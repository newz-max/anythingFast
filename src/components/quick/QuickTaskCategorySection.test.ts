// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import QuickTaskCategorySection from './QuickTaskCategorySection.vue'
import type { QuickTaskRow } from '@/components/quick/quickTaskRows'
import type { TaskItem } from '@/types/domain'

const stubs = {
  NSpin: { template: '<span class="spin-stub">运行中</span>' },
  NTag: {
    props: ['type'],
    template: '<span class="tag-stub" :data-type="type"><slot /></span>'
  }
}

describe('QuickTaskCategorySection', () => {
  it('renders an accessible expanded heading, count, and ordered task rows', () => {
    const rows = [makeRow(1), makeRow(2)]
    const wrapper = mountCategory({ rows, expanded: true })
    const toggle = wrapper.get('.category-toggle')
    const contentId = toggle.attributes('aria-controls')

    expect(toggle.text()).toContain('工作')
    expect(toggle.text()).toContain('2')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('aria-label')).toContain('收起分类 工作')
    expect(wrapper.get('.category-name').attributes('title')).toBe('工作')
    expect(wrapper.find(`#${contentId}`).exists()).toBe(true)
    expect(wrapper.findAll('.task-row').map((row) => row.text())).toEqual([
      expect.stringContaining('事项 1'),
      expect.stringContaining('事项 2')
    ])
  })

  it('removes controlled task content from the DOM when collapsed', () => {
    const wrapper = mountCategory({ expanded: false })
    const toggle = wrapper.get('.category-toggle')

    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-label')).toContain('展开分类 工作')
    expect(wrapper.find('.category-content').exists()).toBe(false)
    expect(wrapper.find('.task-row').exists()).toBe(false)
  })

  it('emits one toggle without executing a task', async () => {
    const wrapper = mountCategory()

    await wrapper.get('.category-toggle').trigger('click')

    expect(wrapper.emitted('toggle')).toEqual([['工作']])
    expect(wrapper.emitted('execute')).toBeUndefined()
  })

  it('forwards task selection and execution with ordinary row presentation', async () => {
    const row = makeRow(1, { running: true, riskLabel: '高风险', riskTagType: 'error' })
    const wrapper = mountCategory({ rows: [row], selectedKey: row.key })
    const taskRow = wrapper.get('.task-row')

    expect(taskRow.classes()).toContain('active')
    expect(taskRow.classes()).toContain('running')
    expect(taskRow.attributes('aria-selected')).toBe('true')
    expect(taskRow.text()).toContain('运行中')
    expect(taskRow.text()).toContain('高风险')
    expect(wrapper.find('.tag-stub[data-type="error"]').exists()).toBe(true)

    await taskRow.trigger('mouseenter')
    await taskRow.trigger('click')

    expect(wrapper.emitted('select')).toEqual([[row]])
    expect(wrapper.emitted('execute')).toEqual([[row]])
  })

  it('exposes the complete long label while keeping dedicated truncation hooks', () => {
    const label = '这是一个用于验证紧凑标题布局的非常长的业务分类名称'
    const wrapper = mountCategory({ categoryKey: label, label })

    expect(wrapper.get('.category-name').attributes('title')).toBe(label)
    expect(wrapper.get('.category-name').classes()).toContain('category-name')
    expect(wrapper.get('.category-count').text()).toBe('1')
  })
})

function mountCategory(patch: Partial<{
  categoryKey: string
  label: string
  rows: QuickTaskRow[]
  expanded: boolean
  selectedKey: string | null
}> = {}) {
  return mount(QuickTaskCategorySection, {
    props: {
      categoryKey: '工作',
      label: '工作',
      rows: [makeRow(1)],
      expanded: true,
      selectedKey: null,
      optionId: (key: string) => `quick-result-${key.slice('task:'.length)}`,
      ...patch
    },
    global: { stubs }
  })
}

function makeRow(index: number, patch: Partial<QuickTaskRow> = {}): QuickTaskRow {
  const task = makeTask(index)
  return {
    key: `task:${task.id}`,
    task,
    actionDetail: `打开 URL · https://example.com/${index}`,
    categoryTone: 'blue',
    meta: '1 个可执行动作',
    running: false,
    riskLabel: '低风险',
    riskTagType: 'success',
    ...patch
  }
}

function makeTask(index: number): TaskItem {
  return {
    id: `task-${index}`,
    name: `事项 ${index}`,
    category: '工作',
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
