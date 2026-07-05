import { createTaskDraft } from '@/domain/taskFactory'
import { deriveActionRisk, maxRisk } from '@/domain/risk'
import { clonePlainDto } from '@/utils/clonePlainDto'
import type { RiskLevel, TaskItem, TaskTemplate } from '@/types/domain'

export const builtInTaskTemplates: TaskTemplate[] = [
  {
    id: 'open-work-dashboard',
    name: '打开工作看板',
    category: '工作',
    keywords: ['dashboard', 'work'],
    description: '打开一个常用工作网页，适合作为 URL 动作模板。',
    actions: [
      {
        type: 'openUrl',
        name: '打开看板',
        params: { url: 'https://example.com' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'focus-delay',
    name: '专注前等待',
    category: '学习',
    keywords: ['focus', 'delay'],
    description: '先等待一小段时间，再继续后续动作，可用于搭建专注流程。',
    actions: [
      {
        type: 'delay',
        name: '等待 3 秒',
        params: { durationMs: 3000 },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'command-starter',
    name: '命令启动器',
    category: '工作',
    keywords: ['command', 'terminal'],
    description: '预置一个命令动作，保存前需要补齐命令和工作目录。',
    actions: [
      {
        type: 'runCommand',
        name: '执行命令',
        params: { source: 'inline', command: '', workingDir: '', env: {}, showTerminal: true, closeTerminalOnFinish: true, terminalHost: 'systemTerminal', shell: 'terminal', scriptPath: '', scriptArgs: [] },
        enabled: true,
        continueOnError: false,
        riskLevel: 'medium'
      }
    ]
  }
]

export function createTaskFromTemplate(template: TaskTemplate): TaskItem {
  const draft = createTaskDraft()
  const source = clonePlainDto(template)
  return {
    ...draft,
    name: source.name,
    category: source.category || draft.category,
    keywords: source.keywords || [],
    description: source.description || '',
    actions: source.actions.map((action) => ({
      ...action,
      id: `action-${crypto.randomUUID()}`
    }))
  }
}

export function deriveTemplateRisk(template: TaskTemplate): RiskLevel {
  return maxRisk(
    template.actions
      .filter((action) => action.enabled)
      .map((action) => deriveActionRisk({ ...action, id: 'template-action' }))
  )
}
