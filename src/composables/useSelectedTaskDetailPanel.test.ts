import { shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { taskMenuActionKeys, useSelectedTaskDetailPanel } from '@/composables/useSelectedTaskDetailPanel'
import type { TaskItem } from '@/types/domain'

describe('useSelectedTaskDetailPanel', () => {
  it('returns stable defaults with no selected task', () => {
    const controller = useSelectedTaskDetailPanel({
      selectedTask: shallowRef<TaskItem | null>(null),
      taskShortcutDraft: shallowRef(''),
      globalShortcutDraft: shallowRef('Alt+Space'),
      shortcutWarning: shallowRef(''),
      showExecutionPanel: shallowRef(false),
      selectedTaskStatusRun: shallowRef(null),
      selectedTaskActiveRuns: shallowRef([]),
      selectedTaskTimeline: shallowRef([]),
      actionExecutionStates: shallowRef({}),
      flowExecutionStates: shallowRef({}),
      executionStore: makeExecutionStore() as never,
      running: shallowRef(false),
      editSelectedTask: vi.fn(),
      duplicateTask: vi.fn(),
      saveSelectedTaskAsTemplate: vi.fn(),
      deleteTask: vi.fn()
    })

    expect(controller.meta.value).toMatchObject({
      selectedCategory: '未分类',
      selectedKeywords: '无',
      formattedCreatedAt: '无',
      formattedUpdatedAt: '无',
      actionCount: 0
    })
    expect(controller.flowPreview.value).toEqual({ nodes: [], edges: [] })
    expect(controller.execution.value.runButtonLabel).toBe('运行')
    expect(controller.triggers.value.shortcutTrigger).toBeNull()
    expect(controller.triggers.value.scheduleTrigger).toBeNull()
  })

  it('builds detail view models and handles all task menu keys', async () => {
    const task = makeTask('task-1')
    const editSelectedTask = vi.fn()
    const duplicateTask = vi.fn().mockResolvedValue(undefined)
    const saveSelectedTaskAsTemplate = vi.fn().mockResolvedValue(undefined)
    const deleteTask = vi.fn()
    const controller = useSelectedTaskDetailPanel({
      selectedTask: shallowRef(task),
      taskShortcutDraft: shallowRef('Ctrl+Alt+T'),
      globalShortcutDraft: shallowRef('Alt+Space'),
      shortcutWarning: shallowRef('冲突'),
      showExecutionPanel: shallowRef(false),
      selectedTaskStatusRun: shallowRef(null),
      selectedTaskActiveRuns: shallowRef([]),
      selectedTaskTimeline: shallowRef([]),
      actionExecutionStates: shallowRef({}),
      flowExecutionStates: shallowRef({}),
      executionStore: makeExecutionStore() as never,
      running: shallowRef(false),
      editSelectedTask,
      duplicateTask,
      saveSelectedTaskAsTemplate,
      deleteTask
    })

    expect(controller.meta.value).toMatchObject({
      selectedCategory: '工作',
      selectedKeywords: 'alpha、beta',
      formattedCreatedAt: '2026/07/07 01:02',
      formattedUpdatedAt: '2026/07/07 02:03',
      actionCount: 1
    })
    expect(controller.triggers.value.shortcutTrigger?.shortcut).toBe('Ctrl+Alt+T')
    expect(controller.triggers.value.scheduleTrigger?.timeOfDay).toBe('09:00')
    expect(controller.triggers.value.shortcutWarning).toBe('冲突')
    expect(controller.flowPreview.value.nodes.map((node) => node.id)).toContain('flow-node-action-1')
    expect(controller.execution.value.runButtonLabel).toBe('运行')

    controller.handleTaskMenuSelect(taskMenuActionKeys.edit)
    controller.handleTaskMenuSelect(taskMenuActionKeys.duplicate)
    controller.handleTaskMenuSelect(taskMenuActionKeys.saveTemplate)
    controller.handleTaskMenuSelect(taskMenuActionKeys.delete)
    controller.handleTaskMenuSelect('unknown')

    expect(editSelectedTask).toHaveBeenCalledTimes(1)
    expect(duplicateTask).toHaveBeenCalledWith(task)
    expect(saveSelectedTaskAsTemplate).toHaveBeenCalledTimes(1)
    expect(deleteTask).toHaveBeenCalledWith(task)
  })

  it('derives running and log button labels from execution state', () => {
    const task = makeTask('task-1')
    const controller = useSelectedTaskDetailPanel({
      selectedTask: shallowRef(task),
      taskShortcutDraft: shallowRef(''),
      globalShortcutDraft: shallowRef('Alt+Space'),
      shortcutWarning: shallowRef(''),
      showExecutionPanel: shallowRef(true),
      selectedTaskStatusRun: shallowRef(null),
      selectedTaskActiveRuns: shallowRef([]),
      selectedTaskTimeline: shallowRef([]),
      actionExecutionStates: shallowRef({}),
      flowExecutionStates: shallowRef({}),
      executionStore: makeExecutionStore({ activeRun: { status: 'running' } }) as never,
      running: shallowRef(true),
      editSelectedTask: vi.fn(),
      duplicateTask: vi.fn(),
      saveSelectedTaskAsTemplate: vi.fn(),
      deleteTask: vi.fn()
    })

    expect(controller.execution.value.runningTask).toBe(true)
    expect(controller.execution.value.runButtonLabel).toBe('执行中')
    expect(controller.execution.value.logsButtonLabel).toBe('隐藏执行日志')
  })
})

function makeExecutionStore(options: { activeRun?: { status?: string } | null } = {}) {
  return {
    logs: [],
    logLoadError: null,
    taskRunTargetKey: (taskId: string) => `task:${taskId}`,
    activeRunForTarget: vi.fn(() => options.activeRun ?? null)
  }
}

function makeTask(id: string): TaskItem {
  return {
    id,
    name: id,
    category: '工作',
    keywords: ['alpha', 'beta'],
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
    triggers: [
      { type: 'manual', enabled: true },
      { type: 'shortcut', enabled: true, shortcut: 'Ctrl+Alt+T' },
      {
        type: 'schedule',
        enabled: true,
        mode: 'daily',
        timeOfDay: '09:00',
        misfirePolicy: 'skip',
        preventOverlap: true
      }
    ],
    createdAt: '2026-07-07T01:02:03',
    updatedAt: '2026-07-07T02:03:04'
  }
}
