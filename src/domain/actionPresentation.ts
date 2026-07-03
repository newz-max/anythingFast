import type { ActionType, CommandParams, DelayParams, OpenProgramParams, OpenUrlParams, PathParams, TaskAction } from '@/types/domain'

export const actionTypeOptions: Array<{ label: string; value: ActionType; description: string }> = [
  { label: '打开程序', value: 'openProgram', description: '启动本地可执行程序，可附带启动参数。' },
  { label: '打开 URL', value: 'openUrl', description: '在默认浏览器中打开网页地址。' },
  { label: '打开文件', value: 'openFile', description: '使用系统默认程序打开本地文件。' },
  { label: '打开文件夹', value: 'openFolder', description: '打开本地文件夹位置。' },
  { label: '执行命令', value: 'runCommand', description: '通过 PowerShell 或 cmd 执行本地命令。' },
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
      const terminalMode = params.showTerminal ? '显示终端' : '后台运行'
      if (params.source === 'script') {
        return `${textParam(params.scriptPath) || '未设置脚本文件'} · ${terminalMode}`
      }
      return `${textParam(params.command) || '未设置命令'} · ${terminalMode}`
    }
    case 'delay':
      return `等待 ${numberParam((action.params as DelayParams).durationMs, 0)} ms`
  }
}

function textParam(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function numberParam(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}
