import { invoke } from '@tauri-apps/api/core'
import type {
  AppConfig,
  AppSettings,
  ExecutionLogSummary,
  PreviewAction,
  RiskAnalysis,
  TaskAction,
  TaskExecutionSummary,
  TaskItem,
  ValidationResult
} from '@/types/domain'

export const tauriApi = {
  loadConfig: () => invoke<AppConfig>('load_config'),
  saveConfig: (config: AppConfig) => invoke<AppConfig>('save_config', { config }),
  validateTask: (task: TaskItem) => invoke<ValidationResult>('validate_task', { task }),
  validateAction: (action: TaskAction) => invoke<ValidationResult>('validate_action', { action }),
  analyzeRisk: (taskId: string) => invoke<RiskAnalysis>('analyze_risk', { taskId }),
  analyzeActionRisk: (taskId: string, actionId: string) =>
    invoke<RiskAnalysis>('analyze_action_risk', { taskId, actionId }),
  runTask: (taskId: string, confirmationToken?: string) =>
    invoke<TaskExecutionSummary>('run_task', { taskId, confirmationToken }),
  runTaskAction: (taskId: string, actionId: string, confirmationToken?: string) =>
    invoke<TaskExecutionSummary>('run_task_action', { taskId, actionId, confirmationToken }),
  previewAction: (action: TaskAction) => invoke<PreviewAction>('preview_action', { action }),
  loadExecutionLogs: (limit: number) => invoke<ExecutionLogSummary[]>('load_execution_logs', { limit }),
  updateSettings: (settings: AppSettings) => invoke<AppConfig>('update_settings', { settings })
}
