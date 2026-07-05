import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionEventPayload } from '@/api/events'
import type { TaskExecutionSummary } from '@/types/domain'

const listenExecutionEventsMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/events', () => ({
  listenExecutionEvents: listenExecutionEventsMock
}))

vi.mock('@/api/tauri', () => ({
  tauriApi: {
    runTask: vi.fn(),
    runTaskAction: vi.fn(),
    loadExecutionLogs: vi.fn()
  }
}))

import { actionRunTargetKey, taskRunTargetKey, useExecutionStore } from './executionStore'

function event(patch: Partial<ExecutionEventPayload>): ExecutionEventPayload {
  return {
    runId: 'run-1',
    taskId: 'task-1',
    taskName: '测试事项',
    scope: 'task',
    status: 'started',
    totalActions: 2,
    ...patch
  }
}

describe('executionStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listenExecutionEventsMock.mockReset()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })

  it('updates the current run snapshot from execution events', () => {
    const store = useExecutionStore()

    store.applyExecutionEvent(event({ status: 'started', message: '事项开始执行' }))
    store.applyExecutionEvent(
      event({
        status: 'action-started',
        currentIndex: 1,
        actionId: 'action-1',
        actionName: '执行脚本',
        actionType: 'runCommand',
        message: '执行脚本'
      })
    )
    store.applyExecutionEvent(
      event({
        status: 'action-success',
        currentIndex: 1,
        actionId: 'action-1',
        actionName: '执行脚本',
        actionType: 'runCommand',
        result: {
          actionId: 'action-1',
          actionName: '执行脚本',
          actionType: 'runCommand',
          status: 'success',
          message: '命令执行成功'
        }
      })
    )

    expect(store.runningTaskId).toBe('task-1')
    expect(store.currentRun?.currentActionName).toBe('执行脚本')
    expect(store.currentRun?.completedActions).toBe(1)
    expect(store.currentRun?.progressPercent).toBe(50)

    store.applyExecutionEvent(event({ status: 'finished', currentIndex: 2, message: '事项执行完成' }))

    expect(store.running).toBe(false)
    expect(store.runningTaskId).toBeNull()
    expect(store.currentRun?.completedActions).toBe(2)
    expect(store.currentRun?.progressPercent).toBe(100)
  })

  it('keeps interleaved runs isolated by run id', () => {
    const store = useExecutionStore()

    store.applyExecutionEvent(event({ runId: 'run-1', taskId: 'task-1', taskName: '事项 A', status: 'started' }))
    store.applyExecutionEvent(event({ runId: 'run-2', taskId: 'task-2', taskName: '事项 B', status: 'started' }))
    store.applyExecutionEvent(
      event({
        runId: 'run-1',
        taskId: 'task-1',
        taskName: '事项 A',
        status: 'action-started',
        currentIndex: 1,
        actionId: 'action-a',
        actionName: '动作 A',
        actionType: 'delay'
      })
    )
    store.applyExecutionEvent(
      event({
        runId: 'run-2',
        taskId: 'task-2',
        taskName: '事项 B',
        status: 'action-started',
        currentIndex: 1,
        actionId: 'action-b',
        actionName: '动作 B',
        actionType: 'delay'
      })
    )

    expect(store.activeRunIds).toEqual(['run-1', 'run-2'])
    expect(store.runsById['run-1'].currentActionName).toBe('动作 A')
    expect(store.runsById['run-2'].currentActionName).toBe('动作 B')
    expect(store.eventsByRunId['run-1']).toHaveLength(2)
    expect(store.eventsByRunId['run-2']).toHaveLength(2)

    store.applyExecutionEvent(event({ runId: 'run-1', taskId: 'task-1', taskName: '事项 A', status: 'finished', currentIndex: 2 }))

    expect(store.activeRunIds).toEqual(['run-2'])
    expect(store.runsById['run-1'].status).toBe('success')
    expect(store.runsById['run-2'].status).toBe('running')
    expect(store.running).toBe(true)
  })

  it('detects duplicate active run targets while allowing different targets', async () => {
    const store = useExecutionStore()

    store.applyExecutionEvent(event({ runId: 'run-1', taskId: 'task-1', status: 'started' }))

    expect(store.isTargetActive(taskRunTargetKey('task-1'))).toBe(true)
    expect(store.isTargetActive(taskRunTargetKey('task-2'))).toBe(false)
    await expect(store.runTask('task-1')).rejects.toThrow('事项已在执行中')

    store.applyExecutionEvent(
      event({
        runId: 'run-2',
        taskId: 'task-1',
        scope: 'action',
        actionId: 'action-1',
        status: 'started',
        totalActions: 1
      })
    )

    expect(store.isTargetActive(actionRunTargetKey('task-1', 'action-1'))).toBe(true)
    await expect(store.runTaskAction('task-1', 'action-1')).rejects.toThrow('动作已在执行中')
    expect(store.isTargetActive(actionRunTargetKey('task-1', 'action-2'))).toBe(false)
  })

  it('applies summaries to the matching run target without replacing unrelated runs', () => {
    const store = useExecutionStore()

    store.applyExecutionEvent(event({ runId: 'run-1', taskId: 'task-1', taskName: '事项 A', status: 'started' }))
    store.applyExecutionEvent(event({ runId: 'run-2', taskId: 'task-2', taskName: '事项 B', status: 'started' }))
    store.applySummary(summary({
      taskId: 'task-1',
      taskName: '事项 A',
      finishedAt: '2026-07-01T00:00:02Z',
      actions: [
        {
          actionId: 'action-1',
          actionName: '动作 1',
          actionType: 'delay',
          status: 'success'
        },
        {
          actionId: 'action-2',
          actionName: '动作 2',
          actionType: 'delay',
          status: 'success'
        }
      ]
    }))

    expect(store.runsById['run-1']).toMatchObject({
      taskId: 'task-1',
      status: 'success',
      progressPercent: 100
    })
    expect(store.summariesByRunId['run-1']?.taskId).toBe('task-1')
    expect(store.runsById['run-2']).toMatchObject({
      taskId: 'task-2',
      status: 'started'
    })
  })

  it('keeps cancelled status after the finished event', () => {
    const store = useExecutionStore()

    store.applyExecutionEvent(event({ status: 'started', message: '事项开始执行' }))
    store.applyExecutionEvent(
      event({
        status: 'action-cancelled',
        currentIndex: 1,
        actionId: 'action-1',
        actionName: '执行脚本',
        actionType: 'runCommand',
        result: {
          actionId: 'action-1',
          actionName: '执行脚本',
          actionType: 'runCommand',
          status: 'cancelled',
          message: '命令执行已取消：终端窗口被关闭或进程收到中断信号',
          exitCode: -1073741510
        }
      })
    )

    expect(store.currentRun?.status).toBe('cancelled')
    expect(store.currentRun?.completedActions).toBe(1)

    store.applyExecutionEvent(event({ status: 'finished', currentIndex: 1, message: '事项执行已取消' }))

    expect(store.running).toBe(false)
    expect(store.currentRun?.status).toBe('cancelled')
    expect(store.currentRun?.message).toBe('事项执行已取消')
  })

  it('does not register duplicate Tauri listeners', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    listenExecutionEventsMock.mockResolvedValue(vi.fn())
    const store = useExecutionStore()

    await store.setupListeners()
    await store.setupListeners()

    expect(listenExecutionEventsMock).toHaveBeenCalledTimes(1)
  })
})

function summary(patch: Partial<TaskExecutionSummary>): TaskExecutionSummary {
  return {
    taskId: 'task-1',
    taskName: '测试事项',
    scope: 'task',
    startedAt: '2026-07-01T00:00:00Z',
    finishedAt: '2026-07-01T00:00:01Z',
    status: 'success',
    actions: [
      {
        actionId: 'action-1',
        actionName: '动作 1',
        actionType: 'delay',
        status: 'success'
      }
    ],
    ...patch
  }
}
