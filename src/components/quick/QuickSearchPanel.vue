<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useTaskSearch } from '@/composables/useTaskSearch'
import { useTaskExecution } from '@/composables/useTaskExecution'
import { useTaskStore } from '@/stores/taskStore'

const taskStore = useTaskStore()
const { query, results } = useTaskSearch(computed(() => taskStore.tasks.filter((task) => task.enabled)))
const { execute, running } = useTaskExecution()
const selectedIndex = shallowRef(0)
const inputRef = useTemplateRef<{ focus: () => void }>('searchInput')

const selectedTask = computed(() => results.value[selectedIndex.value] || null)

onMounted(async () => {
  await nextTick()
  inputRef.value?.focus()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    void hideWindow()
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, Math.max(results.value.length - 1, 0))
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  }
  if (event.key === 'Enter' && selectedTask.value) {
    event.preventDefault()
    void execute(selectedTask.value)
  }
}

async function hideWindow() {
  if ('__TAURI_INTERNALS__' in window) {
    await getCurrentWindow().hide()
  }
}
</script>

<template>
  <main class="quick-panel">
    <NInput
      ref="searchInput"
      v-model:value="query"
      size="large"
      clearable
      placeholder="搜索事项并回车执行"
      @update:value="selectedIndex = 0"
    />
    <div class="results">
      <button
        v-for="(task, index) in results.slice(0, 8)"
        :key="task.id"
        type="button"
        class="result-item"
        :class="{ active: index === selectedIndex }"
        @mouseenter="selectedIndex = index"
        @click="execute(task)"
      >
        <span class="result-main">
          <span class="result-name">{{ task.name }}</span>
          <span class="result-detail">{{ task.category || '未分类' }} · {{ task.description || `${task.actions.length} 个动作` }}</span>
        </span>
        <NTag size="small" :type="task.riskLevel === 'high' ? 'error' : task.riskLevel === 'medium' ? 'warning' : 'success'">
          {{ task.riskLevel }}
        </NTag>
      </button>
      <NEmpty v-if="results.length === 0" description="没有匹配事项" />
    </div>
    <footer class="status">
      <span>Alt+Space 唤起 · ↑↓ 选择 · Enter 执行 · Esc 关闭</span>
      <NSpin v-if="running" size="small" />
    </footer>
  </main>
</template>

<style scoped>
.quick-panel {
  display: grid;
  gap: 12px;
  min-height: 100vh;
  padding: 14px;
  background: #ffffff;
}

.results {
  display: grid;
  align-content: start;
  gap: 8px;
}

.result-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e4e7ec;
  border-radius: 8px;
  background: #ffffff;
  padding: 10px 12px;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.result-item.active,
.result-item:hover {
  border-color: #2563eb;
  background: #edf4ff;
}

.result-main {
  min-width: 0;
}

.result-name,
.result-detail {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-name {
  font-weight: 700;
}

.result-detail,
.status {
  color: #667085;
  font-size: 12px;
}

.status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #eef2f7;
  padding-top: 8px;
}
</style>
