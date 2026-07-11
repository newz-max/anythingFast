import type {
  ActionParams,
  ActionType,
  CommandParams,
  DelayParams,
  FieldIssue,
  OpenProgramParams,
  OpenUrlParams,
  PathParams,
  ReadClipboardParams,
  RiskLevel,
  ShowNotificationParams,
  TaskAction,
  WaitForPortParams
} from '@/types/domain'
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
    description: '通过终端默认配置、PowerShell 7、PowerShell 或 cmd 执行本地命令。',
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
        issues.push({ field: 'shell', message: 'Shell 必须是终端默认配置、PowerShell 7、PowerShell 或 cmd' })
      }
      if (action.params.shell === 'terminal' && (!action.params.showTerminal || action.params.terminalHost === 'direct')) {
        issues.push({ field: 'shell', message: '终端默认配置只能在显示系统终端时使用' })
      }
      if (!isSupportedTerminalHost(action.params.terminalHost)) {
        issues.push({ field: 'terminalHost', message: '终端宿主必须是系统终端或直接启动 Shell' })
      }
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
  },
  writeClipboard: {
    label: '写入剪贴板',
    description: '将文本写入系统剪贴板，可引用运行变量。',
    createDefaultParams: () => ({ text: '' }),
    describe: () => '写入剪贴板文本',
    inferRisk: () => 'low',
    validate: (action, issues) => {
      if (!('text' in action.params) || !textParam(action.params.text)) {
        issues.push({ field: 'text', message: '剪贴板文本不能为空' })
      }
    }
  },
  readClipboard: {
    label: '读取剪贴板',
    description: '读取系统剪贴板文本并作为密文运行时变量提供给后续动作。',
    createDefaultParams: () => ({ targetVariable: 'clipboardText' }),
    describe: (action) => `读取剪贴板到变量：${textParam((action.params as ReadClipboardParams).targetVariable) || '未设置'}`,
    inferRisk: () => 'high',
    validate: (action, issues) => {
      const targetVariable = 'targetVariable' in action.params ? action.params.targetVariable.trim() : ''
      if (!isValidVariableKey(targetVariable)) {
        issues.push({ field: 'targetVariable', message: '目标变量 key 无效' })
      }
    }
  },
  showNotification: {
    label: '系统通知',
    description: '向系统通知中心发送一条最佳努力提醒。',
    createDefaultParams: () => ({ title: '', body: '' }),
    describe: () => '发送系统通知',
    inferRisk: () => 'low',
    validate: (action, issues) => {
      if (!('title' in action.params) || !textParam((action.params as ShowNotificationParams).title)) {
        issues.push({ field: 'title', message: '通知标题不能为空' })
      }
    }
  },
  waitForPort: {
    label: '等待端口',
    description: '等待指定主机的 TCP 端口可连接后继续。',
    createDefaultParams: () => ({ host: '127.0.0.1', port: 3000 }),
    describe: (action) => {
      const params = action.params as WaitForPortParams
      const host = textParam(params.host) || '未设置主机'
      return `等待 ${host}:${numberParam(params.port, 0) || '未设置端口'}`
    },
    inferRisk: () => 'low',
    validate: (action, issues) => {
      const params = action.params as WaitForPortParams
      if (!textParam(params.host)) {
        issues.push({ field: 'host', message: '主机不能为空' })
      }
      if (!Number.isInteger(params.port) || params.port < 1 || params.port > 65535) {
        issues.push({ field: 'port', message: '端口必须在 1 到 65535 之间' })
      }
      if (!Number.isInteger(action.timeoutMs) || !action.timeoutMs || action.timeoutMs < 1000 || action.timeoutMs > 600000) {
        issues.push({ field: 'timeoutMs', message: '端口等待超时时间必须在 1000 到 600000 ms 之间' })
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
  return value === 'terminal' || value === 'pwsh' || value === 'powershell' || value === 'cmd'
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
