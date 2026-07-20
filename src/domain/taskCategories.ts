import type { TaskItem } from '@/types/domain'

export const UNCATEGORIZED_TASK_CATEGORY = '未分类'

export interface TaskCategoryGroup {
  key: string
  label: string
  tasks: TaskItem[]
}

export function normalizeTaskCategory(category?: string): string {
  return category?.trim() || UNCATEGORIZED_TASK_CATEGORY
}

export function groupTasksByCategory(tasks: readonly TaskItem[]): TaskCategoryGroup[] {
  const groups = new Map<string, TaskCategoryGroup>()

  for (const task of tasks) {
    const category = normalizeTaskCategory(task.category)
    const existing = groups.get(category)
    if (existing) {
      existing.tasks.push(task)
      continue
    }

    groups.set(category, {
      key: category,
      label: category,
      tasks: [task]
    })
  }

  return [...groups.values()]
}
