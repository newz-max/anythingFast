import type { FieldIssue, TaskAction, TaskItem, ValidationResult } from '@/types/domain'
import { deriveActionRisk, deriveTaskRisk } from '@/domain/risk'

export function validateTaskLocal(task: TaskItem, allTasks: TaskItem[] = []): ValidationResult {
  const issues: FieldIssue[] = []

  if (!task.name.trim()) {
    issues.push({ field: 'name', message: '事项名称不能为空' })
  }

  if (allTasks.some((item) => item.id !== task.id && item.name.trim() === task.name.trim())) {
    issues.push({ field: 'name', message: '事项名称建议保持唯一' })
  }

  if (task.actions.length === 0) {
    issues.push({ field: 'actions', message: '至少需要一个动作' })
  }

  task.actions.forEach((action, index) => {
    validateActionLocal(action).issues.forEach((issue) => {
      issues.push({ field: `actions.${index}.${issue.field}`, message: issue.message })
    })
  })

  return {
    valid: issues.length === 0,
    issues,
    riskLevel: deriveTaskRisk(task)
  }
}

export function validateActionLocal(action: TaskAction): ValidationResult {
  const issues: FieldIssue[] = []

  if (action.timeoutMs !== undefined && action.timeoutMs <= 0) {
    issues.push({ field: 'timeoutMs', message: '超时时间必须大于 0' })
  }

  switch (action.type) {
    case 'openProgram':
      if (!('path' in action.params) || !action.params.path.trim()) {
        issues.push({ field: 'path', message: '程序路径不能为空' })
      }
      break
    case 'openUrl':
      if (!('url' in action.params) || !isHttpUrl(action.params.url)) {
        issues.push({ field: 'url', message: 'URL 必须是 http 或 https 地址' })
      }
      break
    case 'openFile':
    case 'openFolder':
      if (!('path' in action.params) || !action.params.path.trim()) {
        issues.push({ field: 'path', message: '路径不能为空' })
      }
      break
    case 'runCommand':
      if (!('command' in action.params)) {
        issues.push({ field: 'command', message: '命令内容不能为空' })
        break
      }
      if ((action.params.source || 'inline') === 'script') {
        if (!action.params.scriptPath?.trim()) {
          issues.push({ field: 'scriptPath', message: '脚本文件不能为空' })
        } else if (!isSupportedScriptPath(action.params.scriptPath)) {
          issues.push({ field: 'scriptPath', message: '脚本文件必须是 ps1、cmd 或 bat' })
        }
      } else if (!action.params.command.trim()) {
        issues.push({ field: 'command', message: '命令内容不能为空' })
      }
      if (!action.params.workingDir?.trim()) {
        issues.push({ field: 'workingDir', message: '工作目录不能为空' })
      }
      break
    case 'delay':
      if ('durationMs' in action.params && action.params.durationMs !== undefined && action.params.durationMs !== null && action.params.durationMs <= 0) {
        issues.push({ field: 'durationMs', message: '等待时长必须大于 0' })
      }
      break
  }

  return {
    valid: issues.length === 0,
    issues,
    riskLevel: deriveActionRisk(action)
  }
}

function isSupportedScriptPath(value: string) {
  return /\.(ps1|cmd|bat)$/i.test(value.trim())
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
