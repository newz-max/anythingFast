import { shallowMount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import TaskDetailPanel from './TaskDetailPanel.vue'
import type { TaskDetailExecutionView, TaskDetailMetaView, TaskDetailTriggerView } from '@/composables/useSelectedTaskDetailPanel'
import type { CopyExecutionErrorPayload, ExecutionResultActionTarget } from '@/domain/executionPresentation'
import type { TaskItem } from '@/types/domain'

const target: ExecutionResultActionTarget = {
  logId: 'log-1',
  taskId: 'task-1',
  actionId: 'action-1'
}
const copyPayload: CopyExecutionErrorPayload = { ...target, diagnostic: '已遮罩：***' }

const ExecutionProgressStub = defineComponent({
  name: 'ExecutionProgress',
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
})

function makeProps() {
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
    execution: {
      actionExecutionStates: {},
      taskStatusRun: null,
      activeRuns: [],
      logs: [],
      timeline: [],
      logLoadError: null,
      runningTask: false,
      runButtonLabel: '运行',
      logsButtonLabel: '隐藏执行日志',
      showExecutionPanel: true
    } satisfies TaskDetailExecutionView,
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
