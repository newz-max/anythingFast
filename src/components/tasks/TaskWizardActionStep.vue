<script setup lang="ts">
import { describeAction, getActionTypeLabel } from '@/domain/actionPresentation'
import type { TaskAction } from '@/types/domain'

const actions = defineModel<TaskAction[]>('actions', { required: true })

defineEmits<{
  create: []
  edit: [action: TaskAction]
  remove: [actionId: string]
  move: [actionId: string, direction: -1 | 1]
}>()
</script>

<template>
  <section class="action-step">
    <header class="action-step-header">
      <div class="action-step-copy">
        <h3 class="section-title">动作编排</h3>
        <p class="section-subtitle">动作会按照列表顺序执行，使用“延时等待”控制动作之间的间隔。</p>
      </div>
      <NButton class="create-action-button" type="primary" @click="$emit('create')">新增动作</NButton>
    </header>

    <NEmpty v-if="actions.length === 0" description="还没有动作">
      <template #extra>
        <NButton type="primary" @click="$emit('create')">新增动作</NButton>
      </template>
    </NEmpty>

    <div v-else class="action-list">
      <NCard v-for="(action, index) in actions" :key="action.id" size="small" class="action-card">
        <div class="action-row">
          <span class="order">{{ index + 1 }}</span>
          <div class="action-main">
            <div class="action-title-row">
              <strong class="action-title">{{ action.name || getActionTypeLabel(action.type) }}</strong>
              <NTag size="small">{{ getActionTypeLabel(action.type) }}</NTag>
              <NTag size="small" :type="action.riskLevel === 'high' ? 'error' : action.riskLevel === 'medium' ? 'warning' : 'success'">
                {{ action.riskLevel }}
              </NTag>
            </div>
            <div class="action-detail">{{ describeAction(action) }}</div>
          </div>
          <NSpace align="center">
            <NSwitch v-model:value="action.enabled" size="small" />
            <NButton size="small" secondary @click="$emit('edit', action)">编辑</NButton>
            <NButton size="small" :disabled="index === 0" @click="$emit('move', action.id, -1)">上移</NButton>
            <NButton size="small" :disabled="index === actions.length - 1" @click="$emit('move', action.id, 1)">下移</NButton>
            <NButton size="small" type="error" secondary @click="$emit('remove', action.id)">删除</NButton>
          </NSpace>
        </div>
      </NCard>
    </div>
  </section>
</template>

<style scoped>
.action-step {
  display: grid;
  gap: 12px;
}

.action-step-header,
.action-row,
.action-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-step-header {
  justify-content: space-between;
  min-width: 0;
}

.action-step-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.section-title {
  margin: 0;
  font-size: 18px;
  line-height: 1.3;
}

.section-subtitle {
  margin: 3px 0 0;
  color: #667085;
  font-size: 13px;
  line-height: 1.45;
}

.create-action-button {
  flex: 0 0 auto;
}

.action-list {
  display: grid;
  gap: 10px;
}

.action-card {
  border-radius: 8px;
}

.action-row {
  justify-content: space-between;
  min-width: 0;
  flex-wrap: wrap;
}

.order {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border-radius: 50%;
  background: #edf4ff;
  color: #1f5fbf;
  font-weight: 700;
}

.action-main {
  min-width: 0;
  flex: 1;
}

.action-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-detail {
  margin-top: 5px;
  overflow: hidden;
  color: #667085;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .action-step-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .action-step-header :deep(.n-button) {
    width: 100%;
  }

  .action-row {
    align-items: flex-start;
  }

  .action-main {
    flex-basis: calc(100% - 40px);
  }

  .action-title-row {
    flex-wrap: wrap;
  }

  .action-row :deep(.n-space) {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 480px) {
  .action-row :deep(.n-space) {
    justify-content: flex-start;
  }

  .action-row :deep(.n-button) {
    flex: 1 1 72px;
  }
}
</style>
