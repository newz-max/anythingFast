<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { NModal, useDialog, useMessage } from 'naive-ui'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { DropdownOption } from 'naive-ui'
import TaskListPanel from '@/components/tasks/TaskListPanel.vue'
import TemplateCenter from '@/components/tasks/TemplateCenter.vue'
import TaskImportPreviewModal from '@/components/tasks/TaskImportPreviewModal.vue'
import TaskWizardDrawer from '@/components/tasks/TaskWizardDrawer.vue'
import TaskDetailPanel from '@/components/tasks/TaskDetailPanel.vue'
import HelpModal from '@/components/settings/HelpModal.vue'
import SettingsModal from '@/components/settings/SettingsModal.vue'
import logoUrl from '@/assets/logo.png'
import { createTaskDraft, cloneTask } from '@/domain/taskFactory'
import { createTaskFromTemplate } from '@/domain/taskTemplates'
import { getTasksForView, type TaskView } from '@/domain/taskViews'
import { deriveActionExecutionStates, statusLabel } from '@/domain/executionPresentation'
import { deriveFlowExecutionStates, deriveFlowPreviewModel } from '@/domain/flowPreview'
import { useTaskStore } from '@/stores/taskStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useTaskExecution } from '@/composables/useTaskExecution'
import { useKeybindings } from '@/composables/useKeybindings'
import { useTaskImportExport } from '@/composables/useTaskImportExport'
import { tauriApi } from '@/api/tauri'
import { autostartApi } from '@/api/autostart'
import { listenShortcutStatusEvents } from '@/api/events'
import { getErrorMessage, logDevError } from '@/utils/errors'
import { isEditableKeyboardTarget } from '@/utils/keyboard'
import { keybindingMatchesCommand, keybindingScopeLabels } from '@/domain/keybindings'
import type {
  AppTheme,
  ScheduleTaskTrigger,
  ShortcutStatus,
  ShortcutTaskTrigger,
  TaskAction,
  TaskItem,
  TaskTag,
  TaskTemplate,
  TaskTrigger
} from '@/types/domain'
import type { TaskWizardMode } from '@/composables/useTaskWizardDraft'

const taskStore = useTaskStore()
const executionStore = useExecutionStore()
const updateStore = useUpdateStore()
const { execute, executeAction, running } = useTaskExecution()
const keybindings = useKeybindings()
const message = useMessage()
const dialog = useDialog()
const {
  importPreviewVisible,
  importPreview,
  importConfirming,
  openImportFile,
  confirmImport,
  exportTaskBundle,
  exportSavedTemplates
} = useTaskImportExport({
  taskStore,
  message,
  reportUiError
})
const showLogs = shallowRef(false)
const autoShowExecution = shallowRef(false)
const shortcutDraft = shallowRef('')
const settingsShortcutDraft = shallowRef('')
const themeDraft = shallowRef<AppTheme>('dark')
const launchOnStartupDraft = shallowRef(false)
const wizardVisible = shallowRef(false)
const wizardMode = shallowRef<TaskWizardMode>('create')
const wizardTask = shallowRef<TaskItem | null>(null)
const wizardInitialStep = shallowRef(1)
const activeTaskView = shallowRef<TaskView>('all')
const activeActionView = shallowRef<'list' | 'flow'>('list')
const selectedTagId = shallowRef<string | null>(null)
const tagModalVisible = shallowRef(false)
const tagDraftName = shallowRef('')
const editingTag = shallowRef<TaskTag | null>(null)
const taskShortcutDraft = shallowRef('')
const helpModalVisible = shallowRef(false)
const settingsModalVisible = shallowRef(false)
const shortcutStatus = shallowRef<ShortcutStatus | null>(null)
const isStackedLayout = shallowRef(false)
const taskListExpanded = shallowRef(false)
const layoutRef = useTemplateRef<HTMLElement>('layout')
const contentRef = useTemplateRef<HTMLElement>('content')
const taskListPanelRef = useTemplateRef<{
  focusSearch: () => void
  visibleTaskIds: () => string[]
  scrollTaskIntoView: (taskId: string) => Promise<void>
}>('taskListPanel')
let desktopMediaQuery: MediaQueryList | null = null
let stackedLayoutMediaQuery: MediaQueryList | null = null
let startupUpdateTimer: number | null = null

const selectedTask = computed(() => taskStore.selectedTask)
const visibleTasks = computed(() => getTasksForView(taskStore.tasks, activeTaskView.value, selectedTagId.value))
const showTemplateCenter = computed(() => activeTaskView.value === 'templates')
const shouldShowTaskListToggle = computed(() => isStackedLayout.value && !showTemplateCenter.value)
const shouldCollapseTaskList = computed(() => shouldShowTaskListToggle.value && !taskListExpanded.value)
const mainLayoutClasses = computed(() => ({
  'stacked-task-list': shouldShowTaskListToggle.value,
  'stacked-task-list-expanded': shouldShowTaskListToggle.value && taskListExpanded.value,
  'stacked-task-list-collapsed': shouldCollapseTaskList.value
}))
const taskListToggleLabel = computed(() => (taskListExpanded.value ? '收起事项列表' : '展开事项列表'))
const selectedActionCount = computed(() => selectedTask.value?.actions.filter((action) => action.enabled).length ?? 0)
const selectedKeywords = computed(() => selectedTask.value?.keywords?.join('、') || '无')
const selectedCategory = computed(() => selectedTask.value?.category || '未分类')
const formattedCreatedAt = computed(() => formatDateTime(selectedTask.value?.createdAt))
const formattedUpdatedAt = computed(() => formatDateTime(selectedTask.value?.updatedAt))
const selectedShortcutTrigger = computed(
  () =>
    selectedTask.value?.triggers.find((trigger): trigger is ShortcutTaskTrigger => trigger.type === 'shortcut') || null
)
const selectedScheduleTrigger = computed(
  () =>
    selectedTask.value?.triggers.find((trigger): trigger is ScheduleTaskTrigger => trigger.type === 'schedule') || null
)
const taskShortcutValues = computed(() =>
  taskStore.tasks
    .flatMap((task) => task.triggers)
    .filter((trigger): trigger is ShortcutTaskTrigger => trigger.type === 'shortcut' && trigger.enabled)
    .map((trigger) => trigger.shortcut)
)
const favoriteCount = computed(() => taskStore.tasks.filter((task) => task.favorite).length)
const recentCount = computed(() => taskStore.tasks.filter((task) => task.lastRunAt).length)
const navigationItems = computed(() => [
  { key: 'all' as const, icon: '▣', label: '我的事项', count: taskStore.tasks.length, active: activeTaskView.value === 'all', disabled: false },
  { key: 'favorites' as const, icon: '☆', label: '收藏事项', count: favoriteCount.value, active: activeTaskView.value === 'favorites', disabled: false },
  { key: 'recent' as const, icon: '◷', label: '最近运行', count: recentCount.value, active: activeTaskView.value === 'recent', disabled: false },
  { key: 'templates' as const, icon: '▱', label: '模板中心', count: taskStore.templates.length, active: activeTaskView.value === 'templates', disabled: false }
])
const taskMenuOptions: DropdownOption[] = [
  { label: '编辑', key: 'edit' },
  { label: '复制', key: 'duplicate' },
  { label: '保存为模板', key: 'save-template' },
  { type: 'divider', key: 'divider' },
  { label: '删除', key: 'delete' }
]
const shareOptions: DropdownOption[] = [
  { label: '复制事项摘要', key: 'copy-summary' },
  { label: '复制事项配置 JSON', key: 'copy-json' },
  { label: '导出当前事项 JSON', key: 'export-current' },
  { label: '导出当前列表 JSON', key: 'export-visible' },
  { label: '导入配置 JSON', key: 'import-json' }
]
const themeOptions: Array<{ label: string; value: AppTheme }> = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' }
]
const tagItems = computed(() => taskStore.tags.map((tag, index) => ({ ...tag, tone: tagTone(index) })))
const showExecutionPanel = computed(() => showLogs.value || autoShowExecution.value)
const selectedTaskActiveRun = computed(() => selectedTask.value ? executionStore.latestActiveRunForTask(selectedTask.value.id) : null)
const selectedTaskActiveRuns = computed(() => selectedTask.value ? executionStore.activeRuns.filter((run) => run.taskId === selectedTask.value?.id) : [])
const selectedTaskLatestRun = computed(() => selectedTask.value ? executionStore.latestRunForTask(selectedTask.value.id) : null)
const selectedTaskStatusRun = computed(() => selectedTaskActiveRun.value || selectedTaskLatestRun.value)
const selectedTaskEvents = computed(() => selectedTask.value ? executionStore.eventsForTask(selectedTask.value.id) : [])
const selectedTaskLatestSummary = computed(() => selectedTask.value ? executionStore.latestSummaryForTask(selectedTask.value.id) : null)
const actionExecutionStates = computed(() => deriveActionExecutionStates(selectedTaskEvents.value, selectedTaskActiveRuns.value))
const flowExecutionStates = computed(() => {
  if (!selectedTask.value) return {}
  return deriveFlowExecutionStates({
    taskId: selectedTask.value.id,
    events: selectedTaskEvents.value,
    currentRuns: selectedTaskActiveRuns.value,
    latestSummary: selectedTaskLatestSummary.value
  })
})
const selectedFlowPreview = computed(() => {
  if (!selectedTask.value) return { nodes: [], edges: [] }
  return deriveFlowPreviewModel(selectedTask.value, flowExecutionStates.value)
})
const runningSelectedTask = computed(() => Boolean(selectedTask.value && executionStore.activeRunForTarget(executionStore.taskRunTargetKey(selectedTask.value.id))))
const runButtonLabel = computed(() => {
  const run = selectedTask.value ? executionStore.activeRunForTarget(executionStore.taskRunTargetKey(selectedTask.value.id)) : null
  if (run) return run.status ? statusLabel(run.status) : '执行中'
  return '运行'
})
const logsButtonLabel = computed(() => {
  if (showExecutionPanel.value) return '隐藏执行日志'
  if (running.value) return '查看执行进度'
  return '执行日志'
})
const shortcutWarning = computed(() => {
  const status = shortcutStatus.value
  if (!status || status.registered) return ''
  return status.message || `全局快捷键 ${status.shortcut} 当前不可用`
})
const keybindingHelpGroups = computed(() =>
  Object.entries(keybindingScopeLabels).map(([scope, label]) => ({
    scope,
    label,
    items: keybindings.effective.value.filter((item) => item.scope === scope)
  }))
)

onMounted(async () => {
  window.addEventListener('keydown', onMainWindowKeydown)
  setupResponsiveScrollReset()
  shortcutDraft.value = taskStore.settings.globalShortcut
  settingsShortcutDraft.value = taskStore.settings.globalShortcut
  themeDraft.value = taskStore.settings.theme
  launchOnStartupDraft.value = taskStore.settings.launchOnStartup
  void keybindings.loadKeybindings()
  try {
    await executionStore.setupListeners()
  } catch (err) {
    reportUiError('Setup execution listener failed', err)
  }
  try {
    await setupShortcutStatus()
  } catch (err) {
    reportUiError('Setup shortcut status failed', err)
  }
  try {
    await executionStore.loadLogs()
  } catch (err) {
    reportUiError('Load execution logs failed', err)
  }
  setupStartupUpdateCheck()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onMainWindowKeydown)
  desktopMediaQuery?.removeEventListener('change', handleDesktopBreakpointChange)
  stackedLayoutMediaQuery?.removeEventListener('change', handleStackedLayoutBreakpointChange)
  if (startupUpdateTimer !== null) {
    window.clearTimeout(startupUpdateTimer)
  }
})

watch(
  selectedTask,
  (task) => {
    const shortcutTrigger = task?.triggers.find((trigger) => trigger.type === 'shortcut')
    taskShortcutDraft.value = shortcutTrigger?.shortcut || ''
  },
  { immediate: true }
)

watch(
  () => executionStore.currentRun,
  (run) => {
    if (run) autoShowExecution.value = true
  }
)

function createTask() {
  wizardMode.value = 'create'
  wizardTask.value = createTaskDraft()
  wizardInitialStep.value = 1
  wizardVisible.value = true
}

async function saveTask(task: TaskItem) {
  try {
    await taskStore.upsertTask(task)
    message.success('已保存')
    wizardVisible.value = false
  } catch (err) {
    reportUiError('Save task failed', err, { taskId: task.id })
  }
}

async function duplicateTask(task: TaskItem) {
  try {
    await taskStore.upsertTask(cloneTask(task))
    message.success('已复制事项')
    wizardVisible.value = false
  } catch (err) {
    reportUiError('Duplicate task failed', err, { taskId: task.id })
  }
}

function deleteTask(task: TaskItem) {
  dialog.warning({
    title: '删除事项',
    content: `确认删除“${task.name}”？此操作不会执行任何动作，但会从配置中移除该事项。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await taskStore.removeTask(task.id)
      wizardVisible.value = false
      message.success('已删除')
    }
  })
}

function selectTask(taskId: string) {
  taskStore.selectTask(taskId)
  wizardMode.value = 'edit'
  wizardTask.value = taskStore.tasks.find((task) => task.id === taskId) || null
  if (isStackedLayout.value) {
    taskListExpanded.value = false
  }
}

function editSelectedTask(initialStep = 1) {
  if (!selectedTask.value) return
  wizardMode.value = 'edit'
  wizardTask.value = selectedTask.value
  wizardInitialStep.value = initialStep
  wizardVisible.value = true
}

function onMainWindowKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || isMainShortcutSuspended()) return

  const editableTarget = isEditableKeyboardTarget(event.target)
  if (keybindingMatchesCommand(event, 'main.focusSearch', keybindings.effective.value) && !editableTarget) {
    event.preventDefault()
    taskListPanelRef.value?.focusSearch()
    return
  }

  if (editableTarget) return

  if (keybindingMatchesCommand(event, 'main.selectNextTask', keybindings.effective.value)) {
    event.preventDefault()
    moveSelectedTask(1)
    return
  }
  if (keybindingMatchesCommand(event, 'main.selectPreviousTask', keybindings.effective.value)) {
    event.preventDefault()
    moveSelectedTask(-1)
    return
  }
  if (keybindingMatchesCommand(event, 'main.runSelectedTask', keybindings.effective.value)) {
    event.preventDefault()
    runSelectedTask()
    return
  }
  if (keybindingMatchesCommand(event, 'main.createTask', keybindings.effective.value)) {
    event.preventDefault()
    createTask()
    return
  }
  if (keybindingMatchesCommand(event, 'main.editSelectedTask', keybindings.effective.value)) {
    event.preventDefault()
    editSelectedTask()
    return
  }
  if (keybindingMatchesCommand(event, 'main.toggleExecutionLogs', keybindings.effective.value)) {
    event.preventDefault()
    toggleExecutionPanel()
    return
  }
  if (keybindingMatchesCommand(event, 'main.toggleFavorite', keybindings.effective.value) && selectedTask.value) {
    event.preventDefault()
    void toggleTaskFavorite(selectedTask.value.id)
    return
  }
  if (keybindingMatchesCommand(event, 'main.showActionList', keybindings.effective.value) && selectedTask.value) {
    event.preventDefault()
    activeActionView.value = 'list'
    return
  }
  if (keybindingMatchesCommand(event, 'main.showFlowPreview', keybindings.effective.value) && selectedTask.value) {
    event.preventDefault()
    activeActionView.value = 'flow'
    return
  }
  if (keybindingMatchesCommand(event, 'main.addAction', keybindings.effective.value) && selectedTask.value) {
    event.preventDefault()
    editSelectedTask(2)
  }
}

function isMainShortcutSuspended() {
  return (
    wizardVisible.value ||
    tagModalVisible.value ||
    helpModalVisible.value ||
    settingsModalVisible.value ||
    importPreviewVisible.value
  )
}

function moveSelectedTask(delta: -1 | 1) {
  if (showTemplateCenter.value) return
  const taskIds = taskListPanelRef.value?.visibleTaskIds() ?? visibleTasks.value.map((task) => task.id)
  if (taskIds.length === 0) return
  const currentIndex = taskIds.findIndex((taskId) => taskId === taskStore.selectedTaskId)
  const fallbackIndex = delta > 0 ? 0 : taskIds.length - 1
  const nextIndex = currentIndex === -1 ? fallbackIndex : Math.min(Math.max(currentIndex + delta, 0), taskIds.length - 1)
  const nextTaskId = taskIds[nextIndex]
  taskStore.selectTask(nextTaskId)
  void taskListPanelRef.value?.scrollTaskIntoView(nextTaskId)
}

function toggleSelectedTaskEnabled(enabled: boolean) {
  if (!selectedTask.value) return
  void taskStore.updateTaskEnabled(selectedTask.value.id, enabled)
}

function setTaskView(view: TaskView) {
  activeTaskView.value = view
  if (isStackedLayout.value && view !== 'templates') {
    taskListExpanded.value = false
  }
  if (view === 'templates') return
  const nextTasks = getTasksForView(taskStore.tasks, view, selectedTagId.value)
  if (!nextTasks.some((task) => task.id === taskStore.selectedTaskId)) {
    taskStore.selectTask(nextTasks[0]?.id || null)
  }
}

function selectTag(tagId: string | null) {
  selectedTagId.value = selectedTagId.value === tagId ? null : tagId
  if (activeTaskView.value === 'templates') {
    activeTaskView.value = 'all'
  }
  const nextTasks = visibleTasks.value
  if (!nextTasks.some((task) => task.id === taskStore.selectedTaskId)) {
    taskStore.selectTask(nextTasks[0]?.id || null)
  }
}

async function toggleTaskFavorite(taskId: string) {
  await taskStore.toggleFavorite(taskId)
  const task = taskStore.tasks.find((item) => item.id === taskId)
  message.success(task?.favorite ? '已收藏' : '已取消收藏')
  if (activeTaskView.value === 'favorites' && !task?.favorite) {
    const nextTasks = getTasksForView(taskStore.tasks, 'favorites', selectedTagId.value)
    if (!nextTasks.some((item) => item.id === taskStore.selectedTaskId)) {
      taskStore.selectTask(nextTasks[0]?.id || null)
    }
  }
}

function openCreateTag() {
  editingTag.value = null
  tagDraftName.value = ''
  tagModalVisible.value = true
}

function openRenameTag(tag: TaskTag) {
  editingTag.value = tag
  tagDraftName.value = tag.name
  tagModalVisible.value = true
}

async function saveTag() {
  try {
    if (editingTag.value) {
      await taskStore.renameTag(editingTag.value.id, tagDraftName.value)
      message.success('已更新标签')
    } else {
      await taskStore.createTag(tagDraftName.value)
      message.success('已新增标签')
    }
    tagModalVisible.value = false
  } catch (err) {
    reportUiError('Save tag failed', err, { tagId: editingTag.value?.id })
  }
}

function confirmDeleteTag(tag: TaskTag) {
  dialog.warning({
    title: '删除标签',
    content: `确认删除“${tag.name}”？标签会从已关联事项中移除，事项不会被删除。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await taskStore.deleteTag(tag.id)
      if (selectedTagId.value === tag.id) selectedTagId.value = null
      message.success('已删除标签')
    }
  })
}

function handleTaskMenuSelect(key: string | number) {
  if (!selectedTask.value) return
  if (key === 'edit') {
    editSelectedTask()
    return
  }
  if (key === 'duplicate') {
    void duplicateTask(selectedTask.value)
    return
  }
  if (key === 'save-template') {
    void saveSelectedTaskAsTemplate()
    return
  }
  if (key === 'delete') {
    deleteTask(selectedTask.value)
  }
}

async function handleShareSelect(key: string | number) {
  if (!selectedTask.value) return
  if (key === 'copy-summary') {
    await copyText(createTaskSummary(selectedTask.value))
    message.success('已复制事项摘要')
    return
  }
  if (key === 'copy-json') {
    const bundle = isTauriRuntime()
      ? await tauriApi.exportTaskBundle({ taskIds: [selectedTask.value.id], templateIds: [] })
      : {
          schemaVersion: 1,
          exportedAt: new Date().toISOString(),
          sourceApp: 'anything-fast',
          tasks: [selectedTask.value],
          templates: []
        }
    await copyText(JSON.stringify(bundle, null, 2))
    message.success('已复制事项配置 JSON')
    return
  }
  if (key === 'export-current') {
    await exportTaskBundle([selectedTask.value.id])
    return
  }
  if (key === 'export-visible') {
    await exportTaskBundle(visibleTasks.value.map((task) => task.id))
    return
  }
  if (key === 'import-json') {
    await openImportFile()
  }
}

async function saveSelectedTaskAsTemplate() {
  if (!selectedTask.value) return
  try {
    await taskStore.saveTaskAsTemplate(selectedTask.value)
    message.success('已保存为模板')
  } catch (err) {
    reportUiError('Save task as template failed', err, { taskId: selectedTask.value.id })
  }
}

async function saveShortcut() {
  try {
    await taskStore.updateSettings({ ...taskStore.settings, globalShortcut: shortcutDraft.value.trim() || 'Alt+Space' })
    await refreshShortcutStatus()
    message.success('快捷键设置已保存')
  } catch (err) {
    shortcutDraft.value = taskStore.settings.globalShortcut
    await refreshShortcutStatusQuiet('Refresh shortcut status after failed global shortcut save')
    reportUiError('Save global shortcut failed', err, { shortcut: shortcutDraft.value })
  }
}

async function openSettings() {
  settingsShortcutDraft.value = taskStore.settings.globalShortcut
  themeDraft.value = taskStore.settings.theme
  launchOnStartupDraft.value = taskStore.settings.launchOnStartup
  settingsModalVisible.value = true
  await keybindings.loadKeybindings()
  try {
    launchOnStartupDraft.value = await autostartApi.isEnabled()
  } catch (err) {
    launchOnStartupDraft.value = taskStore.settings.launchOnStartup
    reportUiError('Load autostart status failed', err)
  }
}

async function saveSettings() {
  const previousLaunchOnStartup = taskStore.settings.launchOnStartup
  const nextLaunchOnStartup = launchOnStartupDraft.value
  try {
    await autostartApi.setEnabled(nextLaunchOnStartup)
    await taskStore.updateSettings({
      ...taskStore.settings,
      globalShortcut: settingsShortcutDraft.value.trim() || 'Alt+Space',
      theme: themeDraft.value,
      launchOnStartup: nextLaunchOnStartup
    })
    shortcutDraft.value = taskStore.settings.globalShortcut
    await refreshShortcutStatus()
    settingsModalVisible.value = false
    message.success('设置已保存')
  } catch (err) {
    settingsShortcutDraft.value = taskStore.settings.globalShortcut
    themeDraft.value = taskStore.settings.theme
    launchOnStartupDraft.value = taskStore.settings.launchOnStartup
    if (nextLaunchOnStartup !== previousLaunchOnStartup) {
      try {
        await autostartApi.setEnabled(previousLaunchOnStartup)
      } catch (rollbackErr) {
        logDevError('Rollback autostart status failed', rollbackErr, { previousLaunchOnStartup })
      }
    }
    await refreshShortcutStatusQuiet('Refresh shortcut status after failed settings save')
    reportUiError('Save settings failed', err, {
      shortcut: settingsShortcutDraft.value,
      theme: themeDraft.value,
      launchOnStartup: nextLaunchOnStartup
    })
  }
}

async function cycleTheme() {
  const order: AppTheme[] = ['system', 'light', 'dark']
  const nextTheme = order[(order.indexOf(taskStore.settings.theme) + 1) % order.length]
  await taskStore.updateSettings({ ...taskStore.settings, theme: nextTheme })
  themeDraft.value = nextTheme
  message.success(`主题已切换为${themeLabel(nextTheme)}`)
}

async function saveTaskShortcutTrigger() {
  if (!selectedTask.value) return
  const shortcut = taskShortcutDraft.value.trim()
  const triggers: TaskTrigger[] = selectedTask.value.triggers.filter((trigger) => trigger.type !== 'shortcut')
  if (shortcut) {
    triggers.push({ type: 'shortcut', enabled: true, shortcut })
  }
  try {
    await taskStore.upsertTask({ ...selectedTask.value, triggers })
    message.success('触发设置已保存')
  } catch (err) {
    reportUiError('Save task shortcut trigger failed', err, { taskId: selectedTask.value.id, shortcut })
  }
}

async function clearTaskShortcutTrigger() {
  if (!selectedTask.value) return
  taskShortcutDraft.value = ''
  await taskStore.upsertTask({
    ...selectedTask.value,
    triggers: selectedTask.value.triggers.filter((trigger) => trigger.type !== 'shortcut')
  })
  message.success('已移除事项快捷键')
}

async function saveTaskScheduleTrigger(trigger: ScheduleTaskTrigger) {
  if (!selectedTask.value) return
  const triggers: TaskTrigger[] = selectedTask.value.triggers.filter((item) => item.type !== 'schedule')
  triggers.push(trigger)
  try {
    await taskStore.upsertTask({ ...selectedTask.value, triggers })
    message.success('周期触发已保存')
  } catch (err) {
    reportUiError('Save task schedule trigger failed', err, { taskId: selectedTask.value.id })
  }
}

async function clearTaskScheduleTrigger() {
  if (!selectedTask.value) return
  await taskStore.upsertTask({
    ...selectedTask.value,
    triggers: selectedTask.value.triggers.filter((trigger) => trigger.type !== 'schedule')
  })
  message.success('已移除周期触发')
}

function runTask(task: TaskItem) {
  void execute(task)
}

function runSelectedTask() {
  if (!selectedTask.value) return
  void execute(selectedTask.value)
}

function runSelectedAction(action: TaskAction) {
  if (!selectedTask.value) return
  void executeAction(selectedTask.value, action)
}

function isActionRunning(action: TaskAction) {
  if (!selectedTask.value) return false
  return Boolean(executionStore.activeRunForTarget(executionStore.actionRunTargetKey(selectedTask.value.id, action.id)))
}

function toggleExecutionPanel() {
  const nextVisible = !showExecutionPanel.value
  showLogs.value = nextVisible
  autoShowExecution.value = nextVisible
}

function createFromTemplate(template: TaskTemplate) {
  wizardMode.value = 'create'
  wizardTask.value = createTaskFromTemplate(template)
  wizardInitialStep.value = 1
  wizardVisible.value = true
}

function formatDateTime(value?: string) {
  if (!value) return '无'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function tagTone(index: number) {
  return ['blue', 'green', 'amber', 'purple'][index % 4]
}

function createTaskSummary(task: TaskItem) {
  return [
    `事项：${task.name}`,
    `分类：${task.category || '未分类'}`,
    `描述：${task.description || '无'}`,
    `动作数：${task.actions.length}`,
    `风险等级：${task.riskLevel}`
  ].join('\n')
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}

function themeLabel(theme: AppTheme) {
  if (theme === 'light') return '浅色'
  if (theme === 'dark') return '深色'
  return '跟随系统'
}

function reportUiError(context: string, err: unknown, extra?: Record<string, unknown>) {
  logDevError(context, err, extra)
  message.error(getErrorMessage(err))
}

function isTauriRuntime() {
  return '__TAURI_INTERNALS__' in window
}

function setupStartupUpdateCheck() {
  if (!isTauriRuntime()) return
  if (startupUpdateTimer !== null) return
  startupUpdateTimer = window.setTimeout(() => {
    startupUpdateTimer = null
    void updateStore.checkForUpdate('startup')
  }, 3000)
}

async function minimizeWindow() {
  if (!isTauriRuntime()) return
  await getCurrentWindow().minimize()
}

async function toggleMaximizeWindow() {
  if (!isTauriRuntime()) return
  await getCurrentWindow().toggleMaximize()
}

async function closeWindow() {
  if (!isTauriRuntime()) return
  await getCurrentWindow().close()
}

async function setupShortcutStatus() {
  if (!isTauriRuntime()) return
  await listenShortcutStatusEvents((status) => {
    shortcutStatus.value = status
    if (!status.registered && status.message) {
      message.warning(status.message)
    }
  })
  await refreshShortcutStatus()
}

async function refreshShortcutStatus() {
  if (!isTauriRuntime()) return
  shortcutStatus.value = await tauriApi.loadShortcutStatus()
}

async function refreshShortcutStatusQuiet(context: string) {
  try {
    await refreshShortcutStatus()
  } catch (err) {
    logDevError(context, err)
  }
}

function setupResponsiveScrollReset() {
  desktopMediaQuery = window.matchMedia('(min-width: 961px)')
  desktopMediaQuery.addEventListener('change', handleDesktopBreakpointChange)
  stackedLayoutMediaQuery = window.matchMedia('(max-width: 960px)')
  syncStackedLayout(stackedLayoutMediaQuery.matches)
  stackedLayoutMediaQuery.addEventListener('change', handleStackedLayoutBreakpointChange)
}

function handleDesktopBreakpointChange(event: MediaQueryListEvent) {
  if (!event.matches) return
  void resetLayoutScroll()
}

function handleStackedLayoutBreakpointChange(event: MediaQueryListEvent) {
  syncStackedLayout(event.matches)
  void resetLayoutScroll()
}

function syncStackedLayout(matches: boolean) {
  isStackedLayout.value = matches
  taskListExpanded.value = false
}

function toggleTaskListPanel() {
  taskListExpanded.value = !taskListExpanded.value
  void resetLayoutScroll()
}

async function resetLayoutScroll() {
  await nextTick()
  layoutRef.value?.scrollTo({ top: 0, left: 0 })
  contentRef.value?.scrollTo({ top: 0, left: 0 })
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}
</script>

<template>
  <main ref="layout" class="main-layout" :class="mainLayoutClasses">
    <div class="ambient ambient-one" aria-hidden="true"></div>
    <div class="ambient ambient-two" aria-hidden="true"></div>
    <div class="light-arc light-arc-one" aria-hidden="true"></div>
    <div class="light-arc light-arc-two" aria-hidden="true"></div>

    <header class="app-titlebar" data-tauri-drag-region>
      <div class="window-brand" data-tauri-drag-region>
        <div class="titlebar-mark" aria-hidden="true" data-tauri-drag-region>
          <img :src="logoUrl" alt="" data-tauri-drag-region />
        </div>
        <span data-tauri-drag-region>FlowTask - 事项管理器</span>
      </div>
      <div class="window-controls" aria-label="窗口操作">
        <button class="window-control" type="button" aria-label="最小化" @click.stop="minimizeWindow">
          <span aria-hidden="true"></span>
        </button>
        <button class="window-control" type="button" aria-label="最大化" @click.stop="toggleMaximizeWindow">
          <span aria-hidden="true"></span>
        </button>
        <button class="window-control window-control-close" type="button" aria-label="关闭" @click.stop="closeWindow">
          <span aria-hidden="true"></span>
        </button>
      </div>
    </header>

    <div ref="content" class="app-content">
      <aside class="sidebar">
        <section class="brand">
          <div class="brand-mark" aria-hidden="true">
            <img :src="logoUrl" alt="" />
          </div>
          <div>
            <h1 class="brand-title">FlowTask</h1>
            <p class="brand-subtitle">事项管理器</p>
          </div>
          <span class="collapse-mark" aria-hidden="true">‹‹</span>
        </section>

        <button class="create-button" type="button" @click="createTask">
          <span aria-hidden="true">＋</span>
          创建事项
        </button>

        <nav class="nav-list" aria-label="主导航">
          <button
            v-for="item in navigationItems"
            :key="item.key"
            class="nav-item"
            :class="{ active: item.active, disabled: item.disabled }"
            type="button"
            :disabled="item.disabled"
            @click="!item.disabled && setTaskView(item.key)"
          >
            <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
            <span v-if="item.count !== null" class="nav-count">{{ item.count }}</span>
          </button>
        </nav>

        <section class="tag-block">
          <header class="tag-header">
            <span>标签</span>
            <button type="button" aria-label="新增标签" @click="openCreateTag">＋</button>
          </header>
          <div class="tag-list">
            <button class="tag-item all-tags" :class="{ active: selectedTagId === null }" type="button" @click="selectTag(null)">
              <span class="tag-dot slate" aria-hidden="true"></span>
              <span>全部标签</span>
            </button>
            <div v-for="item in tagItems" :key="item.id" class="tag-item-row">
              <button class="tag-item" :class="{ active: selectedTagId === item.id }" type="button" @click="selectTag(item.id)">
                <span class="tag-dot" :class="item.tone" aria-hidden="true"></span>
                <span>{{ item.name }}</span>
              </button>
              <button class="tag-inline-action" type="button" aria-label="编辑标签" @click="openRenameTag(item)">⌕</button>
              <button class="tag-inline-action" type="button" aria-label="删除标签" @click="confirmDeleteTag(item)">×</button>
            </div>
            <p v-if="tagItems.length === 0" class="empty-tags">暂无标签</p>
          </div>
        </section>

        <section class="promo-card" aria-label="自动化提示">
          <div class="promo-logo" aria-hidden="true">
            <img :src="logoUrl" alt="" />
          </div>
          <h2>释放效率，从自动化开始</h2>
          <p>将重复的操作流程化，一键触发</p>
          <button type="button" @click="helpModalVisible = true">了解更多 →</button>
        </section>

        <footer class="sidebar-footer">
          <button type="button" aria-label="设置" @click="openSettings">⚙</button>
          <button type="button" aria-label="帮助" @click="helpModalVisible = true">?</button>
          <button type="button" aria-label="主题" @click="cycleTheme">☼</button>
          <button class="orb-button" type="button" aria-label="状态"></button>
        </footer>
      </aside>

    <section id="task-list-panel" class="middle-panel">
      <button
        v-if="shouldShowTaskListToggle"
        class="task-list-toggle"
        type="button"
        aria-controls="task-list-content"
        :aria-expanded="taskListExpanded"
        :aria-label="taskListToggleLabel"
        @click="toggleTaskListPanel"
      >
        <span class="task-list-toggle-icon" aria-hidden="true">{{ taskListExpanded ? '⌃' : '⌄' }}</span>
        <span>{{ taskListToggleLabel }}</span>
      </button>

      <TaskListPanel
        v-if="!showTemplateCenter"
        ref="taskListPanel"
        v-show="!shouldCollapseTaskList"
        id="task-list-content"
        :tasks="visibleTasks"
        :categories="taskStore.categories"
        :selected-task-id="taskStore.selectedTaskId"
        :disable-list-scrollbar="isStackedLayout"
        @select="selectTask"
        @create="createTask"
        @run="runTask"
        @toggle-enabled="taskStore.updateTaskEnabled"
        @toggle-favorite="toggleTaskFavorite"
      />

      <TemplateCenter
        v-else
        :templates="taskStore.templates"
        :saved-template-count="taskStore.savedTemplates.length"
        @use="createFromTemplate"
        @import="openImportFile"
        @export="exportSavedTemplates"
      />
    </section>

    <section class="workspace">
      <section v-if="showTemplateCenter" class="template-intro">
        <div class="template-intro-copy">
          <span class="template-intro-icon" aria-hidden="true">▱</span>
          <h2>从模板创建事项</h2>
          <p>模板只会生成可编辑的事项草稿，不会直接运行任何动作。保存时仍会执行现有校验，后续运行也会保留风险确认。</p>
        </div>
      </section>

      <TaskDetailPanel
        v-else-if="selectedTask"
        :task="selectedTask"
        :selected-category="selectedCategory"
        :selected-keywords="selectedKeywords"
        :formatted-created-at="formattedCreatedAt"
        :formatted-updated-at="formattedUpdatedAt"
        :action-count="selectedActionCount"
        :action-view="activeActionView"
        :flow-preview="selectedFlowPreview"
        :action-execution-states="actionExecutionStates"
        :task-status-run="selectedTaskStatusRun"
        :current-run="executionStore.currentRun"
        :active-runs="executionStore.activeRuns"
        :logs="executionStore.logs"
        :events="executionStore.events"
        :running-task="runningSelectedTask"
        :run-button-label="runButtonLabel"
        :logs-button-label="logsButtonLabel"
        :show-execution-panel="showExecutionPanel"
        :shortcut-trigger="selectedShortcutTrigger"
        :schedule-trigger="selectedScheduleTrigger"
        :task-shortcut-draft="taskShortcutDraft"
        :global-shortcut-draft="shortcutDraft"
        :shortcut-warning="shortcutWarning"
        :share-options="shareOptions"
        :task-menu-options="taskMenuOptions"
        :is-action-running="isActionRunning"
        @run="runSelectedTask"
        @run-action="runSelectedAction"
        @edit="editSelectedTask"
        @duplicate="duplicateTask(selectedTask)"
        @delete="deleteTask(selectedTask)"
        @save-template="saveSelectedTaskAsTemplate"
        @toggle-favorite="toggleTaskFavorite(selectedTask.id)"
        @toggle-enabled="toggleSelectedTaskEnabled"
        @share-select="handleShareSelect"
        @task-menu-select="handleTaskMenuSelect"
        @update:action-view="activeActionView = $event"
        @update:shortcut-draft="taskShortcutDraft = $event"
        @update:global-shortcut-draft="shortcutDraft = $event"
        @save-shortcut="saveTaskShortcutTrigger"
        @clear-shortcut="clearTaskShortcutTrigger"
        @save-schedule="saveTaskScheduleTrigger"
        @clear-schedule="clearTaskScheduleTrigger"
        @save-global-shortcut="saveShortcut"
        @toggle-execution-panel="toggleExecutionPanel"
      />

      <NEmpty v-else class="empty-state" description="还没有事项">
        <template #extra>
          <button class="create-button compact" type="button" @click="createTask">新增事项</button>
        </template>
      </NEmpty>
    </section>
    </div>

    <TaskWizardDrawer
      v-model:show="wizardVisible"
      :mode="wizardMode"
      :task="wizardTask"
      :all-tasks="taskStore.tasks"
      :categories="taskStore.categories"
      :tags="taskStore.tags"
      :saving="taskStore.saving"
      :initial-step="wizardInitialStep"
      @save="saveTask"
      @duplicate="duplicateTask"
      @delete="deleteTask"
    />

    <TaskImportPreviewModal
      v-model:show="importPreviewVisible"
      :preview="importPreview"
      :confirming="importConfirming"
      @confirm="confirmImport"
    />

    <NModal v-model:show="tagModalVisible" preset="card" class="tag-modal" :title="editingTag ? '编辑标签' : '新增标签'">
      <NInput v-model:value="tagDraftName" placeholder="标签名称" @keyup.enter="saveTag" />
      <template #footer>
        <NSpace justify="end">
          <NButton @click="tagModalVisible = false">取消</NButton>
          <NButton type="primary" @click="saveTag">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <HelpModal
      v-model:show="helpModalVisible"
      :global-shortcut="taskStore.settings.globalShortcut"
      :keybinding-help-groups="keybindingHelpGroups"
    />

    <SettingsModal
      v-model:show="settingsModalVisible"
      v-model:shortcut="settingsShortcutDraft"
      v-model:theme="themeDraft"
      v-model:launch-on-startup="launchOnStartupDraft"
      :theme-options="themeOptions"
      :task-shortcuts="taskShortcutValues"
      @save="saveSettings"
    />
  </main>
</template>

<style scoped>
.main-layout {
  --sidebar-width: 298px;
  --middle-width: clamp(320px, 28vw, 372px);
  --content-padding: 24px;
  --surface: rgba(15, 20, 40, 0.86);
  --surface-soft: rgba(27, 35, 55, 0.72);
  --line: rgba(82, 106, 171, 0.24);
  --line-strong: rgba(67, 109, 255, 0.72);
  --text: #f4f7ff;
  --muted: #8b96b8;
  --blue: #3a8bff;
  --purple: #4d4bff;
  position: relative;
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr);
  height: 100vh;
  min-height: 100vh;
  min-width: 0;
  overflow: hidden;
  background:
    radial-gradient(circle at 74% 12%, rgba(63, 80, 164, 0.18), transparent 34%),
    linear-gradient(135deg, #070d1e 0%, #0b1124 42%, #090f21 100%);
  color: var(--text);
}

:global([data-app-theme="light"]) .main-layout {
  --surface: rgba(255, 255, 255, 0.92);
  --surface-soft: rgba(247, 249, 253, 0.86);
  --line: rgba(70, 91, 140, 0.18);
  --line-strong: rgba(49, 103, 220, 0.58);
  --text: #172033;
  --muted: #66728b;
  background:
    radial-gradient(circle at 74% 12%, rgba(76, 132, 232, 0.12), transparent 34%),
    linear-gradient(135deg, #eef3fb 0%, #f8fbff 46%, #edf4ff 100%);
}

:global([data-app-theme="light"]) .middle-panel,
:global([data-app-theme="light"]) .template-intro {
  background:
    radial-gradient(circle at 38% -8%, rgba(116, 152, 220, 0.12), transparent 38%),
    rgba(255, 255, 255, 0.78);
}

:global([data-app-theme="light"]) .task-name,
:global([data-app-theme="light"]) .brand-title {
  color: #172033;
}

:global([data-app-theme="light"]) .task-item {
  background: rgba(255, 255, 255, 0.72);
}

.app-titlebar {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  height: 56px;
  border-bottom: 1px solid rgba(82, 106, 171, 0.16);
  background: rgba(5, 11, 27, 0.42);
  color: #f4f7ff;
  user-select: none;
}

:global([data-app-theme="light"]) .app-titlebar {
  background: rgba(238, 243, 251, 0.72);
}

.window-brand {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding-left: 30px;
  font-size: 16px;
  font-weight: 700;
}

.window-brand > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global([data-app-theme="light"]) .window-brand {
  color: #172033;
}

.titlebar-mark {
  position: relative;
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  place-items: center;
}

.titlebar-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.window-controls {
  display: flex;
  height: 56px;
  align-items: stretch;
}

.window-control {
  position: relative;
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  border: 0;
  background: transparent;
  color: #d5def7;
  cursor: pointer;
}

.window-control:hover {
  background: rgba(82, 106, 171, 0.18);
}

.window-control span {
  position: relative;
  display: block;
  width: 16px;
  height: 16px;
}

.window-control:first-child span::before {
  position: absolute;
  right: 1px;
  bottom: 3px;
  left: 1px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  content: "";
}

.window-control:nth-child(2) span::before {
  position: absolute;
  inset: 2px;
  border: 2px solid currentColor;
  border-radius: 2px;
  content: "";
}

.window-control-close {
  margin: 8px 14px 8px 0;
  width: 48px;
  height: 40px;
  border-radius: 13px;
  color: #ff6b7b;
}

.window-control-close:hover {
  background: rgba(255, 72, 96, 0.18);
}

.window-control-close span::before,
.window-control-close span::after {
  position: absolute;
  top: 7px;
  left: 1px;
  width: 15px;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  content: "";
}

.window-control-close span::before {
  transform: rotate(45deg);
}

.window-control-close span::after {
  transform: rotate(-45deg);
}

.ambient {
  position: absolute;
  pointer-events: none;
}

.ambient-one {
  right: -16%;
  bottom: -28%;
  width: 780px;
  height: 520px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(59, 129, 255, 0.4), rgba(88, 67, 255, 0.2) 38%, transparent 68%);
  filter: blur(26px);
}

.ambient-two {
  top: -160px;
  left: 300px;
  width: 390px;
  height: 280px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(61, 93, 160, 0.22), transparent 72%);
  filter: blur(10px);
}

.light-arc {
  position: absolute;
  right: -30px;
  bottom: -62px;
  width: 530px;
  height: 170px;
  pointer-events: none;
  border-top: 1px solid rgba(126, 171, 255, 0.8);
  border-radius: 50%;
  transform: rotate(-8deg);
}

.light-arc-two {
  right: -4px;
  bottom: -40px;
  width: 520px;
  border-top-color: rgba(135, 72, 255, 0.85);
  box-shadow: 16px -16px 28px rgba(118, 65, 255, 0.45);
}

.app-content {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: var(--sidebar-width) var(--middle-width) minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.sidebar,
.middle-panel,
.workspace {
  position: relative;
  z-index: 1;
  min-height: 0;
}

.sidebar {
  display: grid;
  grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
  min-width: 0;
  overflow: hidden;
  padding: 32px 22px 24px;
}

.brand {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.brand-mark,
.promo-logo {
  position: relative;
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
}

.brand-mark img,
.promo-logo img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 8px 14px rgba(35, 101, 255, 0.28));
  pointer-events: none;
}

.brand-title,
.brand-subtitle,
.promo-card h2,
.promo-card p {
  margin: 0;
}

.brand-title {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.1;
}

.brand-subtitle {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12px;
}

.collapse-mark {
  color: #b6c1df;
  font-size: 26px;
  letter-spacing: -7px;
}

.create-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 46px;
  margin-top: 42px;
  border: 0;
  border-radius: 13px;
  background: linear-gradient(135deg, #3a9bff 0%, #4e4dff 100%);
  box-shadow: 0 14px 32px rgba(53, 91, 255, 0.36);
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
}

.create-button.compact {
  min-width: 140px;
  margin-top: 0;
}

.create-button span {
  font-size: 24px;
  font-weight: 400;
  line-height: 1;
}

.nav-list {
  display: grid;
  gap: 10px;
  margin-top: 38px;
}

.nav-item {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  height: 49px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: #b6c1df;
  cursor: pointer;
  padding: 0 15px;
  text-align: left;
}

.nav-item.disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.nav-item.active {
  border-color: rgba(63, 104, 255, 0.44);
  background: linear-gradient(135deg, rgba(32, 60, 132, 0.48), rgba(37, 32, 112, 0.46));
  color: #f4f7ff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 28px rgba(21, 50, 129, 0.18);
  font-weight: 700;
}

.nav-icon {
  color: #c7d3ee;
  font-size: 19px;
}

.nav-count {
  color: #7f8aaa;
  font-size: 12px;
}

.tag-block {
  margin-top: 28px;
}

.tag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  color: #65708f;
  font-size: 13px;
}

.tag-header button {
  border: 0;
  background: transparent;
  color: #9faad0;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
}

.tag-list {
  display: grid;
  gap: 10px;
  max-height: min(24vh, 220px);
  margin-top: 20px;
  overflow-y: auto;
  padding: 0 8px;
}

.tag-item {
  display: grid;
  grid-template-columns: 11px minmax(0, 1fr);
  align-items: center;
  width: 100%;
  gap: 14px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: #9faad0;
  cursor: pointer;
  font-size: 13px;
  padding: 7px 8px;
  text-align: left;
}

.tag-item.active {
  border-color: rgba(82, 106, 171, 0.2);
  background: rgba(27, 35, 55, 0.54);
  color: #f4f7ff;
}

.tag-item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 26px 26px;
  align-items: center;
  gap: 4px;
}

.tag-inline-action {
  display: grid;
  height: 26px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #65708f;
  cursor: pointer;
  font-size: 14px;
}

.tag-inline-action:hover {
  background: rgba(82, 106, 171, 0.16);
  color: #dce9ff;
}

.empty-tags {
  margin: 4px 8px 0;
  color: #65708f;
  font-size: 12px;
}

.tag-dot {
  width: 11px;
  height: 11px;
  border-radius: 4px;
  background: #3a8bff;
}

.tag-dot.green {
  background: #29d6ad;
}

.tag-dot.amber {
  background: #ffb83e;
}

.tag-dot.purple {
  background: #ad66ff;
}

.tag-dot.slate {
  background: #8b96b8;
}

.promo-card {
  align-self: end;
  min-height: 228px;
  border: 1px solid rgba(82, 106, 171, 0.28);
  border-radius: 13px;
  background:
    radial-gradient(circle at 16% 10%, rgba(76, 89, 255, 0.5), transparent 36%),
    radial-gradient(circle at 82% 0%, rgba(34, 139, 255, 0.28), transparent 48%),
    rgba(16, 33, 68, 0.7);
  padding: 30px 18px 18px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.promo-logo {
  transform: scale(0.78);
  transform-origin: left top;
}

.promo-card h2 {
  margin-top: 26px;
  font-size: 15px;
}

.promo-card p {
  margin-top: 12px;
  color: #9faad0;
  font-size: 12px;
}

.promo-card button {
  height: 42px;
  margin-top: 18px;
  border: 0;
  border-radius: 10px;
  background: rgba(42, 54, 88, 0.86);
  color: #f4f7ff;
  cursor: pointer;
  padding: 0 18px;
  font-weight: 700;
}

.sidebar-footer {
  display: grid;
  grid-template-columns: repeat(3, 40px) minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  margin-top: 28px;
}

.sidebar-footer button {
  border: 0;
  background: transparent;
  color: #8290b7;
  cursor: pointer;
}

.sidebar-footer button {
  height: 32px;
  font-size: 18px;
}

.orb-button {
  justify-self: end;
  width: 60px;
  height: 60px !important;
  border-radius: 50%;
  background:
    radial-gradient(circle at 60% 42%, #63c8ff 0 10%, #534bff 11% 34%, #1c2a58 35% 100%) !important;
  box-shadow: 0 12px 28px rgba(33, 64, 169, 0.3);
}

.middle-panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  padding: 44px 22px 34px;
  overflow: hidden;
  border-left: 1px solid rgba(82, 106, 171, 0.08);
  border-radius: 36px 0 0 36px;
  background:
    radial-gradient(circle at 38% -8%, rgba(71, 82, 140, 0.2), transparent 38%),
    rgba(13, 18, 35, 0.68);
}

.workspace {
  display: grid;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 32px var(--content-padding) 32px 0;
}

.task-list-toggle {
  display: none;
  align-items: center;
  justify-self: start;
  gap: 8px;
  min-width: 0;
  height: 34px;
  border: 1px solid rgba(82, 106, 171, 0.28);
  border-radius: 10px;
  background: rgba(27, 35, 55, 0.72);
  color: #dce9ff;
  cursor: pointer;
  padding: 0 12px 0 10px;
  font-size: 13px;
  font-weight: 700;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.task-list-toggle:hover {
  border-color: rgba(67, 109, 255, 0.58);
  background: rgba(40, 54, 92, 0.82);
}

.task-list-toggle:focus-visible {
  outline: 2px solid rgba(58, 139, 255, 0.74);
  outline-offset: 2px;
}

.task-list-toggle-icon {
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 6px;
  background: rgba(63, 82, 159, 0.62);
  color: #f4f7ff;
  font-size: 16px;
  line-height: 1;
}

.template-intro {
  display: grid;
  align-content: center;
  gap: 30px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid rgba(82, 106, 171, 0.28);
  border-radius: 24px;
  background:
    radial-gradient(circle at 100% 100%, rgba(63, 65, 188, 0.26), transparent 36%),
    radial-gradient(circle at 14% 0%, rgba(51, 92, 178, 0.18), transparent 42%),
    rgba(14, 19, 37, 0.84);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 32px 80px rgba(0, 0, 0, 0.22);
  padding: 42px 36px 36px;
}

.template-intro-copy {
  display: grid;
  justify-items: start;
  gap: 16px;
  max-width: 560px;
}

.template-intro-icon {
  display: grid;
  width: 72px;
  height: 72px;
  place-items: center;
  border: 1px solid rgba(81, 119, 255, 0.42);
  border-radius: 18px;
  background: linear-gradient(145deg, #2442a0, #162555);
  color: #dce9ff;
  font-size: 32px;
}

.template-intro-copy h2,
.template-intro-copy p {
  margin: 0;
}

.template-intro-copy h2 {
  color: #f4f7ff;
  font-size: 24px;
  font-weight: 800;
}

.template-intro-copy p {
  color: #9faad0;
  font-size: 14px;
  line-height: 1.7;
}

.empty-state {
  --n-text-color: #8b96b8 !important;
  --n-icon-color: #445071 !important;
}

.empty-state {
  align-self: center;
}

:deep(.n-card) {
  background: rgba(27, 35, 55, 0.86);
  color: #f4f7ff;
}

:deep(.n-card-header),
:deep(.n-thing-header__title) {
  color: #f4f7ff;
}

:deep(.n-thing-main__description),
:deep(.n-timeline-item-content__content) {
  color: #9faad0;
}

:deep(.tag-modal) {
  max-width: 420px;
}

@media (max-width: 1279px) {
  .main-layout {
    --sidebar-width: 76px;
    --middle-width: clamp(300px, 34vw, 336px);
    --content-padding: 18px;
  }

  .sidebar {
    justify-items: center;
    padding: 22px 12px 18px;
  }

  .brand {
    grid-template-columns: 44px;
    justify-items: center;
  }

  .brand > div:not(.brand-mark),
  .collapse-mark,
  .nav-item span:not(.nav-icon),
  .tag-block,
  .promo-card,
  .orb-button {
    display: none;
  }

  .nav-list {
    margin-top: 30px;
  }

  .create-button:not(.compact) {
    width: 48px;
    height: 48px;
    margin-top: 26px;
    border-radius: 12px;
    font-size: 0;
    gap: 0;
    padding: 0;
  }

  .create-button:not(.compact) span {
    font-size: 24px;
  }

  .nav-item {
    grid-template-columns: 1fr;
    width: 48px;
    height: 48px;
    justify-items: center;
    padding: 0;
  }

  .nav-icon {
    font-size: 20px;
  }

  .sidebar-footer {
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 10px;
    margin-top: 18px;
  }

  .middle-panel {
    padding: 30px 16px 24px;
    border-radius: 24px 0 0 24px;
  }

  .template-intro {
    gap: 24px;
    padding: 30px 22px;
  }
}

@media (max-width: 960px) {
  .main-layout {
    --sidebar-width: 100%;
    --middle-width: 100%;
  }

  .app-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .sidebar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
  }

  .brand {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .brand > div:not(.brand-mark) {
    display: block;
  }

  .nav-list,
  .sidebar-footer {
    display: flex;
    margin-top: 0;
  }

  .middle-panel,
  .workspace {
    padding: 16px;
  }

  .workspace {
    align-self: start;
    width: 100%;
    flex: 0 0 auto;
    height: auto;
    min-height: auto;
  }

  .middle-panel {
    display: flex;
    width: 100%;
    flex: 0 0 auto;
    flex-direction: column;
    gap: 12px;
    align-self: start;
    height: auto;
    min-height: auto;
    overflow: visible;
    border-radius: 0;
  }

  .task-list-toggle {
    display: inline-flex;
  }

  .main-layout.stacked-task-list-collapsed .middle-panel {
    padding-bottom: 0;
  }

  .workspace,
  .template-intro {
    overflow: visible;
  }
}

@media (max-width: 640px) {
  .app-titlebar {
    height: auto;
    min-height: 56px;
  }

  .window-brand {
    padding-left: 14px;
    font-size: 14px;
  }

  .titlebar-mark {
    width: 28px;
    height: 28px;
    flex-basis: 28px;
  }

  .window-control {
    width: 44px;
  }

  .window-control-close {
    width: 42px;
    margin-right: 8px;
  }

  .sidebar {
    flex-wrap: wrap;
    gap: 12px;
  }

  .template-intro {
    border-radius: 18px;
    padding: 20px 16px;
  }
}
</style>
