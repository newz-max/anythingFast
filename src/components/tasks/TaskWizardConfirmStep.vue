<script setup lang="ts">
import ActionPreview from '@/components/tasks/ActionPreview.vue'
import type { TaskItem, ValidationResult } from '@/types/domain'

defineProps<{
  task: TaskItem
  validation: ValidationResult | null
  actionCount: number
  containsCommand: boolean
}>()
</script>

<template>
  <section class="confirm-step">
    <ActionPreview :task="task" :action-count="actionCount" :contains-command="containsCommand" />

    <NDescriptions class="summary" label-placement="left" :column="1" bordered>
      <NDescriptionsItem label="事项名称">{{ task.name || '未命名事项' }}</NDescriptionsItem>
      <NDescriptionsItem label="分类">{{ task.category || '未分类' }}</NDescriptionsItem>
      <NDescriptionsItem label="状态">{{ task.enabled ? '启用' : '停用' }}</NDescriptionsItem>
      <NDescriptionsItem label="动作数量">{{ task.actions.length }}</NDescriptionsItem>
    </NDescriptions>

    <NAlert v-if="validation && !validation.valid" type="warning" title="保存前需要修正">
      <ul class="issue-list">
        <li v-for="issue in validation.issues" :key="`${issue.field}-${issue.message}`">{{ issue.message }}</li>
      </ul>
    </NAlert>
    <NAlert v-else type="success" title="配置可以保存">确认后会写入本地事项配置。</NAlert>
  </section>
</template>

<style scoped>
.confirm-step {
  display: grid;
  gap: 14px;
}

.summary {
  background: #ffffff;
}

.issue-list {
  margin: 0;
  padding-left: 18px;
}
</style>
