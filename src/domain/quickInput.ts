import { getActionTypeLabel } from '@/domain/actionTypes'
import { deriveActionRisk, deriveTaskRisk } from '@/domain/risk'
import { createActionDraft, createTaskDraft } from '@/domain/taskFactory'
import type { ActionType, CommandParams, PathParams, TaskItem } from '@/types/domain'

export type QuickInputKind = 'url' | 'path' | 'command'
export type QuickPathKind = 'file' | 'folder' | 'unknown'

export interface QuickInputTokens {
  raw: string
  body: string
  category?: string
  tagNames: string[]
  keywords: string[]
  runImmediately: boolean
}

export interface QuickInputIntent {
  kind: QuickInputKind
  raw: string
  value: string
  pathKind?: QuickPathKind
  tokens: QuickInputTokens
}

export interface QuickCreateDraftOptions {
  name?: string
  category?: string
  keywords?: string[]
  favorite?: boolean
  workingDir?: string
}

export interface QuickCreateSuggestion {
  id: string
  intent: QuickInputIntent
  title: string
  detail: string
  actionType: ActionType
  canSaveDirectly: boolean
  pending?: boolean
  message?: string
}

const TOKEN_PATTERN = /^(#|@|\?)(.+)$/
const COMMAND_PREFIX_PATTERN = /^cmd\s*:/i
const DRIVE_PATH_PATTERN = /^[a-zA-Z]:[\\/](?:.+)?$/
const UNC_PATH_PATTERN = /^\\\\[^\\/\s]+[\\/][^\\/\s]+(?:[\\/].*)?$/
const MAX_COMMAND_NAME_LENGTH = 24

export function parseQuickInputTokens(input: string): QuickInputTokens {
  const raw = input
  const categoryValues: string[] = []
  const tagNames: string[] = []
  const keywords: string[] = []
  let runImmediately = false

  const bodyParts = input
    .trim()
    .split(/\s+/)
    .filter((part) => {
      if (!part) return false
      if (part.toLowerCase() === '!run') {
        runImmediately = true
        return false
      }

      const match = part.match(TOKEN_PATTERN)
      if (!match) return true

      const value = match[2]?.trim()
      if (!value) return true

      if (match[1] === '#') {
        categoryValues.push(value)
        return false
      }
      if (match[1] === '@') {
        tagNames.push(value)
        return false
      }
      keywords.push(value)
      return false
    })

  return {
    raw,
    body: stripOuterQuotes(bodyParts.join(' ').trim()),
    category: categoryValues.at(-1),
    tagNames,
    keywords,
    runImmediately
  }
}

export function parseQuickInputIntent(input: string): QuickInputIntent | null {
  const tokens = parseQuickInputTokens(input)
  const body = tokens.body.trim()
  if (!body) return null

  if (COMMAND_PREFIX_PATTERN.test(body)) {
    const command = body.replace(COMMAND_PREFIX_PATTERN, '').trim()
    if (!command) return null
    return {
      kind: 'command',
      raw: input,
      value: command,
      tokens: { ...tokens, body: command }
    }
  }

  const urlIntent = parseUrlIntent(input, body, tokens)
  if (urlIntent) return urlIntent

  if (isWindowsPathCandidate(body)) {
    return {
      kind: 'path',
      raw: input,
      value: body,
      pathKind: 'unknown',
      tokens
    }
  }

  return null
}

export function withQuickPathInspection(
  intent: QuickInputIntent,
  inspection: { exists: boolean; kind: QuickPathKind; normalizedPath: string }
): QuickInputIntent {
  if (intent.kind !== 'path') return intent
  return {
    ...intent,
    value: inspection.normalizedPath || intent.value,
    pathKind: inspection.exists ? inspection.kind : 'unknown'
  }
}

export function defaultQuickTaskName(intent: QuickInputIntent) {
  if (intent.kind === 'url') {
    try {
      const url = new URL(intent.value)
      return `打开 ${url.hostname || intent.value}`
    } catch {
      return '打开 URL'
    }
  }

  if (intent.kind === 'command') {
    const command = intent.value.length > MAX_COMMAND_NAME_LENGTH ? `${intent.value.slice(0, MAX_COMMAND_NAME_LENGTH)}...` : intent.value
    return `执行 ${command}`
  }

  const name = basename(intent.value)
  if (intent.pathKind === 'folder') return `打开 ${name || '文件夹'}`
  if (intent.pathKind === 'file') return `打开 ${name || '文件'}`
  return `打开 ${name || '路径'}`
}

export function quickIntentActionLabel(intent: QuickInputIntent) {
  if (intent.kind === 'url') return '创建打开 URL 事项'
  if (intent.kind === 'command') return '创建命令事项'
  if (intent.pathKind === 'folder') return '创建打开文件夹事项'
  if (intent.pathKind === 'file') return '创建打开文件事项'
  return '识别到路径'
}

export function createQuickCreateSuggestion(intent: QuickInputIntent, options: { pending?: boolean; message?: string } = {}): QuickCreateSuggestion | null {
  const actionType = quickIntentActionType(intent)
  const canSaveDirectly = Boolean(actionType)
  if (!canSaveDirectly && intent.kind !== 'path') return null

  return {
    id: `${intent.kind}:${intent.value}:${intent.pathKind || 'none'}`,
    intent,
    title: quickIntentActionLabel(intent),
    detail: quickIntentDetail(intent, options),
    actionType: actionType || 'openFolder',
    canSaveDirectly,
    pending: options.pending,
    message: options.message
  }
}

export function createQuickTaskFromIntent(intent: QuickInputIntent, options: QuickCreateDraftOptions = {}): TaskItem {
  const actionType = quickIntentActionType(intent)
  if (!actionType) {
    throw new Error('当前输入不能直接创建事项')
  }

  const task = createTaskDraft()
  const action = createActionDraft(actionType)
  const category = options.category?.trim() || intent.tokens.category || '未分类'
  const keywords = options.keywords ?? intent.tokens.keywords

  action.name = getActionTypeLabel(actionType)
  if (actionType === 'openUrl') {
    action.params = { url: intent.value }
  } else if (actionType === 'openFile' || actionType === 'openFolder') {
    action.params = { path: intent.value } satisfies PathParams
  } else if (actionType === 'runCommand') {
    action.params = {
      source: 'inline',
      command: intent.value,
      workingDir: options.workingDir?.trim() || '',
      env: {},
      showTerminal: false,
      closeTerminalOnFinish: true,
      terminalHost: 'systemTerminal',
      shell: 'pwsh',
      scriptPath: '',
      scriptArgs: []
    } satisfies CommandParams
  }
  action.riskLevel = deriveActionRisk(action)

  const nextTask: TaskItem = {
    ...task,
    name: options.name?.trim() || defaultQuickTaskName(intent),
    category,
    keywords: normalizeKeywords(keywords),
    favorite: options.favorite ?? false,
    actions: [action]
  }

  return {
    ...nextTask,
    riskLevel: deriveTaskRisk(nextTask)
  }
}

export function quickIntentActionType(intent: QuickInputIntent): ActionType | null {
  if (intent.kind === 'url') return 'openUrl'
  if (intent.kind === 'command') return 'runCommand'
  if (intent.pathKind === 'file') return 'openFile'
  if (intent.pathKind === 'folder') return 'openFolder'
  return null
}

function parseUrlIntent(input: string, body: string, tokens: QuickInputTokens): QuickInputIntent | null {
  try {
    const url = new URL(body)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return {
      kind: 'url',
      raw: input,
      value: url.toString(),
      tokens
    }
  } catch {
    return null
  }
}

function quickIntentDetail(intent: QuickInputIntent, options: { pending?: boolean; message?: string }) {
  if (options.pending) return '正在确认路径类型'
  if (options.message) return options.message
  if (intent.kind === 'url') return intent.value
  if (intent.kind === 'command') return intent.value
  if (intent.pathKind === 'file') return intent.value
  if (intent.pathKind === 'folder') return intent.value
  return '需要桌面运行时确认路径类型'
}

function isWindowsPathCandidate(value: string) {
  return DRIVE_PATH_PATTERN.test(value) || UNC_PATH_PATTERN.test(value)
}

function stripOuterQuotes(value: string) {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function basename(path: string) {
  const normalized = path.replace(/[\\/]+$/, '')
  const parts = normalized.split(/[\\/]/)
  return parts.at(-1) || normalized
}

function normalizeKeywords(keywords: string[]) {
  return Array.from(new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean)))
}
