import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { ExecutionEventPayload } from '@/api/events'
import { listenExecutionEvents } from '@/api/events'
import { tauriApi } from '@/api/tauri'
import type { ExecutionLogSummary, TaskExecutionSummary } from '@/types/domain'

export const useExecutionStore = defineStore('execution', () => {
  const runningTaskId = shallowRef<string | null>(null)
  const events = shallowRef<ExecutionEventPayload[]>([])
  const logs = shallowRef<ExecutionLogSummary[]>([])
  const lastSummary = shallowRef<TaskExecutionSummary | null>(null)
  const error = shallowRef<string | null>(null)

  async function setupListeners() {
    if (!('__TAURI_INTERNALS__' in window)) return
    await listenExecutionEvents((payload) => {
      events.value = [...events.value, payload]
      runningTaskId.value = payload.status === 'finished' || payload.status === 'failed' ? null : payload.taskId
    })
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
      error.value = err instanceof Error ? err.message : String(err)
      runningTaskId.value = null
      throw err
    }
  }

  async function loadLogs(limit = 20) {
    if (!('__TAURI_INTERNALS__' in window)) {
      logs.value = []
      return
    }
    logs.value = await tauriApi.loadExecutionLogs(limit)
  }

  return {
    runningTaskId,
    events,
    logs,
    lastSummary,
    error,
    setupListeners,
    runTask,
    loadLogs
  }
})
