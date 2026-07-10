<script setup lang="ts">
import { describeAction, describeCondition, getActionTypeLabel } from '@/domain/actionPresentation'
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
                预估 {{ action.riskLevel }}
              </NTag>
            </div>
            <div class="action-detail">{{ describeAction(action) }}</div>
            <div v-if="action.condition && action.condition.type !== 'always'" class="condition-detail">
              {{ describeCondition(action.condition) }}
            </div>
          </div>
          <div class="action-controls">
            <NSpace align="center">
              <NSwitch v-model:value="action.enabled" size="small" />
              <NButton size="small" secondary @click="$emit('edit', action)">编辑</NButton>
              <NButton size="small" :disabled="index === 0" @click="$emit('move', action.id, -1)">上移</NButton>
              <NButton size="small" :disabled="index === actions.length - 1" @click="$emit('move', action.id, 1)">下移</NButton>
              <NButton size="small" type="error" secondary @click="$emit('remove', action.id)">删除</NButton>
            </NSpace>
          </div>
        </div>
      </NCard>
    </div>
  </section>
</template>

<style scoped>
.action-step {
  display: grid;
  gap: 12px;
  min-width: 0;
  overflow: hidden;
}

.action-step-header,
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
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.action-card {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  border-radius: 8px;
}

.action-card :deep(.n-card__content) {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.action-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.order {
  display: inline-grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 50%;
  background: #edf4ff;
  color: #1f5fbf;
  font-weight: 700;
}

.action-main {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.action-title-row {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
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

.condition-detail {
  margin-top: 3px;
  overflow: hidden;
  color: #8b96b8;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-controls {
  grid-column: 2;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  justify-self: end;
}

.action-controls :deep(.n-space) {
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.action-controls :deep(.n-button) {
  min-width: 0;
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

  .action-title-row {
    flex-wrap: wrap;
    overflow: visible;
  }

  .action-controls {
    grid-column: 1 / -1;
    width: 100%;
    justify-self: stretch;
    overflow: visible;
  }

  .action-controls :deep(.n-space) {
    width: 100%;
    justify-content: flex-end;
  }
}

@media (max-width: 480px) {
  .action-controls :deep(.n-space) {
    justify-content: flex-start;
  }

  .action-controls :deep(.n-button) {
    flex: 1 1 72px;
  }
}
</style>
