import { shallowMount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import TaskDetailPanel from './TaskDetailPanel.vue'
import type { TaskDetailExecutionView, TaskDetailMetaView, TaskDetailTriggerView } from '@/composables/useSelectedTaskDetailPanel'
import type { CopyExecutionErrorPayload, ExecutionResultActionTarget } from '@/domain/executionPresentation'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'
import type { TaskItem } from '@/types/domain'

const target: ExecutionResultActionTarget = {
  logId: 'log-1',
  taskId: 'task-1',
  actionId: 'action-1'
}
const copyPayload: CopyExecutionErrorPayload = { ...target, diagnostic: '已遮罩：***' }

const ExecutionProgressStub = defineComponent({
  name: 'ExecutionProgress',
  props: {
    runs: { type: Array, required: true },
    timeline: { type: Array, required: true },
    logs: { type: Array, required: true }
  },
  emits: ['copy-error', 'retry-action', 'edit-action'],
  template: `
    <div>
      <button class="copy-result" @click="$emit('copy-error', copyPayload)">复制</button>
      <button class="retry-result" @click="$emit('retry-action', target)">重试</button>
      <button class="edit-result" @click="$emit('edit-action', target)">编辑</button>
    </div>
  `,
  setup() {
    return { copyPayload, target }
  }
})

describe('TaskDetailPanel', () => {
  it('forwards actionable execution result events with their identities', async () => {
    const wrapper = shallowMount(TaskDetailPanel, {
      props: makeProps(),
      global: {
        stubs: {
          ExecutionProgress: ExecutionProgressStub,
          NSpin: true,
          NDropdown: true,
          NInput: true,
          NButton: true,
          NInputGroup: true,
          NSwitch: true
        }
      }
    })

    await wrapper.get('.copy-result').trigger('click')
    await wrapper.get('.retry-result').trigger('click')
    await wrapper.get('.edit-result').trigger('click')

    expect(wrapper.emitted('copy-execution-error')).toEqual([[copyPayload]])
    expect(wrapper.emitted('retry-execution-action')).toEqual([[target]])
    expect(wrapper.emitted('edit-execution-action')).toEqual([[target]])
  })

  it('passes global execution feedback to the main progress surface', () => {
    const selectedRun = makeRun('run-selected', 'task-1', '所选事项')
    const unrelatedRun = makeRun('run-unrelated', 'task-2', '其他事项')
    const props = makeProps()
    props.execution.taskStatusRun = selectedRun
    props.execution.globalRuns = [selectedRun, unrelatedRun]

    const wrapper = shallowMount(TaskDetailPanel, {
      props,
      global: {
        stubs: {
          ExecutionProgress: ExecutionProgressStub,
          NSpin: true,
          NDropdown: true,
          NInput: true,
          NButton: true,
          NInputGroup: true,
          NSwitch: true
        }
      }
    })

    const progress = wrapper.getComponent(ExecutionProgressStub)
    expect(progress.props('runs')).toEqual([selectedRun, unrelatedRun])
  })
})

function makeProps() {
  const execution: TaskDetailExecutionView = {
    actionExecutionStates: {},
    taskStatusRun: null,
    globalRuns: [],
    globalLogs: [],
    globalTimeline: [],
    logLoadError: null,
    runningTask: false,
    runButtonLabel: '运行',
    logsButtonLabel: '隐藏执行日志',
    showExecutionPanel: true
  }

  return {
    task: makeTask(),
    meta: {
      selectedCategory: '工作',
      selectedKeywords: '无',
      formattedCreatedAt: '2026/07/01 00:00',
      formattedUpdatedAt: '2026/07/01 00:00',
      actionCount: 1
    } satisfies TaskDetailMetaView,
    actionView: 'list' as const,
    flowPreview: { nodes: [], edges: [] },
    execution,
    triggers: {
      shortcutTrigger: null,
      scheduleTrigger: null,
      taskShortcutDraft: '',
      globalShortcutDraft: 'Alt+Space',
      shortcutWarning: ''
    } satisfies TaskDetailTriggerView,
    shareOptions: [],
    taskMenuOptions: [],
    isActionRunning: () => false
  }
}

function makeRun(runId: string, taskId: string, taskName: string): ExecutionRunSnapshot {
  return {
    runId,
    targetKey: `task:${taskId}`,
    taskId,
    taskName,
    scope: 'task',
    status: 'running',
    currentActionId: null,
    currentActionName: '',
    currentActionType: null,
    currentIndex: 0,
    totalActions: 1,
    completedActions: 0,
    progressPercent: 0,
    message: '执行中'
  }
}

function makeTask(): TaskItem {
  return {
    id: 'task-1',
    name: '测试事项',
    actions: [
      {
        id: 'action-1',
        type: 'delay',
        name: '等待',
        params: { durationMs: 1000 },
        enabled: true,
        riskLevel: 'low'
      }
    ],
    riskLevel: 'low',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
}
