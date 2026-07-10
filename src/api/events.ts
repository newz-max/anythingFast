import { listen } from '@tauri-apps/api/event'
import type { ActionExecutionResult, ActionType, ExecutionScope, ShortcutStatus } from '@/types/domain'

export type ConfigUpdateSource = 'saveConfig' | 'importConfig' | 'updateSettings' | 'runMetadata'

export interface ConfigUpdatedPayload {
  source: ConfigUpdateSource
}

export type MainWindowIntent = 'createTask'

export type ExecutionEventStatus =
  | 'started'
  | 'action-started'
  | 'action-success'
  | 'action-failed'
  | 'action-skipped'
  | 'action-cancelled'
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

export function listenConfigUpdatedEvents(handler: (payload: ConfigUpdatedPayload) => void) {
  return listen<ConfigUpdatedPayload>('config-updated', (event) => handler(event.payload))
}

export function listenMainWindowIntentEvents(handler: (intent: MainWindowIntent) => void) {
  return listen<MainWindowIntent>('main-window-intent', (event) => handler(event.payload))
}
