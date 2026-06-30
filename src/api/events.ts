import { listen } from '@tauri-apps/api/event'
import type { ActionExecutionResult } from '@/types/domain'

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
