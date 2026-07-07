import { shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { createTagItems, useTagManagement } from '@/composables/useTagManagement'
import type { TaskItem, TaskTag } from '@/types/domain'

describe('useTagManagement', () => {
  it('creates stable tag tones', () => {
    expect(createTagItems([
      { id: 'tag-1', name: '一' },
      { id: 'tag-2', name: '二' },
      { id: 'tag-3', name: '三' },
      { id: 'tag-4', name: '四' },
      { id: 'tag-5', name: '五' }
    ])).toEqual([
      { id: 'tag-1', name: '一', tone: 'blue' },
      { id: 'tag-2', name: '二', tone: 'green' },
      { id: 'tag-3', name: '三', tone: 'amber' },
      { id: 'tag-4', name: '四', tone: 'purple' },
      { id: 'tag-5', name: '五', tone: 'blue' }
    ])
  })

  it('creates, renames, selects, and deletes tags through the store', async () => {
    const dialogWarning = vi.fn()
    const taskStore = makeTaskStore([{ id: 'tag-1', name: '工作' }])
    const selectedTagId = shallowRef<string | null>(null)
    const activeTaskView = shallowRef<'all' | 'templates'>('templates')
    const controller = useTagManagement({
      taskStore: taskStore as never,
      activeTaskView: activeTaskView as never,
      selectedTagId,
      getVisibleTasks: () => [makeTask('task-2')],
      message: { success: vi.fn() } as never,
      dialog: { warning: dialogWarning } as never,
      reportUiError: vi.fn()
    })

    controller.selectTag('tag-1')
    expect(selectedTagId.value).toBe('tag-1')
    expect(activeTaskView.value).toBe('all')
    expect(taskStore.selectTask).toHaveBeenCalledWith('task-2')

    controller.openCreateTag()
    controller.tagDraftName.value = '个人'
    await controller.saveTag()
    expect(taskStore.createTag).toHaveBeenCalledWith('个人')

    controller.openRenameTag({ id: 'tag-1', name: '工作' })
    controller.tagDraftName.value = '项目'
    await controller.saveTag()
    expect(taskStore.renameTag).toHaveBeenCalledWith('tag-1', '项目')

    selectedTagId.value = 'tag-1'
    controller.confirmDeleteTag({ id: 'tag-1', name: '项目' })
    const deleteDialog = dialogWarning.mock.calls[0]?.[0]
    await deleteDialog.onPositiveClick()
    expect(taskStore.deleteTag).toHaveBeenCalledWith('tag-1')
    expect(selectedTagId.value).toBeNull()
  })
})

function makeTaskStore(tags: TaskTag[]) {
  return {
    tags,
    selectedTaskId: 'task-1',
    selectTask: vi.fn(),
    createTag: vi.fn().mockResolvedValue(undefined),
    renameTag: vi.fn().mockResolvedValue(undefined),
    deleteTag: vi.fn().mockResolvedValue(undefined)
  }
}

function makeTask(id: string): TaskItem {
  return {
    id,
    name: id,
    actions: [],
    riskLevel: 'low',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-07T00:00:00.000Z',
    updatedAt: '2026-07-07T00:00:00.000Z'
  }
}
