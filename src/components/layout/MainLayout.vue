<script setup lang="ts">
import { computed, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTitlebar from '@/components/layout/AppTitlebar.vue'
import TaskListPanel from '@/components/tasks/TaskListPanel.vue'
import TemplateCenter from '@/components/tasks/TemplateCenter.vue'
import TemplateIntroPanel from '@/components/tasks/TemplateIntroPanel.vue'
import TemplatePreviewModal from '@/components/tasks/TemplatePreviewModal.vue'
import TaskImportPreviewModal from '@/components/tasks/TaskImportPreviewModal.vue'
import TaskWizardDrawer from '@/components/tasks/TaskWizardDrawer.vue'
import TaskDetailPanel from '@/components/tasks/TaskDetailPanel.vue'
import TagManagerModal from '@/components/tasks/TagManagerModal.vue'
import HelpModal from '@/components/settings/HelpModal.vue'
import SettingsModal from '@/components/settings/SettingsModal.vue'
import logoUrl from '@/assets/logo.png'
import { createTaskDraft, cloneTask } from '@/domain/taskFactory'
import { createTaskFromTemplate } from '@/domain/taskTemplates'
import { getTasksForView, type TaskView } from '@/domain/taskViews'
import type { ActionView } from '@/domain/actionView'
import { useTaskStore } from '@/stores/taskStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useUpdateStore } from '@/stores/updateStore'
import { useTaskExecution } from '@/composables/useTaskExecution'
import { useActionableExecutionResults } from '@/composables/useActionableExecutionResults'
import { useKeybindings } from '@/composables/useKeybindings'
import { useTaskImportExport } from '@/composables/useTaskImportExport'
import { useResponsiveMainLayout } from '@/composables/useResponsiveMainLayout'
import { useMainWindowShortcuts } from '@/composables/useMainWindowShortcuts'
import { useMainWindowIntents } from '@/composables/useMainWindowIntents'
import { useTaskExecutionPanel } from '@/composables/useTaskExecutionPanel'
import { useTaskSharing } from '@/composables/useTaskSharing'
import { useTagManagement } from '@/composables/useTagManagement'
import { useGlobalSettingsFlow } from '@/composables/useGlobalSettingsFlow'
import { useSelectedTaskDetailPanel } from '@/composables/useSelectedTaskDetailPanel'
import { useWindowControls } from '@/composables/useWindowControls'
import { useShortcutStatus } from '@/composables/useShortcutStatus'
import { useStartupUpdateCheck } from '@/composables/useStartupUpdateCheck'
import { tauriApi } from '@/api/tauri'
import { getErrorMessage, logDevError } from '@/utils/errors'
import { keybindingScopeLabels } from '@/domain/keybindings'
import type {
  ScheduleTaskTrigger,
  ShortcutTaskTrigger,
  TaskAction,
  TaskItem,
  TaskTemplate,
  TaskTrigger
} from '@/types/domain'
import type { TaskWizardMode } from '@/composables/useTaskWizardDraft'

interface TitlebarUpdateStatus {
  tone: 'busy' | 'ready'
  label: string
  detail: string
  actionLabel: string
  actionDisabled: boolean
  disabledReason: string
}

const taskStore = useTaskStore()
const executionStore = useExecutionStore()
const updateStore = useUpdateStore()
const { execute, executeAction, running } = useTaskExecution()
const keybindings = useKeybindings()
const message = useMessage()
const dialog = useDialog()
const {
  shortcutWarning,
  setupShortcutStatus,
  refreshShortcutStatus,
  refreshShortcutStatusQuiet
} = useShortcutStatus({ message })
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
const shortcutDraft = shallowRef('')
const wizardVisible = shallowRef(false)
const wizardMode = shallowRef<TaskWizardMode>('create')
const wizardTask = shallowRef<TaskItem | null>(null)
const wizardInitialStep = shallowRef(1)
const wizardInitialActionId = shallowRef<string | null>(null)
const templatePreviewVisible = shallowRef(false)
const previewTemplate = shallowRef<TaskTemplate | null>(null)
const activeTaskView = shallowRef<TaskView>('all')
const activeActionView = shallowRef<ActionView>('list')
const selectedTagId = shallowRef<string | null>(null)
const taskShortcutDraft = shallowRef('')
const helpModalVisible = shallowRef(false)
const layoutRef = useTemplateRef<HTMLElement>('layout')
const contentRef = useTemplateRef<HTMLElement>('content')
const taskListPanelRef = useTemplateRef<{
  focusSearch: () => void
  visibleTaskIds: () => string[]
  scrollTaskIntoView: (taskId: string) => Promise<void>
}>('taskListPanel')

const {
  copyExecutionError,
  retryExecutionAction,
  editExecutionAction
} = useActionableExecutionResults({
  getTasks: () => taskStore.tasks,
  executeAction,
  isActionActive: (taskId, actionId) => executionStore.isTargetActive(executionStore.actionRunTargetKey(taskId, actionId)),
  openActionEditor,
  message
})

const selectedTask = computed(() => taskStore.selectedTask)
const visibleTasks = computed(() => getTasksForView(taskStore.tasks, activeTaskView.value, selectedTagId.value))
const showTemplateCenter = computed(() => activeTaskView.value === 'templates')
const {
  isStackedLayout,
  taskListExpanded,
  shouldShowTaskListToggle,
  shouldCollapseTaskList,
  taskListToggleLabel,
  toggleTaskListPanel
} = useResponsiveMainLayout({
  showTemplateCenter,
  layoutRef,
  contentRef
})
const mainLayoutClasses = computed(() => ({
  'stacked-task-list': shouldShowTaskListToggle.value,
  'stacked-task-list-expanded': shouldShowTaskListToggle.value && taskListExpanded.value,
  'stacked-task-list-collapsed': shouldCollapseTaskList.value
}))
const taskShortcutValues = computed(() =>
  taskStore.tasks
    .flatMap((task) => task.triggers)
    .filter((trigger): trigger is ShortcutTaskTrigger => trigger.type === 'shortcut' && trigger.enabled)
    .map((trigger) => trigger.shortcut)
)
const titlebarUpdateStatus = computed<TitlebarUpdateStatus | null>(() => {
  if (updateStore.state === 'downloading') {
    return {
      tone: 'busy',
      label: `下载更新 ${updateStore.progress.percent}%`,
      detail: updateStore.availableVersion ? `版本 ${updateStore.availableVersion}` : '正在后台下载',
      actionLabel: '',
      actionDisabled: true,
      disabledReason: ''
    }
  }

  if (updateStore.state === 'downloaded') {
    return {
      tone: 'ready',
      label: '更新已就绪',
      detail: updateStore.availableVersion ? `版本 ${updateStore.availableVersion}` : '重启后安装',
      actionLabel: '重启更新',
      actionDisabled: !updateStore.canInstallNow,
      disabledReason: updateStore.installBlockedReason
    }
  }

  if (updateStore.state === 'installing') {
    return {
      tone: 'busy',
      label: '正在安装更新',
      detail: updateStore.availableVersion ? `版本 ${updateStore.availableVersion}` : '即将重启',
      actionLabel: '',
      actionDisabled: true,
      disabledReason: ''
    }
  }

  return null
})
const favoriteCount = computed(() => taskStore.tasks.filter((task) => task.favorite).length)
const recentCount = computed(() => taskStore.tasks.filter((task) => task.lastRunAt).length)
const navigationItems = computed(() => [
  { key: 'all' as const, icon: '▣', label: '我的事项', count: taskStore.tasks.length, active: activeTaskView.value === 'all', disabled: false },
  { key: 'favorites' as const, icon: '☆', label: '收藏事项', count: favoriteCount.value, active: activeTaskView.value === 'favorites', disabled: false },
  { key: 'recent' as const, icon: '◷', label: '最近运行', count: recentCount.value, active: activeTaskView.value === 'recent', disabled: false },
  { key: 'templates' as const, icon: '▱', label: '模板中心', count: taskStore.templates.length, active: activeTaskView.value === 'templates', disabled: false }
])
const {
  showExecutionPanel,
  selectedTaskStatusRun,
  actionExecutionStates,
  flowExecutionStates,
  toggleExecutionPanel
} = useTaskExecutionPanel({
  selectedTask,
  executionStore
})
const { minimizeWindow, toggleMaximizeWindow, closeWindow } = useWindowControls()
useStartupUpdateCheck({ updateStore })
const {
  settingsShortcutDraft,
  themeDraft,
  launchOnStartupDraft,
  settingsModalVisible,
  themeOptions,
  syncSettingsDrafts,
  openSettings,
  saveSettings,
  cycleTheme
} = useGlobalSettingsFlow({
  taskStore,
  keybindings,
  shortcutDraft,
  message,
  refreshShortcutStatus,
  refreshShortcutStatusQuiet,
  reportUiError
})
const {
  tagItems,
  tagModalVisible,
  tagDraftName,
  editingTag,
  selectTag,
  openCreateTag,
  openRenameTag,
  saveTag,
  confirmDeleteTag
} = useTagManagement({
  taskStore,
  activeTaskView,
  selectedTagId,
  getVisibleTasks: () => visibleTasks.value,
  message,
  dialog,
  reportUiError
})
const { shareOptions, handleShareSelect } = useTaskSharing({
  selectedTask,
  getVisibleTasks: () => visibleTasks.value,
  exportTaskBundle,
  openImportFile,
  message
})
const {
  meta: detailMeta,
  flowPreview: selectedFlowPreview,
  execution: detailExecution,
  triggers: detailTriggers,
  taskMenuOptions,
  handleTaskMenuSelect
} = useSelectedTaskDetailPanel({
  selectedTask,
  taskShortcutDraft,
  globalShortcutDraft: shortcutDraft,
  shortcutWarning,
  showExecutionPanel,
  selectedTaskStatusRun,
  actionExecutionStates,
  flowExecutionStates,
  executionStore,
  running,
  editSelectedTask,
  duplicateTask,
  saveSelectedTaskAsTemplate,
  deleteTask
})
const keybindingHelpGroups = computed(() =>
  Object.entries(keybindingScopeLabels).map(([scope, label]) => ({
    scope,
    label,
    items: keybindings.effective.value.filter((item) => item.scope === scope)
  }))
)

useMainWindowShortcuts({
  keybindings,
  isDisabled: isMainShortcutSuspended,
  isTemplateCenter: showTemplateCenter,
  selectedTask,
  selectedTaskId: computed(() => taskStore.selectedTaskId),
  taskListPanelRef,
  getVisibleTaskIds: () => visibleTasks.value.map((task) => task.id),
  selectTask: taskStore.selectTask,
  runSelectedTask,
  createTask,
  editSelectedTask,
  toggleSelectedTaskFavorite: () => {
    if (selectedTask.value) void toggleTaskFavorite(selectedTask.value.id)
  },
  toggleExecutionPanel,
  setActionView: (view) => {
    activeActionView.value = view
  }
})

useMainWindowIntents({ createTask })

onMounted(async () => {
  shortcutDraft.value = taskStore.settings.globalShortcut
  syncSettingsDrafts()
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
  await executionStore.loadLogs()
})

watch(
  selectedTask,
  (task) => {
    const shortcutTrigger = task?.triggers.find((trigger) => trigger.type === 'shortcut')
    taskShortcutDraft.value = shortcutTrigger?.shortcut || ''
  },
  { immediate: true }
)

function createTask() {
  wizardMode.value = 'create'
  wizardTask.value = createTaskDraft()
  wizardInitialStep.value = 1
  wizardInitialActionId.value = null
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

async function saveTaskAndRun(task: TaskItem) {
  let savedTask: TaskItem
  try {
    savedTask = await taskStore.upsertTask(task)
    message.success('已保存')
    wizardVisible.value = false
  } catch (err) {
    reportUiError('Save task before run failed', err, { taskId: task.id })
    return
  }
  await execute(savedTask)
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
  wizardInitialActionId.value = null
  wizardVisible.value = true
}

function openActionEditor(task: TaskItem, actionId: string) {
  taskStore.selectTask(task.id)
  wizardMode.value = 'edit'
  wizardTask.value = task
  wizardInitialStep.value = 2
  wizardInitialActionId.value = actionId
  wizardVisible.value = true
  if (isStackedLayout.value) {
    taskListExpanded.value = false
  }
}

function isMainShortcutSuspended() {
  return (
    wizardVisible.value ||
    templatePreviewVisible.value ||
    tagModalVisible.value ||
    helpModalVisible.value ||
    settingsModalVisible.value ||
    importPreviewVisible.value
  )
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

async function restartDownloadedUpdateFromTitlebar() {
  if (!updateStore.canInstallNow) {
    message.warning(updateStore.installBlockedReason || '当前不能安装更新')
    return
  }

  try {
    await updateStore.installDownloadedUpdateAndRelaunch()
  } catch (err) {
    reportUiError('Install update from titlebar failed', err)
  }
}

function isActionRunning(action: TaskAction) {
  if (!selectedTask.value) return false
  return Boolean(executionStore.activeRunForTarget(executionStore.actionRunTargetKey(selectedTask.value.id, action.id)))
}

function openTemplatePreview(template: TaskTemplate) {
  previewTemplate.value = template
  templatePreviewVisible.value = true
}

function createFromTemplate(initialValues: Record<string, string>) {
  const template = previewTemplate.value
  if (!template) return
  const firstConfigurationKeys = new Set(
    (template.variables || [])
      .filter((variable) => !variable.required && !variable.defaultValue)
      .map((variable) => variable.key)
  )
  const task = createTaskFromTemplate(template)
  task.variables = (task.variables || []).map((variable) => {
    const value = initialValues[variable.key]
    return firstConfigurationKeys.has(variable.key) && value?.trim()
      ? { ...variable, defaultValue: value }
      : variable
  })
  wizardMode.value = 'create'
  wizardTask.value = task
  wizardInitialStep.value = 1
  wizardInitialActionId.value = null
  templatePreviewVisible.value = false
  wizardVisible.value = true
}

async function openProjectRepository() {
  try {
    await tauriApi.openProjectRepository()
  } catch (err) {
    reportUiError('Open project repository failed', err)
  }
}

function reportUiError(context: string, err: unknown, extra?: Record<string, unknown>) {
  logDevError(context, err, extra)
  message.error(getErrorMessage(err))
}

</script>

<template>
  <main ref="layout" class="main-layout" :class="mainLayoutClasses">
    <div class="ambient ambient-one" aria-hidden="true"></div>
    <div class="ambient ambient-two" aria-hidden="true"></div>
    <div class="light-arc light-arc-one" aria-hidden="true"></div>
    <div class="light-arc light-arc-two" aria-hidden="true"></div>

    <AppTitlebar
      :logo-url="logoUrl"
      title="FlowTask - 事项管理器"
      :update-status="titlebarUpdateStatus"
      @minimize="minimizeWindow"
      @toggle-maximize="toggleMaximizeWindow"
      @close="closeWindow"
      @restart-update="restartDownloadedUpdateFromTitlebar"
      @open-project-repository="openProjectRepository"
    />

    <div ref="content" class="app-content">
      <AppSidebar
        :logo-url="logoUrl"
        :navigation-items="navigationItems"
        :tags="tagItems"
        :selected-tag-id="selectedTagId"
        :shortcut-warning="shortcutWarning"
        :theme="taskStore.settings.theme"
        @create-task="createTask"
        @set-view="setTaskView"
        @select-tag="selectTag"
        @create-tag="openCreateTag"
        @rename-tag="openRenameTag"
        @delete-tag="confirmDeleteTag"
        @open-settings="openSettings"
        @open-help="helpModalVisible = true"
        @cycle-theme="cycleTheme"
      />

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
          :built-in-templates="taskStore.builtInTemplates"
          :saved-templates="taskStore.savedTemplates"
          @preview="openTemplatePreview"
          @use="openTemplatePreview"
          @import="openImportFile"
          @export="exportSavedTemplates"
        />
      </section>

      <section class="workspace">
        <TemplateIntroPanel v-if="showTemplateCenter" @create-task="createTask" />

        <TaskDetailPanel
          v-else-if="selectedTask"
          :task="selectedTask"
          :meta="detailMeta"
          :action-view="activeActionView"
          :flow-preview="selectedFlowPreview"
          :execution="detailExecution"
          :triggers="detailTriggers"
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
          @copy-execution-error="copyExecutionError"
          @retry-execution-action="retryExecutionAction"
          @edit-execution-action="editExecutionAction"
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
      :initial-action-id="wizardInitialActionId"
      @save="saveTask"
      @save-and-run="saveTaskAndRun"
      @duplicate="duplicateTask"
      @delete="deleteTask"
    />

    <TemplatePreviewModal
      v-model:show="templatePreviewVisible"
      :template="previewTemplate"
      @use="createFromTemplate"
    />

    <TaskImportPreviewModal
      v-model:show="importPreviewVisible"
      :preview="importPreview"
      :confirming="importConfirming"
      @confirm="confirmImport"
    />

    <TagManagerModal
      v-model:show="tagModalVisible"
      v-model:draft-name="tagDraftName"
      :editing-tag="editingTag"
      @save="saveTag"
    />

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

:global([data-app-theme="light"]) .middle-panel {
  background:
    radial-gradient(circle at 38% -8%, rgba(116, 152, 220, 0.12), transparent 38%),
    rgba(255, 255, 255, 0.78);
}

:global([data-app-theme="light"]) .task-name {
  color: #172033;
}

:global([data-app-theme="light"]) .task-item {
  background: rgba(255, 255, 255, 0.72);
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

.middle-panel,
.workspace {
  position: relative;
  z-index: 1;
  min-height: 0;
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

@media (max-width: 1279px) {
  .main-layout {
    --sidebar-width: 76px;
    --middle-width: clamp(300px, 34vw, 336px);
    --content-padding: 18px;
  }

  .middle-panel {
    padding: 30px 16px 24px;
    border-radius: 24px 0 0 24px;
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

  .workspace {
    overflow: visible;
  }
}
</style>
