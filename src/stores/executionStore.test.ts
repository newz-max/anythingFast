import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionEventPayload } from '@/api/events'

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

import { useExecutionStore } from './executionStore'

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
