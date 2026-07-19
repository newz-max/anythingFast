import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import { createTaskDraft } from '@/domain/taskFactory'
import { deriveActionRisk, deriveTaskRisk } from '@/domain/risk'
import { validateTaskLocal } from '@/domain/validation'
import { clonePlainDto } from '@/utils/clonePlainDto'
import type { TaskAction, TaskItem } from '@/types/domain'

export type TaskWizardMode = 'create' | 'edit'

const CREATE_DRAFT_KEY = '__create__'
const draftCache = new Map<string, TaskItem>()

export function useTaskWizardDraft(options: {
  mode: Ref<TaskWizardMode>
  sourceTask: Ref<TaskItem | null>
  allTasks: Ref<TaskItem[]>
}) {
  const draft = ref<TaskItem | null>(null)
  const activeKey = shallowRef(CREATE_DRAFT_KEY)

  function resetDraft() {
    const task = options.sourceTask.value
    const mode = options.mode.value
    const key = task?.id || (mode === 'create' ? CREATE_DRAFT_KEY : null)
    activeKey.value = key || CREATE_DRAFT_KEY

    if (!key) {
      draft.value = null
      return
    }

    const cachedDraft = draftCache.get(key)
    if (cachedDraft) {
      draft.value = cachedDraft
      normalizeRisks()
      return
    }

    const nextDraft = task ? clonePlainDto(task) : mode === 'create' ? createTaskDraft() : null
    draft.value = nextDraft
    if (nextDraft) {
      draftCache.set(key, nextDraft)
      normalizeRisks()
    }
  }

  watch([options.mode, options.sourceTask], resetDraft, { immediate: true })

  watch(
    draft,
    (value) => {
      if (!value) return
      draftCache.set(activeKey.value, value)
    },
    { deep: true }
  )

  const validation = computed(() => (draft.value ? validateTaskLocal(draft.value, options.allTasks.value) : null))
  const actionCount = computed(() => draft.value?.actions.filter((action) => action.enabled).length ?? 0)
  const containsCommand = computed(() => draft.value?.actions.some((action) => action.enabled && action.type === 'runCommand') ?? false)

  function addAction(action: TaskAction) {
    if (!draft.value) return false
    draft.value.actions.push(action)
    normalizeRisks()
    return true
  }

  function replaceAction(action: TaskAction) {
    if (!draft.value) return false
    const index = draft.value.actions.findIndex((item) => item.id === action.id)
    if (index < 0) return false
    const nextActions = [...draft.value.actions]
    nextActions[index] = action
    draft.value.actions = nextActions
    normalizeRisks()
    return true
  }

  function removeAction(actionId: string) {
    if (!draft.value) return
    draft.value.actions = draft.value.actions.filter((action) => action.id !== actionId)
    normalizeRisks()
  }

  function moveAction(actionId: string, direction: -1 | 1) {
    if (!draft.value) return
    const index = draft.value.actions.findIndex((action) => action.id === actionId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= draft.value.actions.length) return
    const nextActions = [...draft.value.actions]
    const [item] = nextActions.splice(index, 1)
    nextActions.splice(target, 0, item)
    draft.value.actions = nextActions
  }

  function normalizeRisks() {
    if (!draft.value) return
    const nextActions = draft.value.actions.map((action) => ({
      ...action,
      riskLevel: deriveActionRisk(action)
    }))
    const nextTaskRisk = deriveTaskRisk({ ...draft.value, actions: nextActions })
    const actionsChanged = nextActions.some((action, index) => action.riskLevel !== draft.value?.actions[index]?.riskLevel)

    if (actionsChanged) {
      draft.value.actions = nextActions
    }
    if (draft.value.riskLevel !== nextTaskRisk) {
      draft.value.riskLevel = nextTaskRisk
    }
  }

  function clearDraft(taskId = activeKey.value) {
    draftCache.delete(taskId)
    if (taskId === activeKey.value) {
      draft.value = null
    }
  }

  return {
    draft,
    validation,
    actionCount,
    containsCommand,
    addAction,
    replaceAction,
    removeAction,
    moveAction,
    normalizeRisks,
    resetDraft,
    clearDraft
  }
}
