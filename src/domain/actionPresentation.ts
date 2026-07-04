import type {
  ActionCondition,
  PreviousActionStatusConditionValue,
  TaskAction
} from '@/types/domain'
import { actionTypeOptions, describeActionByDefinition, getActionTypeLabel } from '@/domain/actionTypes'

export { actionTypeOptions, getActionTypeLabel }

export function describeAction(action: TaskAction) {
  return describeActionByDefinition(action)
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
