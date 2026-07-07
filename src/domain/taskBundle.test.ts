import { describe, expect, it } from 'vitest'
import { createTaskBundleFallback } from '@/domain/taskBundle'
import type { TaskItem, TaskTemplate } from '@/types/domain'

describe('createTaskBundleFallback', () => {
  it('creates the browser fallback export bundle shape', () => {
    const task = makeTask('task-1')
    const template: TaskTemplate = {
      id: 'template-1',
      name: '模板',
      actions: []
    }

    const bundle = createTaskBundleFallback([task], [template], () => new Date('2026-07-07T00:00:00.000Z'))

    expect(bundle).toEqual({
      schemaVersion: 1,
      exportedAt: '2026-07-07T00:00:00.000Z',
      sourceApp: 'anything-fast',
      tasks: [task],
      templates: [template]
    })
  })
})

function makeTask(id: string): TaskItem {
  return {
    id,
    name: '测试事项',
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
