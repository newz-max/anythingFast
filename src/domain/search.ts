import type { TaskItem } from '@/types/domain'
import { describeAction, getActionTypeLabel } from '@/domain/actionPresentation'

export type TaskSearchRanking = 'default' | 'quickRecent'

export interface SearchTasksOptions {
  ranking?: TaskSearchRanking
}

interface ScoredTask {
  task: TaskItem
  score: number
}

export function searchTasks(tasks: TaskItem[], query: string, category: string | null, options: SearchTasksOptions = {}) {
  const normalizedQuery = normalize(query)
  const categoryFilter = category && category !== '全部' ? category : null
  const ranking = options.ranking ?? 'default'

  return tasks
    .filter((task) => !categoryFilter || (task.category || '未分类') === categoryFilter)
    .map((task) => ({ task, score: scoreTask(task, normalizedQuery, ranking) }))
    .filter(({ score }) => !normalizedQuery || score > 0)
    .sort((left, right) => compareScoredTasks(left, right, normalizedQuery, ranking))
    .map(({ task }) => task)
}

function compareScoredTasks(left: ScoredTask, right: ScoredTask, query: string, ranking: TaskSearchRanking) {
  if (left.task.enabled !== right.task.enabled) {
    return left.task.enabled ? -1 : 1
  }

  if (ranking === 'quickRecent' && !query) {
    return compareLastRunAtDesc(left.task, right.task)
  }

  if (left.score !== right.score) {
    return right.score - left.score
  }

  return compareLastRunAtDesc(left.task, right.task)
}

function compareLastRunAtDesc(left: TaskItem, right: TaskItem) {
  return getLastRunTimestamp(right) - getLastRunTimestamp(left)
}

function getLastRunTimestamp(task: TaskItem) {
  return Date.parse(task.lastRunAt || '0') || 0
}

function scoreTask(task: TaskItem, query: string, ranking: TaskSearchRanking) {
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
  if (ranking === 'default' && task.lastRunAt) score += 5

  return score
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}
