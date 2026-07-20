import type { TaskItem } from '@/types/domain'

export type QuickTimePeriod = 'workdayMorning' | 'midday' | 'beforeEndOfWorkday' | 'other'
export type QuickWeekdayMarker = 'monday' | 'friday' | null

export interface QuickTimeContext {
  period: QuickTimePeriod
  weekdayMarker: QuickWeekdayMarker
}

export interface QuickLaunchGroups {
  favorites: TaskItem[]
  timeMatched: TaskItem[]
  recent: TaskItem[]
  remaining: TaskItem[]
}

interface EligibleTask {
  task: TaskItem
  lastRunAt: Date
  timestamp: number
}

const MAX_FAVORITES = 6
const MAX_TIME_MATCHED = 3
const MAX_RECENT = 5

export const QUICK_RECOMMENDATION_SOURCE_LABEL = '基于最近运行时间'

export function deriveTimeContext(now: Date): QuickTimeContext {
  const day = now.getDay()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const isWeekday = day >= 1 && day <= 5

  if (isWeekday && isWithin(minutes, 8 * 60, 11 * 60 + 29)) {
    return {
      period: 'workdayMorning',
      weekdayMarker: weekdayMarkerFor(day)
    }
  }

  if (isWithin(minutes, 11 * 60 + 30, 13 * 60 + 29)) {
    return {
      period: 'midday',
      weekdayMarker: null
    }
  }

  if (isWeekday && isWithin(minutes, 17 * 60, 19 * 60 + 29)) {
    return {
      period: 'beforeEndOfWorkday',
      weekdayMarker: weekdayMarkerFor(day)
    }
  }

  return {
    period: 'other',
    weekdayMarker: null
  }
}

export function getTimeContextLabel(context: QuickTimeContext) {
  const label =
    context.period === 'workdayMorning'
      ? '工作日早上'
      : context.period === 'midday'
        ? '午休前后'
        : context.period === 'beforeEndOfWorkday'
          ? '下班前'
          : '当前时段'

  if (context.weekdayMarker === 'monday') return `周一${label}`
  if (context.weekdayMarker === 'friday') return `周五${label}`
  return label
}

export function getQuickLaunchGroups(tasks: TaskItem[], now: Date): QuickLaunchGroups {
  const context = deriveTimeContext(now)
  const enabledTasks = tasks.filter((task) => task.enabled)
  const favoriteTasks = enabledTasks.filter((task) => task.favorite)
  const favorites = favoriteTasks.slice(0, MAX_FAVORITES)
  const fixedFavoriteIds = new Set(favorites.map((task) => task.id))
  const recommendationCandidates = enabledTasks.filter((task) => !task.favorite)
  const eligible = recommendationCandidates.flatMap((task) => {
    const lastRunAt = parseEligibleLastRunAt(task)
    return lastRunAt ? [{ task, lastRunAt, timestamp: lastRunAt.getTime() }] : []
  })

  const timeMatched =
    context.period === 'other'
      ? []
      : eligible
          .filter(({ lastRunAt }) => deriveTimeContext(lastRunAt).period === context.period)
          .sort((left, right) => compareTimeMatched(left, right, context, now))
          .slice(0, MAX_TIME_MATCHED)
          .map(({ task }) => task)

  const recommendedIds = new Set(timeMatched.map((task) => task.id))
  const recent = eligible
    .filter(({ task }) => !recommendedIds.has(task.id))
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, MAX_RECENT)
    .map(({ task }) => task)

  for (const task of recent) recommendedIds.add(task.id)

  return {
    favorites,
    timeMatched,
    recent,
    remaining: enabledTasks.filter((task) => !fixedFavoriteIds.has(task.id) && !recommendedIds.has(task.id))
  }
}

export const getQuickRecommendations = getQuickLaunchGroups

function isWithin(value: number, start: number, end: number) {
  return value >= start && value <= end
}

function weekdayMarkerFor(day: number): QuickWeekdayMarker {
  if (day === 1) return 'monday'
  if (day === 5) return 'friday'
  return null
}

function parseEligibleLastRunAt(task: TaskItem) {
  if (!task.enabled || !task.lastRunAt) return null

  const lastRunAt = new Date(task.lastRunAt)
  return Number.isNaN(lastRunAt.getTime()) ? null : lastRunAt
}

function compareTimeMatched(left: EligibleTask, right: EligibleTask, context: QuickTimeContext, now: Date) {
  if (context.weekdayMarker) {
    const currentDay = now.getDay()
    const leftMatchesDay = left.lastRunAt.getDay() === currentDay
    const rightMatchesDay = right.lastRunAt.getDay() === currentDay
    if (leftMatchesDay !== rightMatchesDay) return leftMatchesDay ? -1 : 1
  }

  return right.timestamp - left.timestamp
}
