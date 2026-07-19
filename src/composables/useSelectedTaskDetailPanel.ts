import { computed, type Ref } from 'vue'
import type { DropdownOption } from 'naive-ui'
import type { ActionView } from '@/domain/actionView'
import type { ActionExecutionDisplay } from '@/domain/executionPresentation'
import { statusLabel } from '@/domain/executionPresentation'
import { deriveFlowPreviewModel, type FlowPreviewModel } from '@/domain/flowPreview'
import type { ExecutionRunSnapshot, ExecutionTimelineEntry, useExecutionStore } from '@/stores/executionStore'
import type {
  ExecutionLogSummary,
  ScheduleTaskTrigger,
  ShortcutTaskTrigger,
  TaskItem
} from '@/types/domain'

type ExecutionStore = ReturnType<typeof useExecutionStore>

export const taskMenuActionKeys = {
  edit: 'edit',
  duplicate: 'duplicate',
  saveTemplate: 'save-template',
  delete: 'delete'
} as const

export type TaskMenuActionKey = (typeof taskMenuActionKeys)[keyof typeof taskMenuActionKeys]

export const taskMenuOptions: DropdownOption[] = [
  { label: '编辑', key: taskMenuActionKeys.edit },
  { label: '复制', key: taskMenuActionKeys.duplicate },
  { label: '保存为模板', key: taskMenuActionKeys.saveTemplate },
  { type: 'divider', key: 'divider' },
  { label: '删除', key: taskMenuActionKeys.delete }
]

export interface TaskDetailMetaView {
  selectedCategory: string
  selectedKeywords: string
  formattedCreatedAt: string
  formattedUpdatedAt: string
  actionCount: number
}

export interface TaskDetailExecutionView {
  actionExecutionStates: Record<string, ActionExecutionDisplay>
  taskStatusRun: ExecutionRunSnapshot | null
  globalRuns: ExecutionRunSnapshot[]
  globalLogs: ExecutionLogSummary[]
  globalTimeline: ExecutionTimelineEntry[]
  logLoadError: string | null
  runningTask: boolean
  runButtonLabel: string
  logsButtonLabel: string
  showExecutionPanel: boolean
}

export interface TaskDetailTriggerView {
  shortcutTrigger: ShortcutTaskTrigger | null
  scheduleTrigger: ScheduleTaskTrigger | null
  taskShortcutDraft: string
  globalShortcutDraft: string
  shortcutWarning: string
}

export interface UseSelectedTaskDetailPanelOptions {
  selectedTask: Ref<TaskItem | null>
  taskShortcutDraft: Ref<string>
  globalShortcutDraft: Ref<string>
  shortcutWarning: Ref<string>
  showExecutionPanel: Ref<boolean>
  selectedTaskStatusRun: Ref<ExecutionRunSnapshot | null>
  actionExecutionStates: Ref<Record<string, ActionExecutionDisplay>>
  flowExecutionStates: Ref<Record<string, ActionExecutionDisplay>>
  executionStore: ExecutionStore
  running: Ref<boolean>
  editSelectedTask: () => void
  duplicateTask: (task: TaskItem) => Promise<void>
  saveSelectedTaskAsTemplate: () => Promise<void>
  deleteTask: (task: TaskItem) => void
}

export function useSelectedTaskDetailPanel(options: UseSelectedTaskDetailPanelOptions) {
  const meta = computed<TaskDetailMetaView>(() => ({
    selectedCategory: options.selectedTask.value?.category || '未分类',
    selectedKeywords: options.selectedTask.value?.keywords?.join('、') || '无',
    formattedCreatedAt: formatDateTime(options.selectedTask.value?.createdAt),
    formattedUpdatedAt: formatDateTime(options.selectedTask.value?.updatedAt),
    actionCount: options.selectedTask.value?.actions.filter((action) => action.enabled).length ?? 0
  }))

  const flowPreview = computed<FlowPreviewModel>(() => {
    if (!options.selectedTask.value) return { nodes: [], edges: [] }
    return deriveFlowPreviewModel(options.selectedTask.value, options.flowExecutionStates.value)
  })

  const execution = computed<TaskDetailExecutionView>(() => {
    const run = options.selectedTask.value
      ? options.executionStore.activeRunForTarget(options.executionStore.taskRunTargetKey(options.selectedTask.value.id))
      : null
    return {
      actionExecutionStates: options.actionExecutionStates.value,
      taskStatusRun: options.selectedTaskStatusRun.value,
      globalRuns: options.executionStore.activeRuns,
      globalLogs: options.executionStore.logs,
      globalTimeline: options.executionStore.eventTimeline,
      logLoadError: options.executionStore.logLoadError,
      runningTask: Boolean(run),
      runButtonLabel: run ? (run.status ? statusLabel(run.status) : '执行中') : '运行',
      logsButtonLabel: options.showExecutionPanel.value ? '隐藏执行日志' : options.running.value ? '查看执行进度' : '执行日志',
      showExecutionPanel: options.showExecutionPanel.value
    }
  })

  const triggers = computed<TaskDetailTriggerView>(() => ({
    shortcutTrigger:
      options.selectedTask.value?.triggers.find((trigger): trigger is ShortcutTaskTrigger => trigger.type === 'shortcut') || null,
    scheduleTrigger:
      options.selectedTask.value?.triggers.find((trigger): trigger is ScheduleTaskTrigger => trigger.type === 'schedule') || null,
    taskShortcutDraft: options.taskShortcutDraft.value,
    globalShortcutDraft: options.globalShortcutDraft.value,
    shortcutWarning: options.shortcutWarning.value
  }))

  function handleTaskMenuSelect(key: string | number) {
    const task = options.selectedTask.value
    if (!task) return

    if (key === taskMenuActionKeys.edit) {
      options.editSelectedTask()
      return
    }
    if (key === taskMenuActionKeys.duplicate) {
      void options.duplicateTask(task)
      return
    }
    if (key === taskMenuActionKeys.saveTemplate) {
      void options.saveSelectedTaskAsTemplate()
      return
    }
    if (key === taskMenuActionKeys.delete) {
      options.deleteTask(task)
    }
  }

  function setActionView(view: ActionView, target: Ref<ActionView>) {
    target.value = view
  }

  return {
    meta,
    flowPreview,
    execution,
    triggers,
    taskMenuOptions,
    handleTaskMenuSelect,
    setActionView
  }
}

export function formatDateTime(value?: string) {
  if (!value) return '无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}
