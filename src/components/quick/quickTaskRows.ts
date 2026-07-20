import type { TaskItem } from '@/types/domain'

export type QuickTaskRiskTagType = 'success' | 'warning' | 'error'

export interface QuickTaskRow {
  key: `task:${string}`
  task: TaskItem
  actionDetail: string
  categoryTone: string
  meta: string
  sourceLabel?: string
  running: boolean
  riskLabel: string
  riskTagType: QuickTaskRiskTagType
}
