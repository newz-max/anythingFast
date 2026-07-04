import { describe, expect, it } from 'vitest'
import type { ExecutionEventPayload } from '@/api/events'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'
import type { TaskAction, TaskExecutionSummary, TaskItem } from '@/types/domain'
import { deriveFlowExecutionStates, deriveFlowPreviewModel } from './flowPreview'

describe('flowPreview', () => {
  it('derives ordered nodes and linear edges from task actions', () => {
    const task = makeTask([
      makeAction('action-1', 'openUrl', '打开页面', { url: 'https://example.com' }),
      makeAction('action-2', 'delay', '等待', { durationMs: 1000 })
    ])

    const model = deriveFlowPreviewModel(task)

    expect(model.nodes.map((node) => [node.order, node.actionId, node.title])).toEqual([
      [1, 'action-1', '打开页面'],
      [2, 'action-2', '等待']
    ])
    expect(model.edges).toEqual([
      {
        id: 'flow-edge-action-1-action-2',
        fromActionId: 'action-1',
        toActionId: 'action-2',
        label: '下一步',
        outcome: 'next'
      }
    ])
  })

  it('keeps disabled actions visible and marks conditional outcomes without graph jumps', () => {
    const task = makeTask([
      makeAction('action-1', 'openFile', '打开文件', { path: 'D:\\tmp\\a.txt' }, { enabled: false }),
      makeAction('action-2', 'openFolder', '打开目录', { path: 'D:\\tmp' }, {
        condition: { type: 'fileExists', path: 'D:\\tmp\\a.txt' }
      }),
      makeAction('action-3', 'delay', '等待', { durationMs: 300 })
    ])

    const model = deriveFlowPreviewModel(task)

    expect(model.nodes[0]).toMatchObject({ actionId: 'action-1', enabled: false })
    expect(model.nodes[1]).toMatchObject({ conditionSummary: '仅当文件存在：D:\\tmp\\a.txt' })
    expect(model.edges.filter((edge) => edge.fromActionId === 'action-2')).toEqual([
      expect.objectContaining({ toActionId: 'action-3', outcome: 'condition-met' }),
      expect.objectContaining({ toActionId: 'action-3', outcome: 'condition-not-met' })
    ])
  })

  it('masks secret variable references in details and conditions', () => {
    const task = makeTask(
      [
        makeAction('action-1', 'runCommand', '登录', {
          command: 'echo {{ token }}',
          workingDir: 'D:\\Project\\anythingFast',
          shell: 'powershell'
        }, {
          condition: { type: 'variableEquals', variable: 'token', value: 'secret-value' },
          riskLevel: 'high'
        })
      ],
      {
        variables: [
          { key: 'token', label: 'Token', defaultValue: 'secret-value', required: true, secret: true }
        ]
      }
    )

    const model = deriveFlowPreviewModel(task)

    expect(model.nodes[0].detail).toContain('••••')
    expect(model.nodes[0].conditionSummary).toContain('••••')
    expect(model.nodes[0].detail).not.toContain('secret-value')
    expect(model.nodes[0].conditionSummary).not.toContain('secret-value')
  })

  it('maps running and completed execution status by action id', () => {
    const currentRun: ExecutionRunSnapshot = {
      runId: 'run-1',
      taskId: 'task-1',
      taskName: '测试事项',
      scope: 'task',
      status: 'running',
      currentActionId: 'action-2',
      currentActionName: '执行脚本',
      currentActionType: 'runCommand',
      currentIndex: 2,
      totalActions: 3,
      completedActions: 1,
      progressPercent: 33,
      message: '执行脚本'
    }
    const summary = makeSummary('task-1', [
      { actionId: 'action-1', status: 'success' },
      { actionId: 'action-2', status: 'failed', message: '旧结果' }
    ])

    const states = deriveFlowExecutionStates({
      taskId: 'task-1',
      latestSummary: summary,
      currentRun
    })

    expect(states['action-1']).toMatchObject({ status: 'success', label: '成功' })
    expect(states['action-2']).toMatchObject({ status: 'running', label: '执行中', message: '执行脚本' })
  })

  it('maps skipped reasons from events and ignores stale task data', () => {
    const events: ExecutionEventPayload[] = [
      event({ taskId: 'other-task', actionId: 'action-1', status: 'action-success' }),
      event({
        taskId: 'task-1',
        actionId: 'action-2',
        status: 'action-skipped',
        result: {
          actionId: 'action-2',
          actionName: '条件动作',
          actionType: 'delay',
          status: 'skipped',
          skipReason: '条件不满足'
        }
      })
    ]
    const staleSummary = makeSummary('other-task', [{ actionId: 'action-1', status: 'failed' }])

    const states = deriveFlowExecutionStates({ taskId: 'task-1', events, latestSummary: staleSummary })

    expect(states['action-1']).toBeUndefined()
    expect(states['action-2']).toMatchObject({ status: 'skipped', label: '已跳过', message: '条件不满足' })
  })
})

function makeTask(actions: TaskAction[], patch: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 'task-1',
    name: '测试事项',
    actions,
    riskLevel: 'low',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...patch
  }
}

function makeAction(
  id: string,
  type: TaskAction['type'],
  name: string,
  params: TaskAction['params'],
  patch: Partial<TaskAction> = {}
): TaskAction {
  return {
    id,
    type,
    name,
    params,
    enabled: true,
    riskLevel: 'low',
    ...patch
  }
}

function makeSummary(
  taskId: string,
  actions: Array<{ actionId: string; status: TaskExecutionSummary['status']; message?: string }>
): TaskExecutionSummary {
  return {
    taskId,
    taskName: '测试事项',
    scope: 'task',
    startedAt: '2026-07-01T00:00:00.000Z',
    finishedAt: '2026-07-01T00:01:00.000Z',
    status: 'success',
    actions: actions.map((action) => ({
      actionId: action.actionId,
      actionName: action.actionId,
      actionType: 'delay',
      status: action.status,
      message: action.message
    }))
  }
}

function event(patch: Partial<ExecutionEventPayload>): ExecutionEventPayload {
  return {
    runId: 'run-1',
    taskId: 'task-1',
    taskName: '测试事项',
    scope: 'task',
    status: 'started',
    totalActions: 2,
    ...patch
  }
}
