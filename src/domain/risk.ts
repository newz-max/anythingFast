import type { RiskLevel, TaskAction, TaskItem } from '@/types/domain'

const riskWeight: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3
}

export function maxRisk(risks: RiskLevel[]): RiskLevel {
  return risks.reduce<RiskLevel>((highest, risk) => (riskWeight[risk] > riskWeight[highest] ? risk : highest), 'low')
}

export function deriveActionRisk(action: TaskAction): RiskLevel {
  if (action.type !== 'runCommand') {
    return 'low'
  }

  if ('command' in action.params && action.params.source === 'script') {
    return 'high'
  }

  const command = 'command' in action.params ? action.params.command.toLowerCase() : ''
  if (/\b(rm|del|erase|rmdir|rd|format|shutdown|reg\s+delete|takeown|icacls|install|npm\s+i|pnpm\s+add|yarn\s+add)\b/.test(command)) {
    return 'high'
  }

  if (/>|--force|-f\b|remove-item|set-executionpolicy|start-process\s+.*-verb\s+runas/.test(command)) {
    return 'high'
  }

  return 'medium'
}

export function deriveTaskRisk(task: TaskItem): RiskLevel {
  return maxRisk(task.actions.filter((action) => action.enabled).map(deriveActionRisk))
}
