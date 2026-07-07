import { shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { taskShareActionKeys, useTaskSharing } from '@/composables/useTaskSharing'
import type { TaskItem } from '@/types/domain'

describe('useTaskSharing', () => {
  it('does nothing when no task is selected', async () => {
    const copyText = vi.fn().mockResolvedValue(undefined)
    const exportTaskBundle = vi.fn().mockResolvedValue(undefined)
    const openImportFile = vi.fn().mockResolvedValue(undefined)
    const message = { success: vi.fn() }
    const controller = useTaskSharing(
      {
        selectedTask: shallowRef<TaskItem | null>(null),
        getVisibleTasks: () => [makeTask('task-1')],
        exportTaskBundle,
        openImportFile,
        message: message as never
      },
      {
        copyText,
        isTauriRuntime: () => false
      }
    )

    await controller.handleShareSelect(taskShareActionKeys.copySummary)
    await controller.handleShareSelect(taskShareActionKeys.copyJson)
    await controller.handleShareSelect(taskShareActionKeys.exportCurrent)
    await controller.handleShareSelect(taskShareActionKeys.exportVisible)
    await controller.handleShareSelect(taskShareActionKeys.importJson)

    expect(copyText).not.toHaveBeenCalled()
    expect(exportTaskBundle).not.toHaveBeenCalled()
    expect(openImportFile).not.toHaveBeenCalled()
    expect(message.success).not.toHaveBeenCalled()
  })

  it('handles every share action key', async () => {
    const selectedTask = shallowRef<TaskItem | null>(makeTask('task-1'))
    const copyText = vi.fn().mockResolvedValue(undefined)
    const exportTaskBundle = vi.fn().mockResolvedValue(undefined)
    const openImportFile = vi.fn().mockResolvedValue(undefined)
    const message = { success: vi.fn() }
    const controller = useTaskSharing(
      {
        selectedTask,
        getVisibleTasks: () => [makeTask('task-1'), makeTask('task-2')],
        exportTaskBundle,
        openImportFile,
        message: message as never
      },
      {
        copyText,
        isTauriRuntime: () => false,
        now: () => new Date('2026-07-07T00:00:00.000Z')
      }
    )

    await controller.handleShareSelect(taskShareActionKeys.copySummary)
    expect(copyText).toHaveBeenLastCalledWith(expect.stringContaining('事项：测试事项 task-1'))
    expect(message.success).toHaveBeenLastCalledWith('已复制事项摘要')

    await controller.handleShareSelect(taskShareActionKeys.copyJson)
    expect(JSON.parse(copyText.mock.calls.at(-1)?.[0] ?? '')).toMatchObject({
      schemaVersion: 1,
      exportedAt: '2026-07-07T00:00:00.000Z',
      sourceApp: 'anything-fast',
      tasks: [{ id: 'task-1' }],
      templates: []
    })
    expect(message.success).toHaveBeenLastCalledWith('已复制事项配置 JSON')

    await controller.handleShareSelect(taskShareActionKeys.exportCurrent)
    expect(exportTaskBundle).toHaveBeenLastCalledWith(['task-1'])

    await controller.handleShareSelect(taskShareActionKeys.exportVisible)
    expect(exportTaskBundle).toHaveBeenLastCalledWith(['task-1', 'task-2'])

    await controller.handleShareSelect(taskShareActionKeys.importJson)
    expect(openImportFile).toHaveBeenCalledTimes(1)

    await controller.handleShareSelect('unknown')
    expect(exportTaskBundle).toHaveBeenCalledTimes(2)
    expect(openImportFile).toHaveBeenCalledTimes(1)
  })

  it('uses Tauri export for copied JSON in the desktop runtime', async () => {
    const copyText = vi.fn().mockResolvedValue(undefined)
    const api = {
      exportTaskBundle: vi.fn().mockResolvedValue({ schemaVersion: 1, tasks: [{ id: 'task-1' }], templates: [] })
    }
    const controller = useTaskSharing(
      {
        selectedTask: shallowRef(makeTask('task-1')),
        getVisibleTasks: () => [],
        exportTaskBundle: vi.fn(),
        openImportFile: vi.fn(),
        message: { success: vi.fn() } as never
      },
      {
        tauriApi: api,
        copyText,
        isTauriRuntime: () => true
      }
    )

    await controller.handleShareSelect(taskShareActionKeys.copyJson)

    expect(api.exportTaskBundle).toHaveBeenCalledWith({ taskIds: ['task-1'], templateIds: [] })
    expect(copyText).toHaveBeenCalledWith(expect.stringContaining('"task-1"'))
  })
})

function makeTask(id: string): TaskItem {
  return {
    id,
    name: `测试事项 ${id}`,
    category: '工作',
    keywords: [],
    description: '',
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
