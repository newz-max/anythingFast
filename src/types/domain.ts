export type RiskLevel = 'low' | 'medium' | 'high'

export type ActionType = 'openProgram' | 'openUrl' | 'openFile' | 'openFolder' | 'runCommand' | 'delay'

export type CommandShell = 'terminal' | 'powershell' | 'pwsh' | 'cmd'
export type CommandTerminalHost = 'systemTerminal' | 'direct'
export type CommandSource = 'inline' | 'script'

export interface OpenProgramParams {
  path: string
  args?: string[]
  workingDir?: string
}

export interface OpenUrlParams {
  url: string
  browser?: string
}

export interface PathParams {
  path: string
}

export interface CommandParams {
  source?: CommandSource
  command: string
  workingDir: string
  env?: Record<string, string>
  showTerminal?: boolean
  closeTerminalOnFinish?: boolean
  terminalHost?: CommandTerminalHost
  shell: CommandShell
  scriptPath?: string
  scriptArgs?: string[]
}

export interface DelayParams {
  durationMs?: number
}

export type ActionParams = OpenProgramParams | OpenUrlParams | PathParams | CommandParams | DelayParams

export interface TaskVariable {
  key: string
  label: string
  defaultValue: string
  required: boolean
  secret: boolean
}

export interface TaskActionOutputBinding {
  stdoutVariable?: string
  stderrVariable?: string
  exitCodeVariable?: string
}

export type PreviousActionStatusConditionValue = 'success' | 'failed' | 'skipped'

export type ActionCondition =
  | { type: 'always' }
  | { type: 'fileExists'; path: string }
  | { type: 'folderExists'; path: string }
  | { type: 'variableEquals'; variable: string; value: string }
  | { type: 'variableNotEmpty'; variable: string }
  | { type: 'previousActionStatus'; status: PreviousActionStatusConditionValue }

export interface TaskAction {
  id: string
  type: ActionType
  name?: string
  params: ActionParams
  enabled: boolean
  timeoutMs?: number | null
  continueOnError?: boolean
  outputBinding?: TaskActionOutputBinding | null
  condition?: ActionCondition | null
  riskLevel: RiskLevel
}

export interface TaskItem {
  id: string
  name: string
  category?: string
  keywords?: string[]
  description?: string
  variables?: TaskVariable[]
  actions: TaskAction[]
  riskLevel: RiskLevel
  enabled: boolean
  favorite: boolean
  tagIds: string[]
  triggers: TaskTrigger[]
  lastRunAt?: string
  createdAt: string
  updatedAt: string
}

export type TaskTrigger = ManualTaskTrigger | ShortcutTaskTrigger

export interface ManualTaskTrigger {
  type: 'manual'
  enabled: boolean
}

export interface ShortcutTaskTrigger {
  type: 'shortcut'
  enabled: boolean
  shortcut: string
}

export interface TaskTag {
  id: string
  name: string
}

export interface TaskTemplate {
  id: string
  name: string
  category?: string
  keywords?: string[]
  description?: string
  actions: Omit<TaskAction, 'id'>[]
}

export interface TaskExportBundle {
  schemaVersion: number
  exportedAt: string
  sourceApp: string
  tasks: TaskItem[]
  templates: TaskTemplate[]
}

export interface ExportBundleRequest {
  taskIds: string[]
  templateIds: string[]
}

export interface ImportPreview {
  schemaVersion: number
  validTaskCount: number
  templateCount: number
  totalActionCount: number
  riskSummary: ImportRiskSummary
  conflictSummary: ImportConflictSummary
  pathHints: ImportPathHint[]
  tasks: ImportTaskPreview[]
  templates: ImportTemplatePreview[]
}

export interface ImportRiskSummary {
  low: number
  medium: number
  high: number
  commandActions: number
}

export interface ImportConflictSummary {
  taskIdsRegenerated: number
  actionIdsRegenerated: number
  templateIdsRegenerated: number
}

export interface ImportPathHint {
  ownerId: string
  ownerName: string
  actionName: string
  field: string
  path: string
  exists: boolean
  message: string
}

export interface ImportTaskPreview {
  id: string
  originalId: string
  name: string
  actionTypes: ActionType[]
  actionCount: number
  riskLevel: RiskLevel
  commandActionCount: number
}

export interface ImportTemplatePreview {
  id: string
  originalId: string
  name: string
  category?: string
  keywords: string[]
  actionTypes: ActionType[]
  actionCount: number
  riskLevel: RiskLevel
  commandActionCount: number
}

export interface AppSettings {
  globalShortcut: string
  theme: AppTheme
  launchOnStartup: boolean
  configPath?: string
}

export interface ShortcutStatus {
  shortcut: string
  registered: boolean
  message?: string
}

export type AppTheme = 'light' | 'dark' | 'system'

export interface AppConfig {
  version: number
  tasks: TaskItem[]
  tags: TaskTag[]
  templates: TaskTemplate[]
  settings: AppSettings
}

export interface FieldIssue {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  issues: FieldIssue[]
  riskLevel?: RiskLevel
}

export interface RiskActionSummary {
  actionId: string
  name: string
  type: ActionType
  riskLevel: RiskLevel
  detail: string
}

export interface RiskAnalysis {
  taskId: string
  requiresConfirmation: boolean
  reasons: string[]
  highRiskActions: RiskActionSummary[]
}

export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled'
export type ExecutionScope = 'task' | 'action'

export interface ActionExecutionResult {
  actionId: string
  actionName: string
  actionType: ActionType
  status: ExecutionStatus
  message?: string
  skipReason?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  exitCode?: number
  stdout?: string
  stderr?: string
}

export interface TaskExecutionSummary {
  taskId: string
  taskName: string
  scope: ExecutionScope
  actionId?: string
  startedAt: string
  finishedAt: string
  status: ExecutionStatus
  actions: ActionExecutionResult[]
}

export interface ExecutionLogSummary extends TaskExecutionSummary {
  id: string
}

export interface PreviewAction {
  label: string
  detail: string
  riskLevel: RiskLevel
}
