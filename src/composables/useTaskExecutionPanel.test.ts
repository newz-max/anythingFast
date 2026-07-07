import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick, shallowRef } from 'vue'
import type { ExecutionEventPayload } from '@/api/events'
import { useExecutionStore } from '@/stores/executionStore'
import type { TaskExecutionSummary, TaskItem } from '@/types/domain'
import { useTaskExecutionPanel } from './useTaskExecutionPanel'

type ExecutionPanelController = ReturnType<typeof useTaskExecutionPanel>

describe('useTaskExecutionPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('prefers selected-task active run over latest completed run', async () => {
    const store = useExecutionStore()
    store.applySummary(makeSummary('task-1', [{ actionId: 'action-1', status: 'success' }]))
    store.applyExecutionEvent(event({ runId: 'run-active', taskId: 'task-1', status: 'started' }))
    const { controller, wrapper } = mountHarness(store)

    expect(store.runs.some((run) => run.taskId === 'task-1' && run.status === 'success')).toBe(true)
    expect(controller.selectedTaskActiveRun.value?.runId).toBe('run-active')
    expect(controller.selectedTaskStatusRun.value?.runId).toBe('run-active')

    wrapper.unmount()
  })

  it('falls back to latest run and ignores unrelated active runs', () => {
    const store = useExecutionStore()
    store.applySummary(makeSummary('task-1', [{ actionId: 'action-1', status: 'success' }]))
    store.applyExecutionEvent(event({ runId: 'run-other', taskId: 'task-2', status: 'started' }))
    const { controller, wrapper } = mountHarness(store)

    expect(controller.selectedTaskActiveRun.value).toBeNull()
    expect(controller.selectedTaskStatusRun.value?.taskId).toBe('task-1')
    expect(controller.selectedTaskStatusRun.value?.status).toBe('success')

    wrapper.unmount()
  })

  it('toggles panel visibility and auto-opens for current run', async () => {
    const store = useExecutionStore()
    const { controller, wrapper } = mountHarness(store)

    expect(controller.showExecutionPanel.value).toBe(false)

    controller.toggleExecutionPanel()
    expect(controller.showLogs.value).toBe(true)
    expect(controller.autoShowExecution.value).toBe(true)
    expect(controller.showExecutionPanel.value).toBe(true)

    controller.toggleExecutionPanel()
    expect(controller.showExecutionPanel.value).toBe(false)

    store.applyExecutionEvent(event({ runId: 'run-active', taskId: 'task-1', status: 'started' }))
    await nextTick()

    expect(controller.autoShowExecution.value).toBe(true)
    expect(controller.showExecutionPanel.value).toBe(true)

    wrapper.unmount()
  })

  it('derives action and flow states from selected-task events and active runs', () => {
    const store = useExecutionStore()
    store.applyExecutionEvent(event({ runId: 'run-1', taskId: 'task-1', status: 'action-success', actionId: 'action-1' }))
    store.applyExecutionEvent(event({ runId: 'run-1', taskId: 'task-1', status: 'finished' }))
    store.applyExecutionEvent(event({
      runId: 'run-2',
      taskId: 'task-1',
      status: 'started',
      actionId: 'action-2',
      scope: 'action'
    }))
    store.applyExecutionEvent(event({
      runId: 'run-other',
      taskId: 'task-2',
      status: 'started',
      actionId: 'other-action',
      scope: 'action'
    }))
    const { controller, wrapper } = mountHarness(store)

    expect(controller.selectedTaskActiveRuns.value.map((run) => run.runId)).toEqual(['run-2'])
    expect(controller.actionExecutionStates.value['action-1']).toMatchObject({ status: 'success' })
    expect(controller.actionExecutionStates.value['action-2']).toMatchObject({ status: 'running' })
    expect(controller.flowExecutionStates.value['action-1']).toMatchObject({ status: 'success' })
    expect(controller.flowExecutionStates.value['action-2']).toMatchObject({ status: 'running' })
    expect(controller.flowExecutionStates.value['other-action']).toBeUndefined()

    wrapper.unmount()
  })

  it('returns empty selected-task state when no task is selected', () => {
    const store = useExecutionStore()
    store.applyExecutionEvent(event({ runId: 'run-1', taskId: 'task-1', status: 'started' }))
    const { controller, selectedTask, wrapper } = mountHarness(store)

    selectedTask.value = null

    expect(controller.selectedTaskActiveRun.value).toBeNull()
    expect(controller.selectedTaskEvents.value).toEqual([])
    expect(controller.flowExecutionStates.value).toEqual({})

    wrapper.unmount()
  })

  function mountHarness(store: ReturnType<typeof useExecutionStore>) {
    let controller: ExecutionPanelController
    const selectedTask = shallowRef<TaskItem | null>(makeTask('task-1'))
    const wrapper = mount(defineComponent({
      setup() {
        controller = useTaskExecutionPanel({ selectedTask, executionStore: store })
        return {}
      },
      template: '<div />'
    }))

    return { controller: controller!, selectedTask, wrapper }
  }
})

function makeTask(id: string): TaskItem {
  return {
    id,
    name: `事项 ${id}`,
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

function makeSummary(
  taskId: string,
  actions: Array<{ actionId: string; status: TaskExecutionSummary['status'] }>
): TaskExecutionSummary {
  return {
    taskId,
    taskName: `事项 ${taskId}`,
    scope: 'task',
    startedAt: '2026-07-01T00:00:00.000Z',
    finishedAt: '2026-07-01T00:01:00.000Z',
    status: 'success',
    actions: actions.map((action) => ({
      actionId: action.actionId,
      actionName: action.actionId,
      actionType: 'delay',
      status: action.status
    }))
  }
}

function event(patch: Partial<ExecutionEventPayload>): ExecutionEventPayload {
  return {
    runId: 'run-1',
    taskId: 'task-1',
    taskName: '测试事项',
    scope: 'task',
    status: 'started',
    totalActions: 2,
    ...patch
  }
}
