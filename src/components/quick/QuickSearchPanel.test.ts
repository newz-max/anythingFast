// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, ref } from 'vue'
import QuickSearchPanel from './QuickSearchPanel.vue'
import { useTaskStore } from '@/stores/taskStore'
import type { AppConfig, TaskItem } from '@/types/domain'

const executeMock = vi.hoisted(() => vi.fn())
const hideWindowMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    hide: hideWindowMock
  })
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

const stubs = {
  NInput: NInputStub,
  NSpin: { template: '<span>loading</span>' },
  NTag: { props: ['type'], template: '<span><slot /></span>' },
  ExecutionStatusStrip: { template: '<div />' }
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

async function pressKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
  await nextTick()
  await nextTick()
}

function resultItems(wrapper: VueWrapper) {
  return wrapper.findAll('.result-item')
}

describe('QuickSearchPanel keyboard navigation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    executeMock.mockClear()
    hideWindowMock.mockClear()
    scrollIntoViewMock.mockClear()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock
    })
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
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

    await pressKey('ArrowUp')

    expect(resultItems(wrapper)[0].classes()).toContain('active')
    expect(resultItems(wrapper)[0].attributes('aria-selected')).toBe('true')
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
})
