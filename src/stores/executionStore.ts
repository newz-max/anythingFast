import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import type { ExecutionEventPayload } from '@/api/events'
import type { RuntimeVariableValues } from '@/api/tauri'
import { listenExecutionEvents } from '@/api/events'
import { tauriApi } from '@/api/tauri'
import { getErrorMessage, logDevError } from '@/utils/errors'
import type { ActionType, ExecutionLogSummary, ExecutionScope, ExecutionStatus, TaskExecutionSummary } from '@/types/domain'

export type RunTargetKey = `task:${string}` | `action:${string}:${string}`

export interface ExecutionRunSnapshot {
  runId: string | null
  targetKey: RunTargetKey
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
  const runsById = shallowRef<Record<string, ExecutionRunSnapshot>>({})
  const runOrder = shallowRef<string[]>([])
  const activeRunIds = shallowRef<string[]>([])
  const eventsByRunId = shallowRef<Record<string, ExecutionEventPayload[]>>({})
  const summariesByRunId = shallowRef<Record<string, TaskExecutionSummary>>({})
  const logs = shallowRef<ExecutionLogSummary[]>([])
  const error = shallowRef<string | null>(null)
  let executionUnlisten: UnlistenFn | null = null

  const runs = computed(() => runOrder.value.map((runId) => runsById.value[runId]).filter(Boolean))
  const activeRuns = computed(() => activeRunIds.value.map((runId) => runsById.value[runId]).filter(Boolean))
  const events = computed(() => runOrder.value.flatMap((runId) => eventsByRunId.value[runId] || []))
  const summaries = computed(() => runOrder.value.map((runId) => summariesByRunId.value[runId]).filter(Boolean))
  const currentRun = computed(() => activeRuns.value.at(-1) || runs.value.at(-1) || null)
  const lastSummary = computed(() => summaries.value.at(-1) || null)
  const running = computed(() => activeRunIds.value.length > 0)
  const runningTaskId = computed(() => activeRuns.value.at(-1)?.taskId ?? null)
  const runningActionId = computed(() => activeRuns.value.at(-1)?.currentActionId ?? null)

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

  async function runTask(taskId: string, confirmationToken?: string, runtimeVariables?: RuntimeVariableValues) {
    const targetKey = taskRunTargetKey(taskId)
    assertTargetNotActive(targetKey, '事项已在执行中')
    return runTarget(targetKey, createPendingRun(taskId, null), () => tauriApi.runTask(taskId, confirmationToken, runtimeVariables), { taskId })
  }

  async function runTaskAction(taskId: string, actionId: string, confirmationToken?: string, runtimeVariables?: RuntimeVariableValues) {
    const targetKey = actionRunTargetKey(taskId, actionId)
    assertTargetNotActive(targetKey, '动作已在执行中')
    return runTarget(targetKey, createPendingRun(taskId, actionId), () => tauriApi.runTaskAction(taskId, actionId, confirmationToken, runtimeVariables), { taskId, actionId })
  }

  async function runTarget(
    targetKey: RunTargetKey,
    pendingRun: ExecutionRunSnapshot,
    dispatch: () => Promise<TaskExecutionSummary>,
    logContext: Record<string, string>
  ) {
    error.value = null
    const pendingRunId = pendingRun.runId || createPendingRunId(targetKey)
    upsertRun({ ...pendingRun, runId: pendingRunId, targetKey })

    try {
      if (!('__TAURI_INTERNALS__' in window)) {
        throw new Error('浏览器预览环境不能执行本地动作，请使用 Tauri 运行。')
      }
      const summary = await dispatch()
      applySummary(summary, targetKey, pendingRunId)
      await loadLogs(20)
      return summary
    } catch (err) {
      logDevError(targetKey.startsWith('action:') ? 'Run task action failed' : 'Run task failed', err, logContext)
      error.value = getErrorMessage(err)
      markRunFailed(pendingRunId, getErrorMessage(err))
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
    const targetKey = eventTargetKey(payload)
    const runId = payload.runId
    appendEvent(runId, payload)

    if (payload.status === 'started') {
      const pendingRunId = activeRuns.value.find((run) => run.targetKey === targetKey && run.runId?.startsWith('pending:'))?.runId
      if (pendingRunId && pendingRunId !== runId) {
        removeRun(pendingRunId)
      }
      upsertRun({
        runId,
        targetKey,
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
      })
      return
    }

    const previous = runsById.value[runId] ?? createPendingRun(payload.taskId, payload.actionId ?? null, runId, targetKey)
    const completedActions = nextCompletedActions(previous.completedActions, payload)
    const totalActions = payload.totalActions || previous.totalActions
    const isFinished = payload.status === 'finished'

    upsertRun({
      ...previous,
      runId,
      targetKey,
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
    })
  }

  function applySummary(summary: TaskExecutionSummary, targetKey = summaryTargetKey(summary), fallbackRunId?: string) {
    const runId = latestRunIdForTarget(targetKey) || fallbackRunId || createPendingRunId(targetKey)
    const previous = runsById.value[runId] ?? createPendingRun(summary.taskId, summary.actionId ?? null, runId, targetKey)
    const completedActions = summary.actions.length
    const totalActions = Math.max(previous.totalActions, completedActions)

    upsertRun({
      ...previous,
      runId,
      targetKey,
      taskId: summary.taskId,
      taskName: summary.taskName,
      scope: summary.scope,
      status: summary.status,
      currentActionId: summary.actionId ?? previous.currentActionId ?? null,
      currentActionName: previous.currentActionName || summary.actions.at(-1)?.actionName || '',
      currentActionType: previous.currentActionType ?? summary.actions.at(-1)?.actionType ?? null,
      currentIndex: completedActions,
      totalActions,
      completedActions,
      progressPercent: progressPercent(completedActions, totalActions),
      message: summaryStatusMessage(summary.status)
    })
    summariesByRunId.value = {
      ...summariesByRunId.value,
      [runId]: summary
    }
  }

  function upsertRun(run: ExecutionRunSnapshot) {
    const runId = run.runId || createPendingRunId(run.targetKey)
    runsById.value = {
      ...runsById.value,
      [runId]: { ...run, runId }
    }
    if (!runOrder.value.includes(runId)) {
      runOrder.value = [...runOrder.value, runId]
    }
    syncActiveRunIds()
  }

  function appendEvent(runId: string, payload: ExecutionEventPayload) {
    eventsByRunId.value = {
      ...eventsByRunId.value,
      [runId]: [...(eventsByRunId.value[runId] || []), payload]
    }
    if (!runOrder.value.includes(runId)) {
      runOrder.value = [...runOrder.value, runId]
    }
  }

  function removeRun(runId: string) {
    const { [runId]: _removedRun, ...nextRunsById } = runsById.value
    const { [runId]: _removedEvents, ...nextEventsByRunId } = eventsByRunId.value
    const { [runId]: _removedSummary, ...nextSummariesByRunId } = summariesByRunId.value
    runsById.value = nextRunsById
    eventsByRunId.value = nextEventsByRunId
    summariesByRunId.value = nextSummariesByRunId
    runOrder.value = runOrder.value.filter((item) => item !== runId)
    syncActiveRunIds()
  }

  function createPendingRun(
    taskId: string,
    actionId: string | null,
    runId = createPendingRunId(actionId ? actionRunTargetKey(taskId, actionId) : taskRunTargetKey(taskId)),
    targetKey: RunTargetKey = actionId ? actionRunTargetKey(taskId, actionId) : taskRunTargetKey(taskId)
  ): ExecutionRunSnapshot {
    return {
      runId,
      targetKey,
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

  function markRunFailed(runId: string, message: string) {
    const run = runsById.value[runId]
    if (!run) return
    upsertRun({
      ...run,
      status: 'failed',
      message
    })
  }

  function isTargetActive(targetKey: RunTargetKey) {
    return activeRuns.value.some((run) => run.targetKey === targetKey)
  }

  function activeRunForTarget(targetKey: RunTargetKey) {
    return activeRuns.value.find((run) => run.targetKey === targetKey) || null
  }

  function latestRunForTask(taskId: string) {
    return [...runs.value].reverse().find((run) => run.taskId === taskId) || null
  }

  function latestActiveRunForTask(taskId: string) {
    return [...activeRuns.value].reverse().find((run) => run.taskId === taskId) || null
  }

  function eventsForRun(runId: string | null | undefined) {
    return runId ? eventsByRunId.value[runId] || [] : []
  }

  function eventsForTask(taskId: string) {
    return events.value.filter((event) => event.taskId === taskId)
  }

  function latestSummaryForTask(taskId: string) {
    return [...summaries.value].reverse().find((summary) => summary.taskId === taskId) || null
  }

  function assertTargetNotActive(targetKey: RunTargetKey, message: string) {
    if (isTargetActive(targetKey)) {
      throw new Error(message)
    }
  }

  function latestRunIdForTarget(targetKey: RunTargetKey) {
    return [...runOrder.value].reverse().find((runId) => runsById.value[runId]?.targetKey === targetKey)
  }

  function syncActiveRunIds() {
    activeRunIds.value = runOrder.value.filter((runId) => isActiveRun(runsById.value[runId]))
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
    if (status === 'skipped') return '已跳过'
    if (status === 'cancelled') return '执行已取消'
    return '执行失败'
  }

  function progressPercent(completedActions: number, totalActions: number) {
    if (totalActions <= 0) return 0
    return Math.min(100, Math.round((completedActions / totalActions) * 100))
  }

  return {
    runsById,
    runOrder,
    activeRunIds,
    activeRuns,
    runs,
    eventsByRunId,
    summariesByRunId,
    summaries,
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
    applyExecutionEvent,
    applySummary,
    taskRunTargetKey,
    actionRunTargetKey,
    isTargetActive,
    activeRunForTarget,
    latestRunForTask,
    latestActiveRunForTask,
    eventsForRun,
    eventsForTask,
    latestSummaryForTask
  }
})

export function taskRunTargetKey(taskId: string): RunTargetKey {
  return `task:${taskId}`
}

export function actionRunTargetKey(taskId: string, actionId: string): RunTargetKey {
  return `action:${taskId}:${actionId}`
}

function eventTargetKey(payload: ExecutionEventPayload): RunTargetKey {
  return payload.scope === 'action' && payload.actionId
    ? actionRunTargetKey(payload.taskId, payload.actionId)
    : taskRunTargetKey(payload.taskId)
}

function summaryTargetKey(summary: TaskExecutionSummary): RunTargetKey {
  return summary.scope === 'action' && summary.actionId
    ? actionRunTargetKey(summary.taskId, summary.actionId)
    : taskRunTargetKey(summary.taskId)
}

function createPendingRunId(targetKey: RunTargetKey) {
  return `pending:${targetKey}:${Date.now()}:${Math.random().toString(36).slice(2)}`
}

function isActiveRun(run: ExecutionRunSnapshot | undefined) {
  return run?.status === 'started' || run?.status === 'running' || run?.status === 'pending'
}
