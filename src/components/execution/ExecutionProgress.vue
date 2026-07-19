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
import type { ExecutionRunSnapshot, ExecutionTimelineEntry } from '@/stores/executionStore'
import type { ActionExecutionResult, ExecutionLogSummary } from '@/types/domain'

const props = defineProps<{
  runs: ExecutionRunSnapshot[]
  timeline: ExecutionTimelineEntry[]
  logs: ExecutionLogSummary[]
  logLoadError?: string | null
}>()

const visibleTimeline = computed(() => props.timeline.slice(-20))
const latestSummary = computed(() => props.logs[0] ?? null)

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
  const actionName = event.actionName || event.result?.actionName
  return actionName ? `${event.taskName} · ${actionName}` : event.taskName
}

function eventContent(event: ExecutionEventPayload) {
  const prefix = event.currentIndex && event.totalActions ? `${event.currentIndex}/${event.totalActions} · ` : ''
  return `${prefix}${event.result?.message || event.message || eventStatusLabel(event.status)}`
}

function runStatusType(run: ExecutionRunSnapshot) {
  return getRunStatusType(run.status)
}

function runTitle(run: ExecutionRunSnapshot) {
  return getRunTitle(run)
}

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== 'number') return ''
  if (durationMs < 1000) return `${durationMs} ms`
  return `${(durationMs / 1000).toFixed(1)} s`
}
</script>

<template>
  <NCard size="small" class="execution" title="执行反馈">
    <section v-if="runs.length > 0" class="run-list" aria-label="当前执行">
      <article v-for="run in runs" :key="run.runId || run.targetKey" class="run-card">
        <div class="run-heading">
          <span class="run-title">{{ runTitle(run) }}</span>
          <NTag size="small" :type="runStatusType(run)">{{ statusLabel(run.status) }}</NTag>
        </div>
        <NProgress type="line" :percentage="run.progressPercent" :status="runStatusType(run)" :height="8" />
        <div class="run-meta">
          <span>{{ run.completedActions }}/{{ run.totalActions }} 个动作</span>
          <span v-if="run.currentActionName">当前：{{ run.currentActionName }}</span>
          <span>{{ run.message }}</span>
        </div>
      </article>
    </section>

    <NGrid :cols="2" :x-gap="14" responsive="screen">
      <NGi>
        <h3 class="subhead">当前事件</h3>
        <NEmpty v-if="visibleTimeline.length === 0" description="暂无执行事件" />
        <div v-else class="event-timeline-scroll">
          <NTimeline>
            <NTimelineItem
              v-for="entry in visibleTimeline"
              :key="entry.sequence"
              :type="eventType(entry.payload)"
              :title="eventTitle(entry.payload)"
              :content="eventContent(entry.payload)"
            />
          </NTimeline>
        </div>
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

    <NAlert v-if="logLoadError" type="error" title="执行日志加载失败">
      {{ logLoadError }}
    </NAlert>

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

.run-list {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}

.run-card {
  display: grid;
  gap: 9px;
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

.event-timeline-scroll {
  box-sizing: border-box;
  height: 360px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 8px;
  scrollbar-gutter: stable;
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
