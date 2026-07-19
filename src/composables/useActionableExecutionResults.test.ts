import { describe, expect, it, vi } from 'vitest'
import { useActionableExecutionResults } from './useActionableExecutionResults'
import type { CopyExecutionErrorPayload, ExecutionResultActionTarget } from '@/domain/executionPresentation'
import type { TaskAction, TaskItem } from '@/types/domain'

type ExecuteAction = (task: TaskItem, action: TaskAction) => Promise<void>

const target: ExecutionResultActionTarget = { logId: 'log-1', taskId: 'task-1', actionId: 'action-1' }

describe('useActionableExecutionResults', () => {
  it('copies the exact sanitized diagnostic and reports clipboard failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const copyText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('unavailable'))
    const harness = createHarness({}, { copyText })
    const payload: CopyExecutionErrorPayload = { ...target, diagnostic: '密钥 *** 无效' }

    await harness.controller.copyExecutionError(payload)
    await harness.controller.copyExecutionError(payload)

    expect(copyText).toHaveBeenNthCalledWith(1, '密钥 *** 无效')
    expect(harness.message.success).toHaveBeenCalledWith('已复制错误信息')
    expect(harness.message.error).toHaveBeenCalledWith('复制错误信息失败')
    expect(payload.diagnostic).toBe('密钥 *** 无效')
    consoleError.mockRestore()
  })

  it('retries the current saved action through the supplied manual execution flow', async () => {
    const currentTask = makeTask()
    const executeAction = vi.fn().mockResolvedValue(undefined)
    const harness = createHarness({ tasks: [currentTask], executeAction })

    await harness.controller.retryExecutionAction(target)

    expect(executeAction).toHaveBeenCalledWith(currentTask, currentTask.actions[0])
  })

  it('blocks missing, disabled, and already active retry targets with clear feedback', async () => {
    const missingTask = createHarness({ tasks: [] })
    await missingTask.controller.retryExecutionAction(target)
    expect(missingTask.message.warning).toHaveBeenCalledWith('事项已不存在，无法操作该执行结果')

    const taskWithoutAction = createHarness({ tasks: [{ ...makeTask(), actions: [] }] })
    await taskWithoutAction.controller.retryExecutionAction(target)
    expect(taskWithoutAction.message.warning).toHaveBeenCalledWith('动作已不存在，无法操作该执行结果')

    const disabledTask = createHarness({ tasks: [{ ...makeTask(), enabled: false }] })
    await disabledTask.controller.retryExecutionAction(target)
    expect(disabledTask.message.warning).toHaveBeenCalledWith('事项已停用，无法重试动作')

    const disabledAction = makeTask()
    disabledAction.actions[0].enabled = false
    const disabledActionHarness = createHarness({ tasks: [disabledAction] })
    await disabledActionHarness.controller.retryExecutionAction(target)
    expect(disabledActionHarness.message.warning).toHaveBeenCalledWith('动作已停用，无法重试')

    const active = createHarness({ isActionActive: () => true })
    await active.controller.retryExecutionAction(target)
    expect(active.message.warning).toHaveBeenCalledWith('动作已在执行中')
    expect(active.executeAction).not.toHaveBeenCalled()
  })

  it('opens the exact current action and rejects stale edit targets', () => {
    const task = makeTask()
    const harness = createHarness({ tasks: [task] })
    harness.controller.editExecutionAction(target)
    expect(harness.openActionEditor).toHaveBeenCalledWith(task, 'action-1')

    const stale = createHarness({ tasks: [{ ...task, actions: [] }] })
    stale.controller.editExecutionAction(target)
    expect(stale.openActionEditor).not.toHaveBeenCalled()
    expect(stale.message.warning).toHaveBeenCalledWith('动作已不存在，无法操作该执行结果')
  })
})

function createHarness(
  options: {
    tasks?: TaskItem[]
    executeAction?: ExecuteAction
    isActionActive?: (taskId: string, actionId: string) => boolean
  } = {},
  deps: { copyText?: (text: string) => Promise<void> } = {}
) {
  const tasks = options.tasks ?? [makeTask()]
  const executeAction = options.executeAction ?? vi.fn<ExecuteAction>().mockResolvedValue(undefined)
  const openActionEditor = vi.fn()
  const message = { success: vi.fn(), warning: vi.fn(), error: vi.fn() }
  const controller = useActionableExecutionResults(
    {
      getTasks: () => tasks,
      executeAction,
      isActionActive: options.isActionActive ?? (() => false),
      openActionEditor,
      message: message as never
    },
    deps
  )
  return { controller, executeAction, openActionEditor, message }
}

function makeTask(): TaskItem {
  return {
    id: 'task-1',
    name: '当前事项',
    actions: [
      {
        id: 'action-1',
        type: 'runCommand',
        name: '当前保存动作',
        params: { source: 'inline', command: 'yarn test', workingDir: '', shell: 'powershell' },
        enabled: true,
        riskLevel: 'medium'
      }
    ],
    riskLevel: 'medium',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
}
