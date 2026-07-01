import { clonePlainDto } from '@/utils/clonePlainDto'
import { deriveActionRisk, deriveTaskRisk } from '@/domain/risk'
import type { ActionType, AppConfig, RiskLevel, TaskAction, TaskItem } from '@/types/domain'

const now = () => new Date().toISOString()

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export function createDefaultConfig(): AppConfig {
  return {
    version: 1,
    tasks: [],
    tags: [],
    settings: {
      globalShortcut: 'Alt+Space',
      theme: 'system'
    }
  }
}

export function normalizeConfig(config: AppConfig): AppConfig {
  return {
    ...createDefaultConfig(),
    ...config,
    tasks: (config.tasks || []).map(normalizeTask),
    tags: (config.tags || []).map((tag) => ({
      ...tag,
      name: tag.name.trim()
    })),
    settings: {
      ...createDefaultConfig().settings,
      ...(config.settings || {})
    }
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
    actions: (task.actions || []).map((action) => ({
      ...action,
      enabled: action.enabled ?? true,
      riskLevel: deriveActionRisk(action)
    })),
    riskLevel: deriveTaskRisk(task),
    enabled: task.enabled ?? true
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
    params: defaultParams(type),
    enabled: true,
    continueOnError: false,
    riskLevel: defaultRisk(type)
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
  const names: Record<ActionType, string> = {
    openProgram: '打开程序',
    openUrl: '打开 URL',
    openFile: '打开文件',
    openFolder: '打开文件夹',
    runCommand: '执行命令',
    delay: '延时等待'
  }
  return names[type]
}

function defaultRisk(type: ActionType): RiskLevel {
  return type === 'runCommand' ? 'medium' : 'low'
}

function defaultParams(type: ActionType) {
  switch (type) {
    case 'openProgram':
      return { path: '', args: [], workingDir: '' }
    case 'openUrl':
      return { url: 'https://' }
    case 'openFile':
    case 'openFolder':
      return { path: '' }
    case 'runCommand':
      return { command: '', workingDir: '', env: {}, showTerminal: false, shell: 'powershell' as const }
    case 'delay':
      return { durationMs: 1000 }
  }
}
