import { invoke } from '@tauri-apps/api/core'
import { getErrorMessage, logDevError } from '@/utils/errors'
import type {
  AppConfig,
  AppSettings,
  ExecutionLogSummary,
  PreviewAction,
  RiskAnalysis,
  ShortcutStatus,
  TaskAction,
  TaskExecutionSummary,
  TaskItem,
  ValidationResult
} from '@/types/domain'

type InvokeArgs = Record<string, unknown>

async function invokeCommand<T>(command: string, args?: InvokeArgs) {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    logDevError(`Tauri command failed: ${command}`, error, { args })
    throw error instanceof Error ? error : new Error(getErrorMessage(error))
  }
}

export const tauriApi = {
  loadConfig: () => invokeCommand<AppConfig>('load_config'),
  saveConfig: (config: AppConfig) => invokeCommand<AppConfig>('save_config', { config }),
  validateTask: (task: TaskItem) => invokeCommand<ValidationResult>('validate_task', { task }),
  validateAction: (action: TaskAction) => invokeCommand<ValidationResult>('validate_action', { action }),
  analyzeRisk: (taskId: string) => invokeCommand<RiskAnalysis>('analyze_risk', { taskId }),
  analyzeActionRisk: (taskId: string, actionId: string) =>
    invokeCommand<RiskAnalysis>('analyze_action_risk', { taskId, actionId }),
  runTask: (taskId: string, confirmationToken?: string) =>
    invokeCommand<TaskExecutionSummary>('run_task', { taskId, confirmationToken }),
  runTaskAction: (taskId: string, actionId: string, confirmationToken?: string) =>
    invokeCommand<TaskExecutionSummary>('run_task_action', { taskId, actionId, confirmationToken }),
  previewAction: (action: TaskAction) => invokeCommand<PreviewAction>('preview_action', { action }),
  loadExecutionLogs: (limit: number) => invokeCommand<ExecutionLogSummary[]>('load_execution_logs', { limit }),
  loadShortcutStatus: () => invokeCommand<ShortcutStatus>('load_shortcut_status'),
  updateSettings: (settings: AppSettings) => invokeCommand<AppConfig>('update_settings', { settings })
}
