<script setup lang="ts">
import type { TaskItem } from '@/types/domain'

defineProps<{
  task: TaskItem
  actionCount: number
  containsCommand: boolean
}>()
</script>

<template>
  <NCard size="small" class="preview" title="配置预览">
    <div class="metric">
      <span>启用动作</span>
      <strong>{{ actionCount }}</strong>
    </div>
    <div class="metric">
      <span>风险等级</span>
      <NTag :type="task.riskLevel === 'high' ? 'error' : task.riskLevel === 'medium' ? 'warning' : 'success'">
        {{ task.riskLevel }}
      </NTag>
    </div>
    <div class="metric">
      <span>包含命令</span>
      <strong>{{ containsCommand ? '是' : '否' }}</strong>
    </div>
    <NDivider />
    <ol class="steps">
      <li v-for="action in task.actions" :key="action.id" :class="{ disabled: !action.enabled }">
        {{ action.name || action.type }} · {{ action.type }}
      </li>
    </ol>
  </NCard>
</template>

<style scoped>
.preview {
  border-radius: 8px;
}

.metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
  color: #475467;
}

.steps {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 18px;
  color: #475467;
  font-size: 13px;
}

.disabled {
  opacity: 0.48;
  text-decoration: line-through;
}
</style>
