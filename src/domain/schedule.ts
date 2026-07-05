import type { FieldIssue, ScheduleMisfirePolicy, ScheduleMode, ScheduleTaskTrigger } from '@/types/domain'

export const MIN_SCHEDULE_INTERVAL_MINUTES = 5
export const DEFAULT_SCHEDULE_INTERVAL_MINUTES = 60
export const DEFAULT_SCHEDULE_TIME_OF_DAY = '09:00'
export const DEFAULT_SCHEDULE_WEEKDAYS = [1, 2, 3, 4, 5]

const supportedModes: ScheduleMode[] = ['interval', 'daily', 'weekly']
const supportedMisfirePolicies: ScheduleMisfirePolicy[] = ['skip', 'runOnce']
const weekdayLabels = ['一', '二', '三', '四', '五', '六', '日']

export function createDefaultScheduleTrigger(): ScheduleTaskTrigger {
  return {
    type: 'schedule',
    enabled: false,
    mode: 'daily',
    intervalMinutes: DEFAULT_SCHEDULE_INTERVAL_MINUTES,
    timeOfDay: DEFAULT_SCHEDULE_TIME_OF_DAY,
    weekdays: [...DEFAULT_SCHEDULE_WEEKDAYS],
    misfirePolicy: 'skip',
    preventOverlap: true
  }
}

export function normalizeScheduleTrigger(trigger: ScheduleTaskTrigger): ScheduleTaskTrigger {
  const mode = supportedModes.includes(trigger.mode) ? trigger.mode : 'daily'
  const intervalMinutes = normalizeInteger(trigger.intervalMinutes)
  const weekdays = Array.from(new Set((trigger.weekdays || []).map(Number)))
    .filter((weekday) => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7)
    .sort((left, right) => left - right)
  const misfirePolicy = supportedMisfirePolicies.includes(trigger.misfirePolicy) ? trigger.misfirePolicy : 'skip'

  return {
    type: 'schedule',
    enabled: Boolean(trigger.enabled),
    mode,
    intervalMinutes,
    timeOfDay: trigger.timeOfDay?.trim() || '',
    weekdays,
    misfirePolicy,
    preventOverlap: trigger.preventOverlap ?? true,
    nextRunAt: trigger.nextRunAt,
    lastScheduledAt: trigger.lastScheduledAt
  }
}

export function validateScheduleTrigger(trigger: ScheduleTaskTrigger, fieldPrefix = 'triggers'): FieldIssue[] {
  const issues: FieldIssue[] = []
  if (!supportedModes.includes(trigger.mode)) {
    issues.push({ field: `${fieldPrefix}.mode`, message: '周期触发模式无效' })
  }
  if (!supportedMisfirePolicies.includes(trigger.misfirePolicy)) {
    issues.push({ field: `${fieldPrefix}.misfirePolicy`, message: '错过执行策略无效' })
  }
  if (typeof trigger.preventOverlap !== 'boolean') {
    issues.push({ field: `${fieldPrefix}.preventOverlap`, message: '重叠执行策略无效' })
  }
  if (trigger.mode === 'interval') {
    if (!Number.isInteger(trigger.intervalMinutes) || (trigger.intervalMinutes ?? 0) < MIN_SCHEDULE_INTERVAL_MINUTES) {
      issues.push({ field: `${fieldPrefix}.intervalMinutes`, message: `间隔不能小于 ${MIN_SCHEDULE_INTERVAL_MINUTES} 分钟` })
    }
  }
  if (trigger.mode === 'daily' || trigger.mode === 'weekly') {
    if (!isValidTimeOfDay(trigger.timeOfDay || '')) {
      issues.push({ field: `${fieldPrefix}.timeOfDay`, message: '执行时间必须是 HH:mm 格式' })
    }
  }
  if (trigger.mode === 'weekly') {
    const weekdays = trigger.weekdays || []
    if (weekdays.length === 0) {
      issues.push({ field: `${fieldPrefix}.weekdays`, message: '每周触发至少选择一天' })
    }
    if (weekdays.some((weekday) => !Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
      issues.push({ field: `${fieldPrefix}.weekdays`, message: '星期值必须在 1 到 7 之间' })
    }
  }
  return issues
}

export function describeScheduleTrigger(trigger: ScheduleTaskTrigger) {
  if (!trigger.enabled) return '已停用'
  if (trigger.mode === 'interval') return `每 ${trigger.intervalMinutes || DEFAULT_SCHEDULE_INTERVAL_MINUTES} 分钟`
  if (trigger.mode === 'daily') return `每天 ${trigger.timeOfDay || DEFAULT_SCHEDULE_TIME_OF_DAY}`
  const weekdays = (trigger.weekdays?.length ? trigger.weekdays : DEFAULT_SCHEDULE_WEEKDAYS)
    .map((weekday) => `周${weekdayLabels[weekday - 1]}`)
    .join('、')
  return `${weekdays} ${trigger.timeOfDay || DEFAULT_SCHEDULE_TIME_OF_DAY}`
}

export function misfirePolicyLabel(policy: ScheduleMisfirePolicy) {
  return policy === 'runOnce' ? '错过后补跑一次' : '错过则跳过'
}

export function overlapPolicyLabel(preventOverlap: boolean) {
  return preventOverlap ? '运行中跳过新触发' : '允许重叠执行'
}

export function previewNextRun(trigger: ScheduleTaskTrigger, now = new Date()) {
  const next = nextScheduledRun(trigger, now)
  return next ? formatDateTime(next) : ''
}

export function nextScheduledRun(trigger: ScheduleTaskTrigger, now = new Date()): Date | null {
  if (!trigger.enabled) return null
  if (trigger.mode === 'interval') {
    const interval = trigger.intervalMinutes || DEFAULT_SCHEDULE_INTERVAL_MINUTES
    return new Date(now.getTime() + interval * 60_000)
  }
  const time = parseTimeOfDay(trigger.timeOfDay || DEFAULT_SCHEDULE_TIME_OF_DAY)
  if (!time) return null
  if (trigger.mode === 'daily') {
    const candidate = atLocalTime(now, time.hour, time.minute)
    if (candidate.getTime() > now.getTime()) return candidate
    candidate.setDate(candidate.getDate() + 1)
    return candidate
  }
  const weekdays = trigger.weekdays?.length ? trigger.weekdays : DEFAULT_SCHEDULE_WEEKDAYS
  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = atLocalTime(now, time.hour, time.minute)
    candidate.setDate(candidate.getDate() + offset)
    const weekday = candidate.getDay() === 0 ? 7 : candidate.getDay()
    if (weekdays.includes(weekday) && candidate.getTime() > now.getTime()) return candidate
  }
  return null
}

export function isValidTimeOfDay(value: string) {
  return parseTimeOfDay(value) !== null
}

function normalizeInteger(value: number | null | undefined) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? Math.trunc(numberValue) : null
}

function parseTimeOfDay(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim())
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

function atLocalTime(base: Date, hour: number, minute: number) {
  const candidate = new Date(base)
  candidate.setHours(hour, minute, 0, 0)
  return candidate
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
