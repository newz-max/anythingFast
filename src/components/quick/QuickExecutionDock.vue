<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import ExecutionStatusStrip from '@/components/execution/ExecutionStatusStrip.vue'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'

const props = withDefaults(
  defineProps<{
    runs: ExecutionRunSnapshot[]
  }>(),
  {
    runs: () => []
  }
)

const expanded = defineModel<boolean>('expanded', { default: false })
const toggleButtonRef = useTemplateRef<HTMLButtonElement>('toggleButton')
const detailsId = 'quick-execution-details'

const activeCount = computed(() => props.runs.length)
const knownTotalActions = computed(() =>
  props.runs.reduce((total, run) => total + normalizedTotal(run), 0)
)
const completedActions = computed(() =>
  props.runs.reduce((total, run) => total + Math.min(run.completedActions, normalizedTotal(run)), 0)
)
const hasUnknownTotal = computed(() =>
  props.runs.some((run) => normalizedTotal(run) <= 0)
)
const progressPercent = computed(() => {
  if (knownTotalActions.value <= 0 || hasUnknownTotal.value) return null
  return Math.min(100, Math.round((completedActions.value / knownTotalActions.value) * 100))
})
const progressLabel = computed(() => {
  if (activeCount.value === 0) return '等待执行'
  if (knownTotalActions.value <= 0) return '等待动作事件'
  return `${completedActions.value}/${knownTotalActions.value} 个动作`
})
const currentAction = computed(() => {
  const run = props.runs.at(-1)
  if (!run) return ''
  return run.currentActionName || run.taskName || '等待动作事件'
})

watch(
  () => props.runs.length,
  (length) => {
    if (length === 0) expanded.value = false
  }
)

watch(expanded, async (value, previous) => {
  if (!value && previous) {
    await nextTick()
    toggleButtonRef.value?.focus()
  }
})

function normalizedTotal(run: ExecutionRunSnapshot) {
  if (run.totalActions > 0) return run.totalActions
  return run.scope === 'action' ? 1 : 0
}

function toggleExpanded() {
  if (activeCount.value === 0) return
  expanded.value = !expanded.value
}

function collapse() {
  if (expanded.value) expanded.value = false
}
</script>

<template>
  <section class="execution-dock" aria-label="快捷执行状态" @keydown.esc.stop.prevent="collapse">
    <div
      v-if="expanded && activeCount > 0"
      :id="detailsId"
      class="execution-overlay"
      role="region"
      aria-label="运行详情"
    >
      <ExecutionStatusStrip :runs="props.runs" />
    </div>

    <div class="dock-summary" aria-live="polite">
      <span class="activity-indicator" :class="{ active: activeCount > 0 }" aria-hidden="true"></span>
      <strong class="run-count">
        {{ activeCount > 0 ? `正在执行 ${activeCount} 项` : '暂无执行' }}
      </strong>
      <span class="progress-copy">{{ progressLabel }}</span>
      <span v-if="currentAction" class="current-action" :title="currentAction">
        当前：{{ currentAction }}
      </span>
      <span
        class="progress-track"
        :class="{ indeterminate: progressPercent === null && activeCount > 0 }"
        role="progressbar"
        :aria-label="progressLabel"
        :aria-valuemin="progressPercent === null ? undefined : 0"
        :aria-valuemax="progressPercent === null ? undefined : 100"
        :aria-valuenow="progressPercent ?? undefined"
      >
        <span v-if="progressPercent !== null" class="progress-value" :style="{ width: `${progressPercent}%` }"></span>
        <span v-else-if="activeCount > 0" class="progress-value indeterminate-value"></span>
      </span>
      <button
        ref="toggleButton"
        type="button"
        class="expand-button"
        :disabled="activeCount === 0"
        :aria-expanded="expanded"
        :aria-controls="detailsId"
        :title="expanded ? '收起运行详情' : '展开运行详情'"
        @click="toggleExpanded"
      >
        <span aria-hidden="true">{{ expanded ? '⌄' : '⌃' }}</span>
        <span class="sr-only">{{ expanded ? '收起运行详情' : '展开运行详情' }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.execution-dock {
  position: relative;
  min-width: 0;
  height: 46px;
}

.dock-summary {
  display: grid;
  grid-template-columns: 10px auto auto minmax(80px, 1fr) minmax(70px, 120px) 30px;
  align-items: center;
  gap: 9px;
  box-sizing: border-box;
  height: 46px;
  min-width: 0;
  border-top: 1px solid rgba(61, 76, 109, 0.66);
  color: #9faad0;
  font-size: 11px;
}

.activity-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #59627d;
}

.activity-indicator.active {
  background: #5f94ff;
  box-shadow: 0 0 10px rgba(95, 148, 255, 0.8);
}

.run-count {
  color: #edf3ff;
  font-size: 12px;
  white-space: nowrap;
}

.progress-copy {
  white-space: nowrap;
}

.current-action {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-track {
  position: relative;
  display: block;
  height: 5px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(87, 101, 137, 0.42);
}

.progress-value {
  position: absolute;
  inset-block: 0;
  left: 0;
  border-radius: inherit;
  background: #5f94ff;
}

.indeterminate-value {
  width: 42%;
  animation: dock-progress 1.15s ease-in-out infinite alternate;
}

.expand-button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #b9c9ef;
  cursor: pointer;
  font-size: 16px;
}

.expand-button:hover:not(:disabled),
.expand-button:focus-visible {
  background: rgba(95, 148, 255, 0.16);
  outline: none;
}

.expand-button:disabled {
  cursor: default;
  opacity: 0.35;
}

.execution-overlay {
  position: absolute;
  z-index: 20;
  right: 0;
  bottom: calc(100% + 8px);
  left: 0;
  max-height: min(320px, 50vh);
  overflow-y: auto;
  border: 1px solid rgba(95, 148, 255, 0.42);
  border-radius: 8px;
  background: rgba(13, 18, 35, 0.98);
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.48);
  padding: 10px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@keyframes dock-progress {
  from {
    transform: translateX(-20%);
  }
  to {
    transform: translateX(160%);
  }
}

@media (max-width: 620px) {
  .dock-summary {
    grid-template-columns: 10px auto minmax(70px, 1fr) 30px;
  }

  .progress-copy,
  .progress-track {
    display: none;
  }
}
</style>
