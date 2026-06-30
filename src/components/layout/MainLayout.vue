<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import TaskListPanel from '@/components/tasks/TaskListPanel.vue'
import TaskWizardDrawer from '@/components/tasks/TaskWizardDrawer.vue'
import ExecutionProgress from '@/components/execution/ExecutionProgress.vue'
import { createTaskDraft, cloneTask } from '@/domain/taskFactory'
import { useTaskStore } from '@/stores/taskStore'
import { useExecutionStore } from '@/stores/executionStore'
import type { TaskItem } from '@/types/domain'
import type { TaskWizardMode } from '@/composables/useTaskWizardDraft'

const taskStore = useTaskStore()
const executionStore = useExecutionStore()
const message = useMessage()
const dialog = useDialog()
const showLogs = shallowRef(false)
const shortcutDraft = shallowRef('')
const wizardVisible = shallowRef(false)
const wizardMode = shallowRef<TaskWizardMode>('create')
const wizardTask = shallowRef<TaskItem | null>(null)

const selectedTask = computed(() => taskStore.selectedTask)
const selectedActionCount = computed(() => selectedTask.value?.actions.filter((action) => action.enabled).length ?? 0)
const selectedKeywords = computed(() => selectedTask.value?.keywords?.join('、') || '无')

onMounted(async () => {
  shortcutDraft.value = taskStore.settings.globalShortcut
  await executionStore.setupListeners()
  await executionStore.loadLogs()
})

function createTask() {
  wizardMode.value = 'create'
  wizardTask.value = createTaskDraft()
  wizardVisible.value = true
}

async function saveTask(task: TaskItem) {
  await taskStore.upsertTask(task)
  message.success('已保存')
  wizardVisible.value = false
}

async function duplicateTask(task: TaskItem) {
  await taskStore.upsertTask(cloneTask(task))
  message.success('已复制事项')
  wizardVisible.value = false
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
  wizardVisible.value = Boolean(wizardTask.value)
}

function editSelectedTask() {
  if (!selectedTask.value) return
  wizardMode.value = 'edit'
  wizardTask.value = selectedTask.value
  wizardVisible.value = true
}

function toggleSelectedTaskEnabled(enabled: boolean) {
  if (!selectedTask.value) return
  void taskStore.updateTaskEnabled(selectedTask.value.id, enabled)
}

async function saveShortcut() {
  await taskStore.updateSettings({ ...taskStore.settings, globalShortcut: shortcutDraft.value.trim() || 'Alt+Space' })
  message.success('快捷键设置已保存')
}
</script>

<template>
  <main class="main-layout">
    <aside class="sidebar">
      <div class="brand">
        <h1 class="brand-title">事项入口管理器</h1>
        <p class="brand-subtitle">本地事项与动作序列</p>
      </div>
      <TaskListPanel
        :tasks="taskStore.tasks"
        :categories="taskStore.categories"
        :selected-task-id="taskStore.selectedTaskId"
        @select="selectTask"
        @create="createTask"
        @toggle-enabled="taskStore.updateTaskEnabled"
      />
    </aside>

    <section class="workspace">
      <header class="toolbar">
        <div>
          <div class="toolbar-label">默认快捷键</div>
          <NInputGroup class="shortcut-group">
            <NInput v-model:value="shortcutDraft" size="small" placeholder="Alt+Space" />
            <NButton size="small" @click="saveShortcut">保存</NButton>
          </NInputGroup>
        </div>
        <NButton secondary @click="showLogs = !showLogs">执行日志</NButton>
      </header>

      <ExecutionProgress v-if="showLogs" class="logs" :logs="executionStore.logs" :events="executionStore.events" />

      <section v-if="selectedTask" class="task-overview">
        <NCard class="overview-panel" :bordered="false">
          <template #header>
            <div class="overview-header">
              <div>
                <h2 class="title">{{ selectedTask.name || '未命名事项' }}</h2>
                <p class="subtitle">{{ selectedTask.category || '未分类' }} · {{ selectedTask.actions.length }} 个动作</p>
              </div>
              <NSpace>
                <NButton secondary @click="duplicateTask(selectedTask)">复制</NButton>
                <NButton secondary type="error" @click="deleteTask(selectedTask)">删除</NButton>
                <NButton type="primary" @click="editSelectedTask">编辑事项</NButton>
              </NSpace>
            </div>
          </template>

          <NGrid :cols="3" :x-gap="14" :y-gap="14" responsive="screen">
            <NGi>
              <NStatistic label="启用动作" :value="selectedActionCount" />
            </NGi>
            <NGi>
              <div class="metric-label">风险等级</div>
              <NTag :type="selectedTask.riskLevel === 'high' ? 'error' : selectedTask.riskLevel === 'medium' ? 'warning' : 'success'">
                {{ selectedTask.riskLevel }}
              </NTag>
            </NGi>
            <NGi>
              <div class="metric-label">启用状态</div>
              <NSwitch
                :value="selectedTask.enabled"
                @update:value="toggleSelectedTaskEnabled"
              />
            </NGi>
          </NGrid>

          <NDivider />
          <NDescriptions label-placement="left" :column="1" bordered>
            <NDescriptionsItem label="关键词">{{ selectedKeywords }}</NDescriptionsItem>
            <NDescriptionsItem label="描述">{{ selectedTask.description || '无' }}</NDescriptionsItem>
          </NDescriptions>

          <NDivider />
          <NTimeline>
            <NTimelineItem
              v-for="action in selectedTask.actions"
              :key="action.id"
              :type="action.riskLevel === 'high' ? 'error' : action.riskLevel === 'medium' ? 'warning' : 'success'"
              :title="action.name || action.type"
              :content="`${action.type}${action.enabled ? '' : ' · 已停用'}`"
            />
          </NTimeline>
        </NCard>
      </section>
      <NEmpty v-else class="empty-state" description="还没有事项">
        <template #extra>
          <NButton type="primary" @click="createTask">新增事项</NButton>
        </template>
      </NEmpty>
    </section>

    <TaskWizardDrawer
      v-model:show="wizardVisible"
      :mode="wizardMode"
      :task="wizardTask"
      :all-tasks="taskStore.tasks"
      :saving="taskStore.saving"
      @save="saveTask"
      @duplicate="duplicateTask"
      @delete="deleteTask"
    />
  </main>
</template>

<style scoped>
.main-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  min-height: 100vh;
  background: #eef2f7;
}

.sidebar {
  border-right: 1px solid #d9e1ec;
  background: #ffffff;
  padding: 18px;
}

.brand {
  margin-bottom: 18px;
}

.brand-title {
  margin: 0;
  color: #17202a;
  font-size: 22px;
  font-weight: 700;
}

.brand-subtitle,
.toolbar-label {
  color: #667085;
  font-size: 13px;
}

.workspace {
  min-width: 0;
  padding: 18px;
}

.toolbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 14px;
}

.shortcut-group {
  width: 260px;
}

.logs {
  margin-bottom: 14px;
}

.empty-state {
  margin-top: 20vh;
}

.task-overview {
  min-width: 0;
}

.overview-panel {
  border-radius: 8px;
}

.overview-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 22px;
}

.subtitle {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}

.metric-label {
  margin-bottom: 6px;
  color: #667085;
  font-size: 13px;
}
</style>
