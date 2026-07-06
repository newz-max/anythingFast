// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TaskListPanel from './TaskListPanel.vue'
import type { TaskItem } from '@/types/domain'

const NInputStub = defineComponent({
  name: 'NInput',
  inheritAttrs: false,
  props: ['value'],
  emits: ['update:value'],
  template: '<input v-bind="$attrs" :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
})

const stubs = {
  NInput: NInputStub,
  NScrollbar: defineComponent({
    name: 'NScrollbar',
    template: '<div><slot /></div>'
  }),
  NEmpty: defineComponent({
    name: 'NEmpty',
    template: '<div />'
  })
}

function makeTask(id: string, name: string): TaskItem {
  return {
    id,
    name,
    category: '工作',
    keywords: [],
    description: '',
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

function mountPanel(selectedTaskId = 'task-1') {
  return mount(TaskListPanel, {
    attachTo: document.body,
    props: {
      tasks: [makeTask('task-1', '打开控制台'), makeTask('task-2', '部署项目'), makeTask('task-3', '阅读文档')],
      categories: ['全部', '工作'],
      selectedTaskId
    },
    global: { stubs }
  })
}

describe('TaskListPanel keyboard support API', () => {
  it('focuses and selects the search input through the exposed API', async () => {
    const wrapper = mountPanel()
    const input = wrapper.find('input').element as HTMLInputElement

    await wrapper.find('input').setValue('部署')
    ;(wrapper.vm as unknown as { focusSearch: () => void }).focusSearch()

    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(input.value.length)
  })

  it('returns visible task ids in search result order', async () => {
    const wrapper = mountPanel()

    await wrapper.find('input').setValue('部署')
    await nextTick()

    expect((wrapper.vm as unknown as { visibleTaskIds: () => string[] }).visibleTaskIds()).toEqual(['task-2'])
  })

  it('scrolls the selected visible task into view', async () => {
    const scrollIntoViewMock = vi.fn()
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock
    })
    const wrapper = mountPanel('task-2')

    await (wrapper.vm as unknown as { scrollTaskIntoView: (taskId: string) => Promise<void> }).scrollTaskIntoView('task-2')

    expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' })
  })
})
