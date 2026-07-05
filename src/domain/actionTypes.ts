import type { ActionParams, ActionType, CommandParams, DelayParams, FieldIssue, OpenProgramParams, OpenUrlParams, PathParams, RiskLevel, TaskAction } from '@/types/domain'
import { hasVariableSyntax, isValidVariableKey } from '@/domain/variables'

export interface ActionTypeOption {
  label: string
  value: ActionType
  description: string
}

interface ActionTypeDefinition {
  label: string
  description: string
  createDefaultParams: () => ActionParams
  describe: (action: TaskAction) => string
  inferRisk: (action: TaskAction) => RiskLevel
  validate: (action: TaskAction, issues: FieldIssue[]) => void
}

export const actionTypeDefinitions: Record<ActionType, ActionTypeDefinition> = {
  openProgram: {
    label: '打开程序',
    description: '启动本地可执行程序，可附带启动参数。',
    createDefaultParams: () => ({ path: '', args: [], workingDir: '' }),
    describe: (action) => textParam((action.params as OpenProgramParams).path) || '未设置程序路径',
    inferRisk: () => 'low',
    validate: (action, issues) => {
      if (!('path' in action.params) || !action.params.path.trim()) {
        issues.push({ field: 'path', message: '程序路径不能为空' })
      }
    }
  },
  openUrl: {
    label: '打开 URL',
    description: '在默认浏览器中打开网页地址。',
    createDefaultParams: () => ({ url: 'https://' }),
    describe: (action) => textParam((action.params as OpenUrlParams).url) || '未设置 URL',
    inferRisk: () => 'low',
    validate: (action, issues) => {
      if (!('url' in action.params) || (!hasVariableSyntax(action.params.url) && !isHttpUrl(action.params.url))) {
        issues.push({ field: 'url', message: 'URL 必须是 http 或 https 地址' })
      }
    }
  },
  openFile: {
    label: '打开文件',
    description: '使用系统默认程序打开本地文件。',
    createDefaultParams: () => ({ path: '' }),
    describe: (action) => textParam((action.params as PathParams).path) || '未设置文件路径',
    inferRisk: () => 'low',
    validate: validatePathParams
  },
  openFolder: {
    label: '打开文件夹',
    description: '打开本地文件夹位置。',
    createDefaultParams: () => ({ path: '' }),
    describe: (action) => textParam((action.params as PathParams).path) || '未设置文件夹路径',
    inferRisk: () => 'low',
    validate: validatePathParams
  },
  runCommand: {
    label: '执行命令',
    description: '通过 PowerShell 7、PowerShell 或 cmd 执行本地命令，可选择终端宿主。',
    createDefaultParams: () => ({
      source: 'inline',
      command: '',
      workingDir: '',
      env: {},
      showTerminal: false,
      closeTerminalOnFinish: true,
      terminalHost: 'systemTerminal',
      shell: 'pwsh',
      scriptPath: '',
      scriptArgs: []
    }),
    describe: (action) => {
      const params = action.params as CommandParams
      const terminalMode = params.showTerminal
        ? params.closeTerminalOnFinish === false
          ? '显示终端，完成后保留'
          : '显示终端'
        : '后台运行'
      if (params.source === 'script') {
        return `${textParam(params.scriptPath) || '未设置脚本文件'} · ${terminalMode}`
      }
      return `${textParam(params.command) || '未设置命令'} · ${terminalMode}`
    },
    inferRisk: (action) => {
      if ('command' in action.params && action.params.source === 'script') {
        return 'high'
      }

      const command = 'command' in action.params ? action.params.command.toLowerCase() : ''
      if (/\b(rm|del|erase|rmdir|rd|format|shutdown|reg\s+delete|takeown|icacls|install|npm\s+i|pnpm\s+add|yarn\s+add)\b/.test(command)) {
        return 'high'
      }

      if (/>|--force|-f\b|remove-item|set-executionpolicy|start-process\s+.*-verb\s+runas/.test(command)) {
        return 'high'
      }

      return 'medium'
    },
    validate: (action, issues) => {
      if (!('command' in action.params)) {
        issues.push({ field: 'command', message: '命令内容不能为空' })
        return
      }
      if ((action.params.source || 'inline') === 'script') {
        if (!action.params.scriptPath?.trim()) {
          issues.push({ field: 'scriptPath', message: '脚本文件不能为空' })
        } else if (!hasVariableSyntax(action.params.scriptPath) && !isSupportedScriptPath(action.params.scriptPath)) {
          issues.push({ field: 'scriptPath', message: '脚本文件必须是 ps1、cmd 或 bat' })
        } else if (!hasVariableSyntax(action.params.scriptPath) && isPowerShellScriptPath(action.params.scriptPath) && action.params.shell === 'cmd') {
          issues.push({ field: 'shell', message: 'ps1 脚本必须使用 PowerShell 7 或 PowerShell' })
        }
      } else if (!action.params.command.trim()) {
        issues.push({ field: 'command', message: '命令内容不能为空' })
      }
      if (!action.params.workingDir?.trim()) {
        issues.push({ field: 'workingDir', message: '工作目录不能为空' })
      }
      if (!isSupportedCommandShell(action.params.shell)) {
        issues.push({ field: 'shell', message: 'Shell 必须是 PowerShell 7、PowerShell 或 cmd' })
      }
      if (!isSupportedTerminalHost(action.params.terminalHost)) {
        issues.push({ field: 'terminalHost', message: '终端宿主必须是系统终端或直接启动 Shell' })
      }
      validateOutputBinding(action, issues)
    }
  },
  delay: {
    label: '延时等待',
    description: '在动作之间等待一段时间。',
    createDefaultParams: () => ({ durationMs: 1000 }),
    describe: (action) => `等待 ${numberParam((action.params as DelayParams).durationMs, 0)} ms`,
    inferRisk: () => 'low',
    validate: (action, issues) => {
      if ('durationMs' in action.params && action.params.durationMs !== undefined && action.params.durationMs !== null && action.params.durationMs <= 0) {
        issues.push({ field: 'durationMs', message: '等待时长必须大于 0' })
      }
    }
  }
}

export const actionTypeOptions: ActionTypeOption[] = Object.entries(actionTypeDefinitions).map(
  ([value, definition]) => ({
    label: definition.label,
    value: value as ActionType,
    description: definition.description
  })
)

export function getActionDefinition(type: ActionType) {
  return actionTypeDefinitions[type]
}

export function getActionTypeLabel(type: ActionType) {
  return getActionDefinition(type).label
}

export function createDefaultActionParams(type: ActionType) {
  return getActionDefinition(type).createDefaultParams()
}

export function describeActionByDefinition(action: TaskAction) {
  return getActionDefinition(action.type).describe(action)
}

export function inferActionRiskByDefinition(action: TaskAction) {
  return getActionDefinition(action.type).inferRisk(action)
}

export function validateActionParamsByDefinition(action: TaskAction, issues: FieldIssue[]) {
  getActionDefinition(action.type).validate(action, issues)
}

function validatePathParams(action: TaskAction, issues: FieldIssue[]) {
  if (!('path' in action.params) || !action.params.path.trim()) {
    issues.push({ field: 'path', message: '路径不能为空' })
  }
}

function validateOutputBinding(action: TaskAction, issues: FieldIssue[]) {
  if (!action.outputBinding) return
  const bindings = [
    ['outputBinding.stdoutVariable', action.outputBinding.stdoutVariable],
    ['outputBinding.stderrVariable', action.outputBinding.stderrVariable],
    ['outputBinding.exitCodeVariable', action.outputBinding.exitCodeVariable]
  ] as const
  bindings.forEach(([field, key]) => {
    if (key && !isValidVariableKey(key)) {
      issues.push({ field, message: '输出绑定变量 key 无效' })
    }
  })
}

function textParam(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberParam(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}

function isSupportedScriptPath(value: string) {
  return /\.(ps1|cmd|bat)$/i.test(value.trim())
}

function isPowerShellScriptPath(value: string) {
  return /\.ps1$/i.test(value.trim())
}

function isSupportedCommandShell(value: string) {
  return value === 'pwsh' || value === 'powershell' || value === 'cmd'
}

function isSupportedTerminalHost(value: unknown) {
  return value === undefined || value === 'systemTerminal' || value === 'direct'
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
