import { computed, h, reactive } from 'vue'
import { NForm, NFormItem, NInput, useDialog, useMessage } from 'naive-ui'
import { tauriApi } from '@/api/tauri'
import type { RuntimeVariableValues } from '@/api/tauri'
import { defaultRuntimeVariableValues, variablesNeedingInput } from '@/domain/variables'
import { actionRunTargetKey, taskRunTargetKey, useExecutionStore } from '@/stores/executionStore'
import { useTaskStore } from '@/stores/taskStore'
import { getErrorMessage, logDevError } from '@/utils/errors'
import type { TaskAction, TaskItem } from '@/types/domain'

export function useTaskExecution() {
  const dialog = useDialog()
  const message = useMessage()
  const executionStore = useExecutionStore()
  const taskStore = useTaskStore()

  const running = computed(() => executionStore.running)

  async function execute(task: TaskItem) {
    if (!task.enabled) {
      message.warning('事项已停用')
      return
    }
    const targetKey = taskRunTargetKey(task.id)
    if (executionStore.isTargetActive(targetKey)) {
      message.warning('事项已在执行中')
      return
    }

    try {
      const runtimeVariables = await collectRuntimeVariables(task)
      const risk = await tauriApi.analyzeRisk(task.id, runtimeVariables)
      if (risk.requiresConfirmation) {
        await confirmRisk(task, risk.reasons, risk.highRiskActions.map((action) => `${action.name}: ${action.detail}`))
      }
      if (executionStore.isTargetActive(targetKey)) {
        message.warning('事项已在执行中')
        return
      }
      const summary = await executionStore.runTask(task.id, risk.requiresConfirmation ? 'confirmed' : undefined, runtimeVariables)
      taskStore.markTaskLastRun(task.id, summary.finishedAt)
      if (summary.status === 'success') {
        message.success('事项执行完成')
      } else if (summary.status === 'cancelled') {
        message.warning(summary.actions.find((action) => action.status === 'cancelled')?.message || '事项执行已取消')
      } else {
        message.error(summary.actions.find((action) => action.status === 'failed')?.message || '事项执行失败')
      }
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
    const targetKey = actionRunTargetKey(task.id, action.id)
    if (executionStore.isTargetActive(targetKey)) {
      message.warning('动作已在执行中')
      return
    }

    try {
      const runtimeVariables = await collectRuntimeVariables(task)
      const risk = await tauriApi.analyzeActionRisk(task.id, action.id, runtimeVariables)
      if (risk.requiresConfirmation) {
        await confirmRisk(task, risk.reasons, risk.highRiskActions.map((item) => `${item.name}: ${item.detail}`), action)
      }
      if (executionStore.isTargetActive(targetKey)) {
        message.warning('动作已在执行中')
        return
      }
      const summary = await executionStore.runTaskAction(task.id, action.id, risk.requiresConfirmation ? 'confirmed' : undefined, runtimeVariables)
      taskStore.markTaskLastRun(task.id, summary.finishedAt)
      if (summary.status === 'success') {
        message.success('动作执行完成')
      } else if (summary.status === 'cancelled') {
        message.warning(summary.actions.find((item) => item.status === 'cancelled')?.message || '动作执行已取消')
      } else {
        message.error(summary.actions.find((item) => item.status === 'failed')?.message || '动作执行失败')
      }
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

  function collectRuntimeVariables(task: TaskItem): Promise<RuntimeVariableValues | undefined> {
    const variables = task.variables || []
    const inputVariables = variablesNeedingInput(variables)
    if (inputVariables.length === 0) {
      return Promise.resolve(variables.length > 0 ? defaultRuntimeVariableValues(variables) : undefined)
    }

    const values = reactive(defaultRuntimeVariableValues(variables))
    return new Promise((resolve, reject) => {
      dialog.info({
        title: '填写运行变量',
        content: () =>
          h(
            NForm,
            { labelPlacement: 'top' },
            () =>
              inputVariables.map((variable) =>
                h(
                  NFormItem,
                  {
                    key: variable.key,
                    label: variable.label || variable.key,
                    required: variable.required || !variable.defaultValue
                  },
                  () =>
                    h(NInput, {
                      value: values[variable.key],
                      type: variable.secret ? 'password' : 'text',
                      showPasswordOn: variable.secret ? 'click' : undefined,
                      placeholder: variable.key,
                      onUpdateValue: (value: string) => {
                        values[variable.key] = value
                      }
                    })
                )
              )
          ),
        positiveText: '继续执行',
        negativeText: '取消',
        onPositiveClick: () => {
          const missing = inputVariables.find((variable) => (variable.required || !variable.defaultValue) && !values[variable.key])
          if (missing) {
            message.warning(`请填写变量：${missing.label || missing.key}`)
            return false
          }
          resolve({ ...values })
          return true
        },
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
