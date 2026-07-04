<script setup lang="ts">
import { computed } from 'vue'
import type { ExecutionEventPayload } from '@/api/events'
import {
  eventStatusLabel,
  eventStatusType,
  runStatusType as getRunStatusType,
  runTitle as getRunTitle,
  statusLabel
} from '@/domain/executionPresentation'
import type { ExecutionRunSnapshot } from '@/stores/executionStore'
import type { ActionExecutionResult, ExecutionLogSummary } from '@/types/domain'

const props = defineProps<{
  currentRun: ExecutionRunSnapshot | null
  events: ExecutionEventPayload[]
  logs: ExecutionLogSummary[]
}>()

const visibleEvents = computed(() => props.events.slice(-12))
const latestSummary = computed(() => props.logs[0] ?? null)
const runStatusType = computed(() => {
  return getRunStatusType(props.currentRun?.status)
})
const runTitle = computed(() => {
  const run = props.currentRun
  if (!run) return '暂无执行'
  return getRunTitle(run)
})

function attentionActionMessages(log: ExecutionLogSummary): ActionExecutionResult[] {
  return log.actions.filter((action) => (action.status === 'failed' || action.status === 'cancelled' || action.status === 'skipped') && Boolean(action.message || action.skipReason))
}

function actionsWithCommandOutput(log: ExecutionLogSummary): ActionExecutionResult[] {
  return log.actions.filter(hasCommandOutput)
}

function hasCommandOutput(action: ActionExecutionResult) {
  return Boolean(action.stdout || action.stderr || typeof action.exitCode === 'number')
}

function eventType(event: ExecutionEventPayload) {
  return eventStatusType(event)
}

function eventTitle(event: ExecutionEventPayload) {
  return event.actionName || event.result?.actionName || event.taskName
}

function eventContent(event: ExecutionEventPayload) {
  const prefix = event.currentIndex && event.totalActions ? `${event.currentIndex}/${event.totalActions} · ` : ''
  return `${prefix}${event.result?.message || event.message || eventStatusLabel(event.status)}`
}

function eventKey(event: ExecutionEventPayload, index: number) {
  return `${event.runId}-${event.status}-${event.actionId || 'task'}-${event.currentIndex || index}`
}

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== 'number') return ''
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toFixed(1)} s`
}
</script>

<template>
  <NCard size="small" class="execution" title="执行反馈">
    <section v-if="currentRun" class="run-card">
      <div class="run-heading">
        <span class="run-title">{{ runTitle }}</span>
        <NTag size="small" :type="runStatusType">{{ statusLabel(currentRun.status) }}</NTag>
      </div>
      <NProgress type="line" :percentage="currentRun.progressPercent" :status="runStatusType" :height="8" />
      <div class="run-meta">
        <span>{{ currentRun.completedActions }}/{{ currentRun.totalActions }} 个动作</span>
        <span v-if="currentRun.currentActionName">当前：{{ currentRun.currentActionName }}</span>
        <span>{{ currentRun.message }}</span>
      </div>
    </section>

    <NGrid :cols="2" :x-gap="14" responsive="screen">
      <NGi>
        <h3 class="subhead">当前事件</h3>
        <NEmpty v-if="visibleEvents.length === 0" description="暂无执行事件" />
        <NTimeline v-else>
          <NTimelineItem
            v-for="(event, index) in visibleEvents"
            :key="eventKey(event, index)"
            :type="eventType(event)"
            :title="eventTitle(event)"
            :content="eventContent(event)"
          />
        </NTimeline>
      </NGi>
      <NGi>
        <h3 class="subhead">最近摘要</h3>
        <NEmpty v-if="logs.length === 0" description="暂无日志" />
        <NList v-else>
          <NListItem v-for="log in logs" :key="log.id">
            <template #prefix>
              <NTag size="small" :type="log.status === 'success' ? 'success' : log.status === 'failed' ? 'error' : 'warning'">
                {{ statusLabel(log.status) }}
              </NTag>
            </template>
            <NThing
              :title="log.scope === 'action' ? `${log.taskName} · 单动作` : log.taskName"
              :description="`${log.startedAt} · ${log.actions.length} 个动作`"
            />
            <ul v-if="attentionActionMessages(log).length > 0" class="error-list">
              <li
                v-for="action in attentionActionMessages(log)"
                :key="action.actionId"
                class="error-item"
                :class="{ 'warning-item': action.status === 'cancelled' }"
              >
                <span class="error-action">{{ action.actionName }}</span>
                <span class="error-message">{{ action.skipReason || action.message }}</span>
              </li>
            </ul>
            <div v-if="actionsWithCommandOutput(log).length > 0" class="output-list">
              <details v-for="action in actionsWithCommandOutput(log)" :key="`${log.id}-${action.actionId}`" class="output-block">
                <summary>
                  {{ action.actionName }}
                  <span v-if="typeof action.exitCode === 'number'">退出码 {{ action.exitCode }}</span>
                  <span v-if="formatDuration(action.durationMs)">{{ formatDuration(action.durationMs) }}</span>
                </summary>
                <pre v-if="action.stdout" class="command-output stdout">{{ action.stdout }}</pre>
                <pre v-if="action.stderr" class="command-output stderr">{{ action.stderr }}</pre>
              </details>
            </div>
          </NListItem>
        </NList>
      </NGi>
    </NGrid>

    <section v-if="latestSummary" class="latest-summary">
      <span>最近一次：{{ latestSummary.taskName }}</span>
      <span>{{ statusLabel(latestSummary.status) }}</span>
      <span>{{ latestSummary.finishedAt }}</span>
    </section>
  </NCard>
</template>

<style scoped>
.execution {
  border-radius: 8px;
}

.run-card {
  display: grid;
  gap: 9px;
  margin-bottom: 14px;
  padding: 12px;
  border: 1px solid rgba(82, 106, 171, 0.18);
  border-radius: 8px;
  background: rgba(18, 25, 44, 0.42);
}

.run-heading,
.run-meta,
.latest-summary {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.run-title {
  min-width: 0;
  overflow: hidden;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-meta,
.latest-summary {
  color: #8b96b8;
  font-size: 12px;
}

.subhead {
  margin: 0 0 8px;
  font-size: 15px;
}

.error-list,
.output-list {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.error-item {
  display: grid;
  gap: 4px;
  padding: 8px 10px;
  border: 1px solid rgba(239, 68, 68, 0.28);
  border-radius: 8px;
  background: rgba(239, 68, 68, 0.08);
}

.error-action {
  font-size: 12px;
  font-weight: 700;
  color: #ff8a8a;
}

.warning-item {
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.08);
}

.warning-item .error-action {
  color: #fbbf24;
}

.error-message {
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
  color: inherit;
}

.output-block {
  border: 1px solid rgba(82, 106, 171, 0.18);
  border-radius: 8px;
  background: rgba(13, 18, 35, 0.58);
  padding: 8px 10px;
}

.output-block summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}

.output-block summary span {
  margin-left: 8px;
  color: #8b96b8;
  font-weight: 500;
}

.command-output {
  max-height: 180px;
  overflow: auto;
  margin: 8px 0 0;
  border-radius: 6px;
  padding: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.45;
}

.stdout {
  background: rgba(34, 197, 94, 0.08);
}

.stderr {
  background: rgba(239, 68, 68, 0.1);
}

.latest-summary {
  margin-top: 12px;
  border-top: 1px solid rgba(82, 106, 171, 0.14);
  padding-top: 10px;
}
</style>
