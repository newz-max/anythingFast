import { describe, expect, it } from 'vitest'
import { searchTasks } from '@/domain/search'
import type { TaskItem } from '@/types/domain'

describe('searchTasks', () => {
  it('matches name keywords and prioritizes enabled tasks', () => {
    const tasks: TaskItem[] = [
      makeTask('1', '启动项目', false, ['dev']),
      makeTask('2', '开始写作', true, ['obsidian']),
      makeTask('3', '开发 anythingFast', true, ['dev', 'af'])
    ]

    const results = searchTasks(tasks, 'dev', '全部')

    expect(results.map((task) => task.id)).toEqual(['3', '1'])
  })
})

function makeTask(id: string, name: string, enabled: boolean, keywords: string[]): TaskItem {
  return {
    id,
    name,
    category: '开发',
    keywords,
    description: '',
    actions: [],
    riskLevel: 'low',
    enabled,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
}
