import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionEventPayload } from '@/api/events'
import { tauriApi } from '@/api/tauri'
import type { ExecutionLogSummary, TaskExecutionSummary } from '@/types/domain'

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
    vi.mocked(tauriApi.runTask).mockReset()
    vi.mocked(tauriApi.runTaskAction).mockReset()
    vi.mocked(tauriApi.loadExecutionLogs).mockReset()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })

  it('updates the scoped run snapshot from execution events', () => {
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

    expect(store.latestActiveRun?.taskId).toBe('task-1')
    expect(store.latestActiveRun?.currentActionName).toBe('执行脚本')
    expect(store.latestActiveRun?.completedActions).toBe(1)
    expect(store.latestActiveRun?.progressPercent).toBe(50)

    store.applyExecutionEvent(event({ status: 'finished', currentIndex: 2, message: '事项执行完成' }))

    expect(store.running).toBe(false)
    expect(store.latestActiveRun).toBeNull()
    expect(store.latestRunForTask('task-1')?.completedActions).toBe(2)
    expect(store.latestRunForTask('task-1')?.progressPercent).toBe(100)
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
    expect(store.eventTimeline.map((entry) => entry.payload.taskName)).toEqual(['事项 A', '事项 B', '事项 A', '事项 B'])
    expect(store.eventTimeline.map((entry) => entry.sequence)).toEqual([1, 2, 3, 4])

    store.applyExecutionEvent(event({ runId: 'run-1', taskId: 'task-1', taskName: '事项 A', status: 'finished', currentIndex: 2 }))

    expect(store.activeRunIds).toEqual(['run-2'])
    expect(store.runsById['run-1'].status).toBe('success')
    expect(store.runsById['run-2'].status).toBe('running')
    expect(store.running).toBe(true)
  })

  it('bounds the global timeline and each run event bucket', () => {
    const store = useExecutionStore()

    for (let index = 0; index < 205; index += 1) {
      store.applyExecutionEvent(event({
        status: 'action-started',
        currentIndex: index + 1,
        actionId: 'action-1',
        actionName: `动作 ${index}`
      }))
    }

    expect(store.eventTimeline).toHaveLength(200)
    expect(store.eventsByRunId['run-1']).toHaveLength(200)
    expect(store.eventTimeline[0]).toMatchObject({ sequence: 6 })
    expect(store.eventTimeline[0].payload.actionName).toBe('动作 5')
    expect(store.eventTimeline.at(-1)?.sequence).toBe(205)
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

    expect(store.latestActiveRun).toBeNull()
    expect(store.latestRunForTask('task-1')?.status).toBe('cancelled')
    expect(store.latestRunForTask('task-1')?.completedActions).toBe(1)

    store.applyExecutionEvent(event({ status: 'finished', currentIndex: 1, message: '事项执行已取消' }))

    expect(store.running).toBe(false)
    expect(store.latestRunForTask('task-1')?.status).toBe('cancelled')
    expect(store.latestRunForTask('task-1')?.message).toBe('事项执行已取消')
  })

  it('keeps the newest log response when an older request returns last', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    const older = deferred<ExecutionLogSummary[]>()
    const newer = deferred<ExecutionLogSummary[]>()
    vi.mocked(tauriApi.loadExecutionLogs)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const store = useExecutionStore()

    const olderLoad = store.loadLogs()
    const newerLoad = store.loadLogs()
    newer.resolve([log('newer')])
    await newerLoad
    older.resolve([log('older')])
    await olderLoad

    expect(store.logs.map((item) => item.id)).toEqual(['newer'])
    expect(store.logLoadError).toBeNull()
  })

  it('ignores stale log failures after a newer request succeeds', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    const older = deferred<ExecutionLogSummary[]>()
    const newer = deferred<ExecutionLogSummary[]>()
    vi.mocked(tauriApi.loadExecutionLogs)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
    const store = useExecutionStore()

    const olderLoad = store.loadLogs()
    const newerLoad = store.loadLogs()
    newer.resolve([log('newer')])
    await newerLoad
    older.reject(new Error('旧请求失败'))
    await olderLoad

    expect(store.logs.map((item) => item.id)).toEqual(['newer'])
    expect(store.logLoadError).toBeNull()
  })

  it('preserves successful logs and records a separate error when the latest request fails', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    vi.mocked(tauriApi.loadExecutionLogs)
      .mockResolvedValueOnce([log('saved')])
      .mockRejectedValueOnce(new Error('日志读取失败'))
    const store = useExecutionStore()

    await store.loadLogs()
    await store.loadLogs()

    expect(store.logs.map((item) => item.id)).toEqual(['saved'])
    expect(store.logLoadError).toBe('日志读取失败')
    expect(store.error).toBeNull()
  })

  it('does not turn a successful run into a failure when log refresh fails', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    const completed = summary({})
    vi.mocked(tauriApi.runTask).mockResolvedValue(completed)
    vi.mocked(tauriApi.loadExecutionLogs).mockRejectedValue(new Error('日志读取失败'))
    const store = useExecutionStore()

    await expect(store.runTask('task-1')).resolves.toEqual(completed)

    expect(store.latestRunForTask('task-1')?.status).toBe('success')
    expect(store.error).toBeNull()
    expect(store.logLoadError).toBe('日志读取失败')
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

function log(id: string): ExecutionLogSummary {
  return {
    id,
    taskId: 'task-1',
    taskName: '测试事项',
    scope: 'task',
    startedAt: '2026-07-01T00:00:00Z',
    finishedAt: '2026-07-01T00:00:01Z',
    status: 'success',
    actions: []
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
