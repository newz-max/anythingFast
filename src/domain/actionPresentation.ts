import type {
  ActionCondition,
  ActionType,
  CommandParams,
  DelayParams,
  OpenProgramParams,
  OpenUrlParams,
  PathParams,
  PreviousActionStatusConditionValue,
  TaskAction
} from '@/types/domain'

export const actionTypeOptions: Array<{ label: string; value: ActionType; description: string }> = [
  { label: '打开程序', value: 'openProgram', description: '启动本地可执行程序，可附带启动参数。' },
  { label: '打开 URL', value: 'openUrl', description: '在默认浏览器中打开网页地址。' },
  { label: '打开文件', value: 'openFile', description: '使用系统默认程序打开本地文件。' },
  { label: '打开文件夹', value: 'openFolder', description: '打开本地文件夹位置。' },
  { label: '执行命令', value: 'runCommand', description: '通过 PowerShell 7、PowerShell 或 cmd 执行本地命令。' },
  { label: '延时等待', value: 'delay', description: '在动作之间等待一段时间。' }
]

export function getActionTypeLabel(type: ActionType) {
  return actionTypeOptions.find((option) => option.value === type)?.label || type
}

export function describeAction(action: TaskAction) {
  switch (action.type) {
    case 'openProgram':
      return textParam((action.params as OpenProgramParams).path) || '未设置程序路径'
    case 'openUrl':
      return textParam((action.params as OpenUrlParams).url) || '未设置 URL'
    case 'openFile':
      return textParam((action.params as PathParams).path) || '未设置文件路径'
    case 'openFolder':
      return textParam((action.params as PathParams).path) || '未设置文件夹路径'
    case 'runCommand': {
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
    }
    case 'delay':
      return `等待 ${numberParam((action.params as DelayParams).durationMs, 0)} ms`
  }
}

export function describeCondition(condition: ActionCondition | null | undefined) {
  if (!condition || condition.type === 'always') return '始终执行'
  switch (condition.type) {
    case 'fileExists':
      return `仅当文件存在：${textParam(condition.path) || '未设置路径'}`
    case 'folderExists':
      return `仅当文件夹存在：${textParam(condition.path) || '未设置路径'}`
    case 'variableEquals':
      return `仅当变量 ${textParam(condition.variable) || '未设置'} 等于 ${textParam(condition.value) || '空值'}`
    case 'variableNotEmpty':
      return `仅当变量 ${textParam(condition.variable) || '未设置'} 非空`
    case 'previousActionStatus':
      return `仅当上一动作${previousStatusLabel(condition.status)}`
  }
}

function previousStatusLabel(status: PreviousActionStatusConditionValue) {
  const labels: Record<PreviousActionStatusConditionValue, string> = {
    success: '成功',
    failed: '失败',
    skipped: '已跳过'
  }
  return labels[status]
}

function textParam(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberParam(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}
