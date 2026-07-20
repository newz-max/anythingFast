import { describe, expect, it } from 'vitest'
import {
  UNCATEGORIZED_TASK_CATEGORY,
  groupTasksByCategory,
  normalizeTaskCategory
} from '@/domain/taskCategories'
import type { TaskItem } from '@/types/domain'

describe('task categories', () => {
  it.each([
    [undefined, UNCATEGORIZED_TASK_CATEGORY],
    ['', UNCATEGORIZED_TASK_CATEGORY],
    ['   ', UNCATEGORIZED_TASK_CATEGORY],
    ['  工作  ', '工作']
  ])('normalizes category %j to %s', (category, expected) => {
    expect(normalizeTaskCategory(category)).toBe(expected)
  })

  it('returns no groups for empty input', () => {
    expect(groupTasksByCategory([])).toEqual([])
  })

  it('preserves first category appearance and task order within each group', () => {
    const tasks = [
      makeTask('work-1', ' 工作 '),
      makeTask('study-1', '学习'),
      makeTask('work-2', '工作'),
      makeTask('blank-1', ' '),
      makeTask('blank-2')
    ]

    const groups = groupTasksByCategory(tasks)

    expect(groups.map(({ key, label }) => ({ key, label }))).toEqual([
      { key: '工作', label: '工作' },
      { key: '学习', label: '学习' },
      { key: '未分类', label: '未分类' }
    ])
    expect(groups.map((group) => group.tasks.map((task) => task.id))).toEqual([
      ['work-1', 'work-2'],
      ['study-1'],
      ['blank-1', 'blank-2']
    ])
  })

  it('does not modify the input array or task objects', () => {
    const first = Object.freeze(makeTask('first', '工作'))
    const second = Object.freeze(makeTask('second', '工作'))
    const tasks = Object.freeze([first, second])

    const groups = groupTasksByCategory(tasks)

    expect(tasks).toEqual([first, second])
    expect(groups[0].tasks).toEqual([first, second])
    expect(groups[0].tasks[0]).toBe(first)
    expect(groups[0].tasks[1]).toBe(second)
  })
})

function makeTask(id: string, category?: string): TaskItem {
  return {
    id,
    name: id,
    category,
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
