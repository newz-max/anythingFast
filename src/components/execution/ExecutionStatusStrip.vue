<script setup lang="ts">
import { computed } from 'vue'
import {
  isRunActive,
  normalizedProgressPercent,
  runMessage,
  runProgressLabel,
  runStatusType,
  runTitle,
  statusLabel
} from '@/domain/executionPresentation'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'

const props = withDefaults(
  defineProps<{
    runs: ExecutionRunSnapshot[]
    compact?: boolean
  }>(),
  {
    runs: () => [],
    compact: false
  }
)

const displayRun = computed(() => props.runs.at(-1) || null)
const multiple = computed(() => props.runs.length > 1)
const active = computed(() => props.runs.some(isRunActive))
const statusType = computed(() => runStatusType(displayRun.value?.status))
const title = computed(() => {
  if (multiple.value) return `${props.runs.length} 个运行正在执行`
  return displayRun.value ? runTitle(displayRun.value) : '暂无执行'
})
const progressLabel = computed(() => (displayRun.value ? runProgressLabel(displayRun.value) : ''))
const progressPercent = computed(() => (displayRun.value ? normalizedProgressPercent(displayRun.value) : 0))
const message = computed(() => (displayRun.value ? runMessage(displayRun.value) : ''))
const currentActionLabel = computed(() => {
  if (!displayRun.value) return ''
  return displayRun.value.currentActionName || (active.value ? '等待动作事件' : '')
})
</script>

<template>
  <section
    v-if="displayRun"
    class="execution-status-strip"
    :class="[
      `execution-status-${displayRun.status}`,
      {
        compact,
        active
      }
    ]"
    aria-live="polite"
  >
    <div class="status-head">
      <span class="status-main">
        <NSpin v-if="active" size="small" />
        <strong>{{ title }}</strong>
      </span>
      <NTag size="small" :type="statusType">
        {{ multiple ? `${runs.length} 项运行中` : statusLabel(displayRun.status) }}
      </NTag>
    </div>

    <NProgress
      type="line"
      :percentage="progressPercent"
      :status="statusType"
      :processing="active"
      :height="compact ? 6 : 8"
      :show-indicator="!compact"
    />

    <div class="status-meta">
      <span>{{ progressLabel }}</span>
      <span v-if="multiple">最新：{{ runTitle(displayRun) }}</span>
      <span v-if="currentActionLabel">当前：{{ currentActionLabel }}</span>
      <span>{{ message }}</span>
    </div>
  </section>
</template>

<style scoped>
.execution-status-strip {
  display: grid;
  gap: 9px;
  min-width: 0;
  border: 1px solid rgba(82, 106, 171, 0.22);
  border-radius: 10px;
  background:
    linear-gradient(135deg, rgba(31, 42, 72, 0.82), rgba(20, 28, 50, 0.72)),
    rgba(17, 24, 43, 0.86);
  padding: 12px 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.execution-status-strip.compact {
  gap: 7px;
  border-radius: 9px;
  padding: 9px 10px;
}

.execution-status-strip.active {
  border-color: rgba(77, 135, 255, 0.52);
}

.execution-status-success {
  border-color: rgba(34, 197, 94, 0.34);
}

.execution-status-failed {
  border-color: rgba(239, 68, 68, 0.38);
}

.status-head,
.status-main,
.status-meta {
  display: flex;
  min-width: 0;
  align-items: center;
}

.status-head {
  justify-content: space-between;
  gap: 10px;
}

.status-main {
  gap: 8px;
}

.status-main strong {
  min-width: 0;
  overflow: hidden;
  color: #f4f7ff;
  font-size: 13px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-meta {
  flex-wrap: wrap;
  gap: 6px 12px;
  color: #9faad0;
  font-size: 12px;
  line-height: 1.45;
}

.status-meta span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.compact .status-main strong {
  font-size: 12px;
}

.compact .status-meta {
  font-size: 11px;
}
</style>
