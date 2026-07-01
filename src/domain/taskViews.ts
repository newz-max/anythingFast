import type { TaskItem } from '@/types/domain'

export type TaskView = 'all' | 'favorites' | 'recent' | 'templates'

export function getTasksForView(tasks: TaskItem[], view: TaskView, tagId: string | null = null) {
  const filteredTasks = tagId ? tasks.filter((task) => task.tagIds.includes(tagId)) : tasks

  if (view === 'favorites') {
    return filteredTasks.filter((task) => task.favorite)
  }

  if (view === 'recent') {
    return [...filteredTasks]
      .filter((task) => task.lastRunAt)
      .sort((left, right) => (Date.parse(right.lastRunAt || '0') || 0) - (Date.parse(left.lastRunAt || '0') || 0))
  }

  if (view === 'templates') {
    return []
  }

  return filteredTasks
}
