import type { MessageApi } from 'naive-ui'
import type { CopyExecutionErrorPayload, ExecutionResultActionTarget } from '@/domain/executionPresentation'
import type { TaskAction, TaskItem } from '@/types/domain'
import { writeClipboardText } from '@/utils/clipboard'
import { logDevError } from '@/utils/errors'

export interface UseActionableExecutionResultsOptions {
  getTasks: () => TaskItem[]
  executeAction: (task: TaskItem, action: TaskAction) => Promise<void>
  isActionActive: (taskId: string, actionId: string) => boolean
  openActionEditor: (task: TaskItem, actionId: string) => void
  message: Pick<MessageApi, 'success' | 'warning' | 'error'>
}

export interface UseActionableExecutionResultsDeps {
  copyText?: (text: string) => Promise<void>
}

export function useActionableExecutionResults(
  options: UseActionableExecutionResultsOptions,
  deps: UseActionableExecutionResultsDeps = {}
) {
  const copyText = deps.copyText ?? writeClipboardText

  async function copyExecutionError(payload: CopyExecutionErrorPayload) {
    try {
      await copyText(payload.diagnostic)
      options.message.success('已复制错误信息')
    } catch (err) {
      logDevError('Copy execution error failed', err, resultMetadata(payload))
      options.message.error('复制错误信息失败')
    }
  }

  async function retryExecutionAction(target: ExecutionResultActionTarget) {
    const resolved = resolveTarget(target)
    if (!resolved) return
    if (!resolved.task.enabled) {
      options.message.warning('事项已停用，无法重试动作')
      return
    }
    if (!resolved.action.enabled) {
      options.message.warning('动作已停用，无法重试')
      return
    }
    if (options.isActionActive(target.taskId, target.actionId)) {
      options.message.warning('动作已在执行中')
      return
    }
    await options.executeAction(resolved.task, resolved.action)
  }

  function editExecutionAction(target: ExecutionResultActionTarget) {
    const resolved = resolveTarget(target)
    if (!resolved) return
    options.openActionEditor(resolved.task, resolved.action.id)
  }

  function resolveTarget(target: ExecutionResultActionTarget) {
    const task = options.getTasks().find((item) => item.id === target.taskId)
    if (!task) {
      options.message.warning('事项已不存在，无法操作该执行结果')
      return null
    }
    const action = task.actions.find((item) => item.id === target.actionId)
    if (!action) {
      options.message.warning('动作已不存在，无法操作该执行结果')
      return null
    }
    return { task, action }
  }

  return {
    copyExecutionError,
    retryExecutionAction,
    editExecutionAction
  }
}

function resultMetadata(target: ExecutionResultActionTarget) {
  return {
    logId: target.logId,
    taskId: target.taskId,
    actionId: target.actionId
  }
}
