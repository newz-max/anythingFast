// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import MainLayout from './MainLayout.vue'
import { useExecutionStore } from '@/stores/executionStore'
import { useTaskStore } from '@/stores/taskStore'
import { useUpdateStore } from '@/stores/updateStore'
import type { AppConfig, TaskItem } from '@/types/domain'

const executeMock = vi.hoisted(() => vi.fn())
const focusSearchMock = vi.hoisted(() => vi.fn())
const scrollTaskIntoViewMock = vi.hoisted(() => vi.fn())
const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn()
}))
const dialogApi = vi.hoisted(() => ({
  warning: vi.fn()
}))
const updaterApiMock = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  relaunchApp: vi.fn()
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn()
  })
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn()
}))

vi.mock('@/composables/useTaskExecution', async () => {
  const { shallowRef } = await import('vue')
  return {
    useTaskExecution: () => ({
      execute: executeMock,
      executeAction: vi.fn(),
      running: shallowRef(false)
    })
  }
})

vi.mock('@/api/autostart', () => ({
  autostartApi: {
    isEnabled: vi.fn().mockResolvedValue(false),
    setEnabled: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock('@/api/updater', () => ({
  updaterApi: updaterApiMock
}))

vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>()
  return {
    ...actual,
    useMessage: () => messageApi,
    useDialog: () => dialogApi
  }
})

const TaskListPanelStub = defineComponent({
  name: 'TaskListPanel',
  props: ['selectedTaskId'],
  emits: ['select', 'create', 'run', 'toggleEnabled', 'toggleFavorite'],
  setup(_props, { expose }) {
    expose({
      focusSearch: focusSearchMock,
      visibleTaskIds: () => ['task-1', 'task-2', 'task-3'],
      scrollTaskIntoView: scrollTaskIntoViewMock
    })
  },
  template: '<section class="task-list-stub"><slot /></section>'
})

const stubs = {
  TaskListPanel: TaskListPanelStub,
  TemplateCenter: defineComponent({
    name: 'TemplateCenter',
    props: ['builtInTemplates', 'savedTemplates'],
    emits: ['preview', 'use', 'import', 'export'],
    template: `
      <section class="template-center-stub">
        <button class="template-preview-stub" type="button" @click="$emit('preview', builtInTemplates.find(template => template.id === 'switch-git-branch'))">预览模板</button>
        <button class="template-use-stub" type="button" @click="$emit('use', builtInTemplates.find(template => template.id === 'switch-git-branch'))">使用模板</button>
      </section>
    `
  }),
  TemplatePreviewModal: defineComponent({
    name: 'TemplatePreviewModal',
    props: ['show', 'template'],
    emits: ['update:show', 'use'],
    template: `
      <section v-if="show" class="template-preview-modal-stub">
        <span>{{ template?.name }}</span>
        <button class="preview-cancel-stub" type="button" @click="$emit('update:show', false)">取消预览</button>
        <button class="preview-use-stub" type="button" @click="$emit('use', { projectDir: 'D:\\\\Configured', branchName: 'must-not-persist' })">确认使用</button>
        <button class="preview-use-empty-stub" type="button" @click="$emit('use', { projectDir: '   ' })">跳过配置</button>
      </section>
    `
  }),
  TaskWizardDrawer: defineComponent({
    name: 'TaskWizardDrawer',
    props: ['show', 'mode', 'initialStep', 'task'],
    emits: ['save', 'save-and-run'],
    template: `
      <section v-if="show" class="task-wizard-stub">
        {{ mode }}:{{ initialStep }}
        <button class="wizard-save-stub" type="button" @click="$emit('save', task)">保存</button>
        <button v-if="mode === 'create'" class="wizard-save-run-stub" type="button" @click="$emit('save-and-run', task)">保存并运行</button>
      </section>
    `
  }),
  TaskImportPreviewModal: defineComponent({
    name: 'TaskImportPreviewModal',
    props: ['show'],
    template: '<section v-if="show" />'
  }),
  FlowPreviewGraph: defineComponent({
    name: 'FlowPreviewGraph',
    template: '<section class="flow-preview-stub" />'
  }),
  ScheduleTriggerCard: defineComponent({
    name: 'ScheduleTriggerCard',
    template: '<section />'
  }),
  ExecutionProgress: defineComponent({
    name: 'ExecutionProgress',
    template: '<section class="execution-progress-stub" />'
  }),
  ExecutionStatusStrip: defineComponent({
    name: 'ExecutionStatusStrip',
    template: '<section />'
  }),
  HelpModal: defineComponent({
    name: 'HelpModal',
    props: ['show'],
    template: '<section v-if="show" class="help-modal-stub" />'
  }),
  SettingsModal: defineComponent({
    name: 'SettingsModal',
    props: ['show'],
    template: '<section v-if="show" class="settings-modal-stub" />'
  }),
  NDropdown: defineComponent({
    name: 'NDropdown',
    template: '<div><slot /></div>'
  }),
  NModal: defineComponent({
    name: 'NModal',
    props: ['show'],
    template: '<section v-if="show"><slot /><slot name="footer" /></section>'
  }),
  NButton: defineComponent({
    name: 'NButton',
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }),
  NInput: defineComponent({
    name: 'NInput',
    inheritAttrs: false,
    props: ['value'],
    emits: ['update:value'],
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
  }),
  NSpace: defineComponent({
    name: 'NSpace',
    template: '<div><slot /></div>'
  }),
  NForm: defineComponent({
    name: 'NForm',
    template: '<form><slot /></form>'
  }),
  NFormItem: defineComponent({
    name: 'NFormItem',
    template: '<label><slot /></label>'
  }),
  NSelect: defineComponent({
    name: 'NSelect',
    props: ['value'],
    emits: ['update:value'],
    template: '<select :value="value" @change="$emit(\'update:value\', $event.target.value)"><slot /></select>'
  }),
  NInputGroup: defineComponent({
    name: 'NInputGroup',
    template: '<div><slot /></div>'
  }),
  NSwitch: defineComponent({
    name: 'NSwitch',
    props: ['value'],
    emits: ['update:value'],
    template: '<button type="button" @click="$emit(\'update:value\', !value)"><slot /></button>'
  }),
  NSpin: defineComponent({
    name: 'NSpin',
    template: '<span />'
  }),
  NTag: defineComponent({
    name: 'NTag',
    template: '<span><slot /></span>'
  }),
  NEmpty: defineComponent({
    name: 'NEmpty',
    template: '<section><slot name="extra" /></section>'
  })
}

function makeTask(id: string, patch: Partial<TaskItem> = {}): TaskItem {
  return {
    id,
    name: `事项 ${id}`,
    category: '工作',
    keywords: [],
    description: '',
    actions: [
      {
        id: `action-${id}`,
        type: 'delay',
        name: '等待',
        params: { durationMs: 1000 },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ],
    riskLevel: 'low',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...patch
  }
}

function makeConfig(): AppConfig {
  return {
    version: 1,
    tasks: [makeTask('task-1'), makeTask('task-2'), makeTask('task-3')],
    tags: [],
    templates: [],
    settings: {
      globalShortcut: 'Alt+Space',
      theme: 'system',
      launchOnStartup: false
    }
  }
}

async function mountLayout() {
  setActivePinia(createPinia())
  const taskStore = useTaskStore()
  taskStore.replaceConfig(makeConfig())
  const wrapper = mount(MainLayout, {
    attachTo: document.body,
    global: { stubs }
  })
  await Promise.resolve()
  await nextTick()
  return { wrapper, taskStore }
}

async function pressKey(key: string, options: KeyboardEventInit = {}, target: Window | HTMLElement = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))
  await nextTick()
  await nextTick()
}

function findTextButton(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text().includes(text))
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

async function openTemplateDraft(wrapper: VueWrapper) {
  await findTextButton(wrapper, '模板中心').trigger('click')
  await wrapper.get('.template-use-stub').trigger('click')
  await wrapper.get('.preview-use-stub').trigger('click')
  await nextTick()
}

describe('MainLayout window keyboard shortcuts', () => {
  let wrapper: VueWrapper | null = null

  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }))
    })
    executeMock.mockClear()
    executeMock.mockResolvedValue(undefined)
    focusSearchMock.mockClear()
    scrollTaskIntoViewMock.mockClear()
    messageApi.success.mockClear()
    messageApi.error.mockClear()
    messageApi.warning.mockClear()
    updaterApiMock.checkForUpdate.mockReset()
    updaterApiMock.downloadUpdate.mockReset()
    updaterApiMock.installUpdate.mockReset()
    updaterApiMock.relaunchApp.mockReset()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('focuses task search with slash unless focus is editable', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await pressKey('/')
    expect(focusSearchMock).toHaveBeenCalledTimes(1)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await pressKey('/', {}, input)

    expect(focusSearchMock).toHaveBeenCalledTimes(1)
  })

  it('moves selected task through visible task ids and scrolls it into view', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper
    const { taskStore } = mounted

    await pressKey('ArrowDown')

    expect(taskStore.selectedTaskId).toBe('task-2')
    expect(scrollTaskIntoViewMock).toHaveBeenCalledWith('task-2')

    await pressKey('ArrowUp')
    expect(taskStore.selectedTaskId).toBe('task-1')
  })

  it('runs, creates, edits, favorites, toggles logs, and switches action views from shortcuts', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await pressKey('Enter', { ctrlKey: true })
    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }))

    await pressKey('n', { ctrlKey: true })
    expect(wrapper.find('.task-wizard-stub').text()).toContain('create:1')

    wrapper.unmount()
    const remounted = await mountLayout()
    wrapper = remounted.wrapper
    await pressKey('e', { ctrlKey: true })
    expect(wrapper.find('.task-wizard-stub').text()).toContain('edit:1')

    wrapper.unmount()
    const favoriteMount = await mountLayout()
    wrapper = favoriteMount.wrapper
    await pressKey('f')
    expect(favoriteMount.taskStore.tasks[0].favorite).toBe(true)

    await pressKey('`', { ctrlKey: true, code: 'Backquote' })
    expect(wrapper.find('.execution-progress-stub').exists()).toBe(true)

    await pressKey('2')
    expect(wrapper.find('.flow-preview-stub').exists()).toBe(true)

    await pressKey('1')
    expect(wrapper.find('.flow-preview-stub').exists()).toBe(false)

    await pressKey('a')
    expect(wrapper.find('.task-wizard-stub').text()).toContain('edit:2')
  })

  it('uses customized main window keybindings', async () => {
    localStorage.setItem('anything-fast-keybindings', JSON.stringify([{ command: 'main.runSelectedTask', key: 'Alt+R' }]))
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await pressKey('Enter', { ctrlKey: true })
    expect(executeMock).not.toHaveBeenCalled()

    await pressKey('r', { altKey: true })
    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }))
  })

  it('does not trigger disabled main window keybindings', async () => {
    localStorage.setItem('anything-fast-keybindings', JSON.stringify([{ command: 'main.focusSearch', disabled: true }]))
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await pressKey('/')

    expect(focusSearchMock).not.toHaveBeenCalled()
  })

  it('ignores main window shortcuts while the task editor is open', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await pressKey('n', { ctrlKey: true })
    await pressKey('/')
    await pressKey('ArrowDown')

    expect(focusSearchMock).not.toHaveBeenCalled()
    expect(mounted.taskStore.selectedTaskId).toBe('task-1')
  })

  it('ignores main window shortcuts while help or settings modals are open', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await wrapper.find('button[aria-label="帮助"]').trigger('click')
    expect(wrapper.find('.help-modal-stub').exists()).toBe(true)

    await pressKey('/')
    await pressKey('ArrowDown')

    expect(focusSearchMock).not.toHaveBeenCalled()
    expect(mounted.taskStore.selectedTaskId).toBe('task-1')

    wrapper.unmount()
    const settingsMount = await mountLayout()
    wrapper = settingsMount.wrapper

    await wrapper.find('button[aria-label="设置"]').trigger('click')
    await Promise.resolve()
    await nextTick()
    expect(wrapper.find('.settings-modal-stub').exists()).toBe(true)

    await pressKey('/')
    await pressKey('ArrowDown')

    expect(focusSearchMock).not.toHaveBeenCalled()
    expect(settingsMount.taskStore.selectedTaskId).toBe('task-1')
  })

  it('opens template preview without creating a draft and cancellation keeps the wizard closed', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await findTextButton(wrapper, '模板中心').trigger('click')
    await wrapper.get('.template-preview-stub').trigger('click')

    expect(wrapper.find('.template-preview-modal-stub').exists()).toBe(true)
    expect(wrapper.find('.task-wizard-stub').exists()).toBe(false)

    await wrapper.get('.preview-cancel-stub').trigger('click')
    expect(wrapper.find('.template-preview-modal-stub').exists()).toBe(false)
    expect(wrapper.find('.task-wizard-stub').exists()).toBe(false)
  })

  it('applies only non-empty first-configuration values to an independent template draft', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper
    const sourceTemplate = mounted.taskStore.builtInTemplates.find((template) => template.id === 'switch-git-branch')!

    await findTextButton(wrapper, '模板中心').trigger('click')
    await wrapper.get('.template-use-stub').trigger('click')
    await wrapper.get('.preview-use-stub').trigger('click')
    await nextTick()

    const wizard = wrapper.findComponent({ name: 'TaskWizardDrawer' })
    const draft = wizard.props('task') as TaskItem
    expect(draft.variables?.find((variable) => variable.key === 'projectDir')?.defaultValue).toBe('D:\\Configured')
    expect(draft.variables?.find((variable) => variable.key === 'branchName')?.defaultValue).toBe('')
    expect(sourceTemplate.variables?.find((variable) => variable.key === 'projectDir')?.defaultValue).toBe('')
    expect(sourceTemplate.variables?.find((variable) => variable.key === 'branchName')?.defaultValue).toBe('')
    expect(wrapper.find('.template-preview-modal-stub').exists()).toBe(false)
    expect(wrapper.find('.task-wizard-stub').exists()).toBe(true)
  })

  it('keeps skipped first-configuration values empty in the generated draft', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await findTextButton(wrapper, '模板中心').trigger('click')
    await wrapper.get('.template-use-stub').trigger('click')
    await wrapper.get('.preview-use-empty-stub').trigger('click')
    await nextTick()

    const draft = wrapper.findComponent({ name: 'TaskWizardDrawer' }).props('task') as TaskItem
    expect(draft.variables?.find((variable) => variable.key === 'projectDir')?.defaultValue).toBe('')
  })

  it('keeps ordinary save behavior without starting execution', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await openTemplateDraft(wrapper)
    const draft = wrapper.findComponent({ name: 'TaskWizardDrawer' }).props('task') as TaskItem
    await wrapper.get('.wizard-save-stub').trigger('click')
    await flushPromises()

    expect(mounted.taskStore.tasks.some((task) => task.id === draft.id)).toBe(true)
    expect(mounted.taskStore.selectedTaskId).toBe(draft.id)
    expect(executeMock).not.toHaveBeenCalled()
    expect(wrapper.find('.task-wizard-stub').exists()).toBe(false)
  })

  it('runs the actual persisted task only after save succeeds', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper

    await openTemplateDraft(wrapper)
    const draft = wrapper.findComponent({ name: 'TaskWizardDrawer' }).props('task') as TaskItem
    await wrapper.get('.wizard-save-run-stub').trigger('click')
    await flushPromises()

    const savedTask = mounted.taskStore.tasks.find((task) => task.id === draft.id)
    expect(savedTask).toBeDefined()
    expect(mounted.taskStore.selectedTaskId).toBe(draft.id)
    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(executeMock).toHaveBeenCalledWith(savedTask)
    expect(wrapper.find('.task-wizard-stub').exists()).toBe(false)
  })

  it('does not close or execute when save and run persistence fails', async () => {
    const mounted = await mountLayout()
    wrapper = mounted.wrapper
    const saveError = new Error('保存失败')
    vi.spyOn(mounted.taskStore, 'upsertTask').mockRejectedValueOnce(saveError)

    await openTemplateDraft(wrapper)
    await wrapper.get('.wizard-save-run-stub').trigger('click')
    await flushPromises()

    expect(executeMock).not.toHaveBeenCalled()
    expect(wrapper.find('.task-wizard-stub').exists()).toBe(true)
    expect(messageApi.error).toHaveBeenCalledWith('保存失败')
  })

  it('shows downloaded update action in titlebar and installs on click', async () => {
    const update = makeUpdate()
    updaterApiMock.checkForUpdate.mockResolvedValue(update)
    updaterApiMock.downloadUpdate.mockResolvedValue(undefined)
    const mounted = await mountLayout()
    wrapper = mounted.wrapper
    const updateStore = useUpdateStore()

    await updateStore.checkForUpdate('manual')
    await updateStore.downloadUpdate()
    await nextTick()

    expect(wrapper.text()).toContain('更新已就绪')
    expect(wrapper.text()).toContain('重启更新')

    await wrapper.get('.titlebar-update-action').trigger('click')
    await flushPromises()

    expect(updaterApiMock.installUpdate).toHaveBeenCalledWith(update)
    expect(updaterApiMock.relaunchApp).toHaveBeenCalledTimes(1)
  })

  it('disables titlebar restart update action while execution interaction is pending', async () => {
    updaterApiMock.checkForUpdate.mockResolvedValue(makeUpdate())
    updaterApiMock.downloadUpdate.mockResolvedValue(undefined)
    const mounted = await mountLayout()
    wrapper = mounted.wrapper
    const updateStore = useUpdateStore()

    await updateStore.checkForUpdate('manual')
    await updateStore.downloadUpdate()
    useExecutionStore().beginRuntimeInput()
    await nextTick()

    const action = wrapper.get('.titlebar-update-action')
    expect(action.attributes('disabled')).toBeDefined()
    expect(action.attributes('title')).toContain('当前有运行变量输入窗口')
  })
})

function makeUpdate() {
  return {
    currentVersion: '0.5.2',
    version: '0.5.3',
    date: '2026-07-07T00:00:00Z',
    body: '更新说明',
    download: vi.fn(),
    install: vi.fn()
  }
}

function flushPromises() {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}
