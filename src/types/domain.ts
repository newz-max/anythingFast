export type RiskLevel = 'low' | 'medium' | 'high'

export type ActionType = 'openProgram' | 'openUrl' | 'openFile' | 'openFolder' | 'runCommand' | 'delay'

export type CommandShell = 'powershell' | 'cmd'

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
  command: string
  workingDir: string
  env?: Record<string, string>
  showTerminal?: boolean
  shell: CommandShell
}

export interface DelayParams {
  durationMs: number
}

export type ActionParams = OpenProgramParams | OpenUrlParams | PathParams | CommandParams | DelayParams

export interface TaskAction {
  id: string
  type: ActionType
  name?: string
  params: ActionParams
  enabled: boolean
  timeoutMs?: number
  continueOnError?: boolean
  riskLevel: RiskLevel
}

export interface TaskItem {
  id: string
  name: string
  category?: string
  keywords?: string[]
  description?: string
  actions: TaskAction[]
  riskLevel: RiskLevel
  enabled: boolean
  lastRunAt?: string
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  globalShortcut: string
  configPath?: string
}

export interface AppConfig {
  version: number
  tasks: TaskItem[]
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

export interface ActionExecutionResult {
  actionId: string
  actionName: string
  actionType: ActionType
  status: ExecutionStatus
  message?: string
}

export interface TaskExecutionSummary {
  taskId: string
  taskName: string
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
