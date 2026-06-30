<script setup lang="ts">
import { computed, toRef } from 'vue'
import { useTaskSearch } from '@/composables/useTaskSearch'
import type { TaskItem } from '@/types/domain'

const props = defineProps<{
  tasks: TaskItem[]
  categories: string[]
  selectedTaskId: string | null
}>()

const emit = defineEmits<{
  select: [taskId: string]
  create: []
  toggleEnabled: [taskId: string, enabled: boolean]
}>()

const tasksRef = toRef(props, 'tasks')
const { query, category, results } = useTaskSearch(tasksRef)

const resultCount = computed(() => `${results.value.length} 个事项`)
</script>

<template>
  <section class="task-list">
    <NButton class="create-button" type="primary" block @click="emit('create')">新增事项</NButton>
    <NInput v-model:value="query" clearable placeholder="搜索名称、关键词、分类" />
    <NSelect v-model:value="category" :options="categories.map((item) => ({ label: item, value: item }))" />

    <div class="list-meta">{{ resultCount }}</div>
    <NScrollbar class="scroll">
      <button
        v-for="task in results"
        :key="task.id"
        class="task-item"
        :class="{ 'task-item-active': task.id === selectedTaskId, 'task-item-disabled': !task.enabled }"
        type="button"
        @click="emit('select', task.id)"
      >
        <span class="task-main">
          <span class="task-name">{{ task.name }}</span>
          <span class="task-detail">{{ task.category || '未分类' }} · {{ task.actions.length }} 个动作</span>
        </span>
        <span class="task-side">
          <NTag size="small" :type="task.riskLevel === 'high' ? 'error' : task.riskLevel === 'medium' ? 'warning' : 'success'">
            {{ task.riskLevel }}
          </NTag>
          <NSwitch
            size="small"
            :value="task.enabled"
            @update:value="(enabled: boolean) => emit('toggleEnabled', task.id, enabled)"
            @click.stop
          />
        </span>
      </button>
    </NScrollbar>
  </section>
</template>

<style scoped>
.task-list {
  display: grid;
  gap: 10px;
}

.create-button {
  margin-bottom: 2px;
}

.list-meta {
  color: #667085;
  font-size: 12px;
}

.scroll {
  max-height: calc(100vh - 210px);
}

.task-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  padding: 10px;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.task-item:hover,
.task-item-active {
  border-color: #8fb8ff;
  background: #edf4ff;
}

.task-item-disabled {
  opacity: 0.58;
}

.task-main {
  min-width: 0;
}

.task-name,
.task-detail {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-name {
  font-weight: 650;
}

.task-detail {
  color: #667085;
  font-size: 12px;
}

.task-side {
  display: grid;
  justify-items: end;
  gap: 8px;
}
</style>
