import type { ActionCondition, FieldIssue, TaskAction, TaskItem, ValidationResult } from '@/types/domain'
import { deriveActionRisk, deriveTaskRisk } from '@/domain/risk'
import { validateActionParamsByDefinition } from '@/domain/actionTypes'
import { validateScheduleTrigger } from '@/domain/schedule'
import { collectActionStringValues, collectConditionStringValues, collectOutputBindingKeys, hasInvalidVariableSyntax, isValidVariableKey, scanActionVariableReferences } from '@/domain/variables'

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

  task.triggers.forEach((trigger, index) => {
    if (trigger.type === 'schedule') {
      issues.push(...validateScheduleTrigger(trigger, `triggers.${index}`))
    }
  })

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

  task.actions.forEach((action, index) => {
    validateActionLocal(action).issues.forEach((issue) => {
      issues.push({ field: `actions.${index}.${issue.field}`, message: issue.message })
    })
    ;[...collectActionStringValues(action), ...collectConditionStringValues(action.condition)].forEach(({ field, value }) => {
      if (hasInvalidVariableSyntax(value)) {
        issues.push({ field: `actions.${index}.${field}`, message: '变量引用格式必须是 {{variable}}' })
      }
    })
    validateActionVariableReferences(action, variableKeys, `actions.${index}`, issues)
    if (action.enabled && action.type === 'runCommand') {
      scanActionVariableReferences(action).outputBindingKeys.forEach(({ key }) => {
        if (isValidVariableKey(key)) variableKeys.add(key)
      })
    }
  })

  return {
    valid: issues.length === 0,
    issues,
    riskLevel: deriveTaskRisk(task)
  }
}

export function validateActionLocal(action: TaskAction): ValidationResult {
  const issues: FieldIssue[] = []

  if (action.timeoutMs !== undefined && action.timeoutMs !== null && action.timeoutMs < 0) {
    issues.push({ field: 'timeoutMs', message: '超时时间不能小于 0' })
  }
  validateCondition(action.condition, issues)
  validateOutputBinding(action, issues)

  validateActionParamsByDefinition(action, issues)

  return {
    valid: issues.length === 0,
    issues,
    riskLevel: deriveActionRisk(action)
  }
}

function validateCondition(condition: ActionCondition | null | undefined, issues: FieldIssue[]) {
  if (!condition || condition.type === 'always') return
  switch (condition.type) {
    case 'fileExists':
      if (!condition.path.trim()) {
        issues.push({ field: 'condition.path', message: '条件文件路径不能为空' })
      }
      break
    case 'folderExists':
      if (!condition.path.trim()) {
        issues.push({ field: 'condition.path', message: '条件文件夹路径不能为空' })
      }
      break
    case 'variableEquals':
      if (!isValidVariableKey(condition.variable)) {
        issues.push({ field: 'condition.variable', message: '条件变量 key 无效' })
      }
      break
    case 'variableNotEmpty':
      if (!isValidVariableKey(condition.variable)) {
        issues.push({ field: 'condition.variable', message: '条件变量 key 无效' })
      }
      break
    case 'previousActionStatus':
      if (!['success', 'failed', 'skipped'].includes(condition.status)) {
        issues.push({ field: 'condition.status', message: '上一动作状态条件无效' })
      }
      break
    default:
      issues.push({ field: 'condition.type', message: '动作条件类型无效' })
  }
}

function validateOutputBinding(action: TaskAction, issues: FieldIssue[]) {
  collectOutputBindingKeys(action).forEach(({ field, key }) => {
    if (!isValidVariableKey(key)) {
      issues.push({ field, message: '输出绑定变量 key 无效' })
    }
  })
}

function validateActionVariableReferences(action: TaskAction, variableKeys: Set<string>, fieldPrefix: string, issues: FieldIssue[]) {
  const scan = scanActionVariableReferences(action)
  scan.textReferences.forEach(({ field, key }) => {
    if (!variableKeys.has(key)) {
      issues.push({ field: `${fieldPrefix}.${field}`, message: `引用了未定义变量：${key}` })
    }
  })
  scan.conditionVariableKeys.forEach(({ field, key }) => {
    if (isValidVariableKey(key) && !variableKeys.has(key)) {
      issues.push({ field: `${fieldPrefix}.${field}`, message: `引用了未定义变量：${key}` })
    }
  })
}
