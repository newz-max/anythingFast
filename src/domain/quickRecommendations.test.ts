import { describe, expect, it } from 'vitest'
import {
  QUICK_RECOMMENDATION_SOURCE_LABEL,
  deriveTimeContext,
  getQuickRecommendations,
  getTimeContextLabel
} from '@/domain/quickRecommendations'
import type { TaskItem } from '@/types/domain'

describe('quick recommendations', () => {
  it.each([
    [localDate(2026, 7, 6, 8, 0), { period: 'workdayMorning', weekdayMarker: 'monday' }],
    [localDate(2026, 7, 6, 11, 29), { period: 'workdayMorning', weekdayMarker: 'monday' }],
    [localDate(2026, 7, 11, 11, 30), { period: 'midday', weekdayMarker: null }],
    [localDate(2026, 7, 11, 13, 29), { period: 'midday', weekdayMarker: null }],
    [localDate(2026, 7, 10, 17, 0), { period: 'beforeEndOfWorkday', weekdayMarker: 'friday' }],
    [localDate(2026, 7, 10, 19, 29), { period: 'beforeEndOfWorkday', weekdayMarker: 'friday' }],
    [localDate(2026, 7, 10, 19, 30), { period: 'other', weekdayMarker: null }]
  ])('derives the local time context at boundary %s', (now, expected) => {
    expect(deriveTimeContext(now)).toEqual(expected)
  })

  it('provides concise labels and a fixed recent-run source label', () => {
    expect(getTimeContextLabel({ period: 'workdayMorning', weekdayMarker: 'monday' })).toBe('周一工作日早上')
    expect(getTimeContextLabel({ period: 'midday', weekdayMarker: null })).toBe('午休前后')
    expect(QUICK_RECOMMENDATION_SOURCE_LABEL).toBe('基于最近运行时间')
  })

  it('prioritizes Monday time-matched tasks before newer runs from other weekdays', () => {
    const recommendations = getQuickRecommendations(
      [
        makeTask('tuesday-newer', localDate(2026, 7, 7, 10, 30)),
        makeTask('monday-older', localDate(2026, 7, 6, 8, 10)),
        makeTask('monday-newer', localDate(2026, 7, 6, 10, 0)),
        makeTask('midday', localDate(2026, 7, 4, 12, 0))
      ],
      localDate(2026, 7, 6, 9, 0)
    )

    expect(recommendations.timeMatched.map((task) => task.id)).toEqual(['monday-newer', 'monday-older', 'tuesday-newer'])
    expect(recommendations.recent.map((task) => task.id)).toEqual(['midday'])
    expect(recommendations.remaining).toEqual([])
  })

  it('prioritizes Friday time-matched tasks before newer runs from other weekdays', () => {
    const recommendations = getQuickRecommendations(
      [
        makeTask('thursday-newer', localDate(2026, 7, 9, 18, 30)),
        makeTask('friday-older', localDate(2026, 7, 10, 17, 10))
      ],
      localDate(2026, 7, 10, 18, 0)
    )

    expect(recommendations.timeMatched.map((task) => task.id)).toEqual(['friday-older', 'thursday-newer'])
  })

  it('excludes invalid and disabled records, caps groups, de-duplicates tasks, and preserves remaining input order', () => {
    const tasks = [
      makeTask('morning-1', localDate(2026, 7, 7, 8, 0)),
      makeTask('morning-2', localDate(2026, 7, 7, 8, 20)),
      makeTask('morning-3', localDate(2026, 7, 7, 8, 40)),
      makeTask('morning-4', localDate(2026, 7, 7, 9, 0)),
      makeTask('recent-1', localDate(2026, 7, 6, 20, 0)),
      makeTask('recent-2', localDate(2026, 7, 5, 20, 0)),
      makeTask('recent-3', localDate(2026, 7, 4, 20, 0)),
      makeTask('recent-4', localDate(2026, 7, 3, 20, 0)),
      makeTask('recent-5', localDate(2026, 7, 2, 20, 0)),
      makeTask('recent-6', localDate(2026, 7, 1, 20, 0)),
      makeTask('invalid', undefined, { lastRunAt: 'not-a-date' }),
      makeTask('disabled', localDate(2026, 7, 7, 9, 10), { enabled: false }),
      makeTask('never-run')
    ]

    const recommendations = getQuickRecommendations(tasks, localDate(2026, 7, 7, 9, 30))
    const groupedIds = [
      ...recommendations.timeMatched.map((task) => task.id),
      ...recommendations.recent.map((task) => task.id),
      ...recommendations.remaining.map((task) => task.id)
    ]

    expect(recommendations.timeMatched.map((task) => task.id)).toEqual(['morning-4', 'morning-3', 'morning-2'])
    expect(recommendations.recent.map((task) => task.id)).toEqual(['morning-1', 'recent-1', 'recent-2', 'recent-3', 'recent-4'])
    expect(recommendations.remaining.map((task) => task.id)).toEqual(['recent-5', 'recent-6', 'invalid', 'disabled', 'never-run'])
    expect(new Set(groupedIds).size).toBe(groupedIds.length)
  })

  it('shows no time-matched tasks during other time while retaining recent tasks', () => {
    const recommendations = getQuickRecommendations(
      [makeTask('morning', localDate(2026, 7, 7, 9, 0)), makeTask('recent', localDate(2026, 7, 6, 20, 0))],
      localDate(2026, 7, 11, 8, 0)
    )

    expect(recommendations.timeMatched).toEqual([])
    expect(recommendations.recent.map((task) => task.id)).toEqual(['morning', 'recent'])
  })
})

function localDate(year: number, month: number, day: number, hour: number, minute: number) {
  return new Date(year, month - 1, day, hour, minute)
}

function makeTask(id: string, lastRunDate?: Date, patch: Partial<TaskItem> = {}): TaskItem {
  return {
    id,
    name: id,
    actions: [],
    riskLevel: 'low',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...(lastRunDate ? { lastRunAt: lastRunDate.toISOString() } : {}),
    ...patch
  }
}
