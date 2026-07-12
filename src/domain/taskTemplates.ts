import { createTaskDraft, normalizeTask } from '@/domain/taskFactory'
import { deriveActionRisk, maxRisk } from '@/domain/risk'
import { inferMissingInputVariableKeys } from '@/domain/variables'
import { clonePlainDto } from '@/utils/clonePlainDto'
import type { RiskLevel, TaskItem, TaskTemplate } from '@/types/domain'

export const builtInTaskTemplates: TaskTemplate[] = [
  {
    id: 'open-project-workspace',
    name: '打开项目工作区',
    category: '开发者',
    keywords: ['项目', '工作区', '文档', 'developer', 'workspace'],
    description: '打开项目目录和对应文档入口，快速恢复开发上下文。',
    variables: [
      { key: 'projectDir', label: '项目目录', defaultValue: '', required: false, secret: false },
      { key: 'projectDocsUrl', label: '项目文档 URL', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'openFolder',
        name: '打开项目目录',
        params: { path: '{{projectDir}}' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      },
      {
        type: 'openUrl',
        name: '打开项目文档',
        params: { url: '{{projectDocsUrl}}' },
        enabled: true,
        continueOnError: true,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'start-frontend-dev-server',
    name: '启动前端开发服务',
    category: '开发者',
    keywords: ['前端', '开发服务', 'vite', 'dev server'],
    description: '在项目目录启动前端开发服务，仅适合手动运行。',
    variables: [
      { key: 'projectDir', label: '项目目录', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'runCommand',
        name: '启动前端服务',
        params: {
          source: 'inline',
          command: 'yarn dev',
          workingDir: '{{projectDir}}',
          env: {},
          showTerminal: true,
          closeTerminalOnFinish: false,
          terminalHost: 'systemTerminal',
          shell: 'terminal',
          scriptPath: '',
          scriptArgs: []
        },
        enabled: true,
        continueOnError: false,
        riskLevel: 'medium'
      }
    ]
  },
  {
    id: 'start-backend-open-api-docs',
    name: '启动后端并打开接口文档',
    category: '开发者',
    keywords: ['后端', '接口文档', 'api', 'backend'],
    description: '启动后端服务，等待接口端口可用后打开文档，仅适合手动运行。',
    variables: [
      { key: 'projectDir', label: '项目目录', defaultValue: '', required: false, secret: false },
      { key: 'apiDocsUrl', label: '接口文档 URL', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'runCommand',
        name: '启动后端服务',
        params: {
          source: 'inline',
          command: 'yarn dev:server',
          workingDir: '{{projectDir}}',
          env: {},
          showTerminal: true,
          closeTerminalOnFinish: false,
          terminalHost: 'systemTerminal',
          shell: 'terminal',
          scriptPath: '',
          scriptArgs: []
        },
        enabled: true,
        continueOnError: false,
        riskLevel: 'medium'
      },
      {
        type: 'waitForPort',
        name: '等待接口端口',
        params: { host: '127.0.0.1', port: 3000 },
        enabled: true,
        timeoutMs: 120000,
        continueOnError: false,
        riskLevel: 'low'
      },
      {
        type: 'openUrl',
        name: '打开接口文档',
        params: { url: '{{apiDocsUrl}}' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'switch-git-branch',
    name: '切换 Git 分支',
    category: '开发者',
    keywords: ['git', '分支', 'branch', 'switch'],
    description: '在指定项目中切换到本次输入的分支，仅适合手动运行。',
    variables: [
      { key: 'projectDir', label: '项目目录', defaultValue: '', required: false, secret: false },
      { key: 'branchName', label: '目标分支', defaultValue: '', required: true, secret: false }
    ],
    actions: [
      {
        type: 'runCommand',
        name: '切换分支',
        params: {
          source: 'inline',
          command: 'git switch "{{branchName}}"',
          workingDir: '{{projectDir}}',
          env: {},
          showTerminal: true,
          closeTerminalOnFinish: true,
          terminalHost: 'systemTerminal',
          shell: 'terminal',
          scriptPath: '',
          scriptArgs: []
        },
        enabled: true,
        continueOnError: false,
        riskLevel: 'medium'
      }
    ]
  },
  {
    id: 'pre-release-check',
    name: '发布前检查',
    category: '开发者',
    keywords: ['发布', '类型检查', '测试', '构建', 'release'],
    description: '依次运行类型检查、测试和构建，仅适合手动运行。',
    variables: [
      { key: 'projectDir', label: '项目目录', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'runCommand',
        name: '运行发布前检查',
        params: {
          source: 'inline',
          command: 'yarn typecheck && yarn test && yarn build',
          workingDir: '{{projectDir}}',
          env: {},
          showTerminal: true,
          closeTerminalOnFinish: false,
          terminalHost: 'systemTerminal',
          shell: 'terminal',
          scriptPath: '',
          scriptArgs: []
        },
        enabled: true,
        continueOnError: false,
        riskLevel: 'medium'
      }
    ]
  },
  {
    id: 'meeting-preparation',
    name: '会议准备',
    category: '办公',
    keywords: ['会议', '资料', 'meeting', 'office'],
    description: '打开会议链接和资料目录，快速进入会议上下文。',
    variables: [
      { key: 'meetingUrl', label: '会议链接', defaultValue: '', required: false, secret: false },
      { key: 'meetingMaterialsDir', label: '会议资料目录', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'openUrl',
        name: '打开会议链接',
        params: { url: '{{meetingUrl}}' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      },
      {
        type: 'openFolder',
        name: '打开会议资料',
        params: { path: '{{meetingMaterialsDir}}' },
        enabled: true,
        continueOnError: true,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'open-work-dashboard',
    name: '打开工作后台',
    category: '办公',
    keywords: ['后台', '看板', 'dashboard', 'office'],
    description: '打开常用工作系统入口。',
    variables: [
      { key: 'dashboardUrl', label: '工作后台 URL', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'openUrl',
        name: '打开工作后台',
        params: { url: '{{dashboardUrl}}' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'copy-meeting-notes',
    name: '复制会议纪要模板',
    category: '办公',
    keywords: ['会议纪要', '剪贴板', 'notes', 'clipboard'],
    description: '把带本次会议主题的纪要结构写入剪贴板。',
    variables: [
      { key: 'meetingTitle', label: '会议主题', defaultValue: '', required: true, secret: false }
    ],
    actions: [
      {
        type: 'writeClipboard',
        name: '复制纪要模板',
        params: { text: '会议主题：{{meetingTitle}}\n\n参与人：\n\n结论：\n\n待办：' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'open-course-and-notes',
    name: '打开课程与笔记',
    category: '学习',
    keywords: ['课程', '笔记', '资料', 'course', 'study'],
    description: '同时打开课程页面、笔记目录和学习资料目录。',
    variables: [
      { key: 'courseUrl', label: '课程 URL', defaultValue: '', required: false, secret: false },
      { key: 'notesDir', label: '笔记目录', defaultValue: '', required: false, secret: false },
      { key: 'materialsDir', label: '资料目录', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'openUrl',
        name: '打开课程',
        params: { url: '{{courseUrl}}' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      },
      {
        type: 'openFolder',
        name: '打开笔记目录',
        params: { path: '{{notesDir}}' },
        enabled: true,
        continueOnError: true,
        riskLevel: 'low'
      },
      {
        type: 'openFolder',
        name: '打开资料目录',
        params: { path: '{{materialsDir}}' },
        enabled: true,
        continueOnError: true,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'focus-reminder',
    name: '专注提醒',
    category: '学习',
    keywords: ['专注', '提醒', '番茄钟', 'focus'],
    description: '专注 25 分钟后显示系统提醒。',
    variables: [],
    actions: [
      {
        type: 'delay',
        name: '专注 25 分钟',
        params: { durationMs: 1500000 },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      },
      {
        type: 'showNotification',
        name: '显示休息提醒',
        params: { title: '专注结束', body: '起身活动一下，再开始下一轮。' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'open-downloads-directory',
    name: '打开下载目录',
    category: '系统维护',
    keywords: ['下载', '文件夹', 'downloads', 'system'],
    description: '打开当前电脑的下载目录，不执行清理或删除操作。',
    variables: [
      { key: 'downloadsDir', label: '下载目录', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'openFolder',
        name: '打开下载目录',
        params: { path: '{{downloadsDir}}' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ]
  },
  {
    id: 'open-records-entry',
    name: '打开账单或记录入口',
    category: '个人常用',
    keywords: ['账单', '记录', '财务', 'records', 'personal'],
    description: '打开个人记录网页和本地资料目录。',
    variables: [
      { key: 'recordsUrl', label: '记录入口 URL', defaultValue: '', required: false, secret: false },
      { key: 'recordsDir', label: '记录文件目录', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'openUrl',
        name: '打开记录入口',
        params: { url: '{{recordsUrl}}' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      },
      {
        type: 'openFolder',
        name: '打开记录目录',
        params: { path: '{{recordsDir}}' },
        enabled: true,
        continueOnError: true,
        riskLevel: 'low'
      }
    ]
  }
]

export function createTaskFromTemplate(template: TaskTemplate): TaskItem {
  const draft = createTaskDraft()
  const source = clonePlainDto(template)
  const variables = source.variables || []
  const generatedVariables = inferMissingInputVariableKeys(source.actions, variables).map((key) => ({
    key,
    label: key,
    defaultValue: '',
    required: true,
    secret: false
  }))
  return normalizeTask({
    ...draft,
    name: source.name,
    category: source.category || draft.category,
    keywords: source.keywords || [],
    description: source.description || '',
    variables: [...variables, ...generatedVariables],
    actions: source.actions.map((action) => ({
      ...action,
      id: `action-${crypto.randomUUID()}`
    }))
  })
}

export function deriveTemplateRisk(template: TaskTemplate): RiskLevel {
  return maxRisk(
    template.actions
      .filter((action) => action.enabled)
      .map((action) => deriveActionRisk({ ...action, id: 'template-action' }))
  )
}
