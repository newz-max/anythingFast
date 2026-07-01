import { describe, expect, it } from 'vitest'
import { getTasksForView } from '@/domain/taskViews'
import type { TaskItem } from '@/types/domain'

describe('getTasksForView', () => {
  it('filters favorite tasks', () => {
    const tasks = [makeTask('1', false), makeTask('2', true)]

    expect(getTasksForView(tasks, 'favorites').map((task) => task.id)).toEqual(['2'])
  })

  it('orders recent tasks by lastRunAt descending', () => {
    const tasks = [
      makeTask('never', false),
      makeTask('old', false, '2026-07-01T10:00:00.000Z'),
      makeTask('new', false, '2026-07-01T11:00:00.000Z')
    ]

    expect(getTasksForView(tasks, 'recent').map((task) => task.id)).toEqual(['new', 'old'])
  })

  it('composes tag filtering with navigation views', () => {
    const tasks = [
      makeTask('plain', true, undefined, []),
      makeTask('tagged-favorite', true, undefined, ['tag-1']),
      makeTask('tagged-normal', false, undefined, ['tag-1'])
    ]

    expect(getTasksForView(tasks, 'favorites', 'tag-1').map((task) => task.id)).toEqual(['tagged-favorite'])
  })
})

function makeTask(id: string, favorite: boolean, lastRunAt?: string, tagIds: string[] = []): TaskItem {
  return {
    id,
    name: id,
    category: '未分类',
    keywords: [],
    description: '',
    actions: [],
    riskLevel: 'low',
    enabled: true,
    favorite,
    tagIds,
    triggers: [{ type: 'manual', enabled: true }],
    lastRunAt,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
}
