<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
import ExecutionProgress from '@/components/execution/ExecutionProgress.vue'
import ExecutionStatusStrip from '@/components/execution/ExecutionStatusStrip.vue'
import FlowPreviewGraph from '@/components/tasks/FlowPreviewGraph.vue'
import TaskActionList from '@/components/tasks/TaskActionList.vue'
import TaskTriggerSettings from '@/components/tasks/TaskTriggerSettings.vue'
import type { ActionView } from '@/domain/actionView'
import type { FlowPreviewModel } from '@/domain/flowPreview'
import type { TaskDetailExecutionView, TaskDetailMetaView, TaskDetailTriggerView } from '@/composables/useSelectedTaskDetailPanel'
import type {
  ScheduleTaskTrigger,
  TaskAction,
  TaskItem
} from '@/types/domain'

const props = defineProps<{
  task: TaskItem
  meta: TaskDetailMetaView
  actionView: ActionView
  flowPreview: FlowPreviewModel
  execution: TaskDetailExecutionView
  triggers: TaskDetailTriggerView
  shareOptions: DropdownOption[]
  taskMenuOptions: DropdownOption[]
  isActionRunning: (action: TaskAction) => boolean
}>()

const emit = defineEmits<{
  run: []
  'run-action': [action: TaskAction]
  edit: [initialStep?: number]
  duplicate: []
  delete: []
  'save-template': []
  'toggle-favorite': []
  'toggle-enabled': [enabled: boolean]
  'share-select': [key: string | number]
  'task-menu-select': [key: string | number]
  'update:actionView': [view: ActionView]
  'update:shortcutDraft': [shortcut: string]
  'update:globalShortcutDraft': [shortcut: string]
  'save-shortcut': []
  'clear-shortcut': []
  'save-schedule': [trigger: ScheduleTaskTrigger]
  'clear-schedule': []
  'save-global-shortcut': []
  'toggle-execution-panel': []
}>()

function handleTaskMenuSelect(key: string | number) {
  emit('task-menu-select', key)
}

function handleShareSelect(key: string | number) {
  emit('share-select', key)
}
</script>

<template>
  <section class="detail-panel">
    <header class="detail-header">
      <div class="detail-hero">
        <div class="hero-icon" :class="props.meta.selectedCategory">
          <span>{{ props.task.name.slice(0, 1) || '事' }}</span>
        </div>
        <div class="hero-copy">
          <div class="title-row">
            <h2>{{ props.task.name || '未命名事项' }}</h2>
            <button class="ghost-icon-button" type="button" aria-label="编辑事项" @click="emit('edit')">⌕</button>
          </div>
          <p>{{ props.task.description || '打开常用工具、项目文件夹和网页，快速进入工作状态' }}</p>
          <span class="category-badge">{{ props.meta.selectedCategory }}</span>
          <div class="meta-line">
            <span>创建于 {{ props.meta.formattedCreatedAt }}</span>
            <span>最后更新 {{ props.meta.formattedUpdatedAt }}</span>
            <span>关键词 {{ props.meta.selectedKeywords }}</span>
          </div>
        </div>
      </div>

      <div class="detail-actions">
        <button class="run-button" type="button" :disabled="props.execution.runningTask" @click="emit('run')">
          <NSpin v-if="props.execution.runningTask" size="small" />
          <span v-else aria-hidden="true">▶</span>
          {{ props.execution.runButtonLabel }}
        </button>
        <NDropdown trigger="click" :options="props.shareOptions" @select="handleShareSelect">
          <button class="icon-button" type="button" aria-label="分享">⌘</button>
        </NDropdown>
        <button
          class="icon-button favorite-detail-button"
          :class="{ active: props.task.favorite }"
          type="button"
          :aria-label="props.task.favorite ? '取消收藏' : '收藏'"
          @click="emit('toggle-favorite')"
        >
          {{ props.task.favorite ? '★' : '☆' }}
        </button>
        <NDropdown trigger="click" :options="props.taskMenuOptions" @select="handleTaskMenuSelect">
          <button class="icon-button" type="button" aria-label="更多">•••</button>
        </NDropdown>
      </div>
    </header>

    <ExecutionStatusStrip
      v-if="props.execution.taskStatusRun"
      class="detail-status-strip"
      :runs="[props.execution.taskStatusRun]"
    />

    <section class="actions-section">
      <header class="section-title-row">
        <div class="section-title">
          <h3>{{ props.actionView === 'list' ? '动作列表' : '流程预览' }}</h3>
          <span>{{ props.meta.actionCount }}</span>
        </div>
        <div class="action-view-controls">
          <div class="view-switch" role="tablist" aria-label="动作视图">
            <button
              class="view-switch-button"
              :class="{ active: props.actionView === 'list' }"
              type="button"
              role="tab"
              :aria-selected="props.actionView === 'list'"
              @click="emit('update:actionView', 'list')"
            >
              列表
            </button>
            <button
              class="view-switch-button"
              :class="{ active: props.actionView === 'flow' }"
              type="button"
              role="tab"
              :aria-selected="props.actionView === 'flow'"
              @click="emit('update:actionView', 'flow')"
            >
              流程
            </button>
          </div>
          <button v-if="props.actionView === 'list'" class="add-action-button" type="button" @click="emit('edit', 2)">
            <span aria-hidden="true">＋</span>
            添加动作
          </button>
        </div>
      </header>

      <FlowPreviewGraph v-if="props.actionView === 'flow'" :model="props.flowPreview" />
      <TaskActionList
        v-else
        :task="props.task"
        :action-execution-states="props.execution.actionExecutionStates"
        :is-action-running="props.isActionRunning"
        @run-action="emit('run-action', $event)"
        @add-action="emit('edit', 2)"
      />
    </section>

    <TaskTriggerSettings
      :shortcut-trigger="props.triggers.shortcutTrigger"
      :schedule-trigger="props.triggers.scheduleTrigger"
      :shortcut-draft="props.triggers.taskShortcutDraft"
      @update:shortcut-draft="emit('update:shortcutDraft', $event)"
      @save-shortcut="emit('save-shortcut')"
      @clear-shortcut="emit('clear-shortcut')"
      @save-schedule="emit('save-schedule', $event)"
      @clear-schedule="emit('clear-schedule')"
    />

    <section class="utility-strip">
      <div class="shortcut-card">
        <span>默认快捷键</span>
        <NInputGroup class="shortcut-group">
          <NInput
            :value="props.triggers.globalShortcutDraft"
            size="small"
            placeholder="Alt+Space"
            @update:value="emit('update:globalShortcutDraft', $event)"
          />
          <NButton size="small" @click="emit('save-global-shortcut')">保存</NButton>
        </NInputGroup>
        <p v-if="props.triggers.shortcutWarning" class="shortcut-warning">{{ props.triggers.shortcutWarning }}</p>
      </div>
      <button class="logs-button" type="button" @click="emit('toggle-execution-panel')">
        {{ props.execution.logsButtonLabel }}
      </button>
      <NSwitch :value="props.task.enabled" @update:value="emit('toggle-enabled', $event)" />
    </section>

    <ExecutionProgress
      v-if="props.execution.showExecutionPanel"
      class="logs"
      :runs="props.execution.activeRuns"
      :logs="props.execution.logs"
      :timeline="props.execution.timeline"
      :log-load-error="props.execution.logLoadError"
    />
  </section>
</template>

<style scoped>
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

:global([data-app-theme="light"]) .detail-panel {
  background:
    radial-gradient(circle at 38% -8%, rgba(116, 152, 220, 0.12), transparent 38%),
    rgba(255, 255, 255, 0.78);
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
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 18px 36px rgba(24, 52, 136, 0.24);
  color: #dce9ff;
  font-size: 42px;
  font-weight: 800;
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

:global([data-app-theme="light"]) .title-row h2 {
  color: #172033;
}

.ghost-icon-button,
.icon-button,
.logs-button {
  border: 0;
  background: transparent;
  color: #8290b7;
  cursor: pointer;
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
  color: #58a2ff;
  padding: 5px 10px;
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
  box-shadow: 0 14px 32px rgba(53, 91, 255, 0.32);
  color: #fff;
  cursor: pointer;
  font-weight: 700;
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

.detail-status-strip {
  width: 100%;
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

.section-title h3 {
  margin: 0;
  color: #f4f7ff;
  font-size: 18px;
  font-weight: 800;
}

:global([data-app-theme="light"]) .section-title h3 {
  color: #172033;
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
  cursor: pointer;
  font-weight: 700;
}

.view-switch-button.active {
  background: rgba(65, 89, 175, 0.6);
  color: #f4f7ff;
}

.add-action-button {
  height: 40px;
  padding: 0 18px;
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
  color: #f4f7ff;
  padding: 0 14px;
}

.logs {
  overflow: hidden;
  border-radius: 12px;
}

@media (max-width: 1279px) {
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

  .utility-strip {
    grid-template-columns: 1fr;
  }

  .shortcut-group,
  .shortcut-warning {
    max-width: none;
  }
}

@media (max-width: 960px) {
  .detail-panel {
    overflow: visible;
  }

  .detail-hero,
  .section-title-row {
    flex-wrap: wrap;
  }
}

@media (max-width: 640px) {
  .detail-panel {
    border-radius: 18px;
    padding: 20px 16px;
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
