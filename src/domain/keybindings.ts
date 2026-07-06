import type { KeybindingOverride, KeybindingScope } from '@/types/domain'

export type KeybindingCommand =
  | 'main.focusSearch'
  | 'main.selectNextTask'
  | 'main.selectPreviousTask'
  | 'main.runSelectedTask'
  | 'main.createTask'
  | 'main.editSelectedTask'
  | 'main.toggleFavorite'
  | 'main.toggleExecutionLogs'
  | 'main.showActionList'
  | 'main.showFlowPreview'
  | 'main.addAction'
  | 'quick.focusSearch'
  | 'quick.closePanel'
  | 'quick.selectNextResult'
  | 'quick.selectPreviousResult'
  | 'quick.executeSelected'
  | 'taskEditor.save'
  | 'taskEditor.close'
  | 'taskEditor.previousStep'
  | 'taskEditor.nextStep'
  | 'actionEditor.save'
  | 'actionEditor.close'
  | 'actionEditor.previousStep'
  | 'actionEditor.nextStep'

export interface KeybindingDefinition {
  command: KeybindingCommand
  scope: KeybindingScope
  defaultKey: string
  label: string
  description: string
  editable: boolean
}

export interface ParsedKeybinding {
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  key: string
}

export interface EffectiveKeybinding extends KeybindingDefinition {
  key: string
  normalizedKey: string
  enabled: boolean
  customized: boolean
  invalid?: string
}

export interface KeybindingIssue {
  command?: string
  field: string
  message: string
}

export const keybindingScopeLabels: Record<KeybindingScope, string> = {
  main: '主窗口',
  'quick-search': '快捷搜索',
  'task-editor': '事项编辑器',
  'action-editor': '动作编辑器'
}

export const defaultKeybindings: KeybindingDefinition[] = [
  {
    command: 'main.focusSearch',
    scope: 'main',
    defaultKey: '/',
    label: '聚焦事项搜索',
    description: '在主窗口中聚焦事项搜索框。',
    editable: true
  },
  {
    command: 'main.selectNextTask',
    scope: 'main',
    defaultKey: 'ArrowDown',
    label: '选择下一个事项',
    description: '在当前可见事项列表中向下移动选择。',
    editable: true
  },
  {
    command: 'main.selectPreviousTask',
    scope: 'main',
    defaultKey: 'ArrowUp',
    label: '选择上一个事项',
    description: '在当前可见事项列表中向上移动选择。',
    editable: true
  },
  {
    command: 'main.runSelectedTask',
    scope: 'main',
    defaultKey: 'Ctrl+Enter',
    label: '运行选中事项',
    description: '触发和运行按钮相同的事项执行流程。',
    editable: true
  },
  {
    command: 'main.createTask',
    scope: 'main',
    defaultKey: 'Ctrl+N',
    label: '新增事项',
    description: '打开新增事项流程。',
    editable: true
  },
  {
    command: 'main.editSelectedTask',
    scope: 'main',
    defaultKey: 'Ctrl+E',
    label: '编辑选中事项',
    description: '打开选中事项的编辑流程。',
    editable: true
  },
  {
    command: 'main.toggleFavorite',
    scope: 'main',
    defaultKey: 'F',
    label: '切换收藏',
    description: '收藏或取消收藏当前选中事项。',
    editable: true
  },
  {
    command: 'main.toggleExecutionLogs',
    scope: 'main',
    defaultKey: 'Ctrl+Backquote',
    label: '切换执行日志',
    description: '显示或隐藏执行日志面板。',
    editable: true
  },
  {
    command: 'main.showActionList',
    scope: 'main',
    defaultKey: '1',
    label: '显示动作列表',
    description: '切换选中事项的动作区域到列表视图。',
    editable: true
  },
  {
    command: 'main.showFlowPreview',
    scope: 'main',
    defaultKey: '2',
    label: '显示流程预览',
    description: '切换选中事项的动作区域到流程预览。',
    editable: true
  },
  {
    command: 'main.addAction',
    scope: 'main',
    defaultKey: 'A',
    label: '添加动作',
    description: '打开选中事项编辑器并定位到动作步骤。',
    editable: true
  },
  {
    command: 'quick.focusSearch',
    scope: 'quick-search',
    defaultKey: '/',
    label: '聚焦快捷搜索',
    description: '在快捷搜索面板中聚焦搜索框。',
    editable: true
  },
  {
    command: 'quick.closePanel',
    scope: 'quick-search',
    defaultKey: 'Escape',
    label: '关闭快捷搜索',
    description: '隐藏快捷搜索面板。',
    editable: true
  },
  {
    command: 'quick.selectNextResult',
    scope: 'quick-search',
    defaultKey: 'ArrowDown',
    label: '选择下一个结果',
    description: '移动到下一个快捷搜索结果。',
    editable: true
  },
  {
    command: 'quick.selectPreviousResult',
    scope: 'quick-search',
    defaultKey: 'ArrowUp',
    label: '选择上一个结果',
    description: '移动到上一个快捷搜索结果。',
    editable: true
  },
  {
    command: 'quick.executeSelected',
    scope: 'quick-search',
    defaultKey: 'Enter',
    label: '执行选中结果',
    description: '执行当前选中的快捷搜索结果。',
    editable: true
  },
  {
    command: 'taskEditor.save',
    scope: 'task-editor',
    defaultKey: 'Ctrl+S',
    label: '保存事项',
    description: '保存当前事项编辑器内容。',
    editable: true
  },
  {
    command: 'taskEditor.close',
    scope: 'task-editor',
    defaultKey: 'Escape',
    label: '关闭事项编辑器',
    description: '关闭当前事项编辑器。',
    editable: true
  },
  {
    command: 'taskEditor.previousStep',
    scope: 'task-editor',
    defaultKey: 'Ctrl+ArrowLeft',
    label: '上一步',
    description: '切换到事项编辑器上一步。',
    editable: true
  },
  {
    command: 'taskEditor.nextStep',
    scope: 'task-editor',
    defaultKey: 'Ctrl+ArrowRight',
    label: '下一步',
    description: '切换到事项编辑器下一步。',
    editable: true
  },
  {
    command: 'actionEditor.save',
    scope: 'action-editor',
    defaultKey: 'Ctrl+S',
    label: '保存动作',
    description: '保存当前动作编辑器内容。',
    editable: true
  },
  {
    command: 'actionEditor.close',
    scope: 'action-editor',
    defaultKey: 'Escape',
    label: '关闭动作编辑器',
    description: '关闭当前动作编辑器。',
    editable: true
  },
  {
    command: 'actionEditor.previousStep',
    scope: 'action-editor',
    defaultKey: 'Ctrl+ArrowLeft',
    label: '上一步',
    description: '切换到动作编辑器上一步。',
    editable: true
  },
  {
    command: 'actionEditor.nextStep',
    scope: 'action-editor',
    defaultKey: 'Ctrl+ArrowRight',
    label: '下一步',
    description: '切换到动作编辑器下一步。',
    editable: true
  }
]

const commandSet = new Set<string>(defaultKeybindings.map((definition) => definition.command))
const modifierNames = new Map([
  ['ctrl', 'ctrl'],
  ['control', 'ctrl'],
  ['alt', 'alt'],
  ['shift', 'shift'],
  ['meta', 'meta'],
  ['cmd', 'meta'],
  ['command', 'meta'],
  ['win', 'meta'],
  ['windows', 'meta']
])
const namedKeys = new Map([
  ['enter', 'Enter'],
  ['escape', 'Escape'],
  ['esc', 'Escape'],
  ['arrowup', 'ArrowUp'],
  ['up', 'ArrowUp'],
  ['arrowdown', 'ArrowDown'],
  ['down', 'ArrowDown'],
  ['arrowleft', 'ArrowLeft'],
  ['left', 'ArrowLeft'],
  ['arrowright', 'ArrowRight'],
  ['right', 'ArrowRight'],
  ['backquote', 'Backquote'],
  ['`', 'Backquote'],
  ['space', 'Space'],
  [' ', 'Space'],
  ['tab', 'Tab'],
  ['backspace', 'Backspace'],
  ['delete', 'Delete'],
  ['del', 'Delete']
])

export function isKnownKeybindingCommand(command: string): command is KeybindingCommand {
  return commandSet.has(command)
}

export function parseKeybinding(value: string): ParsedKeybinding | null {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  const parsed: ParsedKeybinding = {
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    key: ''
  }

  for (const rawPart of parts) {
    const normalizedPart = rawPart.toLowerCase()
    const modifier = modifierNames.get(normalizedPart)
    if (modifier) {
      if (parsed[modifier as keyof Omit<ParsedKeybinding, 'key'>]) return null
      parsed[modifier as keyof Omit<ParsedKeybinding, 'key'>] = true
      continue
    }
    if (parsed.key) return null
    parsed.key = normalizeKeyName(rawPart)
  }

  if (!parsed.key) return null
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(parsed.key)) return null
  return parsed
}

export function normalizeKeybinding(value: string) {
  const parsed = parseKeybinding(value)
  return parsed ? keybindingToString(parsed) : ''
}

export function keybindingToString(parsed: ParsedKeybinding) {
  return [
    parsed.ctrl ? 'Ctrl' : '',
    parsed.alt ? 'Alt' : '',
    parsed.shift ? 'Shift' : '',
    parsed.meta ? 'Meta' : '',
    parsed.key
  ]
    .filter(Boolean)
    .join('+')
}

export function formatKeybinding(value: string) {
  return normalizeKeybinding(value) || value.trim()
}

export function eventMatchesKeybinding(event: KeyboardEvent, keybinding: string) {
  const parsed = parseKeybinding(keybinding)
  if (!parsed) return false
  const eventKey = normalizeEventKey(event)
  const ctrlMatches = parsed.ctrl ? event.ctrlKey || event.metaKey : !event.ctrlKey
  const metaMatches = parsed.meta ? event.metaKey : parsed.ctrl ? true : !event.metaKey
  return (
    ctrlMatches &&
    parsed.alt === event.altKey &&
    parsed.shift === event.shiftKey &&
    metaMatches &&
    parsed.key === eventKey
  )
}

export function resolveEffectiveKeybindings(overrides: KeybindingOverride[]) {
  const overrideByCommand = new Map(overrides.map((override) => [override.command, override]))
  return defaultKeybindings.map<EffectiveKeybinding>((definition) => {
    const override = overrideByCommand.get(definition.command)
    const disabled = override?.disabled === true
    const key = override?.key?.trim() || definition.defaultKey
    const normalizedKey = normalizeKeybinding(key)
    return {
      ...definition,
      key: normalizedKey || key,
      normalizedKey,
      enabled: !disabled && Boolean(normalizedKey),
      customized: Boolean(override && (disabled || normalizeKeybinding(override.key || '') !== normalizeKeybinding(definition.defaultKey))),
      invalid: normalizedKey ? undefined : '快捷键格式无效'
    }
  })
}

export function validateKeybindingOverrides(overrides: KeybindingOverride[]): KeybindingIssue[] {
  const issues: KeybindingIssue[] = []
  const effective = resolveEffectiveKeybindings(overrides)
  const byScopeAndKey = new Map<string, EffectiveKeybinding>()

  for (const override of overrides) {
    if (!isKnownKeybindingCommand(override.command)) {
      issues.push({
        command: override.command,
        field: 'command',
        message: `未知快捷键命令：${override.command}`
      })
    }
    if (!override.disabled && override.key !== undefined && !normalizeKeybinding(override.key || '')) {
      issues.push({
        command: override.command,
        field: 'key',
        message: '快捷键格式无效，请使用例如 Ctrl+Enter、Alt+F、Escape 或 ArrowDown'
      })
    }
  }

  for (const item of effective) {
    if (!item.enabled) continue
    const mapKey = `${item.scope}:${item.normalizedKey}`
    const existing = byScopeAndKey.get(mapKey)
    if (existing) {
      issues.push({
        command: item.command,
        field: 'key',
        message: `${keybindingScopeLabels[item.scope]} 中与“${existing.label}”冲突`
      })
      continue
    }
    byScopeAndKey.set(mapKey, item)
  }

  return issues
}

export function keybindingWarningsForExternalShortcuts(
  effective: EffectiveKeybinding[],
  externalShortcuts: string[]
) {
  const external = new Set(externalShortcuts.map(normalizeKeybinding).filter(Boolean))
  return effective
    .filter((item) => item.enabled && external.has(item.normalizedKey))
    .map((item) => `${item.label} 与系统级快捷键 ${item.key} 重叠，但作用范围不同`)
}

export function keybindingMatchesCommand(
  event: KeyboardEvent,
  command: KeybindingCommand,
  effective: EffectiveKeybinding[]
) {
  const item = effective.find((entry) => entry.command === command)
  return Boolean(item?.enabled && eventMatchesKeybinding(event, item.key))
}

export function overrideForKey(command: KeybindingCommand, key: string): KeybindingOverride | null {
  const definition = defaultKeybindings.find((item) => item.command === command)
  const normalizedKey = normalizeKeybinding(key)
  if (!definition || !normalizedKey) return null
  if (normalizedKey === normalizeKeybinding(definition.defaultKey)) return null
  return { command, key: normalizedKey }
}

export function disabledOverride(command: KeybindingCommand): KeybindingOverride {
  return { command, disabled: true }
}

function normalizeKeyName(value: string) {
  const trimmed = value.trim()
  const named = namedKeys.get(trimmed.toLowerCase())
  if (named) return named
  if (trimmed.length === 1) return /[a-z]/i.test(trimmed) ? trimmed.toUpperCase() : trimmed
  if (/^f([1-9]|1[0-2])$/i.test(trimmed)) return trimmed.toUpperCase()
  return ''
}

function normalizeEventKey(event: KeyboardEvent) {
  if (event.code === 'Backquote' || event.key === '`') return 'Backquote'
  if (event.key === ' ') return 'Space'
  return normalizeKeyName(event.key)
}
