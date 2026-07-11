import { invoke } from '@tauri-apps/api/core'
import { getErrorMessage, logDevError } from '@/utils/errors'
import type { ClipboardContextSnapshot } from '@/types/context'
import type {
  AppConfig,
  AppSettings,
  ExportBundleRequest,
  ImportPreview,
  ExecutionLogSummary,
  KeybindingOverride,
  KeybindingsLoadResult,
  PathInspection,
  PreviewAction,
  RiskAnalysis,
  ShortcutStatus,
  TaskAction,
  TaskExportBundle,
  TaskExecutionSummary,
  TaskItem,
  TaskTemplate,
  UpdateProxyResolution,
  ValidationResult
} from '@/types/domain'

type InvokeArgs = Record<string, unknown>
export type RuntimeVariableValues = Record<string, string>

interface InvokeCommandLogOptions {
  metadata?: Record<string, unknown>
  sanitizedErrorMessage?: string
}

async function invokeCommand<T>(command: string, args?: InvokeArgs, logOptions?: InvokeCommandLogOptions) {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    if (logOptions?.sanitizedErrorMessage) {
      logDevError(`Tauri command failed: ${command}`, new Error(logOptions.sanitizedErrorMessage), logOptions.metadata)
    } else {
      logDevError(`Tauri command failed: ${command}`, error, { args })
    }
    throw error instanceof Error ? error : new Error(getErrorMessage(error))
  }
}

export const tauriApi = {
  loadConfig: () => invokeCommand<AppConfig>('load_config'),
  saveConfig: (config: AppConfig) => invokeCommand<AppConfig>('save_config', { config }),
  validateTask: (task: TaskItem) => invokeCommand<ValidationResult>('validate_task', { task }),
  validateAction: (action: TaskAction) => invokeCommand<ValidationResult>('validate_action', { action }),
  analyzeRisk: (taskId: string, runtimeVariables?: RuntimeVariableValues) =>
    invokeCommand<RiskAnalysis>('analyze_risk', { taskId, runtimeVariables }),
  analyzeActionRisk: (taskId: string, actionId: string, runtimeVariables?: RuntimeVariableValues) =>
    invokeCommand<RiskAnalysis>('analyze_action_risk', { taskId, actionId, runtimeVariables }),
  runTask: (taskId: string, confirmationToken?: string, runtimeVariables?: RuntimeVariableValues) =>
    invokeCommand<TaskExecutionSummary>('run_task', { taskId, confirmationToken, runtimeVariables }),
  runTaskAction: (taskId: string, actionId: string, confirmationToken?: string, runtimeVariables?: RuntimeVariableValues) =>
    invokeCommand<TaskExecutionSummary>('run_task_action', { taskId, actionId, confirmationToken, runtimeVariables }),
  previewAction: (action: TaskAction) => invokeCommand<PreviewAction>('preview_action', { action }),
  exportTaskBundle: (request: ExportBundleRequest) => invokeCommand<TaskExportBundle>('export_task_bundle', { request }),
  saveTaskBundleFile: (request: ExportBundleRequest, path: string) =>
    invokeCommand<TaskExportBundle>('save_task_bundle_file', { request, path }),
  previewImportBundle: (bundleJson: string) => invokeCommand<ImportPreview>('preview_import_bundle', { bundleJson }),
  previewImportBundleFile: (path: string) => invokeCommand<ImportPreview>('preview_import_bundle_file', { path }),
  confirmImportBundle: (bundleJson: string) => invokeCommand<AppConfig>('confirm_import_bundle', { bundleJson }),
  confirmImportBundleFile: (path: string) => invokeCommand<AppConfig>('confirm_import_bundle_file', { path }),
  createTaskFromTemplate: (template: TaskTemplate) => invokeCommand<TaskItem>('create_task_from_template', { template }),
  openMainWindowCreateTask: () => invokeCommand<void>('open_main_window_create_task'),
  getClipboardContext: () => invokeCommand<ClipboardContextSnapshot>('get_clipboard_context'),
  inspectPathInput: (input: string) => invokeCommand<PathInspection>('inspect_path_input', { input }),
  inspectClipboardPathInput: (input: string) =>
    invokeCommand<PathInspection>('inspect_path_input', { input }, {
      metadata: { source: 'clipboard', kind: 'path', textLength: input.length },
      sanitizedErrorMessage: '剪贴板路径检查失败'
    }),
  getDefaultWorkingDir: () => invokeCommand<string>('get_default_working_dir'),
  loadExecutionLogs: (limit: number) => invokeCommand<ExecutionLogSummary[]>('load_execution_logs', { limit }),
  loadShortcutStatus: () => invokeCommand<ShortcutStatus>('load_shortcut_status'),
  loadKeybindings: () => invokeCommand<KeybindingsLoadResult>('load_keybindings'),
  saveKeybindings: (overrides: KeybindingOverride[]) => invokeCommand<KeybindingsLoadResult>('save_keybindings', { overrides }),
  resetKeybindings: () => invokeCommand<KeybindingsLoadResult>('reset_keybindings'),
  openKeybindingsFile: () => invokeCommand<void>('open_keybindings_file'),
  resolveUpdateProxy: () => invokeCommand<UpdateProxyResolution>('resolve_update_proxy'),
  updateSettings: (settings: AppSettings) => invokeCommand<AppConfig>('update_settings', { settings })
}
