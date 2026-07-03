import { listen } from '@tauri-apps/api/event'
import type { ActionExecutionResult, ActionType, ExecutionScope, ShortcutStatus } from '@/types/domain'

export type ExecutionEventStatus =
  | 'started'
  | 'action-started'
  | 'action-success'
  | 'action-failed'
  | 'action-skipped'
  | 'finished'

export interface ExecutionEventPayload {
  runId: string
  taskId: string
  taskName: string
  scope: ExecutionScope
  status: ExecutionEventStatus
  currentIndex?: number
  totalActions: number
  actionId?: string
  actionName?: string
  actionType?: ActionType
  message?: string
  result?: ActionExecutionResult
}

export function listenExecutionEvents(handler: (payload: ExecutionEventPayload) => void) {
  return listen<ExecutionEventPayload>('task-execution', (event) => handler(event.payload))
}

export function listenShortcutStatusEvents(handler: (payload: ShortcutStatus) => void) {
  return listen<ShortcutStatus>('shortcut-status', (event) => handler(event.payload))
}
