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
const title = computed(() => {
  if (multiple.value) return `${props.runs.length} 个运行正在执行`
  return displayRun.value ? runTitle(displayRun.value) : '暂无执行'
})

function currentActionLabel(run: ExecutionRunSnapshot) {
  return run.currentActionName || (isRunActive(run) ? '等待动作事件' : '')
}
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
      <NTag size="small" :type="runStatusType(displayRun.status)">
        {{ multiple ? `${runs.length} 项运行中` : statusLabel(displayRun.status) }}
      </NTag>
    </div>

    <div v-if="multiple" class="run-status-list" role="list" aria-label="当前活跃运行">
      <article
        v-for="run in runs"
        :key="run.runId || run.targetKey"
        class="run-status-row"
        role="listitem"
      >
        <div class="run-row-head">
          <strong class="run-row-title" :title="runTitle(run)">{{ runTitle(run) }}</strong>
          <NTag size="small" :type="runStatusType(run.status)">{{ statusLabel(run.status) }}</NTag>
        </div>
        <NProgress
          type="line"
          :percentage="normalizedProgressPercent(run)"
          :status="runStatusType(run.status)"
          :processing="isRunActive(run)"
          :height="compact ? 6 : 8"
          :show-indicator="false"
        />
        <div class="run-row-meta">
          <span>{{ runProgressLabel(run) }}</span>
          <span v-if="currentActionLabel(run)" class="run-row-current" :title="currentActionLabel(run)">
            当前：{{ currentActionLabel(run) }}
          </span>
          <span class="run-row-message" :title="runMessage(run)">{{ runMessage(run) }}</span>
        </div>
      </article>
    </div>

    <template v-else>
      <NProgress
        type="line"
        :percentage="normalizedProgressPercent(displayRun)"
        :status="runStatusType(displayRun.status)"
        :processing="active"
        :height="compact ? 6 : 8"
        :show-indicator="!compact"
      />

      <div class="status-meta">
        <span>{{ runProgressLabel(displayRun) }}</span>
        <span v-if="currentActionLabel(displayRun)">当前：{{ currentActionLabel(displayRun) }}</span>
        <span>{{ runMessage(displayRun) }}</span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.execution-status-strip {
  display: grid;
  gap: 9px;
  min-width: 0;
  border: 1px solid rgba(82, 106, 171, 0.22);
  border-radius: 8px;
  background: rgba(20, 28, 50, 0.92);
  padding: 12px 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.execution-status-strip.compact {
  gap: 7px;
  border-radius: 8px;
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
.status-meta,
.run-row-head,
.run-row-meta {
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

.run-status-list {
  --run-status-row-height: 76px;
  display: grid;
  max-height: calc(var(--run-status-row-height) * 3);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.run-status-row {
  display: grid;
  box-sizing: border-box;
  min-width: 0;
  height: var(--run-status-row-height);
  gap: 7px;
  padding: 9px 2px;
}

.run-status-row + .run-status-row {
  border-top: 1px solid rgba(82, 106, 171, 0.2);
}

.run-row-head {
  justify-content: space-between;
  gap: 8px;
}

.run-row-title,
.run-row-current,
.run-row-message {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-row-title {
  color: #f4f7ff;
  font-size: 12px;
  font-weight: 800;
}

.run-row-meta {
  gap: 8px;
  color: #9faad0;
  font-size: 11px;
  line-height: 1.35;
}

.run-row-current,
.run-row-message {
  flex: 1 1 0;
}

.compact .status-main strong {
  font-size: 12px;
}

.compact .status-meta {
  font-size: 11px;
}
</style>
