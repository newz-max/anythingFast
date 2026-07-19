import { describe, expect, it } from 'vitest'
import type { ExecutionEventPayload } from '@/api/events'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'
import { deriveActionExecutionStates, eventStatusLabel, eventStatusType, normalizedProgressPercent, runProgressLabel } from './executionPresentation'

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
})
