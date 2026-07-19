import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ExecutionProgress from './ExecutionProgress.vue'
import type { ExecutionEventPayload } from '@/api/events'
import type { ExecutionRunSnapshot, ExecutionTimelineEntry } from '@/stores/executionStore'
import type { ExecutionLogSummary } from '@/types/domain'

const stubs = {
  NCard: { template: '<section><slot /></section>' },
  NGrid: { template: '<div><slot /></div>' },
  NGi: { template: '<div><slot /></div>' },
  NEmpty: { props: ['description'], template: '<div>{{ description }}</div>' },
  NProgress: { props: ['percentage'], template: '<div>进度 {{ percentage }}%</div>' },
  NTimeline: { template: '<div><slot /></div>' },
  NTimelineItem: { props: ['title', 'content'], template: '<div class="timeline-item">{{ title }} {{ content }}</div>' },
  NList: { template: '<div><slot /></div>' },
  NListItem: { template: '<div><slot name="prefix" /><slot /></div>' },
  NTag: { template: '<span><slot /></span>' },
  NThing: { props: ['title', 'description'], template: '<div><strong>{{ title }}</strong><span>{{ description }}</span></div>' },
  NAlert: { props: ['title'], template: '<div>{{ title }} <slot /></div>' }
}

describe('ExecutionProgress', () => {
  it('renders current progress events and command output from recent logs', () => {
    const activeRun: ExecutionRunSnapshot = {
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
      },
      {
        id: 'log-2',
        taskId: 'task-2',
        taskName: '取消事项',
        scope: 'task',
        startedAt: '2026-07-03T00:00:02Z',
        finishedAt: '2026-07-03T00:00:03Z',
        status: 'cancelled',
        actions: [
          {
            actionId: 'action-3',
            actionName: '构建脚本',
            actionType: 'runCommand',
            status: 'cancelled',
            message: '命令执行已取消：终端窗口被关闭或进程收到中断信号',
            exitCode: -1073741510
          }
        ]
      },
      {
        id: 'log-3',
        taskId: 'task-3',
        taskName: '条件事项',
        scope: 'task',
        startedAt: '2026-07-03T00:00:04Z',
        finishedAt: '2026-07-03T00:00:05Z',
        status: 'success',
        actions: [
          {
            actionId: 'action-4',
            actionName: '条件动作',
            actionType: 'openFile',
            status: 'skipped',
            message: '条件不满足：文件不存在：D:\\missing.txt',
            skipReason: '条件不满足：文件不存在：D:\\missing.txt'
          }
        ]
      }
    ]

    const wrapper = mount(ExecutionProgress, {
      props: {
        runs: [activeRun],
        timeline: toTimeline(events),
        logs
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('进度 50%')
    expect(wrapper.text()).toContain('1/2 · 执行脚本')
    expect(wrapper.text()).toContain('2/2 · 动作已停用')
    expect(wrapper.text()).toContain('执行脚本')
    expect(wrapper.text()).toContain('命令执行失败，退出码：7，bad')
    expect(wrapper.text()).toContain('命令执行已取消：终端窗口被关闭或进程收到中断信号')
    expect(wrapper.text()).toContain('条件不满足：文件不存在：D:\\missing.txt')
    expect(wrapper.text()).toContain('退出码 -1073741510')
    expect(wrapper.text()).toContain('退出码 7')
    expect(wrapper.text()).toContain('hello')
    expect(wrapper.text()).toContain('bad')
  })

  it('renders multiple active runs', () => {
    const wrapper = mount(ExecutionProgress, {
      props: {
        runs: [
          {
            runId: 'run-1',
            targetKey: 'task:task-1',
            taskId: 'task-1',
            taskName: '事项 A',
            scope: 'task',
            status: 'running',
            currentActionId: 'action-1',
            currentActionName: '动作 A',
            currentActionType: 'delay',
            currentIndex: 1,
            totalActions: 2,
            completedActions: 1,
            progressPercent: 50,
            message: '动作 A'
          },
          {
            runId: 'run-2',
            targetKey: 'action:task-2:action-2',
            taskId: 'task-2',
            taskName: '事项 B',
            scope: 'action',
            status: 'running',
            currentActionId: 'action-2',
            currentActionName: '动作 B',
            currentActionType: 'delay',
            currentIndex: 1,
            totalActions: 1,
            completedActions: 0,
            progressPercent: 0,
            message: '动作 B'
          }
        ],
        timeline: [],
        logs: []
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('事项 A')
    expect(wrapper.text()).toContain('事项 B · 单动作')
    expect(wrapper.text()).toContain('进度 50%')
    expect(wrapper.text()).toContain('进度 0%')
  })

  it('renders only the latest 20 timeline entries in observed order', () => {
    const entries = Array.from({ length: 21 }, (_, index) => event({
      actionId: `action-${index + 1}`,
      actionName: `事件 ${index + 1}`,
      currentIndex: index + 1
    }))
    const wrapper = mount(ExecutionProgress, {
      props: {
        runs: [],
        timeline: toTimeline(entries),
        logs: []
      },
      global: { stubs }
    })

    const timelineItems = wrapper.findAll('.timeline-item')
    expect(timelineItems).toHaveLength(20)
    expect(timelineItems.map((item) => item.text().match(/事件 \d+/)?.[0])).toEqual(
      Array.from({ length: 20 }, (_, index) => `事件 ${index + 2}`)
    )
    expect(timelineItems[0].text()).toContain('测试事项 · 事件 2')
    expect(timelineItems.at(-1)?.text()).toContain('测试事项 · 事件 21')
  })

  it('keeps interleaved same-name events distinct and identifies their tasks', () => {
    const entries = [
      event({ runId: 'run-a', taskId: 'task-a', taskName: '事项 A', actionName: '等待', message: 'A1' }),
      event({ runId: 'run-b', taskId: 'task-b', taskName: '事项 B', actionName: '等待', message: 'B1' }),
      event({ runId: 'run-a', taskId: 'task-a', taskName: '事项 A', actionName: '等待', message: 'A2' }),
      event({ runId: 'run-b', taskId: 'task-b', taskName: '事项 B', status: 'started', actionName: undefined, message: 'B2' })
    ]
    const wrapper = mount(ExecutionProgress, {
      props: {
        runs: [],
        timeline: toTimeline(entries),
        logs: []
      },
      global: { stubs }
    })

    expect(wrapper.findAll('.timeline-item').map((item) => item.text())).toEqual([
      expect.stringContaining('事项 A · 等待 A1'),
      expect.stringContaining('事项 B · 等待 B1'),
      expect.stringContaining('事项 A · 等待 A2'),
      expect.stringContaining('事项 B B2')
    ])
  })

  it('shows a separate log loading error', () => {
    const wrapper = mount(ExecutionProgress, {
      props: {
        runs: [],
        timeline: [],
        logs: [],
        logLoadError: '日志文件暂时不可读'
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('执行日志加载失败')
    expect(wrapper.text()).toContain('日志文件暂时不可读')
  })
})

function event(patch: Partial<ExecutionEventPayload> = {}): ExecutionEventPayload {
  return {
    runId: 'run-1',
    taskId: 'task-1',
    taskName: '测试事项',
    scope: 'task',
    status: 'action-started',
    totalActions: 13,
    ...patch
  }
}

function toTimeline(events: ExecutionEventPayload[]): ExecutionTimelineEntry[] {
  return events.map((payload, index) => ({
    sequence: index + 1,
    receivedAt: index,
    payload
  }))
}
