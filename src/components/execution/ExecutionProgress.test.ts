import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ExecutionProgress from './ExecutionProgress.vue'
import type { ExecutionLogSummary } from '@/types/domain'

const stubs = {
  NCard: { template: '<section><slot /></section>' },
  NGrid: { template: '<div><slot /></div>' },
  NGi: { template: '<div><slot /></div>' },
  NEmpty: { props: ['description'], template: '<div>{{ description }}</div>' },
  NTimeline: { template: '<div><slot /></div>' },
  NTimelineItem: { props: ['title', 'content'], template: '<div>{{ title }} {{ content }}</div>' },
  NList: { template: '<div><slot /></div>' },
  NListItem: { template: '<div><slot name="prefix" /><slot /></div>' },
  NTag: { template: '<span><slot /></span>' },
  NThing: { props: ['title', 'description'], template: '<div><strong>{{ title }}</strong><span>{{ description }}</span></div>' }
}

describe('ExecutionProgress', () => {
  it('renders failed action messages in recent logs', () => {
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
            message: '命令执行失败，退出码：7，bad'
          }
        ]
      }
    ]

    const wrapper = mount(ExecutionProgress, {
      props: {
        events: [],
        logs
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('执行脚本')
    expect(wrapper.text()).toContain('命令执行失败，退出码：7，bad')
  })
})
