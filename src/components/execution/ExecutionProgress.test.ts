import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ExecutionProgress from './ExecutionProgress.vue'
import type { ExecutionEventPayload } from '@/api/events'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'
import type { ExecutionLogSummary } from '@/types/domain'

const stubs = {
  NCard: { template: '<section><slot /></section>' },
  NGrid: { template: '<div><slot /></div>' },
  NGi: { template: '<div><slot /></div>' },
  NEmpty: { props: ['description'], template: '<div>{{ description }}</div>' },
  NProgress: { props: ['percentage'], template: '<div>进度 {{ percentage }}%</div>' },
  NTimeline: { template: '<div><slot /></div>' },
  NTimelineItem: { props: ['title', 'content'], template: '<div>{{ title }} {{ content }}</div>' },
  NList: { template: '<div><slot /></div>' },
  NListItem: { template: '<div><slot name="prefix" /><slot /></div>' },
  NTag: { template: '<span><slot /></span>' },
  NThing: { props: ['title', 'description'], template: '<div><strong>{{ title }}</strong><span>{{ description }}</span></div>' }
}

describe('ExecutionProgress', () => {
  it('renders current progress events and command output from recent logs', () => {
    const currentRun: ExecutionRunSnapshot = {
      runId: 'run-1',
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
      message: '执行中'
    }
    const events: ExecutionEventPayload[] = [
      {
        runId: 'run-1',
        taskId: 'task-1',
        taskName: '测试事项',
        scope: 'task',
        status: 'action-started',
        currentIndex: 1,
        totalActions: 2,
        actionId: 'action-1',
        actionName: '执行脚本',
        actionType: 'runCommand',
        message: '执行脚本'
      },
      {
        runId: 'run-1',
        taskId: 'task-1',
        taskName: '测试事项',
        scope: 'task',
        status: 'action-skipped',
        currentIndex: 2,
        totalActions: 2,
        actionId: 'action-2',
        actionName: '停用动作',
        actionType: 'delay',
        message: '动作已停用'
      }
    ]
    const logs: ExecutionLogSummary[] = [
      {
        id: 'log-1',
        taskId: 'task-1',
        taskName: '测试事项',
        scope: 'task',
        startedAt: '2026-07-03T00:00:00Z',
        finishedAt: '2026-07-03T00:00:01Z',
        status: 'failed',
        actions: [
          {
            actionId: 'action-1',
            actionName: '执行脚本',
            actionType: 'runCommand',
            status: 'failed',
            message: '命令执行失败，退出码：7，bad',
            exitCode: 7,
            stdout: 'hello',
            stderr: 'bad'
          }
        ]
      }
    ]

    const wrapper = mount(ExecutionProgress, {
      props: {
        currentRun,
        events,
        logs
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('进度 50%')
    expect(wrapper.text()).toContain('1/2 · 执行脚本')
    expect(wrapper.text()).toContain('2/2 · 动作已停用')
    expect(wrapper.text()).toContain('执行脚本')
    expect(wrapper.text()).toContain('命令执行失败，退出码：7，bad')
    expect(wrapper.text()).toContain('退出码 7')
    expect(wrapper.text()).toContain('hello')
    expect(wrapper.text()).toContain('bad')
  })
})
