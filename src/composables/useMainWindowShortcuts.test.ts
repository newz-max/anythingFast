// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, shallowRef } from 'vue'
import { resolveEffectiveKeybindings } from '@/domain/keybindings'
import type { KeybindingOverride } from '@/types/domain'
import type { TaskItem } from '@/types/domain'
import { useMainWindowShortcuts } from './useMainWindowShortcuts'

describe('useMainWindowShortcuts', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('focuses search with slash unless the target is editable', async () => {
    const harness = mountHarness()

    await pressKey('/')
    expect(harness.focusSearch).toHaveBeenCalledTimes(1)

    const input = document.createElement('input')
    document.body.appendChild(input)
    await pressKey('/', {}, input)

    expect(harness.focusSearch).toHaveBeenCalledTimes(1)
    harness.wrapper.unmount()
  })

  it('does not dispatch shortcuts when disabled', async () => {
    const harness = mountHarness({ disabled: true })

    await pressKey('/')
    await pressKey('Enter', { ctrlKey: true })

    expect(harness.focusSearch).not.toHaveBeenCalled()
    expect(harness.runSelectedTask).not.toHaveBeenCalled()
    harness.wrapper.unmount()
  })

  it('does not move task selection in template center', async () => {
    const harness = mountHarness({ templateCenter: true })

    await pressKey('ArrowDown')

    expect(harness.selectTask).not.toHaveBeenCalled()
    expect(harness.scrollTaskIntoView).not.toHaveBeenCalled()
    harness.wrapper.unmount()
  })

  it('moves selected task through visible ids and scrolls it into view', async () => {
    const harness = mountHarness()

    await pressKey('ArrowDown')

    expect(harness.selectTask).toHaveBeenCalledWith('task-2')
    expect(harness.scrollTaskIntoView).toHaveBeenCalledWith('task-2')
    harness.wrapper.unmount()
  })

  it('uses customized keybindings and ignores disabled keybindings', async () => {
    const custom = mountHarness({ overrides: [{ command: 'main.runSelectedTask', key: 'Alt+R' }] })

    await pressKey('Enter', { ctrlKey: true })
    expect(custom.runSelectedTask).not.toHaveBeenCalled()

    await pressKey('r', { altKey: true })
    expect(custom.runSelectedTask).toHaveBeenCalledTimes(1)
    custom.wrapper.unmount()

    const disabled = mountHarness({ overrides: [{ command: 'main.focusSearch', disabled: true }] })
    await pressKey('/')
    expect(disabled.focusSearch).not.toHaveBeenCalled()
    disabled.wrapper.unmount()
  })

  it('dispatches selected task operations and removes its listener on unmount', async () => {
    const harness = mountHarness()

    await pressKey('Enter', { ctrlKey: true })
    await pressKey('n', { ctrlKey: true })
    await pressKey('e', { ctrlKey: true })
    await pressKey('f')
    await pressKey('`', { ctrlKey: true, code: 'Backquote' })
    await pressKey('2')
    await pressKey('1')
    await pressKey('a')

    expect(harness.runSelectedTask).toHaveBeenCalledTimes(1)
    expect(harness.createTask).toHaveBeenCalledTimes(1)
    expect(harness.editSelectedTask).toHaveBeenNthCalledWith(1)
    expect(harness.toggleSelectedTaskFavorite).toHaveBeenCalledTimes(1)
    expect(harness.toggleExecutionPanel).toHaveBeenCalledTimes(1)
    expect(harness.setActionView).toHaveBeenNthCalledWith(1, 'flow')
    expect(harness.setActionView).toHaveBeenNthCalledWith(2, 'list')
    expect(harness.editSelectedTask).toHaveBeenNthCalledWith(2, 2)

    harness.wrapper.unmount()
    await pressKey('Enter', { ctrlKey: true })

    expect(harness.runSelectedTask).toHaveBeenCalledTimes(1)
  })

  function mountHarness(options: { disabled?: boolean; templateCenter?: boolean; overrides?: KeybindingOverride[] } = {}) {
    const selectedTask = shallowRef<TaskItem | null>(makeTask('task-1'))
    const selectedTaskId = shallowRef<string | null>('task-1')
    const focusSearch = vi.fn()
    const scrollTaskIntoView = vi.fn().mockResolvedValue(undefined)
    const selectTask = vi.fn((taskId: string | null) => {
      selectedTaskId.value = taskId
    })
    const runSelectedTask = vi.fn()
    const createTask = vi.fn()
    const editSelectedTask = vi.fn()
    const toggleSelectedTaskFavorite = vi.fn()
    const toggleExecutionPanel = vi.fn()
    const setActionView = vi.fn()

    const taskListPanelRef = shallowRef({
      focusSearch,
      visibleTaskIds: () => ['task-1', 'task-2', 'task-3'],
      scrollTaskIntoView
    })

    const wrapper = mount(defineComponent({
      setup() {
        useMainWindowShortcuts({
          keybindings: { effective: computed(() => resolveEffectiveKeybindings(options.overrides ?? [])) },
          isDisabled: () => Boolean(options.disabled),
          isTemplateCenter: shallowRef(Boolean(options.templateCenter)),
          selectedTask,
          selectedTaskId,
          taskListPanelRef,
          getVisibleTaskIds: () => ['task-1', 'task-2', 'task-3'],
          selectTask,
          runSelectedTask,
          createTask,
          editSelectedTask,
          toggleSelectedTaskFavorite,
          toggleExecutionPanel,
          setActionView
        })
        return {}
      },
      template: '<div />'
    }))

    return {
      wrapper,
      focusSearch,
      scrollTaskIntoView,
      selectTask,
      runSelectedTask,
      createTask,
      editSelectedTask,
      toggleSelectedTaskFavorite,
      toggleExecutionPanel,
      setActionView
    }
  }
})

async function pressKey(key: string, options: KeyboardEventInit = {}, target: Window | HTMLElement = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))
  await Promise.resolve()
}

function makeTask(id: string): TaskItem {
  return {
    id,
    name: `事项 ${id}`,
    actions: [],
    riskLevel: 'low',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
}
