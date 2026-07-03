import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { ExecutionEventPayload } from '@/api/events'
import { listenExecutionEvents } from '@/api/events'
import { tauriApi } from '@/api/tauri'
import { getErrorMessage, logDevError } from '@/utils/errors'
import type { ExecutionLogSummary, TaskExecutionSummary } from '@/types/domain'

export const useExecutionStore = defineStore('execution', () => {
  const runningTaskId = shallowRef<string | null>(null)
  const runningActionId = shallowRef<string | null>(null)
  const events = shallowRef<ExecutionEventPayload[]>([])
  const logs = shallowRef<ExecutionLogSummary[]>([])
  const lastSummary = shallowRef<TaskExecutionSummary | null>(null)
  const error = shallowRef<string | null>(null)

  async function setupListeners() {
    if (!('__TAURI_INTERNALS__' in window)) return
    try {
      await listenExecutionEvents((payload) => {
        events.value = [...events.value, payload]
        if (payload.status === 'finished' || payload.status === 'failed') {
          runningTaskId.value = null
          runningActionId.value = null
        } else {
          runningTaskId.value = payload.taskId
        }
      })
    } catch (err) {
      logDevError('Setup execution listener failed', err)
      error.value = getErrorMessage(err)
      throw err
    }
  }

  async function runTask(taskId: string, confirmationToken?: string) {
    error.value = null
    runningTaskId.value = taskId
    events.value = []
    try {
      if (!('__TAURI_INTERNALS__' in window)) {
        throw new Error('浏览器预览环境不能执行本地动作，请使用 Tauri 运行。')
      }
      lastSummary.value = await tauriApi.runTask(taskId, confirmationToken)
      await loadLogs(20)
      return lastSummary.value
    } catch (err) {
      logDevError('Run task failed', err, { taskId })
      error.value = getErrorMessage(err)
      runningTaskId.value = null
      throw err
    }
  }

  async function runTaskAction(taskId: string, actionId: string, confirmationToken?: string) {
    error.value = null
    runningTaskId.value = taskId
    runningActionId.value = actionId
    events.value = []
    try {
      if (!('__TAURI_INTERNALS__' in window)) {
        throw new Error('浏览器预览环境不能执行本地动作，请使用 Tauri 运行。')
      }
      lastSummary.value = await tauriApi.runTaskAction(taskId, actionId, confirmationToken)
      await loadLogs(20)
      return lastSummary.value
    } catch (err) {
      logDevError('Run task action failed', err, { taskId, actionId })
      error.value = getErrorMessage(err)
      runningTaskId.value = null
      runningActionId.value = null
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

  return {
    runningTaskId,
    runningActionId,
    events,
    logs,
    lastSummary,
    error,
    setupListeners,
    runTask,
    runTaskAction,
    loadLogs
  }
})
