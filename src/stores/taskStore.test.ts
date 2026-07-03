import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '@/stores/taskStore'
import type { TaskItem } from '@/types/domain'

describe('taskStore templates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('saves a task action sequence as a non-runnable template', async () => {
    const store = useTaskStore()
    const task: TaskItem = {
      id: 'task-a',
      name: '工作流',
      category: '工作',
      keywords: ['work'],
      description: '打开工作入口',
      actions: [
        {
          id: 'action-a',
          type: 'openUrl',
          name: '打开网页',
          params: { url: 'https://example.com' },
          enabled: true,
          continueOnError: false,
          riskLevel: 'low'
        }
      ],
      riskLevel: 'low',
      enabled: true,
      favorite: false,
      tagIds: [],
      triggers: [{ type: 'shortcut', enabled: true, shortcut: 'Ctrl+Alt+W' }],
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z'
    }

    const template = await store.saveTaskAsTemplate(task)

    expect(store.savedTemplates).toHaveLength(1)
    expect(template.name).toBe(task.name)
    expect(template.actions).toHaveLength(1)
    expect('id' in template.actions[0]).toBe(false)
    expect(template.description).toBe(task.description)
  })
})
