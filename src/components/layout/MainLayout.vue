<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import TaskListPanel from '@/components/tasks/TaskListPanel.vue'
import TaskEditor from '@/components/tasks/TaskEditor.vue'
import ExecutionProgress from '@/components/execution/ExecutionProgress.vue'
import { createTaskDraft, cloneTask } from '@/domain/taskFactory'
import { useTaskStore } from '@/stores/taskStore'
import { useExecutionStore } from '@/stores/executionStore'
import type { TaskItem } from '@/types/domain'

const taskStore = useTaskStore()
const executionStore = useExecutionStore()
const message = useMessage()
const dialog = useDialog()
const showLogs = shallowRef(false)
const shortcutDraft = shallowRef('')

const selectedTask = computed(() => taskStore.selectedTask)

onMounted(async () => {
  shortcutDraft.value = taskStore.settings.globalShortcut
  await executionStore.setupListeners()
  await executionStore.loadLogs()
})

async function createTask() {
  const task = createTaskDraft()
  await taskStore.upsertTask(task)
  message.success('已创建事项')
}

async function saveTask(task: TaskItem) {
  await taskStore.upsertTask(task)
  message.success('已保存')
}

async function duplicateTask(task: TaskItem) {
  await taskStore.upsertTask(cloneTask(task))
  message.success('已复制事项')
}

function deleteTask(task: TaskItem) {
  dialog.warning({
    title: '删除事项',
    content: `确认删除“${task.name}”？此操作不会执行任何动作，但会从配置中移除该事项。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await taskStore.removeTask(task.id)
      message.success('已删除')
    }
  })
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
        @select="taskStore.selectTask"
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

      <TaskEditor
        v-if="selectedTask"
        :task="selectedTask"
        :all-tasks="taskStore.tasks"
        :saving="taskStore.saving"
        @save="saveTask"
        @duplicate="duplicateTask"
        @delete="deleteTask"
      />
      <NEmpty v-else class="empty-state" description="还没有事项">
        <template #extra>
          <NButton type="primary" @click="createTask">新增事项</NButton>
        </template>
      </NEmpty>
    </section>
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
</style>
