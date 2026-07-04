import { clonePlainDto } from '@/utils/clonePlainDto'
import { deriveActionRisk, deriveTaskRisk } from '@/domain/risk'
import { createDefaultActionParams, getActionTypeLabel } from '@/domain/actionTypes'
import type { ActionCondition, ActionType, AppConfig, AppSettings, RiskLevel, TaskAction, TaskItem, TaskTemplate, TaskVariable } from '@/types/domain'

type AppConfigInput = Partial<Omit<AppConfig, 'settings'>> & {
  settings?: Partial<AppSettings>
}

const now = () => new Date().toISOString()

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export function createDefaultConfig(): AppConfig {
  return {
    version: 2,
    tasks: [],
    tags: [],
    templates: [],
    settings: {
      globalShortcut: 'Alt+Space',
      theme: 'dark',
      launchOnStartup: false
    }
  }
}

export function normalizeConfig(config: AppConfigInput): AppConfig {
  const defaultConfig = createDefaultConfig()
  const settings = {
    ...defaultConfig.settings,
    ...(config.settings || {})
  }

  if ((config.version || 1) < 2 && settings.theme === 'system') {
    settings.theme = 'dark'
  }

  return {
    ...defaultConfig,
    ...config,
    version: defaultConfig.version,
    tasks: (config.tasks || []).map(normalizeTask),
    tags: (config.tags || []).map((tag) => ({
      ...tag,
      name: tag.name.trim()
    })),
    templates: (config.templates || []).map(normalizeTemplate),
    settings
  }
}

export function normalizeTask(task: TaskItem): TaskItem {
  return {
    ...task,
    category: task.category?.trim() || '未分类',
    keywords: task.keywords || [],
    description: task.description || '',
    favorite: task.favorite ?? false,
    tagIds: task.tagIds || [],
    triggers: normalizeTriggers(task.triggers),
    variables: normalizeVariables(task.variables),
    actions: (task.actions || []).map(normalizeAction),
    riskLevel: deriveTaskRisk(task),
    enabled: task.enabled ?? true
  }
}

function normalizeAction(action: TaskAction): TaskAction {
  const normalized = {
    ...action,
    enabled: action.enabled ?? true,
    outputBinding: normalizeOutputBinding(action.outputBinding),
    condition: normalizeCondition(action.condition),
    params: normalizeActionParams(action)
  }
  return {
    ...normalized,
    riskLevel: deriveActionRisk(normalized)
  }
}

export function normalizeTemplate(template: TaskTemplate): TaskTemplate {
  const actions = (template.actions || []).map((action) => {
    const normalized = {
      ...action,
      enabled: action.enabled ?? true,
      outputBinding: normalizeOutputBinding(action.outputBinding),
      condition: normalizeCondition(action.condition),
      params: normalizeActionParams(action as TaskAction)
    }
    return {
      ...normalized,
      riskLevel: deriveActionRisk({ ...normalized, id: 'template-action' })
    }
  })

  return {
    ...template,
    category: template.category?.trim() || '未分类',
    keywords: template.keywords || [],
    description: template.description || '',
    actions
  }
}

function normalizeActionParams(action: TaskAction): TaskAction['params'] {
  if (action.type !== 'runCommand' || !('command' in action.params)) {
    return action.params
  }

  return {
    source: action.params.source || 'inline',
    command: action.params.command || '',
    workingDir: action.params.workingDir || '',
    env: action.params.env || {},
    showTerminal: action.params.showTerminal ?? false,
    closeTerminalOnFinish: action.params.closeTerminalOnFinish ?? true,
    shell: action.params.shell || 'powershell',
    scriptPath: action.params.scriptPath || '',
    scriptArgs: action.params.scriptArgs || []
  }
}

export function createTaskDraft(): TaskItem {
  const timestamp = now()
  return {
    id: uid('task'),
    name: '新事项',
    category: '未分类',
    keywords: [],
    description: '',
    variables: [],
    actions: [],
    riskLevel: 'low',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function normalizeTriggers(taskTriggers: TaskItem['triggers'] | undefined): TaskItem['triggers'] {
  const triggers = taskTriggers && taskTriggers.length > 0 ? taskTriggers : [{ type: 'manual' as const, enabled: true }]
  return triggers.map((trigger) => {
    if (trigger.type === 'shortcut') {
      return {
        ...trigger,
        shortcut: trigger.shortcut.trim()
      }
    }
    return trigger
  })
}

export function createActionDraft(type: ActionType): TaskAction {
  return {
    id: uid('action'),
    type,
    name: defaultActionName(type),
    params: createDefaultActionParams(type),
    enabled: true,
    continueOnError: false,
    outputBinding: null,
    condition: { type: 'always' },
    riskLevel: defaultRisk(type)
  }
}

function normalizeVariables(variables: TaskVariable[] | undefined): TaskVariable[] {
  return (variables || []).map((variable) => ({
    key: variable.key.trim(),
    label: variable.label.trim(),
    defaultValue: variable.defaultValue ?? '',
    required: Boolean(variable.required),
    secret: Boolean(variable.secret)
  }))
}

function normalizeOutputBinding(binding: TaskAction['outputBinding'] | undefined): TaskAction['outputBinding'] {
  if (!binding) return null
  const next = {
    stdoutVariable: binding.stdoutVariable?.trim() || undefined,
    stderrVariable: binding.stderrVariable?.trim() || undefined,
    exitCodeVariable: binding.exitCodeVariable?.trim() || undefined
  }
  return next.stdoutVariable || next.stderrVariable || next.exitCodeVariable ? next : null
}

function normalizeCondition(condition: ActionCondition | null | undefined): ActionCondition {
  if (!condition) return { type: 'always' }
  switch (condition.type) {
    case 'fileExists':
    case 'folderExists':
      return { type: condition.type, path: condition.path?.trim() || '' }
    case 'variableEquals':
      return {
        type: 'variableEquals',
        variable: condition.variable?.trim() || '',
        value: condition.value ?? ''
      }
    case 'variableNotEmpty':
      return { type: 'variableNotEmpty', variable: condition.variable?.trim() || '' }
    case 'previousActionStatus':
      return { type: 'previousActionStatus', status: condition.status }
    case 'always':
    default:
      return { type: 'always' }
  }
}

export function cloneTask(task: TaskItem): TaskItem {
  const timestamp = now()
  const sourceTask = clonePlainDto(task)
  return {
    ...sourceTask,
    id: uid('task'),
    name: `${task.name} 副本`,
    lastRunAt: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
    actions: sourceTask.actions.map((action) => ({
      ...action,
      id: uid('action')
    }))
  }
}

export function defaultActionName(type: ActionType) {
  return getActionTypeLabel(type)
}

function defaultRisk(type: ActionType): RiskLevel {
  return type === 'runCommand' ? 'medium' : 'low'
}
