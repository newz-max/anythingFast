import { onMounted, onUnmounted } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { keybindingMatchesCommand, type EffectiveKeybinding } from '@/domain/keybindings'
import { isEditableKeyboardTarget } from '@/utils/keyboard'
import type { ActionView } from '@/domain/actionView'
import type { TaskItem } from '@/types/domain'

interface MainWindowTaskListPanelApi {
  focusSearch: () => void
  visibleTaskIds: () => string[]
  scrollTaskIntoView: (taskId: string) => Promise<void>
}

interface MainWindowKeybindings {
  effective: ComputedRef<EffectiveKeybinding[]>
}

interface UseMainWindowShortcutsOptions {
  keybindings: MainWindowKeybindings
  isDisabled: () => boolean
  isTemplateCenter: Ref<boolean>
  selectedTask: Ref<TaskItem | null>
  selectedTaskId: Ref<string | null>
  taskListPanelRef: Ref<MainWindowTaskListPanelApi | null>
  getVisibleTaskIds: () => string[]
  selectTask: (taskId: string | null) => void
  runSelectedTask: () => void
  createTask: () => void
  editSelectedTask: (initialStep?: number) => void
  toggleSelectedTaskFavorite: () => void
  toggleExecutionPanel: () => void
  setActionView: (view: ActionView) => void
}

export function useMainWindowShortcuts(options: UseMainWindowShortcutsOptions) {
  onMounted(() => {
    window.addEventListener('keydown', onMainWindowKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onMainWindowKeydown)
  })

  function onMainWindowKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || options.isDisabled()) return

    const editableTarget = isEditableKeyboardTarget(event.target)
    if (keybindingMatchesCommand(event, 'main.focusSearch', options.keybindings.effective.value) && !editableTarget) {
      event.preventDefault()
      options.taskListPanelRef.value?.focusSearch()
      return
    }

    if (editableTarget) return

    if (keybindingMatchesCommand(event, 'main.selectNextTask', options.keybindings.effective.value)) {
      event.preventDefault()
      moveSelectedTask(1)
      return
    }
    if (keybindingMatchesCommand(event, 'main.selectPreviousTask', options.keybindings.effective.value)) {
      event.preventDefault()
      moveSelectedTask(-1)
      return
    }
    if (keybindingMatchesCommand(event, 'main.runSelectedTask', options.keybindings.effective.value)) {
      event.preventDefault()
      options.runSelectedTask()
      return
    }
    if (keybindingMatchesCommand(event, 'main.createTask', options.keybindings.effective.value)) {
      event.preventDefault()
      options.createTask()
      return
    }
    if (keybindingMatchesCommand(event, 'main.editSelectedTask', options.keybindings.effective.value)) {
      event.preventDefault()
      options.editSelectedTask()
      return
    }
    if (keybindingMatchesCommand(event, 'main.toggleExecutionLogs', options.keybindings.effective.value)) {
      event.preventDefault()
      options.toggleExecutionPanel()
      return
    }
    if (keybindingMatchesCommand(event, 'main.toggleFavorite', options.keybindings.effective.value) && options.selectedTask.value) {
      event.preventDefault()
      options.toggleSelectedTaskFavorite()
      return
    }
    if (keybindingMatchesCommand(event, 'main.showActionList', options.keybindings.effective.value) && options.selectedTask.value) {
      event.preventDefault()
      options.setActionView('list')
      return
    }
    if (keybindingMatchesCommand(event, 'main.showFlowPreview', options.keybindings.effective.value) && options.selectedTask.value) {
      event.preventDefault()
      options.setActionView('flow')
      return
    }
    if (keybindingMatchesCommand(event, 'main.addAction', options.keybindings.effective.value) && options.selectedTask.value) {
      event.preventDefault()
      options.editSelectedTask(2)
    }
  }

  function moveSelectedTask(delta: -1 | 1) {
    if (options.isTemplateCenter.value) return
    const taskIds = options.taskListPanelRef.value?.visibleTaskIds() ?? options.getVisibleTaskIds()
    if (taskIds.length === 0) return
    const currentIndex = taskIds.findIndex((taskId) => taskId === options.selectedTaskId.value)
    const fallbackIndex = delta > 0 ? 0 : taskIds.length - 1
    const nextIndex = currentIndex === -1 ? fallbackIndex : Math.min(Math.max(currentIndex + delta, 0), taskIds.length - 1)
    const nextTaskId = taskIds[nextIndex]
    options.selectTask(nextTaskId)
    void options.taskListPanelRef.value?.scrollTaskIntoView(nextTaskId)
  }
}
