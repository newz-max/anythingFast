import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import type { ExecutionEventPayload } from '@/api/events'
import { listenExecutionEvents } from '@/api/events'
import { tauriApi } from '@/api/tauri'
import { getErrorMessage, logDevError } from '@/utils/errors'
import type { ActionType, ExecutionLogSummary, ExecutionScope, ExecutionStatus, TaskExecutionSummary } from '@/types/domain'

export interface ExecutionRunSnapshot {
  runId: string | null
  taskId: string | null
  taskName: string
  scope: ExecutionScope
  status: ExecutionStatus | 'started'
  currentActionId: string | null
  currentActionName: string
  currentActionType: ActionType | null
  currentIndex: number
  totalActions: number
  completedActions: number
  progressPercent: number
  message: string
}

export const useExecutionStore = defineStore('execution', () => {
  const runningTaskId = shallowRef<string | null>(null)
  const runningActionId = shallowRef<string | null>(null)
  const events = shallowRef<ExecutionEventPayload[]>([])
  const logs = shallowRef<ExecutionLogSummary[]>([])
  const lastSummary = shallowRef<TaskExecutionSummary | null>(null)
  const error = shallowRef<string | null>(null)
  const currentRun = shallowRef<ExecutionRunSnapshot | null>(null)
  let executionUnlisten: UnlistenFn | null = null

  async function setupListeners() {
    if (!('__TAURI_INTERNALS__' in window)) return
    if (executionUnlisten) return
    try {
      executionUnlisten = await listenExecutionEvents(applyExecutionEvent)
    } catch (err) {
      logDevError('Setup execution listener failed', err)
      error.value = getErrorMessage(err)
      throw err
    }
  }

  async function runTask(taskId: string, confirmationToken?: string) {
    error.value = null
    runningTaskId.value = taskId
    runningActionId.value = null
    events.value = []
    currentRun.value = createPendingRun(taskId, null)
    try {
      if (!('__TAURI_INTERNALS__' in window)) {
        throw new Error('浏览器预览环境不能执行本地动作，请使用 Tauri 运行。')
      }
      lastSummary.value = await tauriApi.runTask(taskId, confirmationToken)
      applySummary(lastSummary.value)
      await loadLogs(20)
      return lastSummary.value
    } catch (err) {
      logDevError('Run task failed', err, { taskId })
      error.value = getErrorMessage(err)
      runningTaskId.value = null
      runningActionId.value = null
      markCurrentRunFailed(getErrorMessage(err))
      throw err
    }
  }

  async function runTaskAction(taskId: string, actionId: string, confirmationToken?: string) {
    error.value = null
    runningTaskId.value = taskId
    runningActionId.value = actionId
    events.value = []
    currentRun.value = createPendingRun(taskId, actionId)
    try {
      if (!('__TAURI_INTERNALS__' in window)) {
        throw new Error('浏览器预览环境不能执行本地动作，请使用 Tauri 运行。')
      }
      lastSummary.value = await tauriApi.runTaskAction(taskId, actionId, confirmationToken)
      applySummary(lastSummary.value)
      await loadLogs(20)
      return lastSummary.value
    } catch (err) {
      logDevError('Run task action failed', err, { taskId, actionId })
      error.value = getErrorMessage(err)
      runningTaskId.value = null
      runningActionId.value = null
      markCurrentRunFailed(getErrorMessage(err))
      throw err
    }
  }

  async function loadLogs(limit = 20) {
    if (!('__TAURI_INTERNALS__' in window)) {
      logs.value = []
      return
    }
    try {
      logs.value = await tauriApi.loadExecutionLogs(limit)
    } catch (err) {
      logDevError('Load execution logs failed', err, { limit })
      error.value = getErrorMessage(err)
      throw err
    }
  }

  function applyExecutionEvent(payload: ExecutionEventPayload) {
    events.value = [...events.value, payload]

    if (payload.status === 'started') {
      currentRun.value = {
        runId: payload.runId,
        taskId: payload.taskId,
        taskName: payload.taskName,
        scope: payload.scope,
        status: 'started',
        currentActionId: payload.actionId ?? null,
        currentActionName: payload.actionName || '',
        currentActionType: payload.actionType ?? null,
        currentIndex: 0,
        totalActions: payload.totalActions,
        completedActions: 0,
        progressPercent: 0,
        message: payload.message || '开始执行'
      }
      runningTaskId.value = payload.taskId
      runningActionId.value = payload.actionId ?? null
      return
    }

    const previous = currentRun.value ?? createPendingRun(payload.taskId, payload.actionId ?? null)
    const completedActions = nextCompletedActions(previous.completedActions, payload)
    const totalActions = payload.totalActions || previous.totalActions
    const isFinished = payload.status === 'finished'

    currentRun.value = {
      ...previous,
      runId: payload.runId,
      taskId: payload.taskId,
      taskName: payload.taskName,
      scope: payload.scope,
      status: isFinished ? finishedRunStatus(previous.status) : eventStatusToRunStatus(payload.status),
      currentActionId: payload.actionId ?? previous.currentActionId,
      currentActionName: payload.actionName || previous.currentActionName,
      currentActionType: payload.actionType ?? previous.currentActionType,
      currentIndex: payload.currentIndex ?? previous.currentIndex,
      totalActions,
      completedActions: isFinished ? totalActions : completedActions,
      progressPercent: progressPercent(isFinished ? totalActions : completedActions, totalActions),
      message: payload.result?.message || payload.message || previous.message
    }

    if (isFinished) {
      runningTaskId.value = null
      runningActionId.value = null
    } else {
      runningTaskId.value = payload.taskId
      runningActionId.value = payload.actionId ?? previous.currentActionId
    }
  }

  function applySummary(summary: TaskExecutionSummary) {
    const completedActions = summary.actions.length
    currentRun.value = {
      runId: currentRun.value?.runId ?? null,
      taskId: summary.taskId,
      taskName: summary.taskName,
      scope: summary.scope,
      status: summary.status,
      currentActionId: summary.actionId ?? currentRun.value?.currentActionId ?? null,
      currentActionName: currentRun.value?.currentActionName || summary.actions.at(-1)?.actionName || '',
      currentActionType: currentRun.value?.currentActionType ?? summary.actions.at(-1)?.actionType ?? null,
      currentIndex: completedActions,
      totalActions: Math.max(currentRun.value?.totalActions ?? 0, completedActions),
      completedActions,
      progressPercent: progressPercent(completedActions, Math.max(currentRun.value?.totalActions ?? 0, completedActions)),
      message: summaryStatusMessage(summary.status)
    }
    runningTaskId.value = null
    runningActionId.value = null
  }

  function createPendingRun(taskId: string, actionId: string | null): ExecutionRunSnapshot {
    return {
      runId: null,
      taskId,
      taskName: '',
      scope: actionId ? 'action' : 'task',
      status: 'started',
      currentActionId: actionId,
      currentActionName: '',
      currentActionType: null,
      currentIndex: 0,
      totalActions: actionId ? 1 : 0,
      completedActions: 0,
      progressPercent: 0,
      message: '准备执行'
    }
  }

  function markCurrentRunFailed(message: string) {
    if (!currentRun.value) return
    currentRun.value = {
      ...currentRun.value,
      status: 'failed',
      message
    }
  }

  function nextCompletedActions(previousCompleted: number, payload: ExecutionEventPayload) {
    if (
      payload.status === 'action-success' ||
      payload.status === 'action-failed' ||
      payload.status === 'action-skipped' ||
      payload.status === 'action-cancelled'
    ) {
      return Math.max(previousCompleted, payload.currentIndex ?? previousCompleted)
    }
    return previousCompleted
  }

  function eventStatusToRunStatus(status: ExecutionEventPayload['status']): ExecutionRunSnapshot['status'] {
    if (status === 'action-failed') return 'failed'
    if (status === 'action-cancelled') return 'cancelled'
    if (status === 'finished') return 'success'
    return 'running'
  }

  function finishedRunStatus(previousStatus: ExecutionRunSnapshot['status']): ExecutionRunSnapshot['status'] {
    if (previousStatus === 'failed' || previousStatus === 'cancelled') return previousStatus
    return 'success'
  }

  function summaryStatusMessage(status: TaskExecutionSummary['status']) {
    if (status === 'success') return '执行完成'
    if (status === 'cancelled') return '执行已取消'
    return '执行失败'
  }

  function progressPercent(completedActions: number, totalActions: number) {
    if (totalActions <= 0) return 0
    return Math.min(100, Math.round((completedActions / totalActions) * 100))
  }

  const running = computed(() => Boolean(runningTaskId.value || runningActionId.value))

  return {
    runningTaskId,
    runningActionId,
    running,
    events,
    logs,
    lastSummary,
    error,
    currentRun,
    setupListeners,
    runTask,
    runTaskAction,
    loadLogs,
    applyExecutionEvent
  }
})
