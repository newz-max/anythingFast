import { listen } from '@tauri-apps/api/event'
import type { ActionExecutionResult, ShortcutStatus } from '@/types/domain'

export interface ExecutionEventPayload {
  taskId: string
  taskName: string
  action?: ActionExecutionResult
  status: string
  message?: string
}

export function listenExecutionEvents(handler: (payload: ExecutionEventPayload) => void) {
  return listen<ExecutionEventPayload>('task-execution', (event) => handler(event.payload))
}

export function listenShortcutStatusEvents(handler: (payload: ShortcutStatus) => void) {
  return listen<ShortcutStatus>('shortcut-status', (event) => handler(event.payload))
}
