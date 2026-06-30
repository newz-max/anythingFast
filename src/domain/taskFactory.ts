import type { ActionType, AppConfig, RiskLevel, TaskAction, TaskItem } from '@/types/domain'

const now = () => new Date().toISOString()

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export function createDefaultConfig(): AppConfig {
  return {
    version: 1,
    tasks: [],
    settings: {
      globalShortcut: 'Alt+Space'
    }
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
    createdAt: timestamp,
    updatedAt: timestamp
  }
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
  return {
    ...structuredClone(task),
    id: uid('task'),
    name: `${task.name} 副本`,
    lastRunAt: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
    actions: task.actions.map((action) => ({
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
