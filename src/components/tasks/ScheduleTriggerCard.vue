<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import {
  createDefaultScheduleTrigger,
  describeScheduleTrigger,
  misfirePolicyLabel,
  nextScheduledRun,
  normalizeScheduleTrigger,
  overlapPolicyLabel,
  previewNextRun,
  validateScheduleTrigger
} from '@/domain/schedule'
import type { ScheduleMode, ScheduleTaskTrigger } from '@/types/domain'

const props = defineProps<{
  trigger: ScheduleTaskTrigger | null
}>()

const emit = defineEmits<{
  save: [trigger: ScheduleTaskTrigger]
  remove: []
}>()

const draft = shallowRef<ScheduleTaskTrigger>(createDefaultScheduleTrigger())

const modeOptions = [
  { label: '每隔一段时间', value: 'interval' },
  { label: '每天固定时间', value: 'daily' },
  { label: '每周固定时间', value: 'weekly' }
]
const weekdayOptions = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 }
]
const misfireOptions = [
  { label: '错过则跳过', value: 'skip' },
  { label: '恢复后补跑一次', value: 'runOnce' }
]

const normalizedDraft = computed(() => normalizeScheduleTrigger(draft.value))
const issues = computed(() => validateScheduleTrigger(normalizedDraft.value))
const canSave = computed(() => issues.value.length === 0)
const scheduleSummary = computed(() => describeScheduleTrigger(normalizedDraft.value))
const nextRunPreview = computed(() => previewNextRun(normalizedDraft.value) || '保存后计算')
const policySummary = computed(() =>
  `${misfirePolicyLabel(normalizedDraft.value.misfirePolicy)} · ${overlapPolicyLabel(normalizedDraft.value.preventOverlap)}`
)

watch(
  () => props.trigger,
  (trigger) => {
    draft.value = trigger ? normalizeScheduleTrigger(trigger) : createDefaultScheduleTrigger()
  },
  { immediate: true }
)

function updateEnabled(value: boolean) {
  draft.value = { ...draft.value, enabled: value }
}

function updateMode(value: string) {
  draft.value = { ...draft.value, mode: value as ScheduleMode }
}

function updateInterval(value: number | null) {
  draft.value = { ...draft.value, intervalMinutes: value }
}

function updateTime(value: string) {
  draft.value = { ...draft.value, timeOfDay: value }
}

function updateWeekdays(value: Array<string | number>) {
  draft.value = { ...draft.value, weekdays: value.map(Number) }
}

function updateMisfirePolicy(value: string) {
  draft.value = { ...draft.value, misfirePolicy: value === 'runOnce' ? 'runOnce' : 'skip' }
}

function updatePreventOverlap(value: boolean) {
  draft.value = { ...draft.value, preventOverlap: value }
}

function saveSchedule() {
  if (!canSave.value) return
  const nextRun = nextScheduledRun(normalizedDraft.value)
  emit('save', {
    ...normalizedDraft.value,
    nextRunAt: nextRun?.toISOString()
  })
}
</script>

<template>
  <article class="trigger-card schedule-trigger-card">
    <span class="trigger-icon" aria-hidden="true">⏱</span>
    <span class="trigger-copy">
      <strong>周期触发</strong>
      <small>{{ props.trigger ? scheduleSummary : '未设置' }}</small>
    </span>

    <div class="schedule-trigger-form">
      <div class="schedule-trigger-row">
        <NSwitch :value="normalizedDraft.enabled" @update:value="updateEnabled" />
        <NSelect
          class="schedule-mode-select"
          size="small"
          :value="normalizedDraft.mode"
          :options="modeOptions"
          @update:value="updateMode"
        />
      </div>

      <NInputNumber
        v-if="normalizedDraft.mode === 'interval'"
        class="schedule-input"
        size="small"
        :min="5"
        :step="5"
        :value="normalizedDraft.intervalMinutes"
        placeholder="间隔分钟"
        @update:value="updateInterval"
      />

      <NInput
        v-if="normalizedDraft.mode === 'daily' || normalizedDraft.mode === 'weekly'"
        class="schedule-input"
        size="small"
        :value="normalizedDraft.timeOfDay"
        placeholder="HH:mm"
        @update:value="updateTime"
      />

      <NCheckboxGroup
        v-if="normalizedDraft.mode === 'weekly'"
        class="weekday-group"
        :value="normalizedDraft.weekdays || []"
        @update:value="updateWeekdays"
      >
        <NSpace size="small">
          <NCheckbox
            v-for="option in weekdayOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </NCheckbox>
        </NSpace>
      </NCheckboxGroup>

      <div class="schedule-trigger-row">
        <NSelect
          class="schedule-policy-select"
          size="small"
          :value="normalizedDraft.misfirePolicy"
          :options="misfireOptions"
          @update:value="updateMisfirePolicy"
        />
        <NSwitch :value="normalizedDraft.preventOverlap" @update:value="updatePreventOverlap" />
      </div>

      <p class="schedule-summary">
        下次 {{ nextRunPreview }} · {{ policySummary }} · 应用运行时生效
      </p>
      <p v-if="issues.length" class="schedule-error">{{ issues[0].message }}</p>

      <div class="schedule-actions">
        <NButton size="small" :disabled="!canSave" @click="saveSchedule">保存</NButton>
        <NButton size="small" secondary @click="emit('remove')">移除</NButton>
      </div>
    </div>
  </article>
</template>

<style scoped>
.schedule-trigger-card {
  align-items: flex-start;
}

.schedule-trigger-form {
  display: grid;
  flex: 1;
  gap: 8px;
  min-width: 0;
}

.schedule-trigger-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.schedule-mode-select,
.schedule-policy-select,
.schedule-input {
  min-width: 160px;
}

.weekday-group {
  min-width: 0;
}

.schedule-summary,
.schedule-error {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}

.schedule-summary {
  color: var(--muted);
}

.schedule-error {
  color: #ef4444;
}

.schedule-actions {
  display: flex;
  gap: 8px;
}
</style>
