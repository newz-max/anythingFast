import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ExecutionStatusStrip from './ExecutionStatusStrip.vue'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'

const stubs = {
  NProgress: {
    props: ['percentage', 'status', 'processing', 'height', 'showIndicator'],
    template: '<div>进度 {{ percentage }}% {{ status }} {{ processing ? "processing" : "idle" }}</div>'
  },
  NSpin: { template: '<span>loading</span>' },
  NTag: { props: ['type'], template: '<span>{{ type }} <slot /></span>' }
}

function run(patch: Partial<ExecutionRunSnapshot> = {}): ExecutionRunSnapshot {
  return {
    runId: 'run-1',
    targetKey: 'task:task-1',
    taskId: 'task-1',
    taskName: '测试事项',
    scope: 'task',
    status: 'running',
    currentActionId: 'action-1',
    currentActionName: '执行脚本',
    currentActionType: 'runCommand',
    currentIndex: 1,
    totalActions: 2,
    completedActions: 1,
    progressPercent: 50,
    message: '执行脚本',
    ...patch
  }
}

describe('ExecutionStatusStrip', () => {
  it('renders running task progress with processing state', () => {
    const wrapper = mount(ExecutionStatusStrip, {
      props: { runs: [run()] },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('测试事项')
    expect(wrapper.text()).toContain('执行中')
    expect(wrapper.text()).toContain('进度 50% info processing')
    expect(wrapper.text()).toContain('1/2 个动作')
    expect(wrapper.text()).toContain('当前：执行脚本')
  })

  it('renders success and failed status colors', () => {
    const success = mount(ExecutionStatusStrip, {
      props: { runs: [run({ status: 'success', completedActions: 2, progressPercent: 100, message: '执行完成' })] },
      global: { stubs }
    })
    const failed = mount(ExecutionStatusStrip, {
      props: { runs: [run({ status: 'failed', message: '执行失败' })] },
      global: { stubs }
    })

    expect(success.text()).toContain('success 成功')
    expect(success.text()).toContain('进度 100% success idle')
    expect(failed.text()).toContain('error 失败')
    expect(failed.text()).toContain('执行失败')
  })

  it('renders single action and unknown total fallbacks', () => {
    const singleAction = mount(ExecutionStatusStrip, {
      props: { runs: [run({ scope: 'action', totalActions: 1, completedActions: 0, taskName: '测试事项' })] },
      global: { stubs }
    })
    const pending = mount(ExecutionStatusStrip, {
      props: { runs: [run({ totalActions: 0, completedActions: 0, progressPercent: 0, currentActionName: '' })] },
      global: { stubs }
    })

    expect(singleAction.text()).toContain('测试事项 · 单动作')
    expect(singleAction.text()).toContain('0/1 个动作')
    expect(pending.text()).toContain('等待动作事件')
  })

  it('summarizes multiple active runs and uses the latest run details', () => {
    const wrapper = mount(ExecutionStatusStrip, {
      props: {
        runs: [
          run({ runId: 'run-1', taskName: '事项 A' }),
          run({ runId: 'run-2', taskId: 'task-2', targetKey: 'action:task-2:action-2', taskName: '事项 B', scope: 'action' })
        ],
        compact: true
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('2 个运行正在执行')
    expect(wrapper.text()).toContain('2 项运行中')
    expect(wrapper.text()).toContain('最新：事项 B · 单动作')
  })

  it('renders nothing without active or scoped runs', () => {
    const wrapper = mount(ExecutionStatusStrip, {
      props: { runs: [] },
      global: { stubs }
    })

    expect(wrapper.find('.execution-status-strip').exists()).toBe(false)
  })
})
