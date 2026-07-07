import { computed, shallowRef, watch } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type { ExecutionEventPayload } from '@/api/events'
import { deriveActionExecutionStates, type ActionExecutionDisplay } from '@/domain/executionPresentation'
import { deriveFlowExecutionStates, type FlowPreviewStatus } from '@/domain/flowPreview'
import type { ExecutionRunSnapshot, useExecutionStore } from '@/stores/executionStore'
import type { TaskExecutionSummary, TaskItem } from '@/types/domain'

type ActionExecutionStates = Record<string, ActionExecutionDisplay>
type FlowExecutionStates = Record<string, FlowPreviewStatus>

interface UseTaskExecutionPanelOptions {
  selectedTask: Ref<TaskItem | null>
  executionStore: ReturnType<typeof useExecutionStore>
}

interface TaskExecutionPanelController {
  showLogs: Ref<boolean>
  autoShowExecution: Ref<boolean>
  showExecutionPanel: ComputedRef<boolean>
  selectedTaskActiveRun: ComputedRef<ExecutionRunSnapshot | null>
  selectedTaskActiveRuns: ComputedRef<ExecutionRunSnapshot[]>
  selectedTaskLatestRun: ComputedRef<ExecutionRunSnapshot | null>
  selectedTaskStatusRun: ComputedRef<ExecutionRunSnapshot | null>
  selectedTaskEvents: ComputedRef<ExecutionEventPayload[]>
  selectedTaskLatestSummary: ComputedRef<TaskExecutionSummary | null>
  actionExecutionStates: ComputedRef<ActionExecutionStates>
  flowExecutionStates: ComputedRef<FlowExecutionStates>
  toggleExecutionPanel: () => void
}

export function useTaskExecutionPanel(options: UseTaskExecutionPanelOptions): TaskExecutionPanelController {
  const showLogs = shallowRef(false)
  const autoShowExecution = shallowRef(false)
  const showExecutionPanel = computed(() => showLogs.value || autoShowExecution.value)
  const selectedTaskActiveRun = computed(() =>
    options.selectedTask.value ? options.executionStore.latestActiveRunForTask(options.selectedTask.value.id) : null
  )
  const selectedTaskActiveRuns = computed(() =>
    options.selectedTask.value
      ? options.executionStore.activeRuns.filter((run) => run.taskId === options.selectedTask.value?.id)
      : []
  )
  const selectedTaskLatestRun = computed(() =>
    options.selectedTask.value ? options.executionStore.latestRunForTask(options.selectedTask.value.id) : null
  )
  const selectedTaskStatusRun = computed(() => selectedTaskActiveRun.value || selectedTaskLatestRun.value)
  const selectedTaskEvents = computed(() =>
    options.selectedTask.value ? options.executionStore.eventsForTask(options.selectedTask.value.id) : []
  )
  const selectedTaskLatestSummary = computed(() =>
    options.selectedTask.value ? options.executionStore.latestSummaryForTask(options.selectedTask.value.id) : null
  )
  const actionExecutionStates = computed(() =>
    deriveActionExecutionStates(selectedTaskEvents.value, selectedTaskActiveRuns.value)
  )
  const flowExecutionStates = computed(() => {
    if (!options.selectedTask.value) return {}
    return deriveFlowExecutionStates({
      taskId: options.selectedTask.value.id,
      events: selectedTaskEvents.value,
      currentRuns: selectedTaskActiveRuns.value,
      latestSummary: selectedTaskLatestSummary.value
    })
  })

  watch(
    () => options.executionStore.currentRun,
    (run) => {
      if (run) autoShowExecution.value = true
    }
  )

  function toggleExecutionPanel() {
    const nextVisible = !showExecutionPanel.value
    showLogs.value = nextVisible
    autoShowExecution.value = nextVisible
  }

  return {
    showLogs,
    autoShowExecution,
    showExecutionPanel,
    selectedTaskActiveRun,
    selectedTaskActiveRuns,
    selectedTaskLatestRun,
    selectedTaskStatusRun,
    selectedTaskEvents,
    selectedTaskLatestSummary,
    actionExecutionStates,
    flowExecutionStates,
    toggleExecutionPanel
  }
}
