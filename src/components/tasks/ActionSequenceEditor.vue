<script setup lang="ts">
import type { ActionType, TaskAction } from '@/types/domain'

const actions = defineModel<TaskAction[]>('actions', { required: true })

const emit = defineEmits<{
  add: [type: ActionType]
  remove: [actionId: string]
  move: [actionId: string, direction: -1 | 1]
}>()

const actionTypeOptions: Array<{ label: string; value: ActionType }> = [
  { label: '打开程序', value: 'openProgram' },
  { label: '打开 URL', value: 'openUrl' },
  { label: '打开文件', value: 'openFile' },
  { label: '打开文件夹', value: 'openFolder' },
  { label: '执行命令', value: 'runCommand' },
  { label: '延时等待', value: 'delay' }
]

function addAction(value: ActionType | null) {
  if (value) emit('add', value)
}
</script>

<template>
  <section class="sequence">
    <header class="sequence-header">
      <div>
        <h3 class="section-title">动作序列</h3>
        <p class="section-subtitle">动作会按照列表顺序执行，停用动作会跳过。</p>
      </div>
      <NDropdown trigger="click" :options="actionTypeOptions" @select="addAction">
        <NButton type="primary">新增动作</NButton>
      </NDropdown>
    </header>

    <NEmpty v-if="actions.length === 0" description="还没有动作" />
    <div v-else class="action-list">
      <NCard v-for="(action, index) in actions" :key="action.id" size="small" class="action-card">
        <template #header>
          <div class="action-header">
            <div class="action-title">
              <span class="order">{{ index + 1 }}</span>
              <NInput v-model:value="action.name" size="small" placeholder="动作名称" />
            </div>
            <NSpace align="center">
              <NTag size="small" :type="action.riskLevel === 'high' ? 'error' : action.riskLevel === 'medium' ? 'warning' : 'success'">
                {{ action.riskLevel }}
              </NTag>
              <NSwitch v-model:value="action.enabled" size="small" />
              <NButton size="small" :disabled="index === 0" @click="emit('move', action.id, -1)">上移</NButton>
              <NButton size="small" :disabled="index === actions.length - 1" @click="emit('move', action.id, 1)">下移</NButton>
              <NButton size="small" type="error" secondary @click="emit('remove', action.id)">删除</NButton>
            </NSpace>
          </div>
        </template>
        <ActionParamForm v-model="actions[index]" />
      </NCard>
    </div>
  </section>
</template>

<style scoped>
.sequence {
  display: grid;
  gap: 12px;
}

.sequence-header,
.action-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.section-title {
  margin: 0;
  font-size: 18px;
}

.section-subtitle {
  margin: 3px 0 0;
  color: #667085;
  font-size: 13px;
}

.action-list {
  display: grid;
  gap: 10px;
}

.action-card {
  border-radius: 8px;
}

.action-title {
  display: grid;
  grid-template-columns: 28px minmax(160px, 260px);
  align-items: center;
  gap: 8px;
}

.order {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 50%;
  background: #edf4ff;
  color: #1f5fbf;
  font-weight: 700;
}
</style>
