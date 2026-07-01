<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import TaskListPanel from '@/components/tasks/TaskListPanel.vue'
import TaskWizardDrawer from '@/components/tasks/TaskWizardDrawer.vue'
import ExecutionProgress from '@/components/execution/ExecutionProgress.vue'
import { createTaskDraft, cloneTask } from '@/domain/taskFactory'
import { describeAction, getActionTypeLabel } from '@/domain/actionPresentation'
import { useTaskStore } from '@/stores/taskStore'
import { useExecutionStore } from '@/stores/executionStore'
import { useTaskExecution } from '@/composables/useTaskExecution'
import type { ActionType, TaskAction, TaskItem } from '@/types/domain'
import type { TaskWizardMode } from '@/composables/useTaskWizardDraft'

const taskStore = useTaskStore()
const executionStore = useExecutionStore()
const { execute, running } = useTaskExecution()
const message = useMessage()
const dialog = useDialog()
const showLogs = shallowRef(false)
const shortcutDraft = shallowRef('')
const wizardVisible = shallowRef(false)
const wizardMode = shallowRef<TaskWizardMode>('create')
const wizardTask = shallowRef<TaskItem | null>(null)
const wizardInitialStep = shallowRef(1)

const selectedTask = computed(() => taskStore.selectedTask)
const selectedActionCount = computed(() => selectedTask.value?.actions.filter((action) => action.enabled).length ?? 0)
const selectedKeywords = computed(() => selectedTask.value?.keywords?.join('、') || '无')
const selectedCategory = computed(() => selectedTask.value?.category || '未分类')
const formattedCreatedAt = computed(() => formatDateTime(selectedTask.value?.createdAt))
const formattedUpdatedAt = computed(() => formatDateTime(selectedTask.value?.updatedAt))
const navigationItems = [
  { icon: '▣', label: '我的事项', active: true },
  { icon: '☆', label: '收藏事项', active: false },
  { icon: '◷', label: '最近运行', active: false },
  { icon: '▱', label: '模板中心', active: false }
]
const tagItems = [
  { label: '工作', tone: 'blue' },
  { label: '学习', tone: 'green' },
  { label: '生活', tone: 'amber' },
  { label: '其他', tone: 'purple' }
]

onMounted(async () => {
  shortcutDraft.value = taskStore.settings.globalShortcut
  await executionStore.setupListeners()
  await executionStore.loadLogs()
})

function createTask() {
  wizardMode.value = 'create'
  wizardTask.value = createTaskDraft()
  wizardInitialStep.value = 1
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

async function saveShortcut() {
  await taskStore.updateSettings({ ...taskStore.settings, globalShortcut: shortcutDraft.value.trim() || 'Alt+Space' })
  message.success('快捷键设置已保存')
}

function runTask(task: TaskItem) {
  void execute(task)
}

function runSelectedTask() {
  if (!selectedTask.value) return
  void execute(selectedTask.value)
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
</script>

<template>
  <main class="main-layout">
    <div class="ambient ambient-one" aria-hidden="true"></div>
    <div class="ambient ambient-two" aria-hidden="true"></div>
    <div class="light-arc light-arc-one" aria-hidden="true"></div>
    <div class="light-arc light-arc-two" aria-hidden="true"></div>

    <aside class="sidebar">
      <section class="brand">
        <div class="brand-mark" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
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
          :key="item.label"
          class="nav-item"
          :class="{ active: item.active }"
          type="button"
        >
          <span class="nav-icon" aria-hidden="true">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <section class="tag-block">
        <header class="tag-header">
          <span>标签</span>
          <span aria-hidden="true">＋</span>
        </header>
        <div class="tag-list">
          <div v-for="item in tagItems" :key="item.label" class="tag-item">
            <span class="tag-dot" :class="item.tone" aria-hidden="true"></span>
            <span>{{ item.label }}</span>
          </div>
        </div>
      </section>

      <section class="promo-card" aria-label="自动化提示">
        <div class="promo-logo" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <h2>释放效率，从自动化开始</h2>
        <p>将重复的操作流程化，一键触发</p>
        <button type="button">了解更多 →</button>
      </section>

      <footer class="sidebar-footer">
        <button type="button" aria-label="设置">⚙</button>
        <button type="button" aria-label="帮助">?</button>
        <button type="button" aria-label="主题">☼</button>
        <button class="orb-button" type="button" aria-label="状态"></button>
      </footer>
    </aside>

    <section class="middle-panel">
      <TaskListPanel
        :tasks="taskStore.tasks"
        :categories="taskStore.categories"
        :selected-task-id="taskStore.selectedTaskId"
        @select="selectTask"
        @create="createTask"
        @run="runTask"
        @toggle-enabled="taskStore.updateTaskEnabled"
      />
    </section>

    <section class="workspace">
      <section v-if="selectedTask" class="detail-panel">
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
              <span aria-hidden="true">▶</span>
              运行
            </button>
            <button class="icon-button placeholder" type="button" aria-label="分享">⌘</button>
            <button class="icon-button placeholder" type="button" aria-label="收藏">☆</button>
            <button class="icon-button placeholder" type="button" aria-label="更多">•••</button>
          </div>
        </header>

        <section class="actions-section">
          <header class="section-title-row">
            <div class="section-title">
              <h3>动作列表</h3>
              <span>{{ selectedActionCount }}</span>
            </div>
            <button class="add-action-button" type="button" @click="editSelectedTask(2)">
              <span aria-hidden="true">＋</span>
              添加动作
            </button>
          </header>

          <div v-if="selectedTask.actions.length > 0" class="action-list">
            <article
              v-for="(action, index) in selectedTask.actions"
              :key="action.id"
              class="action-row"
              :class="{ disabled: !action.enabled }"
            >
              <span class="drag-dots" aria-hidden="true">⠿</span>
              <span class="action-index">{{ index + 1 }}</span>
              <span class="action-icon" :class="actionTypeClass(action)">{{ actionIcon(action.type) }}</span>
              <span class="action-name">{{ action.name || getActionTypeLabel(action.type) }}</span>
              <span class="action-detail">{{ describeAction(action) }}</span>
              <button class="action-play placeholder" type="button" aria-label="单动作运行">▶</button>
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
            <span class="trigger-chevron" aria-hidden="true">⌄</span>
          </article>
        </section>

        <section class="utility-strip">
          <div class="shortcut-card">
            <span>默认快捷键</span>
            <NInputGroup class="shortcut-group">
              <NInput v-model:value="shortcutDraft" size="small" placeholder="Alt+Space" />
              <NButton size="small" @click="saveShortcut">保存</NButton>
            </NInputGroup>
          </div>
          <button class="logs-button" type="button" @click="showLogs = !showLogs">
            {{ showLogs ? '隐藏执行日志' : '执行日志' }}
          </button>
          <NSwitch :value="selectedTask.enabled" @update:value="toggleSelectedTaskEnabled" />
        </section>

        <ExecutionProgress v-if="showLogs" class="logs" :logs="executionStore.logs" :events="executionStore.events" />
      </section>

      <NEmpty v-else class="empty-state" description="还没有事项">
        <template #extra>
          <button class="create-button compact" type="button" @click="createTask">新增事项</button>
        </template>
      </NEmpty>
    </section>

    <TaskWizardDrawer
      v-model:show="wizardVisible"
      :mode="wizardMode"
      :task="wizardTask"
      :all-tasks="taskStore.tasks"
      :saving="taskStore.saving"
      :initial-step="wizardInitialStep"
      @save="saveTask"
      @duplicate="duplicateTask"
      @delete="deleteTask"
    />
  </main>
</template>

<style scoped>
.main-layout {
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
  grid-template-columns: 298px 352px minmax(0, 1fr);
  min-width: 1180px;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(circle at 74% 12%, rgba(63, 80, 164, 0.18), transparent 34%),
    linear-gradient(135deg, #070d1e 0%, #0b1124 42%, #090f21 100%);
  color: var(--text);
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
  padding: 40px 22px 24px;
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
  width: 44px;
  height: 44px;
}

.brand-mark span,
.promo-logo span {
  position: absolute;
  border-radius: 12px 12px 18px 4px;
  background: linear-gradient(145deg, #3aa3ff, #5444ff);
  filter: drop-shadow(0 8px 14px rgba(35, 101, 255, 0.28));
}

.brand-mark span:nth-child(1),
.promo-logo span:nth-child(1) {
  inset: 3px 9px 22px 4px;
  transform: skewX(-16deg);
}

.brand-mark span:nth-child(2),
.promo-logo span:nth-child(2) {
  inset: 14px 5px 4px 15px;
  transform: rotate(38deg);
}

.brand-mark span:nth-child(3),
.promo-logo span:nth-child(3) {
  inset: 22px 22px 2px 1px;
  background: linear-gradient(145deg, #2467ff, #6c4eff);
  transform: rotate(20deg);
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
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  height: 49px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: #b6c1df;
  cursor: default;
  padding: 0 15px;
  text-align: left;
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

.tag-list {
  display: grid;
  gap: 16px;
  margin-top: 20px;
  padding: 0 16px;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 14px;
  color: #9faad0;
  font-size: 13px;
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
  cursor: default;
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
  min-width: 0;
  padding: 44px 22px 34px;
  border-left: 1px solid rgba(82, 106, 171, 0.08);
  border-radius: 36px 0 0 36px;
  background:
    radial-gradient(circle at 38% -8%, rgba(71, 82, 140, 0.2), transparent 38%),
    rgba(13, 18, 35, 0.68);
}

.workspace {
  display: grid;
  min-width: 0;
  padding: 32px 24px 32px 0;
}

.detail-panel {
  display: grid;
  grid-template-rows: auto minmax(0, auto) auto auto auto;
  gap: 30px;
  min-width: 0;
  min-height: 0;
  border: 1px solid rgba(82, 106, 171, 0.28);
  border-radius: 24px;
  background:
    radial-gradient(circle at 100% 100%, rgba(63, 65, 188, 0.26), transparent 36%),
    radial-gradient(circle at 14% 0%, rgba(51, 92, 178, 0.18), transparent 42%),
    rgba(14, 19, 37, 0.84);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 32px 80px rgba(0, 0, 0, 0.22);
  padding: 42px 36px 36px;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.detail-hero {
  display: flex;
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
  margin: 16px 0 10px;
  color: var(--muted);
  font-size: 14px;
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

.detail-actions {
  display: flex;
  align-items: center;
  gap: 18px;
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

.placeholder {
  cursor: default;
}

.actions-section {
  display: grid;
  gap: 18px;
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
  grid-template-columns: 20px 24px 46px minmax(110px, 145px) minmax(0, 1fr) 42px 34px;
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
.trigger-chevron {
  color: #8b96b8;
}

.utility-strip {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto auto;
  align-items: end;
  gap: 16px;
}

.shortcut-card {
  display: grid;
  gap: 8px;
  color: #8b96b8;
  font-size: 12px;
}

.shortcut-group {
  max-width: 320px;
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

@media (max-width: 1280px) {
  .main-layout {
    grid-template-columns: 260px 330px minmax(0, 1fr);
    min-width: 1040px;
  }

  .detail-panel {
    padding: 34px 28px;
  }

  .action-row {
    grid-template-columns: 18px 22px 40px minmax(96px, 125px) minmax(0, 1fr) 38px 28px;
    gap: 10px;
  }
}
</style>
