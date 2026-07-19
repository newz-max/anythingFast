<script setup lang="ts">
import { computed } from 'vue'
import type { ExecutionEventPayload } from '@/api/events'
import {
  deriveSlowestActionIds,
  eventStatusLabel,
  eventStatusType,
  formatActionDuration,
  primaryFailureDiagnostic,
  runStatusType as getRunStatusType,
  runTitle as getRunTitle,
  statusLabel
} from '@/domain/executionPresentation'
import type { CopyExecutionErrorPayload, ExecutionResultActionTarget } from '@/domain/executionPresentation'
import type { ExecutionRunSnapshot, ExecutionTimelineEntry } from '@/stores/executionStore'
import type { ExecutionLogSummary, ExecutionStatus } from '@/types/domain'

const props = defineProps<{
  runs: ExecutionRunSnapshot[]
  timeline: ExecutionTimelineEntry[]
  logs: ExecutionLogSummary[]
  logLoadError?: string | null
}>()

const emit = defineEmits<{
  'copy-error': [payload: CopyExecutionErrorPayload]
  'retry-action': [payload: ExecutionResultActionTarget]
  'edit-action': [payload: ExecutionResultActionTarget]
}>()

const visibleTimeline = computed(() => props.timeline.slice(-20))
const latestSummary = computed(() => props.logs[0] ?? null)
const logViews = computed(() => props.logs.map((log) => {
  const slowestActionIds = new Set(deriveSlowestActionIds(log))
  return {
    log,
    actions: log.actions.map((action) => ({
      action,
      diagnostic: primaryFailureDiagnostic(action),
      durationLabel: formatActionDuration(action.durationMs),
      isSlowest: slowestActionIds.has(action.actionId),
      hasCommandOutput: Boolean(action.stdout || action.stderr || typeof action.exitCode === 'number')
    }))
  }
}))

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

function resultStatusType(status: ExecutionStatus) {
  return getRunStatusType(status)
}

function runTitle(run: ExecutionRunSnapshot) {
  return getRunTitle(run)
}

function resultTarget(log: ExecutionLogSummary, actionId: string): ExecutionResultActionTarget {
  return { logId: log.id, taskId: log.taskId, actionId }
}

function copyError(log: ExecutionLogSummary, actionId: string, diagnostic: string | null) {
  if (!diagnostic) return
  emit('copy-error', { ...resultTarget(log, actionId), diagnostic })
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
          <NListItem v-for="view in logViews" :key="view.log.id">
            <template #prefix>
              <NTag size="small" :type="resultStatusType(view.log.status)">
                {{ statusLabel(view.log.status) }}
              </NTag>
            </template>
            <NThing
              :title="view.log.scope === 'action' ? `${view.log.taskName} · 单动作` : view.log.taskName"
              :description="`${view.log.startedAt} · ${view.log.actions.length} 个动作`"
            />
            <ul v-if="view.actions.length > 0" class="result-list">
              <li v-for="actionView in view.actions" :key="`${view.log.id}-${actionView.action.actionId}`" class="result-item">
                <div class="result-heading">
                  <span class="result-action">{{ actionView.action.actionName }}</span>
                  <NTag size="small" :type="resultStatusType(actionView.action.status)">
                    {{ statusLabel(actionView.action.status) }}
                  </NTag>
                  <span v-if="actionView.durationLabel" class="duration-label">{{ actionView.durationLabel }}</span>
                  <NTag v-if="actionView.isSlowest" size="small" type="warning">最慢</NTag>
                </div>
                <span v-if="actionView.action.skipReason || actionView.action.message" class="result-message">
                  {{ actionView.action.skipReason || actionView.action.message }}
                </span>
                <div v-if="actionView.action.status === 'failed'" class="result-actions">
                  <NButton
                    size="tiny"
                    secondary
                    :disabled="!actionView.diagnostic"
                    @click="copyError(view.log, actionView.action.actionId, actionView.diagnostic)"
                  >
                    复制错误
                  </NButton>
                  <NButton size="tiny" secondary @click="emit('retry-action', resultTarget(view.log, actionView.action.actionId))">
                    重试动作
                  </NButton>
                  <NButton size="tiny" secondary @click="emit('edit-action', resultTarget(view.log, actionView.action.actionId))">
                    编辑动作
                  </NButton>
                </div>
                <details v-if="actionView.hasCommandOutput" class="output-block">
                  <summary>
                    命令输出
                    <span v-if="typeof actionView.action.exitCode === 'number'">退出码 {{ actionView.action.exitCode }}</span>
                  </summary>
                  <pre v-if="actionView.action.stdout" class="command-output stdout">{{ actionView.action.stdout }}</pre>
                  <pre v-if="actionView.action.stderr" class="command-output stderr">{{ actionView.action.stderr }}</pre>
                </details>
              </li>
            </ul>
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

.result-list {
  display: grid;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.result-item {
  display: grid;
  gap: 7px;
  padding: 8px 10px;
  border: 1px solid rgba(82, 106, 171, 0.18);
  border-radius: 8px;
  background: rgba(13, 18, 35, 0.36);
}

.result-heading,
.result-actions {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.result-action {
  min-width: 0;
  font-size: 12px;
  font-weight: 700;
  color: #dce4fb;
}

.result-message {
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
  color: inherit;
}

.duration-label {
  color: #8b96b8;
  font-size: 12px;
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
