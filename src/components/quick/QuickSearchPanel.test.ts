// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import QuickSearchPanel from './QuickSearchPanel.vue'
import QuickCreateConfirm from './QuickCreateConfirm.vue'
import { useKeybindings } from '@/composables/useKeybindings'
import { useExecutionStore } from '@/stores/executionStore'
import { useTaskStore } from '@/stores/taskStore'
import type { AppConfig, TaskItem } from '@/types/domain'

const executeMock = vi.hoisted(() => vi.fn())
const openMainWindowCreateTaskMock = vi.hoisted(() => vi.fn())
const getClipboardContextMock = vi.hoisted(() => vi.fn())
const inspectPathInputMock = vi.hoisted(() => vi.fn())
const getDefaultWorkingDirMock = vi.hoisted(() => vi.fn())
const saveConfigMock = vi.hoisted(() => vi.fn(async (config: AppConfig) => config))
const loadKeybindingsMock = vi.hoisted(() => vi.fn())
const hideWindowMock = vi.hoisted(() => vi.fn())
const onFocusChangedMock = vi.hoisted(() => vi.fn())
const unlistenFocusChangedMock = vi.hoisted(() => vi.fn())
const focusChangedHandlers = vi.hoisted(() => [] as Array<(event: { payload: boolean }) => void>)

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    hide: hideWindowMock,
    onFocusChanged: onFocusChangedMock
  })
}))

vi.mock('@/api/tauri', () => ({
  tauriApi: {
    openMainWindowCreateTask: openMainWindowCreateTaskMock,
    getClipboardContext: getClipboardContextMock,
    inspectPathInput: inspectPathInputMock,
    inspectClipboardPathInput: inspectPathInputMock,
    getDefaultWorkingDir: getDefaultWorkingDirMock,
    saveConfig: saveConfigMock,
    loadKeybindings: loadKeybindingsMock
  }
}))

vi.mock('@/composables/useTaskExecution', async () => {
  const { shallowRef } = await import('vue')
  return {
    useTaskExecution: () => ({
      execute: executeMock,
      running: shallowRef(false)
    })
  }
})

const NInputStub = defineComponent({
  name: 'NInput',
  inheritAttrs: false,
  props: ['value', 'size', 'clearable', 'bordered', 'placeholder'],
  emits: ['update:value'],
  setup(_props, { expose }) {
    const inputRef = ref<HTMLInputElement | null>(null)
    expose({
      focus: () => inputRef.value?.focus()
    })
    return { inputRef }
  },
  template: '<input ref="inputRef" :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
})

const ExecutionStatusStripStub = defineComponent({
  name: 'ExecutionStatusStrip',
  props: {
    runs: { type: Array, default: () => [] },
    compact: Boolean
  },
  template: '<div class="execution-status-stub" :data-compact="String(compact)"><span v-for="run in runs" :key="run.runId">{{ run.taskName }}</span></div>'
})

const stubs = {
  NInput: NInputStub,
  NSelect: {
    inheritAttrs: false,
    props: ['value'],
    emits: ['update:value'],
    template: '<input class="select-stub" :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
  },
  NCheckbox: {
    props: ['checked'],
    emits: ['update:checked'],
    template: '<label><input type="checkbox" :checked="checked" @input="$emit(\'update:checked\', $event.target.checked)" @change="$emit(\'update:checked\', $event.target.checked)" /><slot /></label>'
  },
  NButton: {
    props: ['disabled', 'loading'],
    template: '<button :disabled="disabled"><slot /></button>'
  },
  NSpin: { template: '<span>loading</span>' },
  NTag: { props: ['type'], template: '<span><slot /></span>' },
  ExecutionStatusStrip: ExecutionStatusStripStub
}

const scrollIntoViewMock = vi.fn()
const mountedWrappers: VueWrapper[] = []

function makeTask(index: number, patch: Partial<TaskItem> = {}): TaskItem {
  return {
    id: `task-${index}`,
    name: `事项 ${index}`,
    category: index % 2 === 0 ? '工作' : '学习',
    keywords: [],
    description: '',
    actions: [
      {
        id: `action-${index}`,
        type: 'openUrl',
        name: '打开网页',
        params: { url: `https://example.com/${index}` },
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

function makeConfig(tasks: TaskItem[]): AppConfig {
  return {
    version: 1,
    tasks,
    tags: [],
    templates: [],
    settings: {
      globalShortcut: 'Alt+Space',
      theme: 'system',
      launchOnStartup: false
    }
  }
}

async function mountPanel(tasks = [makeTask(1), makeTask(2), makeTask(3)]) {
  setActivePinia(createPinia())
  useTaskStore().replaceConfig(makeConfig(tasks))
  const wrapper = mount(QuickSearchPanel, {
    attachTo: document.body,
    global: { stubs }
  })
  mountedWrappers.push(wrapper)
  await Promise.resolve()
  await nextTick()
  await nextTick()
  return wrapper
}

async function pressKey(key: string, target: Window | HTMLElement = window, options: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))
  await nextTick()
  await nextTick()
}

function resultItems(wrapper: VueWrapper) {
  return wrapper.findAll('.result-item, .recommendation-item')
}

function lastScrollTarget() {
  return scrollIntoViewMock.mock.contexts.at(-1)
}

describe('QuickSearchPanel keyboard navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.clear()
    executeMock.mockClear()
    openMainWindowCreateTaskMock.mockReset()
    openMainWindowCreateTaskMock.mockResolvedValue(undefined)
    getClipboardContextMock.mockReset()
    getClipboardContextMock.mockResolvedValue({
      source: 'clipboard',
      capturedAt: '2026-07-11T00:00:00.000Z',
      status: 'empty',
      text: '',
      truncated: false
    })
    inspectPathInputMock.mockReset()
    inspectPathInputMock.mockResolvedValue({
      input: 'D:\\Project\\anythingFast',
      exists: true,
      kind: 'folder',
      normalizedPath: 'D:\\Project\\anythingFast'
    })
    getDefaultWorkingDirMock.mockReset()
    getDefaultWorkingDirMock.mockResolvedValue('C:\\Users\\Administrator')
    saveConfigMock.mockClear()
    saveConfigMock.mockImplementation(async (config: AppConfig) => config)
    loadKeybindingsMock.mockReset()
    loadKeybindingsMock.mockResolvedValue({ overrides: [], path: 'keybindings.json' })
    hideWindowMock.mockClear()
    onFocusChangedMock.mockClear()
    onFocusChangedMock.mockImplementation(async (handler: (event: { payload: boolean }) => void) => {
      focusChangedHandlers.push(handler)
      return unlistenFocusChangedMock
    })
    unlistenFocusChangedMock.mockClear()
    focusChangedHandlers.splice(0)
    scrollIntoViewMock.mockClear()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock
    })
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
    vi.useRealTimers()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })

  it('moves the active result with arrow keys and scrolls it into view', async () => {
    const wrapper = await mountPanel()

    expect(resultItems(wrapper)[0].classes()).toContain('active')
    expect(resultItems(wrapper)[0].attributes('aria-selected')).toBe('true')

    await pressKey('ArrowDown')

    expect(resultItems(wrapper)[1].classes()).toContain('active')
    expect(resultItems(wrapper)[1].attributes('aria-selected')).toBe('true')
    expect(resultItems(wrapper)[0].attributes('aria-selected')).toBe('false')
    expect(scrollIntoViewMock).toHaveBeenLastCalledWith({ block: 'nearest' })
    expect(lastScrollTarget()).toBe(resultItems(wrapper)[1].element)

    await pressKey('ArrowUp')

    expect(resultItems(wrapper)[0].classes()).toContain('active')
    expect(resultItems(wrapper)[0].attributes('aria-selected')).toBe('true')
    expect(lastScrollTarget()).toBe(resultItems(wrapper)[0].element)
  })

  it('scrolls the active result by task id after search reorders results', async () => {
    const wrapper = await mountPanel([
      makeTask(1, { name: '低优先级事项', description: 'alpha' }),
      makeTask(2, { name: 'Alpha 入口' }),
      makeTask(3, { name: '关键词事项', keywords: ['alphabet'] })
    ])

    await wrapper.find('input').setValue('alpha')
    await nextTick()
    await nextTick()

    expect(resultItems(wrapper)[0].text()).toContain('Alpha 入口')
    expect(resultItems(wrapper)[0].classes()).toContain('active')
    expect(lastScrollTarget()).toBe(resultItems(wrapper)[0].element)

    await pressKey('ArrowDown')

    expect(resultItems(wrapper)[1].text()).toContain('关键词事项')
    expect(resultItems(wrapper)[1].classes()).toContain('active')
    expect(lastScrollTarget()).toBe(resultItems(wrapper)[1].element)
  })

  it('uses customized quick search navigation keybindings', async () => {
    localStorage.setItem('anything-fast-keybindings', JSON.stringify([{ command: 'quick.selectNextResult', key: 'Alt+J' }]))
    const wrapper = await mountPanel()

    await pressKey('ArrowDown')
    expect(resultItems(wrapper)[0].classes()).toContain('active')

    await pressKey('j', window, { altKey: true })
    expect(resultItems(wrapper)[1].classes()).toContain('active')
  })

  it('does not trigger disabled quick search keybindings', async () => {
    localStorage.setItem('anything-fast-keybindings', JSON.stringify([{ command: 'quick.executeSelected', disabled: true }]))
    await mountPanel()

    await pressKey('Enter')

    expect(executeMock).not.toHaveBeenCalled()
  })

  it('opens the main window create flow with the default shortcut and displays it in the hint', async () => {
    const wrapper = await mountPanel()

    await pressKey('n', window, { ctrlKey: true })

    expect(openMainWindowCreateTaskMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.status').text()).toContain('Ctrl+N 新增事项')
  })

  it('handles create task from the focused search input and prevents the default WebView behavior', async () => {
    const wrapper = await mountPanel()
    const input = wrapper.find('input').element as HTMLInputElement
    input.focus()
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true })

    input.dispatchEvent(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(true)
    expect(openMainWindowCreateTaskMock).toHaveBeenCalledTimes(1)
  })

  it('uses a customized create-task shortcut', async () => {
    localStorage.setItem('anything-fast-keybindings', JSON.stringify([{ command: 'quick.createTask', key: 'Alt+N' }]))
    const wrapper = await mountPanel()

    await pressKey('n', window, { ctrlKey: true })
    expect(openMainWindowCreateTaskMock).not.toHaveBeenCalled()

    await pressKey('n', window, { altKey: true })
    expect(openMainWindowCreateTaskMock).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.status').text()).toContain('Alt+N 新增事项')
  })

  it('does not invoke a disabled create-task shortcut and represents it accurately', async () => {
    localStorage.setItem('anything-fast-keybindings', JSON.stringify([{ command: 'quick.createTask', disabled: true }]))
    await useKeybindings().loadKeybindings()
    const disabledWrapper = await mountPanel()

    await pressKey('n', window, { ctrlKey: true })
    expect(openMainWindowCreateTaskMock).not.toHaveBeenCalled()
    expect(disabledWrapper.find('.status').text()).toContain('已禁用 新增事项')
  })

  it('clamps selection to the visible result range', async () => {
    const wrapper = await mountPanel()

    await pressKey('ArrowUp')
    expect(resultItems(wrapper)[0].classes()).toContain('active')

    await pressKey('ArrowDown')
    await pressKey('ArrowDown')
    await pressKey('ArrowDown')

    expect(resultItems(wrapper)[2].classes()).toContain('active')
    expect(resultItems(wrapper)[2].attributes('aria-selected')).toBe('true')
  })

  it('resets selection and list scroll position when the search query changes', async () => {
    const wrapper = await mountPanel(Array.from({ length: 10 }, (_, index) => makeTask(index + 1)))
    const results = wrapper.find('.results').element as HTMLElement

    await pressKey('ArrowDown')
    results.scrollTop = 120
    await wrapper.find('input').setValue('事项 1')
    await nextTick()
    await nextTick()

    expect(results.scrollTop).toBe(0)
    expect(resultItems(wrapper)[0].classes()).toContain('active')
    expect(resultItems(wrapper)[0].attributes('aria-selected')).toBe('true')
  })

  it('keeps Enter execution pointed at the selected task', async () => {
    const wrapper = await mountPanel()

    await pressKey('ArrowDown')
    await pressKey('Enter')

    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(executeMock.mock.calls[0][0].id).toBe('task-2')
    expect(resultItems(wrapper)[1].classes()).toContain('active')
  })

  it('focuses and selects the search input with slash from outside editable controls', async () => {
    const wrapper = await mountPanel()
    const input = wrapper.find('input').element as HTMLInputElement
    await wrapper.find('.result-item').trigger('focus')
    input.setSelectionRange(0, 0)

    await pressKey('/')

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it('keeps slash typing behavior inside the search input', async () => {
    const wrapper = await mountPanel()
    const input = wrapper.find('input').element as HTMLInputElement
    input.focus()
    const event = new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })

    input.dispatchEvent(event)
    await nextTick()

    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(input)
  })

  it('hides the quick window when the Tauri window loses focus', async () => {
    await mountPanel()

    expect(onFocusChangedMock).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {}
    })
    focusChangedHandlers[0]?.({ payload: false })
    await nextTick()

    expect(hideWindowMock).toHaveBeenCalledTimes(1)
  })

  it('removes the Tauri focus listener on unmount', async () => {
    const wrapper = await mountPanel()

    wrapper.unmount()

    expect(unlistenFocusChangedMock).toHaveBeenCalledTimes(1)
  })

  it('reflects task config replacements without remounting the quick panel', async () => {
    const wrapper = await mountPanel([makeTask(1)])
    const taskStore = useTaskStore()

    expect(resultItems(wrapper)).toHaveLength(1)
    expect(resultItems(wrapper)[0].text()).toContain('事项 1')

    taskStore.replaceConfig(makeConfig([makeTask(2, { name: '新增事项' })]))
    await nextTick()
    await nextTick()

    expect(resultItems(wrapper)).toHaveLength(1)
    expect(resultItems(wrapper)[0].text()).toContain('新增事项')

    taskStore.replaceConfig(makeConfig([makeTask(2, { name: '新增事项', enabled: false })]))
    await nextTick()
    await nextTick()

    expect(resultItems(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('没有匹配的启用事项')
  })

  it('shows URL create suggestion when there are no matching task results', async () => {
    const wrapper = await mountPanel([])

    await wrapper.find('input').setValue('https://github.com')
    await nextTick()

    expect(wrapper.find('.quick-create-suggestion').exists()).toBe(true)
    expect(wrapper.text()).toContain('创建打开 URL 事项')
    expect(wrapper.text()).toContain('https://github.com/')
  })

  it('does not show create suggestions when existing task results match', async () => {
    const wrapper = await mountPanel([makeTask(1, { name: 'https://github.com' })])

    await wrapper.find('input').setValue('https://github.com')
    await nextTick()

    expect(resultItems(wrapper)).toHaveLength(1)
    expect(wrapper.find('.quick-create-suggestion').exists()).toBe(false)
  })

  it('opens quick create confirmation with Enter for suggestions', async () => {
    const wrapper = await mountPanel([])

    await wrapper.find('input').setValue('https://github.com')
    await nextTick()
    await pressKey('Enter')

    expect(wrapper.text()).toContain('确认事项信息')
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('saves command suggestions and optionally executes the saved task', async () => {
    const wrapper = await mountPanel([])
    const taskStore = useTaskStore()

    await wrapper.find('input').setValue('cmd: yarn dev')
    await nextTick()
    await pressKey('Enter')
    wrapper.findComponent(QuickCreateConfirm).vm.$emit('submit', {
      name: '执行 yarn dev',
      category: '未分类',
      keywords: [],
      favorite: false,
      runImmediately: true
    })
    await vi.waitFor(() => expect(taskStore.tasks).toHaveLength(1))

    expect(getDefaultWorkingDirMock).not.toHaveBeenCalled()
    expect(taskStore.tasks[0].actions[0]).toMatchObject({
        type: 'runCommand',
        params: {
          command: 'yarn dev',
          workingDir: '.'
        },
      riskLevel: 'medium'
    })
    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(executeMock.mock.calls[0][0].id).toBe(taskStore.tasks[0].id)
  })

  it('shows path suggestions after backend inspection', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {
      transformCallback: () => 1,
      invoke: vi.fn()
    })
    vi.useFakeTimers()
    const wrapper = await mountPanel([])

    await wrapper.find('input').setValue('D:\\Project\\anythingFast')
    await vi.advanceTimersByTimeAsync(180)
    await nextTick()
    await nextTick()

    expect(inspectPathInputMock).toHaveBeenCalledWith('D:\\Project\\anythingFast')
    expect(wrapper.text()).toContain('创建打开文件夹事项')

    vi.useRealTimers()
  })

  it('shows a clipboard suggestion before task results and opens confirmation with Enter', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', { transformCallback: () => 1, invoke: vi.fn() })
    getClipboardContextMock.mockResolvedValueOnce({
      source: 'clipboard',
      capturedAt: '2026-07-11T00:00:00.000Z',
      status: 'available',
      text: 'https://clipboard.example',
      truncated: false
    })
    const wrapper = await mountPanel([makeTask(1)])
    await Promise.resolve()
    await nextTick()
    await vi.waitFor(() => expect(onFocusChangedMock).toHaveBeenCalledTimes(1))
    await nextTick()

    const contextSuggestion = wrapper.find('.context-suggestion')
    expect(contextSuggestion.exists()).toBe(true)
    expect(contextSuggestion.text()).toContain('来自剪贴板')
    expect(contextSuggestion.attributes('aria-selected')).toBe('true')
    expect(resultItems(wrapper)[0].attributes('aria-selected')).toBe('false')
    expect(wrapper.find('[role="listbox"]').attributes('aria-activedescendant')).toBe(contextSuggestion.attributes('id'))

    await pressKey('Enter')

    expect(wrapper.text()).toContain('确认事项信息')
    expect(executeMock).not.toHaveBeenCalled()
  })

  it('keeps a non-saveable clipboard path out of the Enter target', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', { transformCallback: () => 1, invoke: vi.fn() })
    getClipboardContextMock.mockResolvedValueOnce({
      source: 'clipboard',
      capturedAt: '2026-07-11T00:00:00.000Z',
      status: 'available',
      text: 'D:\\missing\\path',
      truncated: false
    })
    inspectPathInputMock.mockResolvedValueOnce({
      input: 'D:\\missing\\path',
      exists: false,
      kind: 'unknown',
      normalizedPath: 'D:\\missing\\path',
      message: '路径不存在，不能创建'
    })
    const wrapper = await mountPanel([makeTask(1)])
    await Promise.resolve()
    await nextTick()
    await nextTick()

    expect(wrapper.text()).toContain('路径不存在，不能创建')
    expect(wrapper.find('.context-suggestion').attributes('aria-selected')).toBe('false')
    expect(resultItems(wrapper)[0].attributes('aria-selected')).toBe('true')

    await pressKey('Enter')

    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }))
  })

  it('resets the panel and refreshes clipboard context after focus returns', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', { transformCallback: () => 1, invoke: vi.fn() })
    getClipboardContextMock
      .mockResolvedValueOnce({
        source: 'clipboard',
        capturedAt: '2026-07-11T00:00:00.000Z',
        status: 'available',
        text: 'https://first.example',
        truncated: false
      })
      .mockResolvedValueOnce({
        source: 'clipboard',
        capturedAt: '2026-07-11T00:01:00.000Z',
        status: 'available',
        text: 'https://second.example',
        truncated: false
      })
    const wrapper = await mountPanel([makeTask(1)])
    await Promise.resolve()
    await nextTick()
    await wrapper.find('input').setValue('事项')

    focusChangedHandlers[0]?.({ payload: false })
    focusChangedHandlers[0]?.({ payload: true })
    await Promise.resolve()
    await nextTick()
    await nextTick()

    expect(wrapper.find('input').element).toHaveProperty('value', '')
    expect(getClipboardContextMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('https://second.example/')
  })

  it('updates recent ranking and metadata after task run metadata sync', async () => {
    const wrapper = await mountPanel([
      makeTask(1, { lastRunAt: '2026-07-01T08:00:00.000Z' }),
      makeTask(2, { lastRunAt: '2026-07-02T08:00:00.000Z' })
    ])
    const taskStore = useTaskStore()

    expect(resultItems(wrapper)[0].text()).toContain('事项 2')

    taskStore.replaceConfig(makeConfig([
      makeTask(1, { lastRunAt: '2026-07-03T08:00:00.000Z' }),
      makeTask(2, { lastRunAt: '2026-07-02T08:00:00.000Z' })
    ]))
    await nextTick()
    await nextTick()

    expect(resultItems(wrapper)[0].text()).toContain('事项 1')
    expect(resultItems(wrapper)[0].text()).toContain('上次')
  })

  it('passes every active run to the compact status without hiding results or hints', async () => {
    const wrapper = await mountPanel()
    const executionStore = useExecutionStore()

    executionStore.applyExecutionEvent({
      runId: 'run-a',
      taskId: 'task-1',
      taskName: '并发事项 A',
      scope: 'task',
      status: 'started',
      totalActions: 2
    })
    executionStore.applyExecutionEvent({
      runId: 'run-b',
      taskId: 'task-2',
      taskName: '并发事项 B',
      scope: 'task',
      status: 'started',
      totalActions: 3
    })
    await nextTick()

    const status = wrapper.findComponent(ExecutionStatusStripStub)
    const statusRuns = status.props('runs') as Array<{ taskName: string }>
    expect(status.exists()).toBe(true)
    expect(status.props('compact')).toBe(true)
    expect(statusRuns.map((run) => run.taskName)).toEqual(['并发事项 A', '并发事项 B'])
    expect(status.text()).toContain('并发事项 A')
    expect(status.text()).toContain('并发事项 B')
    expect(resultItems(wrapper)).toHaveLength(3)
    expect(wrapper.find('.status').text()).toContain('新增事项')
  })

  it('orders time-matched, recent, and ordinary tasks as one navigable recommendation list', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(localDate(6, 9, 0))
    const wrapper = await mountPanel([
      makeTask(1, { name: '周一事项', lastRunAt: localDate(6, 8, 10).toISOString() }),
      makeTask(2, { name: '周二事项', lastRunAt: localDate(7, 10, 30).toISOString() }),
      makeTask(3, { name: '夜间事项', lastRunAt: localDate(5, 20, 0).toISOString() }),
      makeTask(4, { name: '未运行事项' })
    ])

    expect(wrapper.text()).toContain('本时段推荐')
    expect(wrapper.text()).toContain('最近运行')
    expect(wrapper.text()).toContain('基于最近运行时间')
    expect(wrapper.findAll('#quick-result-task-1')).toHaveLength(1)
    expect(wrapper.findAll('#quick-result-task-2')).toHaveLength(1)
    expect(wrapper.findAll('#quick-result-task-3')).toHaveLength(1)
    expect(wrapper.findAll('#quick-result-task-4')).toHaveLength(1)
    expect(wrapper.find('[role="listbox"]').attributes('aria-activedescendant')).toBe('quick-result-task-1')

    await pressKey('ArrowDown')
    expect(wrapper.find('[role="listbox"]').attributes('aria-activedescendant')).toBe('quick-result-task-2')

    await pressKey('ArrowDown')
    expect(wrapper.find('[role="listbox"]').attributes('aria-activedescendant')).toBe('quick-result-task-3')

    await pressKey('ArrowDown')
    expect(wrapper.find('[role="listbox"]').attributes('aria-activedescendant')).toBe('quick-result-task-4')

    await pressKey('Enter')
    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-4' }))
  })

  it('keeps a saveable clipboard suggestion ahead of recommendation groups', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(localDate(6, 9, 0))
    Reflect.set(window, '__TAURI_INTERNALS__', { transformCallback: () => 1, invoke: vi.fn() })
    getClipboardContextMock.mockResolvedValueOnce({
      source: 'clipboard',
      capturedAt: '2026-07-06T09:00:00.000Z',
      status: 'available',
      text: 'https://context.example',
      truncated: false
    })
    const wrapper = await mountPanel([
      makeTask(1, { name: '周一事项', lastRunAt: localDate(6, 8, 10).toISOString() }),
      makeTask(2, { name: '夜间事项', lastRunAt: localDate(5, 20, 0).toISOString() })
    ])
    await Promise.resolve()
    await nextTick()
    await nextTick()

    expect(wrapper.find('[role="listbox"]').attributes('aria-activedescendant')).toMatch(/^quick-context-/)
    expect(wrapper.find('.context-suggestion').text()).toContain('来自剪贴板')

    await pressKey('ArrowDown')
    expect(wrapper.find('[role="listbox"]').attributes('aria-activedescendant')).toBe('quick-result-task-1')
  })

  it('hides both recommendation groups after a non-empty search query', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(localDate(6, 9, 0))
    const wrapper = await mountPanel([
      makeTask(1, { name: '周一事项', lastRunAt: localDate(6, 8, 10).toISOString() }),
      makeTask(2, { name: '匹配普通事项' })
    ])

    expect(wrapper.findAll('.recommendation-item')).toHaveLength(1)

    await wrapper.find('input').setValue('匹配普通')
    await nextTick()
    await nextTick()

    expect(wrapper.text()).not.toContain('本时段推荐')
    expect(wrapper.text()).not.toContain('最近运行')
    expect(wrapper.findAll('.recommendation-item')).toHaveLength(0)
    expect(resultItems(wrapper)).toHaveLength(1)
    expect(resultItems(wrapper)[0].text()).toContain('匹配普通事项')
  })

  it('routes high-risk and runtime-variable recommendations through the existing execution entry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(localDate(6, 9, 0))
    const wrapper = await mountPanel([
      makeTask(1, {
        name: '高风险变量事项',
        lastRunAt: localDate(6, 8, 10).toISOString(),
        variables: [{ key: 'token', label: '令牌', defaultValue: '', required: true, secret: true }],
        actions: [{
          id: 'high-risk-action',
          type: 'runCommand',
          name: '清理临时文件',
          params: {
            source: 'inline',
            command: 'Remove-Item C:\\Temp\\example',
            workingDir: 'C:\\Temp',
            env: {},
            showTerminal: false,
            closeTerminalOnFinish: true,
            terminalHost: 'systemTerminal',
            shell: 'powershell',
            scriptPath: '',
            scriptArgs: []
          },
          enabled: true,
          continueOnError: false,
          condition: { type: 'always' },
          outputBinding: null,
          riskLevel: 'high'
        }]
      })
    ])

    expect(wrapper.find('.recommendation-item').text()).toContain('高风险')
    await pressKey('Enter')

    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-1',
      riskLevel: 'high',
      variables: [expect.objectContaining({ key: 'token', required: true })]
    }))
  })
})

function localDate(day: number, hour: number, minute: number) {
  return new Date(2026, 6, day, hour, minute)
}
