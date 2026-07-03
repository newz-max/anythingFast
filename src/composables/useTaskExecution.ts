import { computed } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { tauriApi } from '@/api/tauri'
import { useExecutionStore } from '@/stores/executionStore'
import { useTaskStore } from '@/stores/taskStore'
import { getErrorMessage, logDevError } from '@/utils/errors'
import type { TaskAction, TaskItem } from '@/types/domain'

export function useTaskExecution() {
  const dialog = useDialog()
  const message = useMessage()
  const executionStore = useExecutionStore()
  const taskStore = useTaskStore()

  const running = computed(() => Boolean(executionStore.runningTaskId || executionStore.runningActionId))

  async function execute(task: TaskItem) {
    if (!task.enabled) {
      message.warning('事项已停用')
      return
    }

    try {
      const risk = await tauriApi.analyzeRisk(task.id)
      if (risk.requiresConfirmation) {
        await confirmRisk(task, risk.reasons, risk.highRiskActions.map((action) => `${action.name}: ${action.detail}`))
        const summary = await executionStore.runTask(task.id, 'confirmed')
        taskStore.markTaskLastRun(task.id, summary.finishedAt)
      } else {
        const summary = await executionStore.runTask(task.id)
        taskStore.markTaskLastRun(task.id, summary.finishedAt)
      }
      message.success('事项执行完成')
    } catch (err) {
      if (err instanceof Error && err.message === 'cancelled') {
        message.info('已取消执行')
        return
      }
      logDevError('Execute task failed', err, { taskId: task.id })
      message.error(getErrorMessage(err))
    }
  }

  async function executeAction(task: TaskItem, action: TaskAction) {
    if (!task.enabled) {
      message.warning('事项已停用')
      return
    }
    if (!action.enabled) {
      message.warning('动作已停用')
      return
    }

    try {
      const risk = await tauriApi.analyzeActionRisk(task.id, action.id)
      if (risk.requiresConfirmation) {
        await confirmRisk(task, risk.reasons, risk.highRiskActions.map((item) => `${item.name}: ${item.detail}`), action)
        const summary = await executionStore.runTaskAction(task.id, action.id, 'confirmed')
        taskStore.markTaskLastRun(task.id, summary.finishedAt)
      } else {
        const summary = await executionStore.runTaskAction(task.id, action.id)
        taskStore.markTaskLastRun(task.id, summary.finishedAt)
      }
      message.success('动作执行完成')
    } catch (err) {
      if (err instanceof Error && err.message === 'cancelled') {
        message.info('已取消执行')
        return
      }
      logDevError('Execute task action failed', err, { taskId: task.id, actionId: action.id })
      message.error(getErrorMessage(err))
    }
  }

  function confirmRisk(task: TaskItem, reasons: string[], details: string[], action?: TaskAction) {
    return new Promise<void>((resolve, reject) => {
      dialog.warning({
        title: action ? '确认执行高风险动作' : '确认执行高风险事项',
        content: () => [
          `事项：${task.name}`,
          ...(action ? [`动作：${action.name || '未命名动作'}`] : []),
          ...reasons.map((reason) => `原因：${reason}`),
          ...details
        ].join('\n'),
        positiveText: '确认执行',
        negativeText: '取消',
        onPositiveClick: () => resolve(),
        onNegativeClick: () => reject(new Error('cancelled')),
        onClose: () => reject(new Error('cancelled'))
      })
    })
  }

  return {
    running,
    execute,
    executeAction
  }
}
