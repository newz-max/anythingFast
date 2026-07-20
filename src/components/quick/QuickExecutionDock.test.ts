// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import QuickExecutionDock from './QuickExecutionDock.vue'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'

const ExecutionStatusStripStub = defineComponent({
  props: { runs: { type: Array, default: () => [] } },
  template: '<div class="full-run-list"><span v-for="run in runs" :key="run.runId">{{ run.taskName }}</span></div>'
})

function run(index: number, patch: Partial<ExecutionRunSnapshot> = {}): ExecutionRunSnapshot {
  return {
    runId: `run-${index}`,
    targetKey: `task:task-${index}`,
    taskId: `task-${index}`,
    taskName: `事项 ${index}`,
    scope: 'task',
    status: 'running',
    currentActionId: `action-${index}`,
    currentActionName: `动作 ${index}`,
    currentActionType: 'openUrl',
    currentIndex: 1,
    totalActions: 2,
    completedActions: 1,
    progressPercent: 50,
    message: '执行中',
    ...patch
  }
}

function mountDock(runs: ExecutionRunSnapshot[], expanded = false) {
  let wrapper: ReturnType<typeof mount>
  wrapper = mount(QuickExecutionDock, {
    attachTo: document.body,
    props: {
      runs,
      expanded,
      'onUpdate:expanded': (value: boolean) => wrapper.setProps({ expanded: value })
    },
    global: {
      stubs: { ExecutionStatusStrip: ExecutionStatusStripStub }
    }
  })
  return wrapper
}

describe('QuickExecutionDock', () => {
  it('reserves the same collapsed structure without active runs', () => {
    const wrapper = mountDock([])

    expect(wrapper.find('.execution-dock').exists()).toBe(true)
    expect(wrapper.find('.dock-summary').text()).toContain('暂无执行')
    expect(wrapper.find('.expand-button').attributes()).toHaveProperty('disabled')
    expect(wrapper.find('.execution-overlay').exists()).toBe(false)
  })

  it('aggregates one active run and exposes determinate progress', () => {
    const wrapper = mountDock([run(1)])

    expect(wrapper.text()).toContain('正在执行 1 项')
    expect(wrapper.text()).toContain('1/2 个动作')
    expect(wrapper.text()).toContain('当前：动作 1')
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('50')
  })

  it('aggregates multiple runs without rendering detail rows while collapsed', () => {
    const wrapper = mountDock([
      run(1),
      run(2, { completedActions: 2, totalActions: 3 }),
      run(3),
      run(4)
    ])

    expect(wrapper.text()).toContain('正在执行 4 项')
    expect(wrapper.text()).toContain('5/9 个动作')
    expect(wrapper.text()).toContain('当前：动作 4')
    expect(wrapper.find('.full-run-list').exists()).toBe(false)
  })

  it('uses indeterminate progress when an active run has no known total', () => {
    const wrapper = mountDock([run(1, { totalActions: 0, completedActions: 0, currentActionName: '' })])
    const progress = wrapper.find('[role="progressbar"]')

    expect(wrapper.text()).toContain('等待动作事件')
    expect(progress.attributes('aria-valuenow')).toBeUndefined()
    expect(wrapper.find('.progress-track').classes()).toContain('indeterminate')
  })

  it('expands every run in an accessible bounded overlay', async () => {
    const runs = Array.from({ length: 4 }, (_, index) => run(index + 1))
    const wrapper = mountDock(runs)

    await wrapper.find('.expand-button').trigger('click')
    await nextTick()

    expect(wrapper.find('.expand-button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.expand-button').attributes('aria-controls')).toBe('quick-execution-details')
    expect(wrapper.find('.execution-overlay').attributes('role')).toBe('region')
    expect(wrapper.findAll('.full-run-list span').map((item) => item.text())).toEqual([
      '事项 1',
      '事项 2',
      '事项 3',
      '事项 4'
    ])
  })

  it('removes only a completed run and preserves remaining detail order', async () => {
    const runs = [run(1), run(2), run(3)]
    const wrapper = mountDock(runs, true)

    await wrapper.setProps({ runs: [runs[0], runs[2]] })

    expect(wrapper.findAll('.full-run-list span').map((item) => item.text())).toEqual(['事项 1', '事项 3'])
  })

  it('closes details with Escape and restores focus to the toggle button', async () => {
    const wrapper = mountDock([run(1)], true)
    const button = wrapper.find('.expand-button').element as HTMLButtonElement
    button.focus()

    await wrapper.find('.execution-dock').trigger('keydown', { key: 'Escape' })
    await nextTick()

    expect(wrapper.find('.execution-overlay').exists()).toBe(false)
    expect(wrapper.find('.expand-button').attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(button)
  })
})
