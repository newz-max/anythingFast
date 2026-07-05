<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { NDropdown, NModal, useDialog, useMessage } from 'naive-ui'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { DropdownOption } from 'naive-ui'
import TaskListPanel from '@/components/tasks/TaskListPanel.vue'
import TaskImportPreviewModal from '@/components/tasks/TaskImportPreviewModal.vue'
import TaskWizardDrawer from '@/components/tasks/TaskWizardDrawer.vue'
import FlowPreviewGraph from '@/components/tasks/FlowPreviewGraph.vue'
import ScheduleTriggerCard from '@/components/tasks/ScheduleTriggerCard.vue'
import ExecutionProgress from '@/components/execution/ExecutionProgress.vue'
import ExecutionStatusStrip from '@/components/execution/ExecutionStatusStrip.vue'
import logoUrl from '@/assets/logo.png'
import { createTaskDraft, cloneTask } from '@/domain/taskFactory'
import { createTaskFromTemplate, deriveTemplateRisk } from '@/domain/taskTemplates'
import { getTasksForView, type TaskView } from '@/domain/taskViews'
import { describeAction, getActionTypeLabel } from '@/domain/actionPresentation'
import { deriveActionExecutionStates, isRunActive, statusLabel } from '@/domain/executionPresentation'
import { deriveFlowExecutionStates, deriveFlowPreviewModel } from '@/domain/flowPreview'
import { useTaskStore } from '@/stores/taskStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useTaskExecution } from '@/composables/useTaskExecution'
import { tauriApi } from '@/api/tauri'
import { autostartApi } from '@/api/autostart'
import { listenShortcutStatusEvents } from '@/api/events'
import { getErrorMessage, logDevError } from '@/utils/errors'
import { open, save } from '@tauri-apps/plugin-dialog'
import type {
  ActionType,
  AppTheme,
  ImportPreview,
  ScheduleTaskTrigger,
  ShortcutStatus,
  ShortcutTaskTrigger,
  TaskAction,
  TaskItem,
  TaskTag,
  TaskTemplate,
  TaskTrigger,
  RiskLevel
} from '@/types/domain'
import type { TaskWizardMode } from '@/composables/useTaskWizardDraft'

const taskStore = useTaskStore()
const executionStore = useExecutionStore()
const { execute, executeAction, running } = useTaskExecution()
const message = useMessage()
const dialog = useDialog()
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
const importPreviewVisible = shallowRef(false)
const importPreview = shallowRef<ImportPreview | null>(null)
const importFilePath = shallowRef('')
const importConfirming = shallowRef(false)
const isStackedLayout = shallowRef(false)
const taskListExpanded = shallowRef(false)
const layoutRef = useTemplateRef<HTMLElement>('layout')
const contentRef = useTemplateRef<HTMLElement>('content')
let desktopMediaQuery: MediaQueryList | null = null
let stackedLayoutMediaQuery: MediaQueryList | null = null

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
const templateCountLabel = computed(() => `${taskStore.templates.length} 个模板`)
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
const themeOptions = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' }
]
const tagItems = computed(() => taskStore.tags.map((tag, index) => ({ ...tag, tone: tagTone(index) })))
const showExecutionPanel = computed(() => showLogs.value || autoShowExecution.value)
const actionExecutionStates = computed(() => deriveActionExecutionStates(executionStore.events, executionStore.currentRun))
const flowExecutionStates = computed(() => {
  if (!selectedTask.value) return {}
  return deriveFlowExecutionStates({
    taskId: selectedTask.value.id,
    events: executionStore.events,
    currentRun: executionStore.currentRun,
    latestSummary: executionStore.lastSummary
  })
})
const selectedFlowPreview = computed(() => {
  if (!selectedTask.value) return { nodes: [], edges: [] }
  return deriveFlowPreviewModel(selectedTask.value, flowExecutionStates.value)
})
const runningSelectedTask = computed(() => Boolean(selectedTask.value && executionStore.runningTaskId === selectedTask.value.id))
const runButtonLabel = computed(() => {
  const run = executionStore.currentRun
  if (!running.value) return '运行'
  if (runningSelectedTask.value) return run?.status ? statusLabel(run.status) : '执行中'
  return '等待中'
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

onMounted(async () => {
  setupResponsiveScrollReset()
  shortcutDraft.value = taskStore.settings.globalShortcut
  settingsShortcutDraft.value = taskStore.settings.globalShortcut
  themeDraft.value = taskStore.settings.theme
  launchOnStartupDraft.value = taskStore.settings.launchOnStartup
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
})

onUnmounted(() => {
  desktopMediaQuery?.removeEventListener('change', handleDesktopBreakpointChange)
  stackedLayoutMediaQuery?.removeEventListener('change', handleStackedLayoutBreakpointChange)
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

async function exportTaskBundle(taskIds: string[]) {
  if (!isTauriRuntime()) {
    message.warning('导出文件需要在桌面应用中使用')
    return
  }
  if (taskIds.length === 0) {
    message.warning('没有可导出的事项')
    return
  }
  const targetPath = await save({
    defaultPath: `anything-fast-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (!targetPath) return
  await tauriApi.saveTaskBundleFile({ taskIds, templateIds: [] }, targetPath)
  message.success('已导出 JSON')
}

async function exportSavedTemplates() {
  if (!isTauriRuntime()) {
    message.warning('导出文件需要在桌面应用中使用')
    return
  }
  if (taskStore.savedTemplates.length === 0) {
    message.warning('没有可导出的已保存模板')
    return
  }
  const targetPath = await save({
    defaultPath: `anything-fast-templates-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (!targetPath) return
  await tauriApi.saveTaskBundleFile(
    { taskIds: [], templateIds: taskStore.savedTemplates.map((template) => template.id) },
    targetPath
  )
  message.success('已导出模板 JSON')
}

async function openImportFile() {
  if (!isTauriRuntime()) {
    message.warning('导入文件需要在桌面应用中使用')
    return
  }
  const selected = await open({
    multiple: false,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })
  if (!selected || Array.isArray(selected)) return
  importFilePath.value = selected
  importPreview.value = await tauriApi.previewImportBundleFile(selected)
  importPreviewVisible.value = true
}

async function confirmImport() {
  if (!importFilePath.value) return
  importConfirming.value = true
  try {
    const nextConfig = await tauriApi.confirmImportBundleFile(importFilePath.value)
    taskStore.replaceConfig(nextConfig)
    importPreviewVisible.value = false
    importPreview.value = null
    importFilePath.value = ''
    message.success('已导入配置')
  } catch (err) {
    reportUiError('Confirm import failed', err)
  } finally {
    importConfirming.value = false
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

function actionExecutionClass(action: TaskAction) {
  const status = actionExecutionStates.value[action.id]?.status
  return {
    disabled: !action.enabled,
    'action-running': status === 'running',
    'action-success': status === 'success',
    'action-failed': status === 'failed',
    'action-skipped': status === 'skipped',
    'action-cancelled': status === 'cancelled'
  }
}

function actionExecutionState(action: TaskAction) {
  return actionExecutionStates.value[action.id] || null
}

function isActionRunning(action: TaskAction) {
  return actionExecutionStates.value[action.id]?.status === 'running' && isRunActive(executionStore.currentRun)
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

function templateMeta(template: TaskTemplate) {
  const types = Array.from(new Set(template.actions.map((action) => action.type))).map(getActionTypeLabel)
  return `${template.category || '未分类'} · ${template.actions.length} 个动作 · ${types.join('、') || '无动作'} · ${riskLabel(deriveTemplateRisk(template))}`
}

function riskLabel(risk: RiskLevel) {
  if (risk === 'high') return '高风险'
  if (risk === 'medium') return '中风险'
  return '低风险'
}

function actionIcon(type: ActionType) {
  const icons: Record<ActionType, string> = {
    openProgram: '</>',
    openUrl: '◎',
    openFile: '▤',
    openFolder: '▰',
    runCommand: '>_',
    delay: '◷'
  }
  return icons[type]
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

function actionTypeClass(action: TaskAction) {
  return `action-icon-${action.type}`
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

      <section v-else class="template-center" aria-label="模板中心">
        <header class="template-header">
          <span>模板中心</span>
          <small>{{ templateCountLabel }}</small>
          <div class="template-header-actions">
            <button class="template-use-button" type="button" @click="openImportFile">导入配置</button>
            <button class="template-use-button" type="button" @click="exportSavedTemplates">导出模板</button>
          </div>
        </header>
        <div class="template-list">
          <article v-for="template in taskStore.templates" :key="template.id" class="template-card">
            <div class="template-card-main">
              <strong>{{ template.name }}</strong>
              <span>{{ template.description }}</span>
              <small>{{ templateMeta(template) }}</small>
            </div>
            <button class="template-use-button" type="button" @click="createFromTemplate(template)">使用</button>
          </article>
          <NEmpty v-if="taskStore.templates.length === 0" description="没有可用模板" />
        </div>
      </section>
    </section>

    <section class="workspace">
      <section v-if="showTemplateCenter" class="template-intro detail-panel">
        <div class="template-intro-copy">
          <span class="template-intro-icon" aria-hidden="true">▱</span>
          <h2>从模板创建事项</h2>
          <p>模板只会生成可编辑的事项草稿，不会直接运行任何动作。保存时仍会执行现有校验，后续运行也会保留风险确认。</p>
        </div>
      </section>

      <section v-else-if="selectedTask" class="detail-panel">
        <header class="detail-header">
          <div class="detail-hero">
            <div class="hero-icon" :class="selectedCategory">
              <span>{{ selectedTask.name.slice(0, 1) || '事' }}</span>
            </div>
            <div class="hero-copy">
              <div class="title-row">
                <h2>{{ selectedTask.name || '未命名事项' }}</h2>
                <button class="ghost-icon-button" type="button" aria-label="编辑事项" @click="editSelectedTask()">⌕</button>
              </div>
              <p>{{ selectedTask.description || '打开常用工具、项目文件夹和网页，快速进入工作状态' }}</p>
              <span class="category-badge">{{ selectedCategory }}</span>
              <div class="meta-line">
                <span>创建于 {{ formattedCreatedAt }}</span>
                <span>最后更新 {{ formattedUpdatedAt }}</span>
                <span>关键词 {{ selectedKeywords }}</span>
              </div>
            </div>
          </div>

          <div class="detail-actions">
            <button class="run-button" type="button" :disabled="running" @click="runSelectedTask">
              <NSpin v-if="runningSelectedTask" size="small" />
              <span v-else aria-hidden="true">▶</span>
              {{ runButtonLabel }}
            </button>
            <NDropdown trigger="click" :options="shareOptions" @select="handleShareSelect">
              <button class="icon-button" type="button" aria-label="分享">⌘</button>
            </NDropdown>
            <button
              class="icon-button favorite-detail-button"
              :class="{ active: selectedTask.favorite }"
              type="button"
              :aria-label="selectedTask.favorite ? '取消收藏' : '收藏'"
              @click="toggleTaskFavorite(selectedTask.id)"
            >
              {{ selectedTask.favorite ? '★' : '☆' }}
            </button>
            <NDropdown trigger="click" :options="taskMenuOptions" @select="handleTaskMenuSelect">
              <button class="icon-button" type="button" aria-label="更多">•••</button>
            </NDropdown>
          </div>
        </header>

        <ExecutionStatusStrip
          v-if="executionStore.currentRun"
          class="detail-status-strip"
          :current-run="executionStore.currentRun"
        />

        <section class="actions-section">
          <header class="section-title-row">
            <div class="section-title">
              <h3>{{ activeActionView === 'list' ? '动作列表' : '流程预览' }}</h3>
              <span>{{ selectedActionCount }}</span>
            </div>
            <div class="action-view-controls">
              <div class="view-switch" role="tablist" aria-label="动作视图">
                <button
                  class="view-switch-button"
                  :class="{ active: activeActionView === 'list' }"
                  type="button"
                  role="tab"
                  :aria-selected="activeActionView === 'list'"
                  @click="activeActionView = 'list'"
                >
                  列表
                </button>
                <button
                  class="view-switch-button"
                  :class="{ active: activeActionView === 'flow' }"
                  type="button"
                  role="tab"
                  :aria-selected="activeActionView === 'flow'"
                  @click="activeActionView = 'flow'"
                >
                  流程
                </button>
              </div>
              <button v-if="activeActionView === 'list'" class="add-action-button" type="button" @click="editSelectedTask(2)">
                <span aria-hidden="true">＋</span>
                添加动作
              </button>
            </div>
          </header>

          <FlowPreviewGraph v-if="activeActionView === 'flow'" :model="selectedFlowPreview" />

          <div v-else-if="selectedTask.actions.length > 0" class="action-list">
            <article
              v-for="(action, index) in selectedTask.actions"
              :key="action.id"
              class="action-row"
              :class="actionExecutionClass(action)"
            >
              <span class="drag-dots" aria-hidden="true">⠿</span>
              <span class="action-index">{{ index + 1 }}</span>
              <span class="action-icon" :class="actionTypeClass(action)">{{ actionIcon(action.type) }}</span>
              <span class="action-name">{{ action.name || getActionTypeLabel(action.type) }}</span>
              <span class="action-detail">{{ describeAction(action) }}</span>
              <NTag
                v-if="actionExecutionState(action)"
                class="action-state-tag"
                size="small"
                :type="actionExecutionState(action)?.type"
              >
                {{ actionExecutionState(action)?.label }}
              </NTag>
              <button
                class="action-play"
                type="button"
                :disabled="running || !selectedTask.enabled || !action.enabled"
                aria-label="单动作运行"
                @click="runSelectedAction(action)"
              >
                <NSpin v-if="isActionRunning(action)" size="small" />
                <span v-else>▶</span>
              </button>
              <span class="row-more" aria-hidden="true">•••</span>
            </article>
          </div>

          <NEmpty v-else class="empty-actions" description="还没有动作">
            <template #extra>
              <button class="add-action-button" type="button" @click="editSelectedTask(2)">添加动作</button>
            </template>
          </NEmpty>
        </section>

        <section class="trigger-section">
          <h3>触发设置</h3>
          <article class="trigger-card">
            <span class="trigger-icon" aria-hidden="true">◷</span>
            <span class="trigger-copy">
              <strong>手动触发</strong>
              <small>需要手动点击运行</small>
            </span>
            <span class="trigger-state">已启用</span>
          </article>
          <article class="trigger-card shortcut-trigger-card">
            <span class="trigger-icon" aria-hidden="true">⌘</span>
            <span class="trigger-copy">
              <strong>事项快捷键</strong>
              <small>{{ selectedShortcutTrigger ? selectedShortcutTrigger.shortcut : '未设置' }}</small>
            </span>
            <NInputGroup class="task-shortcut-group">
              <NInput v-model:value="taskShortcutDraft" size="small" placeholder="例如 Ctrl+Alt+P" />
              <NButton size="small" @click="saveTaskShortcutTrigger">保存</NButton>
              <NButton size="small" secondary @click="clearTaskShortcutTrigger">移除</NButton>
            </NInputGroup>
          </article>
          <ScheduleTriggerCard
            :trigger="selectedScheduleTrigger"
            @save="saveTaskScheduleTrigger"
            @remove="clearTaskScheduleTrigger"
          />
        </section>

        <section class="utility-strip">
          <div class="shortcut-card">
            <span>默认快捷键</span>
            <NInputGroup class="shortcut-group">
              <NInput v-model:value="shortcutDraft" size="small" placeholder="Alt+Space" />
              <NButton size="small" @click="saveShortcut">保存</NButton>
            </NInputGroup>
            <p v-if="shortcutWarning" class="shortcut-warning">{{ shortcutWarning }}</p>
          </div>
          <button class="logs-button" type="button" @click="toggleExecutionPanel">
            {{ logsButtonLabel }}
          </button>
          <NSwitch :value="selectedTask.enabled" @update:value="toggleSelectedTaskEnabled" />
        </section>

        <ExecutionProgress
          v-if="showExecutionPanel"
          class="logs"
          :current-run="executionStore.currentRun"
          :logs="executionStore.logs"
          :events="executionStore.events"
        />
      </section>

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

    <NModal v-model:show="helpModalVisible" preset="card" class="help-modal" title="帮助">
      <div class="help-content">
        <p>事项由基础信息和动作序列组成，可以手动运行，也可以配置事项快捷键触发。</p>
        <p>动作支持打开程序、URL、文件、文件夹、执行命令和延时等待；本地动作始终通过 Tauri 后端执行。</p>
        <p>包含高风险命令或首次执行命令事项时，需要二次确认。执行结果会写入执行日志。</p>
      </div>
    </NModal>

    <NModal v-model:show="settingsModalVisible" preset="card" class="settings-modal" title="全局设置">
      <NForm label-placement="top">
        <NFormItem label="全局快捷键">
          <NInput v-model:value="settingsShortcutDraft" placeholder="Alt+Space" />
        </NFormItem>
        <NFormItem label="主题">
          <NSelect v-model:value="themeDraft" :options="themeOptions" />
        </NFormItem>
        <NFormItem label="开机自启动">
          <NSwitch v-model:value="launchOnStartupDraft" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="settingsModalVisible = false">取消</NButton>
          <NButton type="primary" @click="saveSettings">保存</NButton>
        </NSpace>
      </template>
    </NModal>
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
:global([data-app-theme="light"]) .detail-panel {
  background:
    radial-gradient(circle at 38% -8%, rgba(116, 152, 220, 0.12), transparent 38%),
    rgba(255, 255, 255, 0.78);
}

:global([data-app-theme="light"]) .task-name,
:global([data-app-theme="light"]) .section-title h3,
:global([data-app-theme="light"]) .trigger-section h3,
:global([data-app-theme="light"]) .title-row h2,
:global([data-app-theme="light"]) .template-card-main strong,
:global([data-app-theme="light"]) .template-header span,
:global([data-app-theme="light"]) .brand-title {
  color: #172033;
}

:global([data-app-theme="light"]) .task-item,
:global([data-app-theme="light"]) .action-row,
:global([data-app-theme="light"]) .trigger-card,
:global([data-app-theme="light"]) .template-card {
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
.promo-card p,
.section-title h3,
.trigger-section h3 {
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

.sidebar-footer button,
.icon-button,
.ghost-icon-button,
.logs-button {
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

.template-center {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
}

.template-header {
  display: grid;
  gap: 6px;
  padding: 4px 2px 0;
}

.template-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.template-header span {
  color: #f4f7ff;
  font-size: 18px;
  font-weight: 800;
}

.template-header small {
  color: #8b96b8;
  font-size: 12px;
}

.template-list {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}

.template-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  border: 1px solid rgba(82, 106, 171, 0.18);
  border-radius: 12px;
  background: rgba(27, 35, 55, 0.68);
  padding: 16px;
}

.template-card-main {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.template-card-main strong {
  color: #f4f7ff;
  font-size: 15px;
}

.template-card-main span,
.template-card-main small {
  color: #9faad0;
  font-size: 12px;
  line-height: 1.5;
}

.template-use-button {
  height: 32px;
  border: 1px solid rgba(82, 106, 171, 0.3);
  border-radius: 9px;
  background: rgba(63, 82, 159, 0.58);
  color: #f4f7ff;
  cursor: pointer;
  padding: 0 14px;
  font-weight: 700;
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

.detail-panel {
  display: grid;
  align-content: start;
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

.template-intro {
  align-content: center;
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

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  min-width: 0;
}

.detail-hero {
  display: flex;
  flex: 1 1 420px;
  min-width: 0;
  gap: 26px;
}

.hero-icon {
  display: grid;
  width: 100px;
  height: 100px;
  flex: 0 0 100px;
  place-items: center;
  border: 1px solid rgba(81, 119, 255, 0.42);
  border-radius: 22px;
  background: linear-gradient(145deg, #2442a0, #162555);
  color: #dce9ff;
  font-size: 42px;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 18px 36px rgba(24, 52, 136, 0.24);
}

.hero-copy {
  min-width: 0;
  padding-top: 8px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.title-row h2 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: #f4f7ff;
  font-size: 23px;
  font-weight: 800;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ghost-icon-button {
  font-size: 17px;
}

.hero-copy p {
  display: -webkit-box;
  margin: 16px 0 10px;
  overflow: hidden;
  color: var(--muted);
  font-size: 14px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.category-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  background: rgba(58, 139, 255, 0.13);
  padding: 5px 10px;
  color: #58a2ff;
  font-size: 12px;
}

.category-badge::before {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  content: "";
}

.meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-top: 20px;
  color: #727e9f;
  font-size: 12px;
}

.meta-line span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-actions {
  display: flex;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 18px;
  min-width: 0;
  padding-top: 0;
}

.run-button,
.add-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #3a8bff, #4d4bff);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  box-shadow: 0 14px 32px rgba(53, 91, 255, 0.32);
}

.run-button {
  width: 120px;
  height: 43px;
  font-size: 15px;
}

.run-button:disabled {
  cursor: progress;
  opacity: 0.68;
}

.icon-button {
  width: 26px;
  height: 34px;
  color: #aeb9d8;
  font-size: 18px;
}

.favorite-detail-button.active {
  color: #ffd76a;
}

.actions-section {
  display: grid;
  gap: 18px;
}

.detail-status-strip {
  width: 100%;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-title {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.section-title h3,
.trigger-section h3 {
  color: #f4f7ff;
  font-size: 18px;
  font-weight: 800;
}

.section-title span {
  display: grid;
  min-width: 34px;
  height: 23px;
  place-items: center;
  border-radius: 999px;
  background: rgba(94, 110, 148, 0.26);
  color: #c0c9e6;
  font-size: 13px;
  font-weight: 700;
}

.action-view-controls {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.view-switch {
  display: inline-flex;
  gap: 4px;
  border: 1px solid rgba(82, 106, 171, 0.18);
  border-radius: 10px;
  background: rgba(27, 35, 55, 0.72);
  padding: 4px;
}

.view-switch-button {
  min-width: 56px;
  height: 32px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: #9aa7c9;
  font-weight: 700;
  cursor: pointer;
}

.view-switch-button.active {
  background: rgba(65, 89, 175, 0.6);
  color: #f4f7ff;
}

.add-action-button {
  height: 40px;
  padding: 0 18px;
}

.action-list {
  display: grid;
  gap: 7px;
}

.action-row {
  display: grid;
  grid-template-columns: 20px 24px 46px minmax(110px, 145px) minmax(0, 1fr) auto 42px 34px;
  align-items: center;
  gap: 14px;
  min-height: 70px;
  border: 1px solid rgba(82, 106, 171, 0.11);
  border-radius: 10px;
  background: rgba(27, 35, 55, 0.72);
  padding: 0 18px;
}

.action-row.disabled {
  opacity: 0.5;
}

.action-row.action-running {
  border-color: rgba(77, 135, 255, 0.48);
  background:
    radial-gradient(circle at 100% 0%, rgba(77, 135, 255, 0.18), transparent 42%),
    rgba(27, 35, 55, 0.78);
}

.action-row.action-success {
  border-color: rgba(34, 197, 94, 0.28);
}

.action-row.action-failed {
  border-color: rgba(239, 68, 68, 0.38);
}

.action-row.action-skipped,
.action-row.action-cancelled {
  border-color: rgba(245, 158, 11, 0.3);
}

.drag-dots,
.action-index,
.row-more {
  color: #9aa7c9;
  font-size: 15px;
}

.action-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 9px;
  background: rgba(65, 89, 175, 0.42);
  color: #92c2ff;
  font-size: 18px;
  font-weight: 800;
}

.action-icon-openUrl {
  font-size: 26px;
}

.action-icon-openFolder,
.action-icon-openFile {
  color: #ffc65c;
}

.action-icon-runCommand {
  color: #a794ff;
}

.action-name,
.action-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-name {
  color: #f4f7ff;
  font-size: 14px;
  font-weight: 700;
}

.action-detail {
  color: #b3bddb;
  font-size: 14px;
}

.action-state-tag {
  justify-self: end;
  white-space: nowrap;
}

.action-play {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border: 0;
  border-radius: 9px;
  background: rgba(63, 82, 159, 0.58);
  color: #dce9ff;
  font-size: 11px;
  cursor: pointer;
}

.action-play:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.trigger-section {
  display: grid;
  gap: 16px;
}

.trigger-card {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 94px;
  border: 1px solid rgba(82, 106, 171, 0.14);
  border-radius: 12px;
  background:
    radial-gradient(circle at 80% 20%, rgba(73, 67, 175, 0.24), transparent 42%),
    rgba(27, 35, 55, 0.72);
  padding: 0 20px;
}

.shortcut-trigger-card {
  grid-template-columns: 48px minmax(0, 1fr) minmax(0, 420px);
}

.trigger-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(93, 117, 174, 0.42);
  border-radius: 12px;
  background: rgba(64, 81, 149, 0.52);
  color: #dce9ff;
  font-size: 24px;
}

.trigger-copy {
  display: grid;
  gap: 4px;
}

.trigger-copy strong {
  color: #f4f7ff;
  font-size: 15px;
}

.trigger-copy small,
.trigger-state {
  color: #8b96b8;
}

.trigger-state {
  justify-self: end;
  font-size: 12px;
}

.task-shortcut-group {
  width: 100%;
  min-width: 0;
  justify-self: end;
  max-width: 420px;
}

.utility-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: end;
  gap: 16px;
  min-width: 0;
}

.shortcut-card {
  display: grid;
  gap: 8px;
  color: #8b96b8;
  font-size: 12px;
}

.shortcut-group {
  width: 100%;
  max-width: 320px;
}

.shortcut-warning {
  max-width: 420px;
  margin: 0;
  color: #ffb15c;
  line-height: 1.5;
}

.logs-button {
  height: 34px;
  border: 1px solid rgba(82, 106, 171, 0.24);
  border-radius: 10px;
  background: rgba(27, 35, 55, 0.52);
  padding: 0 14px;
  color: #f4f7ff;
}

.logs {
  border-radius: 12px;
  overflow: hidden;
}

.empty-state,
.empty-actions {
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

:deep(.tag-modal),
:deep(.help-modal),
:deep(.settings-modal) {
  max-width: 420px;
}

.help-content {
  display: grid;
  gap: 10px;
  color: #475467;
  line-height: 1.7;
}

.help-content p {
  margin: 0;
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

  .detail-panel {
    gap: 24px;
    padding: 30px 22px;
  }

  .detail-header {
    flex-wrap: wrap;
    gap: 18px;
  }

  .detail-actions {
    width: 100%;
    gap: 12px;
  }

  .hero-icon {
    width: 76px;
    height: 76px;
    flex-basis: 76px;
    font-size: 32px;
  }

  .actions-section {
    gap: 16px;
    min-width: 0;
  }

  .section-title-row {
    flex-wrap: wrap;
    gap: 12px;
    min-width: 0;
  }

  .section-title {
    min-width: 0;
  }

  .add-action-button {
    flex: 0 0 auto;
  }

  .action-view-controls {
    flex-wrap: wrap;
  }

  .action-row {
    grid-template-columns: 22px 38px minmax(0, 1fr) minmax(0, auto) 34px;
    grid-template-areas:
      "index icon name state play"
      "index icon detail detail play";
    gap: 6px 10px;
    min-height: 78px;
    padding: 12px 14px;
  }

  .drag-dots,
  .row-more {
    display: none;
  }

  .action-index {
    grid-area: index;
    align-self: center;
  }

  .action-icon {
    grid-area: icon;
  }

  .action-name {
    grid-area: name;
    min-width: 0;
  }

  .action-detail {
    grid-area: detail;
    min-width: 0;
  }

  .action-state-tag {
    grid-area: state;
    max-width: 100%;
  }

  .action-play {
    grid-area: play;
  }

  .shortcut-trigger-card,
  .schedule-trigger-card,
  .utility-strip {
    grid-template-columns: 1fr;
  }

  .trigger-card {
    align-items: start;
    padding: 18px;
  }

  .task-shortcut-group,
  .shortcut-group,
  .shortcut-warning {
    max-width: none;
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
  .detail-panel {
    overflow: visible;
  }

  .detail-hero {
    flex-wrap: wrap;
  }

  .section-title-row,
  .template-card {
    flex-wrap: wrap;
  }

  .template-card {
    grid-template-columns: 1fr;
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

  .detail-panel {
    border-radius: 18px;
    padding: 20px 16px;
  }

  .action-row {
    grid-template-columns: 18px 34px minmax(0, 1fr) 34px;
    grid-template-areas:
      "index icon name play"
      "index icon detail play"
      ". . state state";
  }

  .drag-dots,
  .row-more {
    display: none;
  }

  .action-index {
    display: block;
  }

  .action-detail {
    grid-area: detail;
  }

  .action-state-tag {
    grid-area: state;
    justify-self: start;
  }

  .action-play {
    grid-area: play;
  }

  .run-button,
  .add-action-button {
    width: 100%;
  }

  .detail-actions,
  .section-title-row {
    justify-content: stretch;
  }
}
</style>
