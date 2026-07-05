import type { ExecutionEventPayload } from '@/api/events'
import { describeAction, describeCondition, getActionTypeLabel } from '@/domain/actionPresentation'
import { actionStatusDisplay, isRunActive, type ActionRunDisplayStatus, type NaiveStatusType } from '@/domain/executionPresentation'
import { maskSecretVariableText } from '@/domain/variables'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'
import type { ActionType, ExecutionStatus, RiskLevel, TaskExecutionSummary, TaskItem } from '@/types/domain'

export type FlowEdgeOutcome = 'next' | 'condition-met' | 'condition-not-met'

export interface FlowPreviewStatus {
  status: ActionRunDisplayStatus
  label: string
  type: NaiveStatusType
  message?: string
}

export interface FlowPreviewNode {
  id: string
  actionId: string
  order: number
  actionType: ActionType
  actionTypeLabel: string
  title: string
  detail: string
  enabled: boolean
  riskLevel: RiskLevel
  conditionSummary: string | null
  status: FlowPreviewStatus | null
}

export interface FlowPreviewEdge {
  id: string
  fromActionId: string
  toActionId: string
  label: string
  outcome: FlowEdgeOutcome
}

export interface FlowPreviewModel {
  nodes: FlowPreviewNode[]
  edges: FlowPreviewEdge[]
}

export interface FlowExecutionStateInput {
  taskId: string
  events?: ExecutionEventPayload[]
  currentRun?: ExecutionRunSnapshot | null
  currentRuns?: ExecutionRunSnapshot[]
  latestSummary?: TaskExecutionSummary | null
}

export function deriveFlowPreviewModel(
  task: TaskItem,
  statuses: Record<string, FlowPreviewStatus> = {}
): FlowPreviewModel {
  return {
    nodes: task.actions.map((action, index) => {
      const actionTypeLabel = getActionTypeLabel(action.type)
      const conditionSummary = action.condition && action.condition.type !== 'always'
        ? maskSecretVariableText(describeCondition(action.condition), task.variables || [])
        : null

      return {
        id: `flow-node-${action.id}`,
        actionId: action.id,
        order: index + 1,
        actionType: action.type,
        actionTypeLabel,
        title: action.name || actionTypeLabel,
        detail: maskSecretVariableText(describeAction(action), task.variables || []),
        enabled: action.enabled,
        riskLevel: action.riskLevel,
        conditionSummary,
        status: statuses[action.id] || null
      }
    }),
    edges: deriveFlowEdges(task)
  }
}

export function deriveFlowExecutionStates(input: FlowExecutionStateInput): Record<string, FlowPreviewStatus> {
  const states: Record<string, FlowPreviewStatus> = {}

  if (input.latestSummary?.taskId === input.taskId) {
    input.latestSummary.actions.forEach((result) => {
      states[result.actionId] = flowStatus(executionStatusToFlowStatus(result.status), result.skipReason || result.message)
    })
  }

  input.events?.forEach((event) => {
    if (event.taskId !== input.taskId || !event.actionId) return
    const status = flowStatusFromEvent(event)
    if (!status) return
    states[event.actionId] = status
  })

  const currentRuns = input.currentRuns ?? (input.currentRun ? [input.currentRun] : [])
  currentRuns.forEach((run) => {
    if (run.taskId === input.taskId && run.currentActionId && isRunActive(run)) {
      states[run.currentActionId] = flowStatus('running', run.message)
    }
  })

  return states
}

function deriveFlowEdges(task: TaskItem): FlowPreviewEdge[] {
  return task.actions.flatMap<FlowPreviewEdge>((action, index) => {
    const nextAction = task.actions[index + 1]
    if (!nextAction) return []

    if (action.condition && action.condition.type !== 'always') {
      return [
        {
          id: `flow-edge-${action.id}-${nextAction.id}-met`,
          fromActionId: action.id,
          toActionId: nextAction.id,
          label: '条件满足：执行后继续',
          outcome: 'condition-met'
        },
        {
          id: `flow-edge-${action.id}-${nextAction.id}-not-met`,
          fromActionId: action.id,
          toActionId: nextAction.id,
          label: '条件不满足：跳过后继续',
          outcome: 'condition-not-met'
        }
      ]
    }

    return [
      {
        id: `flow-edge-${action.id}-${nextAction.id}`,
        fromActionId: action.id,
        toActionId: nextAction.id,
        label: '下一步',
        outcome: 'next'
      }
    ]
  })
}

function flowStatusFromEvent(event: ExecutionEventPayload): FlowPreviewStatus | null {
  if (event.status === 'action-started') return flowStatus('running', event.message)
  if (event.status === 'action-success') return flowStatus('success', event.result?.message || event.message)
  if (event.status === 'action-failed') return flowStatus('failed', event.result?.message || event.message)
  if (event.status === 'action-skipped') return flowStatus('skipped', event.result?.skipReason || event.result?.message || event.message)
  if (event.status === 'action-cancelled') return flowStatus('cancelled', event.result?.message || event.message)
  return null
}

function executionStatusToFlowStatus(status: ExecutionStatus): ActionRunDisplayStatus {
  if (status === 'pending') return 'idle'
  return status
}

function flowStatus(status: ActionRunDisplayStatus, message?: string): FlowPreviewStatus {
  return {
    ...actionStatusDisplay(status),
    message
  }
}
