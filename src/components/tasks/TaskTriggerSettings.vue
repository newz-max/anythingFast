<script setup lang="ts">
import ScheduleTriggerCard from '@/components/tasks/ScheduleTriggerCard.vue'
import type { ScheduleTaskTrigger, ShortcutTaskTrigger } from '@/types/domain'

const props = defineProps<{
  shortcutTrigger: ShortcutTaskTrigger | null
  scheduleTrigger: ScheduleTaskTrigger | null
  shortcutDraft: string
}>()

const emit = defineEmits<{
  'update:shortcutDraft': [shortcut: string]
  'save-shortcut': []
  'clear-shortcut': []
  'save-schedule': [trigger: ScheduleTaskTrigger]
  'clear-schedule': []
}>()
</script>

<template>
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
        <small>{{ props.shortcutTrigger ? props.shortcutTrigger.shortcut : '未设置' }}</small>
      </span>
      <NInputGroup class="task-shortcut-group">
        <NInput
          :value="props.shortcutDraft"
          size="small"
          placeholder="例如 Ctrl+Alt+P"
          @update:value="emit('update:shortcutDraft', $event)"
        />
        <NButton size="small" @click="emit('save-shortcut')">保存</NButton>
        <NButton size="small" secondary @click="emit('clear-shortcut')">移除</NButton>
      </NInputGroup>
    </article>
    <ScheduleTriggerCard
      :trigger="props.scheduleTrigger"
      @save="emit('save-schedule', $event)"
      @remove="emit('clear-schedule')"
    />
  </section>
</template>

<style scoped>
.trigger-section {
  display: grid;
  gap: 16px;
}

.trigger-section h3 {
  margin: 0;
  color: #f4f7ff;
  font-size: 18px;
  font-weight: 800;
}

:global([data-app-theme="light"]) .trigger-section h3 {
  color: #172033;
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

:global([data-app-theme="light"]) .trigger-card {
  background: rgba(255, 255, 255, 0.72);
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
  max-width: 420px;
  min-width: 0;
  justify-self: end;
}

@media (max-width: 1279px) {
  .shortcut-trigger-card,
  :deep(.schedule-trigger-card) {
    grid-template-columns: 1fr;
  }

  .trigger-card,
  :deep(.trigger-card) {
    align-items: start;
    padding: 18px;
  }

  .task-shortcut-group {
    max-width: none;
  }
}
</style>
