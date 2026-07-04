import type { FieldIssue, TaskAction, TaskItem, ValidationResult } from '@/types/domain'
import { deriveActionRisk, deriveTaskRisk } from '@/domain/risk'
import { collectActionStringValues, extractVariableReferences, hasInvalidVariableSyntax, hasVariableSyntax, isValidVariableKey } from '@/domain/variables'

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

  const variableKeys = new Set<string>()
  ;(task.variables || []).forEach((variable, index) => {
    const key = variable.key.trim()
    if (!isValidVariableKey(key)) {
      issues.push({ field: `variables.${index}.key`, message: '变量 key 只能包含字母、数字和下划线，且不能以数字开头' })
    }
    if (variableKeys.has(key)) {
      issues.push({ field: `variables.${index}.key`, message: '变量 key 不能重复' })
    }
    variableKeys.add(key)
    if (!variable.label.trim()) {
      issues.push({ field: `variables.${index}.label`, message: '变量标签不能为空' })
    }
  })
  task.actions.forEach((action) => {
    if (!action.outputBinding) return
    ;[
      action.outputBinding.stdoutVariable,
      action.outputBinding.stderrVariable,
      action.outputBinding.exitCodeVariable
    ].forEach((key) => {
      if (key && isValidVariableKey(key)) {
        variableKeys.add(key)
      }
    })
  })

  task.actions.forEach((action, index) => {
    validateActionLocal(action).issues.forEach((issue) => {
      issues.push({ field: `actions.${index}.${issue.field}`, message: issue.message })
    })
    collectActionStringValues(action).forEach(({ field, value }) => {
      if (hasInvalidVariableSyntax(value)) {
        issues.push({ field: `actions.${index}.${field}`, message: '变量引用格式必须是 {{variable}}' })
      }
      extractVariableReferences(value).forEach((key) => {
        if (!variableKeys.has(key)) {
          issues.push({ field: `actions.${index}.${field}`, message: `引用了未定义变量：${key}` })
        }
      })
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

  if (action.timeoutMs !== undefined && action.timeoutMs !== null && action.timeoutMs <= 0) {
    issues.push({ field: 'timeoutMs', message: '超时时间必须大于 0' })
  }

  switch (action.type) {
    case 'openProgram':
      if (!('path' in action.params) || !action.params.path.trim()) {
        issues.push({ field: 'path', message: '程序路径不能为空' })
      }
      break
    case 'openUrl':
      if (!('url' in action.params) || (!hasVariableSyntax(action.params.url) && !isHttpUrl(action.params.url))) {
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
      validateOutputBinding(action, issues)
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

function isSupportedScriptPath(value: string) {
  return /\.(ps1|cmd|bat)$/i.test(value.trim())
}

function isPowerShellScriptPath(value: string) {
  return /\.ps1$/i.test(value.trim())
}

function isSupportedCommandShell(value: string) {
  return value === 'pwsh' || value === 'powershell' || value === 'cmd'
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
