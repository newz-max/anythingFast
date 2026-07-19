import type { ExecutionEventPayload } from '@/api/events'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'
import type { ActionExecutionResult, ExecutionStatus, TaskExecutionSummary } from '@/types/domain'

export type NaiveStatusType = 'default' | 'info' | 'success' | 'warning' | 'error'
export type ExecutionRunStatus = ExecutionStatus | 'started'
export type ActionRunDisplayStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped' | 'cancelled'

export interface ActionExecutionDisplay {
  status: ActionRunDisplayStatus
  label: string
  type: NaiveStatusType
}

export interface ExecutionResultActionTarget {
  logId: string
  taskId: string
  actionId: string
}

export interface CopyExecutionErrorPayload extends ExecutionResultActionTarget {
  diagnostic: string
}

export function primaryFailureDiagnostic(action: ActionExecutionResult): string | null {
  if (action.status !== 'failed') return null
  return nonEmptyText(action.message) ?? nonEmptyText(action.stderr)
}

export function formatActionDuration(durationMs?: number): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0) return null
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toFixed(1)} s`
}

export function deriveSlowestActionIds(summary: TaskExecutionSummary): string[] {
  if (summary.scope !== 'task') return []
  const timedActions = summary.actions.filter(
    (action) => action.status !== 'skipped' && formatActionDuration(action.durationMs) !== null
  )
  if (timedActions.length < 2) return []

  const maximumDuration = Math.max(...timedActions.map((action) => action.durationMs!))
  return timedActions
    .filter((action) => action.durationMs === maximumDuration)
    .map((action) => action.actionId)
}

export function statusLabel(status: ExecutionRunStatus) {
  const labels: Record<ExecutionRunStatus, string> = {
    pending: '等待中',
    running: '执行中',
    success: '成功',
    failed: '失败',
    skipped: '已跳过',
    cancelled: '已取消',
    started: '准备执行'
  }
  return labels[status]
}

export function eventStatusLabel(status: ExecutionEventPayload['status']) {
  const labels: Record<ExecutionEventPayload['status'], string> = {
    started: '开始执行',
    'action-started': '动作开始',
    'action-success': '动作成功',
    'action-failed': '动作失败',
    'action-skipped': '动作跳过',
    'action-cancelled': '动作取消',
    finished: '执行结束'
  }
  return labels[status]
}

export function runStatusType(status: ExecutionRunStatus | null | undefined): NaiveStatusType {
  if (status === 'failed') return 'error'
  if (status === 'success') return 'success'
  if (status === 'skipped' || status === 'cancelled') return 'warning'
  if (status === 'running' || status === 'started' || status === 'pending') return 'info'
  return 'default'
}

export function eventStatusType(event: ExecutionEventPayload): NaiveStatusType {
  if (event.status === 'action-failed' || event.result?.status === 'failed') return 'error'
  if (
    event.status === 'action-skipped' ||
    event.status === 'action-cancelled' ||
    event.result?.status === 'skipped' ||
    event.result?.status === 'cancelled'
  ) return 'warning'
  if (event.status === 'action-success' || event.status === 'finished') return 'success'
  return 'info'
}

export function actionStatusDisplay(status: ActionRunDisplayStatus): ActionExecutionDisplay {
  const displays: Record<ActionRunDisplayStatus, ActionExecutionDisplay> = {
    idle: { status: 'idle', label: '未执行', type: 'default' },
    running: { status: 'running', label: '执行中', type: 'info' },
    success: { status: 'success', label: '成功', type: 'success' },
    failed: { status: 'failed', label: '失败', type: 'error' },
    skipped: { status: 'skipped', label: '已跳过', type: 'warning' },
    cancelled: { status: 'cancelled', label: '已取消', type: 'warning' }
  }
  return displays[status]
}

export function isRunActive(run: ExecutionRunSnapshot | null | undefined) {
  return run?.status === 'started' || run?.status === 'running' || run?.status === 'pending'
}

export function runProgressLabel(run: ExecutionRunSnapshot) {
  const total = normalizedTotalActions(run)
  if (total <= 0) return '等待动作事件'
  return `${Math.min(run.completedActions, total)}/${total} 个动作`
}

export function normalizedProgressPercent(run: ExecutionRunSnapshot) {
  if (run.totalActions <= 0) return 0
  return Math.max(0, Math.min(100, run.progressPercent))
}

export function normalizedTotalActions(run: ExecutionRunSnapshot) {
  if (run.totalActions > 0) return run.totalActions
  return run.scope === 'action' ? 1 : 0
}

export function runTitle(run: ExecutionRunSnapshot) {
  const taskName = run.taskName || '当前事项'
  return run.scope === 'action' ? `${taskName} · 单动作` : taskName
}

export function runMessage(run: ExecutionRunSnapshot) {
  if (run.message) return run.message
  if (isRunActive(run)) return '正在执行'
  return statusLabel(run.status)
}

export function deriveActionExecutionStates(
  events: ExecutionEventPayload[],
  activeRuns: ExecutionRunSnapshot[] = []
): Record<string, ActionExecutionDisplay> {
  const states: Record<string, ActionExecutionDisplay> = {}

  for (const event of events) {
    if (!event.actionId) continue
    const status = actionRunStatusFromEvent(event)
    if (!status) continue
    states[event.actionId] = actionStatusDisplay(status)
  }

  for (const run of activeRuns) {
    if (run.currentActionId && isRunActive(run)) {
      states[run.currentActionId] = actionStatusDisplay('running')
    }
  }

  return states
}

function actionRunStatusFromEvent(event: ExecutionEventPayload): ActionRunDisplayStatus | null {
  if (event.status === 'action-started') return 'running'
  if (event.status === 'action-success') return 'success'
  if (event.status === 'action-failed') return 'failed'
  if (event.status === 'action-skipped') return 'skipped'
  if (event.status === 'action-cancelled') return 'cancelled'
  return null
}

function nonEmptyText(value?: string): string | null {
  const text = value?.trim()
  return text ? text : null
}
