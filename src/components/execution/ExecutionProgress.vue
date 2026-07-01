<script setup lang="ts">
import type { ExecutionEventPayload } from '@/api/events'
import type { ExecutionLogSummary } from '@/types/domain'

defineProps<{
  events: ExecutionEventPayload[]
  logs: ExecutionLogSummary[]
}>()
</script>

<template>
  <NCard size="small" class="execution" title="执行反馈">
    <NGrid :cols="2" :x-gap="14" responsive="screen">
      <NGi>
        <h3 class="subhead">当前事件</h3>
        <NEmpty v-if="events.length === 0" description="暂无执行事件" />
        <NTimeline v-else>
          <NTimelineItem
            v-for="(event, index) in events"
            :key="`${event.taskId}-${index}`"
            :type="event.status === 'failed' ? 'error' : event.status === 'finished' ? 'success' : 'info'"
            :title="event.action?.actionName || event.taskName"
            :content="event.action?.message || event.message || event.status"
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
                {{ log.status }}
              </NTag>
            </template>
            <NThing
              :title="log.scope === 'action' ? `${log.taskName} · 单动作` : log.taskName"
              :description="`${log.startedAt} · ${log.actions.length} 个动作`"
            />
          </NListItem>
        </NList>
      </NGi>
    </NGrid>
  </NCard>
</template>

<style scoped>
.execution {
  border-radius: 8px;
}

.subhead {
  margin: 0 0 8px;
  font-size: 15px;
}
</style>
