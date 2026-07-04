import type { RiskLevel, TaskAction, TaskItem } from '@/types/domain'
import { inferActionRiskByDefinition } from '@/domain/actionTypes'

const riskWeight: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3
}

export function maxRisk(risks: RiskLevel[]): RiskLevel {
  return risks.reduce<RiskLevel>((highest, risk) => (riskWeight[risk] > riskWeight[highest] ? risk : highest), 'low')
}

export function deriveActionRisk(action: TaskAction): RiskLevel {
  return inferActionRiskByDefinition(action)
}

export function deriveTaskRisk(task: TaskItem): RiskLevel {
  return maxRisk(task.actions.filter((action) => action.enabled).map(deriveActionRisk))
}
