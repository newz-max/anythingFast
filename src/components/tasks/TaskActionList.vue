<script setup lang="ts">
import { describeAction, getActionTypeLabel } from '@/domain/actionPresentation'
import type { ActionExecutionDisplay } from '@/domain/executionPresentation'
import type { ActionType, TaskAction, TaskItem } from '@/types/domain'

const props = defineProps<{
  task: TaskItem
  actionExecutionStates: Record<string, ActionExecutionDisplay>
  disabled?: boolean
  isActionRunning: (action: TaskAction) => boolean
}>()

const emit = defineEmits<{
  'run-action': [action: TaskAction]
  'add-action': []
}>()

function actionExecutionClass(action: TaskAction) {
  const status = props.actionExecutionStates[action.id]?.status
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
  return props.actionExecutionStates[action.id] || null
}

function actionTypeClass(action: TaskAction) {
  return `action-icon-${action.type}`
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
</script>

<template>
  <div v-if="props.task.actions.length > 0" class="action-list">
    <article
      v-for="(action, index) in props.task.actions"
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
        :disabled="props.disabled || props.isActionRunning(action) || !props.task.enabled || !action.enabled"
        aria-label="单动作运行"
        @click="emit('run-action', action)"
      >
        <NSpin v-if="props.isActionRunning(action)" size="small" />
        <span v-else>▶</span>
      </button>
      <span class="row-more" aria-hidden="true">•••</span>
    </article>
  </div>

  <NEmpty v-else class="empty-actions" description="还没有动作">
    <template #extra>
      <button class="add-action-button" type="button" @click="emit('add-action')">添加动作</button>
    </template>
  </NEmpty>
</template>

<style scoped>
.add-action-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 40px;
  border: 0;
  border-radius: 12px;
  background: linear-gradient(135deg, #3a8bff, #4d4bff);
  box-shadow: 0 14px 32px rgba(53, 91, 255, 0.32);
  color: #fff;
  cursor: pointer;
  padding: 0 18px;
  font-weight: 700;
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

:global([data-app-theme="light"]) .action-row {
  background: rgba(255, 255, 255, 0.72);
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

:global([data-app-theme="light"]) .action-name {
  color: #172033;
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
  cursor: pointer;
  font-size: 11px;
}

.action-play:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.empty-actions {
  --n-text-color: #8b96b8 !important;
  --n-icon-color: #445071 !important;
}

@media (max-width: 1279px) {
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

  .add-action-button {
    flex: 0 0 auto;
  }
}

@media (max-width: 640px) {
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

  .add-action-button {
    width: 100%;
  }
}
</style>
