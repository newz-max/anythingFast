import { describe, expect, it } from 'vitest'
import type { ExecutionEventPayload } from '@/api/events'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'
import {
  deriveActionExecutionStates,
  deriveSlowestActionIds,
  eventStatusLabel,
  eventStatusType,
  formatActionDuration,
  normalizedProgressPercent,
  primaryFailureDiagnostic,
  runProgressLabel
} from './executionPresentation'
import type { ActionExecutionResult, TaskExecutionSummary } from '@/types/domain'

function event(patch: Partial<ExecutionEventPayload>): ExecutionEventPayload {
  return {
    runId: 'run-1',
    taskId: 'task-1',
    taskName: '测试事项',
    scope: 'task',
    status: 'started',
    totalActions: 4,
    ...patch
  }
}

describe('executionPresentation', () => {
  it('derives action display states from execution events', () => {
    const states = deriveActionExecutionStates([
      event({ status: 'action-success', actionId: 'action-1' }),
      event({ status: 'action-failed', actionId: 'action-2' }),
      event({ status: 'action-skipped', actionId: 'action-3' }),
      event({ status: 'action-started', actionId: 'action-4' }),
      event({ status: 'action-cancelled', actionId: 'action-5' })
    ])

    expect(states['action-1']).toMatchObject({ status: 'success', label: '成功', type: 'success' })
    expect(states['action-2']).toMatchObject({ status: 'failed', label: '失败', type: 'error' })
    expect(states['action-3']).toMatchObject({ status: 'skipped', label: '已跳过', type: 'warning' })
    expect(states['action-4']).toMatchObject({ status: 'running', label: '执行中', type: 'info' })
    expect(states['action-5']).toMatchObject({ status: 'cancelled', label: '已取消', type: 'warning' })
  })

  it('keeps the current action running while the run is active', () => {
    const activeRun: ExecutionRunSnapshot = {
      runId: 'run-1',
      targetKey: 'task:task-1',
      taskId: 'task-1',
      taskName: '测试事项',
      scope: 'task',
      status: 'running',
      currentActionId: 'action-1',
      currentActionName: '执行脚本',
      currentActionType: 'runCommand',
      currentIndex: 1,
      totalActions: 2,
      completedActions: 0,
      progressPercent: 0,
      message: '执行脚本'
    }

    const states = deriveActionExecutionStates([event({ status: 'action-success', actionId: 'action-1' })], [activeRun])

    expect(states['action-1']).toMatchObject({ status: 'running', label: '执行中', type: 'info' })
  })

  it('keeps multiple current actions running while runs are active', () => {
    const states = deriveActionExecutionStates(
      [
        event({ status: 'action-success', actionId: 'action-1' }),
        event({ status: 'action-success', actionId: 'action-2' })
      ],
      [
        {
          runId: 'run-1',
          targetKey: 'action:task-1:action-1',
          taskId: 'task-1',
          taskName: '测试事项',
          scope: 'action',
          status: 'running',
          currentActionId: 'action-1',
          currentActionName: '动作 1',
          currentActionType: 'delay',
          currentIndex: 1,
          totalActions: 1,
          completedActions: 0,
          progressPercent: 0,
          message: '动作 1'
        },
        {
          runId: 'run-2',
          targetKey: 'action:task-1:action-2',
          taskId: 'task-1',
          taskName: '测试事项',
          scope: 'action',
          status: 'running',
          currentActionId: 'action-2',
          currentActionName: '动作 2',
          currentActionType: 'delay',
          currentIndex: 1,
          totalActions: 1,
          completedActions: 0,
          progressPercent: 0,
          message: '动作 2'
        }
      ]
    )

    expect(states['action-1']).toMatchObject({ status: 'running', label: '执行中' })
    expect(states['action-2']).toMatchObject({ status: 'running', label: '执行中' })
  })

  it('formats event labels and progress fallbacks', () => {
    const pendingRun: ExecutionRunSnapshot = {
      runId: null,
      targetKey: 'task:task-1',
      taskId: 'task-1',
      taskName: '',
      scope: 'task',
      status: 'started',
      currentActionId: null,
      currentActionName: '',
      currentActionType: null,
      currentIndex: 0,
      totalActions: 0,
      completedActions: 0,
      progressPercent: 0,
      message: '准备执行'
    }

    expect(eventStatusLabel('action-started')).toBe('动作开始')
    expect(eventStatusLabel('action-cancelled')).toBe('动作取消')
    expect(eventStatusType(event({ status: 'action-cancelled' }))).toBe('warning')
    expect(runProgressLabel(pendingRun)).toBe('等待动作事件')
    expect(normalizedProgressPercent({ ...pendingRun, totalActions: 2, progressPercent: 180 })).toBe(100)
  })

  it('derives the sanitized primary failure diagnostic without using non-failed output', () => {
    expect(primaryFailureDiagnostic(actionResult({ message: '  已遮罩：***  ', stderr: 'fallback' }))).toBe('已遮罩：***')
    expect(primaryFailureDiagnostic(actionResult({ message: ' ', stderr: '  stderr fallback  ' }))).toBe('stderr fallback')
    expect(primaryFailureDiagnostic(actionResult({ status: 'success', message: '完成' }))).toBeNull()
  })

  it('formats valid durations and rejects unavailable values', () => {
    expect(formatActionDuration(999)).toBe('999 ms')
    expect(formatActionDuration(1250)).toBe('1.3 s')
    expect(formatActionDuration(undefined)).toBeNull()
    expect(formatActionDuration(Number.NaN)).toBeNull()
    expect(formatActionDuration(-1)).toBeNull()
  })

  it('derives all tied slowest non-skipped actions for task-scoped results', () => {
    const summary = executionSummary([
      actionResult({ actionId: 'fast', durationMs: 10 }),
      actionResult({ actionId: 'slow-a', durationMs: 40 }),
      actionResult({ actionId: 'slow-b', durationMs: 40 }),
      actionResult({ actionId: 'skipped', status: 'skipped', durationMs: 100 }),
      actionResult({ actionId: 'missing' })
    ])

    expect(deriveSlowestActionIds(summary)).toEqual(['slow-a', 'slow-b'])
    expect(deriveSlowestActionIds({ ...summary, scope: 'action' })).toEqual([])
    expect(deriveSlowestActionIds(executionSummary([actionResult({ durationMs: 10 })]))).toEqual([])
  })
})

function actionResult(patch: Partial<ActionExecutionResult> = {}): ActionExecutionResult {
  return {
    actionId: 'action-1',
    actionName: '测试动作',
    actionType: 'runCommand',
    status: 'failed',
    ...patch
  }
}

function executionSummary(actions: ActionExecutionResult[]): TaskExecutionSummary {
  return {
    taskId: 'task-1',
    taskName: '测试事项',
    scope: 'task',
    startedAt: '2026-07-01T00:00:00.000Z',
    finishedAt: '2026-07-01T00:00:01.000Z',
    status: 'failed',
    actions
  }
}
