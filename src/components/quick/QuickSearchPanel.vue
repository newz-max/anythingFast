<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, shallowRef, useTemplateRef, watch } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { describeAction, getActionTypeLabel } from '@/domain/actionPresentation'
import { useTaskSearch } from '@/composables/useTaskSearch'
import { useTaskExecution } from '@/composables/useTaskExecution'
import { useTaskStore } from '@/stores/taskStore'
import logoUrl from '@/assets/logo.png'
import type { RiskLevel, TaskAction, TaskItem } from '@/types/domain'

type RiskTagType = 'success' | 'warning' | 'error'

const taskStore = useTaskStore()
const enabledTasks = computed(() => taskStore.tasks.filter((task) => task.enabled))
const { query, results } = useTaskSearch(enabledTasks)
const { execute, running } = useTaskExecution()
const selectedIndex = shallowRef(0)
const inputRef = useTemplateRef<{ focus: () => void }>('searchInput')

const visibleResults = computed(() => results.value.slice(0, 8))
const resultRows = computed(() =>
  visibleResults.value.map((task) => {
    const action = findDisplayAction(task, query.value)
    return {
      task,
      actionDetail: action ? `${getActionTypeLabel(action.type)} · ${describeAction(action)}` : `${task.actions.length} 个动作`,
      categoryTone: categoryTone(task.category),
      meta: formatTaskMeta(task)
    }
  })
)
const selectedTask = computed(() => resultRows.value[selectedIndex.value]?.task || null)
const resultCountLabel = computed(() => (taskStore.loading ? '加载中' : `${results.value.length} 个可执行事项`))

watch(
  () => resultRows.value.length,
  (length) => {
    selectedIndex.value = Math.min(selectedIndex.value, Math.max(length - 1, 0))
  },
  { immediate: true }
)

onMounted(async () => {
  await nextTick()
  inputRef.value?.focus()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => window.removeEventListener('keydown', onKeydown))

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    void hideWindow()
    return
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, Math.max(resultRows.value.length - 1, 0))
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    return
  }
  if (event.key === 'Enter' && selectedTask.value && !running.value) {
    event.preventDefault()
    void execute(selectedTask.value)
  }
}

function resetSelection() {
  selectedIndex.value = 0
}

function runTask(task: TaskItem) {
  if (running.value) return
  void execute(task)
}

async function hideWindow() {
  if ('__TAURI_INTERNALS__' in window) {
    await getCurrentWindow().hide()
  }
}

function findDisplayAction(task: TaskItem, searchQuery: string) {
  const normalizedQuery = normalize(searchQuery)
  if (!normalizedQuery) {
    return task.actions.find((action) => action.enabled) || task.actions[0] || null
  }
  return (
    task.actions.find((action) => actionSearchText(action).includes(normalizedQuery)) ||
    task.actions.find((action) => action.enabled) ||
    task.actions[0] ||
    null
  )
}

function actionSearchText(action: TaskAction) {
  return normalize([action.name || '', getActionTypeLabel(action.type), describeAction(action)].join(' '))
}

function normalize(value: string) {
  return value.trim().toLowerCase()
}

function riskTagType(riskLevel: RiskLevel): RiskTagType {
  if (riskLevel === 'high') return 'error'
  if (riskLevel === 'medium') return 'warning'
  return 'success'
}

function riskLabel(riskLevel: RiskLevel) {
  if (riskLevel === 'high') return '高风险'
  if (riskLevel === 'medium') return '中风险'
  return '低风险'
}

function categoryTone(categoryName?: string) {
  const normalized = categoryName?.trim() || '未分类'
  if (normalized === '工作') return 'blue'
  if (normalized === '学习') return 'green'
  if (normalized === '生活') return 'amber'
  if (normalized === '其他') return 'purple'
  return 'slate'
}

function formatTaskMeta(task: TaskItem) {
  if (task.lastRunAt) return `上次 ${formatTaskTime(task.lastRunAt)}`
  const enabledActionCount = task.actions.filter((action) => action.enabled).length
  return `${enabledActionCount} 个可执行动作`
}

function formatTaskTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未运行'

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const prefix =
    date.toDateString() === now.toDateString()
      ? '今天'
      : date.toDateString() === yesterday.toDateString()
        ? '昨天'
        : `${date.getMonth() + 1}月${date.getDate()}日`

  return `${prefix} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}
</script>

<template>
  <main class="quick-panel">
    <div class="quick-shell">
      <header class="quick-header" data-tauri-drag-region>
        <span class="brand-mark" aria-hidden="true" data-tauri-drag-region>
          <img :src="logoUrl" alt="" data-tauri-drag-region />
        </span>
        <span class="brand-copy" data-tauri-drag-region>
          <strong data-tauri-drag-region>FlowTask</strong>
          <small data-tauri-drag-region>快捷搜索</small>
        </span>
        <span class="result-count" data-tauri-drag-region>{{ resultCountLabel }}</span>
      </header>

      <section class="search-box">
        <span class="search-icon" aria-hidden="true"></span>
        <NInput
          ref="searchInput"
          v-model:value="query"
          class="quick-input"
          size="large"
          clearable
          placeholder="搜索事项、URL、路径或命令"
          :bordered="false"
          @update:value="resetSelection"
        />
      </section>

      <section class="results" aria-live="polite">
        <div v-if="taskStore.loading" class="state-panel">
          <NSpin size="small" />
          <span>正在加载事项配置</span>
        </div>

        <template v-else>
          <button
            v-for="(row, index) in resultRows"
            :key="row.task.id"
            type="button"
            class="result-item"
            :class="{ active: index === selectedIndex }"
            @mouseenter="selectedIndex = index"
            @click="runTask(row.task)"
          >
            <span class="task-icon" :class="row.categoryTone" aria-hidden="true">
              {{ row.task.name.slice(0, 1) || '事' }}
            </span>
            <span class="result-main">
              <span class="result-title-row">
                <span class="result-name">{{ row.task.name || '未命名事项' }}</span>
                <span class="task-meta">{{ row.meta }}</span>
              </span>
              <span class="result-detail">{{ row.actionDetail }}</span>
              <span class="category-badge" :class="row.categoryTone">{{ row.task.category || '未分类' }}</span>
            </span>
            <NTag size="small" :type="riskTagType(row.task.riskLevel)">
              {{ riskLabel(row.task.riskLevel) }}
            </NTag>
          </button>

          <div v-if="resultRows.length === 0" class="state-panel empty">
            <span class="empty-icon" aria-hidden="true"></span>
            <span>没有匹配的启用事项</span>
          </div>
        </template>
      </section>

      <footer class="status">
        <span>Alt+Space 唤起 · ↑↓ 选择 · Enter 执行 · Esc 关闭</span>
        <NSpin v-if="running" size="small" />
      </footer>
    </div>
  </main>
</template>

<style scoped>
.quick-panel {
  min-width: 0;
  min-height: 100vh;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(6, 12, 27, 0.98), rgba(14, 20, 39, 0.98) 54%, rgba(17, 25, 51, 0.98)),
    #07101f;
  color: #f4f7ff;
  padding: 14px;
}

.quick-shell {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 12px;
  height: calc(100vh - 28px);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(82, 106, 171, 0.26);
  border-radius: 18px;
  background:
    radial-gradient(circle at 18% 0%, rgba(70, 103, 193, 0.18), transparent 38%),
    radial-gradient(circle at 96% 100%, rgba(81, 70, 190, 0.2), transparent 34%),
    rgba(13, 18, 35, 0.82);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 24px 70px rgba(0, 0, 0, 0.32);
  padding: 16px;
}

.quick-header {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  min-height: 40px;
  cursor: default;
}

.brand-mark,
.task-icon {
  display: grid;
  place-items: center;
}

.brand-mark {
  width: 38px;
  height: 38px;
}

.brand-mark img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 8px 14px rgba(35, 101, 255, 0.28));
}

.brand-copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.brand-copy strong {
  overflow: hidden;
  font-size: 16px;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-copy small,
.result-count,
.task-meta,
.result-detail,
.status {
  color: #8b96b8;
}

.brand-copy small,
.result-count,
.status {
  font-size: 12px;
}

.result-count {
  justify-self: end;
  white-space: nowrap;
}

.search-box {
  display: flex;
  min-width: 0;
  align-items: center;
  height: 48px;
  border: 1px solid rgba(93, 117, 174, 0.28);
  border-radius: 13px;
  background: linear-gradient(180deg, rgba(31, 42, 72, 0.9), rgba(20, 28, 50, 0.86));
  padding: 0 13px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.search-icon {
  position: relative;
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  border: 2px solid #aab8d8;
  border-radius: 50%;
  opacity: 0.9;
}

.search-icon::after {
  position: absolute;
  right: -6px;
  bottom: -5px;
  width: 8px;
  height: 2px;
  border-radius: 999px;
  background: #aab8d8;
  content: "";
  transform: rotate(45deg);
}

.quick-input {
  --n-color: transparent !important;
  --n-color-focus: transparent !important;
  --n-text-color: #eef4ff !important;
  --n-placeholder-color: #717d9e !important;
  --n-caret-color: #4d87ff !important;
  min-width: 0;
}

.results {
  display: grid;
  align-content: start;
  gap: 9px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.result-item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  width: 100%;
  min-height: 78px;
  min-width: 0;
  border: 1px solid rgba(82, 106, 171, 0.16);
  border-radius: 12px;
  background: rgba(27, 35, 55, 0.62);
  color: inherit;
  cursor: pointer;
  padding: 13px 13px 12px 15px;
  text-align: left;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}

.result-item.active,
.result-item:hover {
  border-color: rgba(67, 109, 255, 0.9);
  background:
    radial-gradient(circle at 100% 0%, rgba(82, 90, 255, 0.22), transparent 48%),
    rgba(28, 38, 68, 0.8);
  box-shadow: 0 0 0 1px rgba(60, 94, 161, 0.2), 0 12px 30px rgba(19, 42, 119, 0.22);
}

.task-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(145deg, #2563eb, #6d5dff);
  color: #dce9ff;
  font-weight: 800;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 12px 24px rgba(31, 78, 199, 0.24);
}

.task-icon.green {
  background: linear-gradient(145deg, #0e9f83, #163c6e);
}

.task-icon.amber {
  background: linear-gradient(145deg, #dd9a20, #594018);
}

.task-icon.purple {
  background: linear-gradient(145deg, #8a4cff, #41246c);
}

.task-icon.slate {
  background: linear-gradient(145deg, #385072, #1b2740);
}

.result-main {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.result-title-row {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 10px;
}

.result-name,
.task-meta,
.result-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-name {
  min-width: 0;
  color: #f4f7ff;
  font-size: 15px;
  font-weight: 800;
}

.task-meta {
  flex: 0 0 auto;
  font-size: 12px;
}

.result-detail {
  color: #b3bddb;
  font-size: 13px;
}

.category-badge {
  position: relative;
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 5px;
  color: #58a2ff;
  font-size: 11px;
  line-height: 1.2;
}

.category-badge::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  content: "";
}

.category-badge.green {
  color: #29d6ad;
}

.category-badge.amber {
  color: #ffb83e;
}

.category-badge.purple {
  color: #ad66ff;
}

.category-badge.slate {
  color: #8b96b8;
}

.state-panel {
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 12px;
  min-height: 230px;
  border: 1px solid rgba(82, 106, 171, 0.14);
  border-radius: 12px;
  background: rgba(27, 35, 55, 0.38);
  color: #8b96b8;
  font-size: 13px;
}

.empty-icon {
  position: relative;
  width: 36px;
  height: 36px;
  border: 2px solid rgba(139, 150, 184, 0.66);
  border-radius: 50%;
}

.empty-icon::after {
  position: absolute;
  right: -8px;
  bottom: 1px;
  width: 14px;
  height: 2px;
  border-radius: 999px;
  background: rgba(139, 150, 184, 0.66);
  content: "";
  transform: rotate(45deg);
}

.status {
  display: flex;
  min-height: 24px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid rgba(61, 76, 109, 0.66);
  padding-top: 9px;
}

@media (max-width: 520px) {
  .quick-panel {
    padding: 10px;
  }

  .quick-shell {
    height: calc(100vh - 20px);
    padding: 12px;
  }

  .quick-header {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .result-count {
    grid-column: 2;
    justify-self: start;
  }

  .result-item {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .result-item :deep(.n-tag) {
    grid-column: 2;
    justify-self: start;
  }

  .result-title-row,
  .status {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
