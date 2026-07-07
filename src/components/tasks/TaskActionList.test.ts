// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import TaskActionList from '@/components/tasks/TaskActionList.vue'
import type { ActionExecutionDisplay } from '@/domain/executionPresentation'
import type { TaskItem } from '@/types/domain'

const stubs = {
  NSpin: defineComponent({
    name: 'NSpin',
    template: '<span class="spin-stub" />'
  }),
  NTag: defineComponent({
    name: 'NTag',
    props: ['type'],
    template: '<span class="tag-stub"><slot /></span>'
  }),
  NEmpty: defineComponent({
    name: 'NEmpty',
    props: ['description'],
    template: '<section class="empty-stub"><span>{{ description }}</span><slot name="extra" /></section>'
  })
}

function makeTask(patch: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 'task-1',
    name: '开发环境',
    category: '工作',
    keywords: [],
    description: '',
    actions: [
      {
        id: 'action-url',
        type: 'openUrl',
        name: '打开文档',
        params: { url: 'https://example.com' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      },
      {
        id: 'action-delay',
        type: 'delay',
        name: '',
        params: { durationMs: 500 },
        enabled: false,
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

describe('TaskActionList', () => {
  it('displays action rows, details, execution state, and disabled running state', () => {
    const actionExecutionStates: Record<string, ActionExecutionDisplay> = {
      'action-url': { status: 'success', label: '成功', type: 'success' },
      'action-delay': { status: 'running', label: '执行中', type: 'info' }
    }

    const wrapper = mount(TaskActionList, {
      props: {
        task: makeTask(),
        actionExecutionStates,
        isActionRunning: (action) => action.id === 'action-delay'
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('打开文档')
    expect(wrapper.text()).toContain('https://example.com')
    expect(wrapper.text()).toContain('延时等待')
    expect(wrapper.text()).toContain('等待 500 ms')
    expect(wrapper.text()).toContain('成功')
    expect(wrapper.text()).toContain('执行中')

    const runButtons = wrapper.findAll('button[aria-label="单动作运行"]')
    expect(runButtons).toHaveLength(2)
    expect(runButtons[0].attributes('disabled')).toBeUndefined()
    expect(runButtons[1].attributes('disabled')).toBeDefined()
  })

  it('emits run-action for the selected action', async () => {
    const task = makeTask()
    const wrapper = mount(TaskActionList, {
      props: {
        task,
        actionExecutionStates: {},
        isActionRunning: () => false
      },
      global: { stubs }
    })

    await wrapper.find('button[aria-label="单动作运行"]').trigger('click')

    expect(wrapper.emitted('run-action')).toEqual([[task.actions[0]]])
  })

  it('emits add-action from the empty state', async () => {
    const wrapper = mount(TaskActionList, {
      props: {
        task: makeTask({ actions: [] }),
        actionExecutionStates: {},
        isActionRunning: vi.fn()
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('还没有动作')

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('add-action')).toHaveLength(1)
  })
})
