import { computed } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import { tauriApi } from '@/api/tauri'
import { useExecutionStore } from '@/stores/executionStore'
import type { TaskItem } from '@/types/domain'

export function useTaskExecution() {
  const dialog = useDialog()
  const message = useMessage()
  const executionStore = useExecutionStore()

  const running = computed(() => Boolean(executionStore.runningTaskId))

  async function execute(task: TaskItem) {
    if (!task.enabled) {
      message.warning('事项已停用')
      return
    }

    try {
      const risk = await tauriApi.analyzeRisk(task.id)
      if (risk.requiresConfirmation) {
        await confirmRisk(task, risk.reasons, risk.highRiskActions.map((action) => `${action.name}: ${action.detail}`))
        await executionStore.runTask(task.id, 'confirmed')
      } else {
        await executionStore.runTask(task.id)
      }
      message.success('事项执行完成')
    } catch (err) {
      if (err instanceof Error && err.message === 'cancelled') {
        message.info('已取消执行')
        return
      }
      message.error(err instanceof Error ? err.message : String(err))
    }
  }

  function confirmRisk(task: TaskItem, reasons: string[], details: string[]) {
    return new Promise<void>((resolve, reject) => {
      dialog.warning({
        title: '确认执行高风险事项',
        content: () => [
          `事项：${task.name}`,
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
    execute
  }
}
