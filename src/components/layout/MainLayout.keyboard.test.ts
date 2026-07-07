// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import MainLayout from './MainLayout.vue'
import { useTaskStore } from '@/stores/taskStore'
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
  TaskWizardDrawer: defineComponent({
    name: 'TaskWizardDrawer',
    props: ['show', 'mode', 'initialStep'],
    template: '<section v-if="show" class="task-wizard-stub">{{ mode }}:{{ initialStep }}</section>'
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
    focusSearchMock.mockClear()
    scrollTaskIntoViewMock.mockClear()
    messageApi.success.mockClear()
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
})
