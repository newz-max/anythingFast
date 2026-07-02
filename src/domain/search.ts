import type { TaskItem } from '@/types/domain'
import { describeAction, getActionTypeLabel } from '@/domain/actionPresentation'

export function searchTasks(tasks: TaskItem[], query: string, category: string | null) {
  const normalizedQuery = normalize(query)
  const categoryFilter = category && category !== '全部' ? category : null

  return tasks
    .filter((task) => !categoryFilter || (task.category || '未分类') === categoryFilter)
    .map((task) => ({ task, score: scoreTask(task, normalizedQuery) }))
    .filter(({ score }) => !normalizedQuery || score > 0)
    .sort((left, right) => {
      if (left.task.enabled !== right.task.enabled) {
        return left.task.enabled ? -1 : 1
      }
      if (left.score !== right.score) {
        return right.score - left.score
      }
      return (Date.parse(right.task.lastRunAt || '0') || 0) - (Date.parse(left.task.lastRunAt || '0') || 0)
    })
    .map(({ task }) => task)
}

function scoreTask(task: TaskItem, query: string) {
  if (!query) {
    return task.lastRunAt ? 2 : 1
  }

  let score = 0
  const name = normalize(task.name)
  const category = normalize(task.category || '')
  const description = normalize(task.description || '')
  const keywords = (task.keywords || []).map(normalize)
  const actionNames = task.actions.map((action) => normalize(action.name || ''))
  const actionTypes = task.actions.map((action) => normalize(getActionTypeLabel(action.type)))
  const actionDetails = task.actions.map((action) => normalize(describeAction(action)))

  if (name === query) score += 100
  if (name.includes(query)) score += 60
  if (keywords.some((keyword) => keyword === query)) score += 50
  if (keywords.some((keyword) => keyword.includes(query))) score += 35
  if (actionNames.some((actionName) => actionName === query)) score += 45
  if (actionNames.some((actionName) => actionName.includes(query))) score += 32
  if (actionDetails.some((detail) => detail.includes(query))) score += 30
  if (category.includes(query)) score += 20
  if (actionTypes.some((actionType) => actionType.includes(query))) score += 18
  if (description.includes(query)) score += 10
  if (task.lastRunAt) score += 5

  return score
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}
