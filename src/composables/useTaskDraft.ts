import { computed, ref, watch, type Ref } from 'vue'
import { createActionDraft } from '@/domain/taskFactory'
import { deriveActionRisk, deriveTaskRisk } from '@/domain/risk'
import { validateTaskLocal } from '@/domain/validation'
import type { ActionType, TaskItem } from '@/types/domain'

export function useTaskDraft(sourceTask: Ref<TaskItem | null>, allTasks: Ref<TaskItem[]>) {
  const draft = ref<TaskItem | null>(null)

  watch(
    sourceTask,
    (task) => {
      draft.value = task ? structuredClone(task) : null
    },
    { immediate: true }
  )

  const validation = computed(() => (draft.value ? validateTaskLocal(draft.value, allTasks.value) : null))
  const actionCount = computed(() => draft.value?.actions.filter((action) => action.enabled).length ?? 0)
  const containsCommand = computed(() => draft.value?.actions.some((action) => action.enabled && action.type === 'runCommand') ?? false)

  function addAction(type: ActionType) {
    if (!draft.value) return
    draft.value.actions.push(createActionDraft(type))
    normalizeRisks()
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
    draft.value.actions = draft.value.actions.map((action) => ({
      ...action,
      riskLevel: deriveActionRisk(action)
    }))
    draft.value.riskLevel = deriveTaskRisk(draft.value)
  }

  return {
    draft,
    validation,
    actionCount,
    containsCommand,
    addAction,
    removeAction,
    moveAction,
    normalizeRisks
  }
}
