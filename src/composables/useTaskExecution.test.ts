// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { useTaskExecution } from './useTaskExecution'
import { useExecutionStore } from '@/stores/executionStore'
import { useTaskStore } from '@/stores/taskStore'
import type { AppConfig, ExecutionLogSummary, TaskExecutionSummary, TaskItem } from '@/types/domain'

const dialogApi = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn()
}))
const messageApi = vi.hoisted(() => ({
  info: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
  error: vi.fn()
}))
const tauriApiMock = vi.hoisted(() => ({
  analyzeRisk: vi.fn(),
  analyzeActionRisk: vi.fn(),
  runTask: vi.fn(),
  runTaskAction: vi.fn(),
  loadExecutionLogs: vi.fn()
}))

vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>()
  return {
    ...actual,
    useDialog: () => dialogApi,
    useMessage: () => messageApi
  }
})

vi.mock('@/api/tauri', () => ({
  tauriApi: tauriApiMock
}))

vi.mock('@/utils/tauriRuntime', () => ({
  isTauriRuntime: () => true
}))

describe('useTaskExecution', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    dialogApi.info.mockReset()
    dialogApi.warning.mockReset()
    Object.values(messageApi).forEach((mock) => mock.mockReset())
    Object.values(tauriApiMock).forEach((mock) => mock.mockReset())
    tauriApiMock.analyzeRisk.mockResolvedValue({
      taskId: 'task-template',
      requiresConfirmation: false,
      reasons: [],
      highRiskActions: []
    })
    tauriApiMock.loadExecutionLogs.mockResolvedValue([])
  })

  it('collects required runtime values before executing a saved template task', async () => {
    const task = makeTask({
      variables: [
        { key: 'projectDir', label: '项目目录', defaultValue: 'D:\\Work', required: false, secret: false },
        { key: 'branchName', label: '分支名', defaultValue: '', required: true, secret: false }
      ]
    })
    const summary = makeSummary('success')
    tauriApiMock.runTask.mockResolvedValue(summary)
    const { controller, wrapper } = mountExecution(task)

    const execution = controller.execute(task)
    expect(dialogApi.info).toHaveBeenCalledTimes(1)
    const options = dialogApi.info.mock.calls[0][0]
    setRuntimeInputValue(options, '分支名', 'feature/template-center')
    expect(options.onPositiveClick()).toBe(true)
    await execution

    expect(tauriApiMock.analyzeRisk).toHaveBeenCalledWith('task-template', {
      projectDir: 'D:\\Work',
      branchName: 'feature/template-center'
    })
    expect(tauriApiMock.runTask).toHaveBeenCalledWith(
      'task-template',
      undefined,
      { projectDir: 'D:\\Work', branchName: 'feature/template-center' }
    )
    expect(messageApi.success).toHaveBeenCalledWith('事项执行完成')
    wrapper.unmount()
  })

  it('keeps the saved task when risk confirmation is cancelled', async () => {
    const task = makeTask()
    tauriApiMock.analyzeRisk.mockResolvedValue({
      taskId: task.id,
      requiresConfirmation: true,
      reasons: ['命令包含变量'],
      highRiskActions: [{ actionId: 'action-1', name: '执行命令', type: 'runCommand', riskLevel: 'medium', detail: 'git switch' }]
    })
    const { controller, taskStore, wrapper } = mountExecution(task)

    const execution = controller.execute(task)
    await vi.waitFor(() => expect(dialogApi.warning).toHaveBeenCalledTimes(1))
    const options = dialogApi.warning.mock.calls[0][0]
    options.onNegativeClick()
    await execution

    expect(tauriApiMock.runTask).not.toHaveBeenCalled()
    expect(taskStore.tasks.some((item) => item.id === task.id)).toBe(true)
    expect(messageApi.info).toHaveBeenCalledWith('已取消执行')
    wrapper.unmount()
  })

  it('keeps the saved task and loads the failure log after execution fails', async () => {
    const task = makeTask()
    const summary = makeSummary('failed')
    const log: ExecutionLogSummary = { ...summary, id: 'log-failed' }
    tauriApiMock.runTask.mockResolvedValue(summary)
    tauriApiMock.loadExecutionLogs.mockResolvedValue([log])
    const { controller, executionStore, taskStore, wrapper } = mountExecution(task)

    await controller.execute(task)

    expect(taskStore.tasks.some((item) => item.id === task.id)).toBe(true)
    expect(executionStore.logs).toEqual([log])
    expect(messageApi.error).toHaveBeenCalledWith('命令执行失败')
    wrapper.unmount()
  })
})

function mountExecution(task: TaskItem) {
  const taskStore = useTaskStore()
  taskStore.replaceConfig(makeConfig(task))
  const executionStore = useExecutionStore()
  let controller: ReturnType<typeof useTaskExecution>
  const wrapper = mount(defineComponent({
    setup() {
      controller = useTaskExecution()
      return {}
    },
    template: '<div />'
  }))
  return { controller: controller!, executionStore, taskStore, wrapper }
}

function setRuntimeInputValue(options: { content: () => unknown }, label: string, value: string) {
  const form = options.content() as { children: { default: () => Array<{ props: { label: string }; children: { default: () => { props: { onUpdateValue: (value: string) => void } } } }> } }
  const item = form.children.default().find((candidate) => candidate.props.label === label)
  if (!item) throw new Error(`Runtime input not found: ${label}`)
  item.children.default().props.onUpdateValue(value)
}

function makeTask(patch: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 'task-template',
    name: '模板事项',
    category: '开发者',
    keywords: [],
    description: '',
    variables: [],
    actions: [{
      id: 'action-1',
      type: 'runCommand',
      name: '执行命令',
      params: { command: 'git status', workingDir: 'D:\\Work', shell: 'powershell' },
      enabled: true,
      riskLevel: 'medium'
    }],
    riskLevel: 'medium',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...patch
  }
}

function makeConfig(task: TaskItem): AppConfig {
  return {
    version: 1,
    tasks: [task],
    tags: [],
    templates: [],
    settings: { globalShortcut: 'Alt+Space', theme: 'system', launchOnStartup: false }
  }
}

function makeSummary(status: TaskExecutionSummary['status']): TaskExecutionSummary {
  return {
    taskId: 'task-template',
    taskName: '模板事项',
    scope: 'task',
    startedAt: '2026-07-01T00:00:00.000Z',
    finishedAt: '2026-07-01T00:01:00.000Z',
    status,
    actions: [{
      actionId: 'action-1',
      actionName: '执行命令',
      actionType: 'runCommand',
      status,
      message: status === 'failed' ? '命令执行失败' : undefined
    }]
  }
}
