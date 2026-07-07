import { shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { taskMenuActionKeys, useSelectedTaskDetailPanel } from '@/composables/useSelectedTaskDetailPanel'
import type { TaskItem } from '@/types/domain'

describe('useSelectedTaskDetailPanel', () => {
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
      actionCount: 1
    })
    expect(controller.triggers.value.shortcutTrigger?.shortcut).toBe('Ctrl+Alt+T')
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
})

function makeExecutionStore() {
  return {
    currentRun: null,
    activeRuns: [],
    logs: [],
    events: [],
    taskRunTargetKey: (taskId: string) => `task:${taskId}`,
    activeRunForTarget: vi.fn(() => null)
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
      { type: 'shortcut', enabled: true, shortcut: 'Ctrl+Alt+T' }
    ],
    createdAt: '2026-07-07T01:02:03',
    updatedAt: '2026-07-07T02:03:04'
  }
}
