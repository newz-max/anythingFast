<script setup lang="ts">
import { computed, nextTick, toRef, useTemplateRef } from 'vue'
import { NScrollbar } from 'naive-ui'
import { useTaskSearch } from '@/composables/useTaskSearch'
import { categoryTone } from '@/domain/categoryPresentation'
import type { TaskItem } from '@/types/domain'

const props = defineProps<{
  tasks: TaskItem[]
  categories: string[]
  selectedTaskId: string | null
  disableListScrollbar?: boolean
}>()

const emit = defineEmits<{
  select: [taskId: string]
  create: []
  run: [task: TaskItem]
  toggleEnabled: [taskId: string, enabled: boolean]
  toggleFavorite: [taskId: string]
}>()

const tasksRef = toRef(props, 'tasks')
const { query, category, results } = useTaskSearch(tasksRef)
const searchBoxRef = useTemplateRef<HTMLElement>('searchBox')
const taskItemRefs = useTemplateRef<HTMLButtonElement[]>('taskItems')

const visibleCategories = computed(() => props.categories.filter((item) => item !== '全部'))
const resultCount = computed(() => `共 ${results.value.length} 个事项`)

function focusSearch() {
  const input = searchBoxRef.value?.querySelector('input')
  input?.focus()
  input?.select()
}

function visibleTaskIds() {
  return results.value.map((task) => task.id)
}

async function scrollTaskIntoView(taskId: string) {
  await nextTick()
  const index = results.value.findIndex((task) => task.id === taskId)
  if (index < 0) return
  taskItemRefs.value?.[index]?.scrollIntoView({ block: 'nearest' })
}

defineExpose({
  focusSearch,
  visibleTaskIds,
  scrollTaskIntoView
})

function formatTaskTime(task: TaskItem) {
  const source = task.lastRunAt || task.updatedAt || task.createdAt
  const date = new Date(source)
  if (Number.isNaN(date.getTime())) return '未运行'

  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const prefix = sameDay ? '今天' : date.toDateString() === yesterday.toDateString() ? '昨天' : `${date.getMonth() + 1}月${date.getDate()}日`
  return `${prefix} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
}
</script>

<template>
  <section class="task-list">
    <div class="search-row">
      <div ref="searchBox" class="search-box">
        <span class="search-icon" aria-hidden="true"></span>
        <NInput
          v-model:value="query"
          class="search-input"
          clearable
          placeholder="搜索事项"
          :bordered="false"
        />
      </div>
      <button class="filter-button" type="button" aria-label="筛选事项" disabled>
        <span class="filter-shape" aria-hidden="true"></span>
      </button>
    </div>

    <div class="section-row">
      <button class="category-select" type="button">
        <span>{{ category || '全部事项' }}</span>
        <span class="chevron" aria-hidden="true">⌄</span>
      </button>
      <div class="grid-icon" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>

    <div class="category-pills" aria-label="标签筛选">
      <button
        class="category-pill"
        :class="{ active: category === '全部' }"
        type="button"
        @click="category = '全部'"
      >
        全部
      </button>
      <button
        v-for="item in visibleCategories"
        :key="item"
        class="category-pill"
        :class="[categoryTone(item), { active: category === item }]"
        type="button"
        @click="category = item"
      >
        {{ item }}
      </button>
    </div>

    <component :is="props.disableListScrollbar ? 'div' : NScrollbar" class="scroll">
      <div class="items">
        <button
          v-for="task in results"
          :key="task.id"
          ref="taskItems"
          class="task-item"
          :class="{ 'task-item-active': task.id === selectedTaskId, 'task-item-disabled': !task.enabled }"
          type="button"
          @click="emit('select', task.id)"
        >
          <span class="task-icon" :class="categoryTone(task.category)" aria-hidden="true">
            <span class="task-icon-mark">{{ task.name.slice(0, 1) || '事' }}</span>
          </span>
          <span class="task-main">
            <span class="task-name">{{ task.name || '未命名事项' }}</span>
            <span class="task-category" :class="categoryTone(task.category)">
              {{ task.category || '未分类' }}
            </span>
            <span class="task-time">{{ formatTaskTime(task) }}</span>
          </span>
          <span class="task-actions">
            <button
              class="favorite-toggle"
              :class="{ active: task.favorite }"
              type="button"
              :aria-label="task.favorite ? '取消收藏事项' : '收藏事项'"
              @click.stop="emit('toggleFavorite', task.id)"
            >
              {{ task.favorite ? '★' : '☆' }}
            </button>
            <button
              class="small-run"
              type="button"
              aria-label="运行事项"
              @click.stop="emit('run', task)"
            >
              ▶
            </button>
            <span class="more-dots" aria-hidden="true">•••</span>
          </span>
        </button>

        <NEmpty v-if="results.length === 0" class="empty-state" description="没有匹配事项" />
      </div>
    </component>

    <footer class="list-footer">{{ resultCount }}</footer>
  </section>
</template>

<style scoped>
.task-list {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  gap: 18px;
  min-height: 0;
  overflow: hidden;
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  gap: 10px;
}

.search-box,
.filter-button {
  border: 1px solid rgba(93, 117, 174, 0.22);
  background: linear-gradient(180deg, rgba(31, 42, 72, 0.88), rgba(21, 28, 50, 0.84));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.search-box {
  display: flex;
  min-width: 0;
  align-items: center;
  height: 46px;
  border-radius: 12px;
  padding: 0 12px;
}

.search-icon {
  width: 15px;
  height: 15px;
  flex: 0 0 15px;
  border: 2px solid #aab8d8;
  border-radius: 50%;
  opacity: 0.9;
  position: relative;
}

.search-icon::after {
  position: absolute;
  right: -6px;
  bottom: -5px;
  width: 7px;
  height: 2px;
  border-radius: 99px;
  background: #aab8d8;
  content: "";
  transform: rotate(45deg);
}

.search-input {
  --n-color: transparent !important;
  --n-color-focus: transparent !important;
  --n-text-color: #eef4ff !important;
  --n-placeholder-color: #8b96b8 !important;
}

.filter-button {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 12px;
  color: #d5def7;
  cursor: not-allowed;
  opacity: 0.54;
}

.filter-shape {
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-top-width: 3px;
  clip-path: polygon(0 0, 100% 0, 62% 45%, 62% 100%, 38% 100%, 38% 45%);
}

.section-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 6px 8px;
}

.category-select {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: transparent;
  color: #f4f7ff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
}

.chevron {
  color: #92a0c5;
  font-size: 16px;
}

.grid-icon {
  display: grid;
  grid-template-columns: repeat(2, 5px);
  gap: 4px;
  opacity: 0.85;
}

.grid-icon span {
  width: 5px;
  height: 5px;
  border: 1px solid #a8b4d2;
  border-radius: 2px;
}

.category-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 74px;
  overflow-y: auto;
  padding-right: 2px;
}

.category-pill {
  border: 1px solid rgba(110, 132, 193, 0.2);
  border-radius: 999px;
  background: rgba(27, 35, 55, 0.52);
  padding: 5px 10px;
  color: #8b96b8;
  cursor: pointer;
  font-size: 12px;
}

.category-pill.active {
  border-color: rgba(58, 139, 255, 0.72);
  color: #f4f7ff;
}

.category-pill.blue {
  color: #58a2ff;
}

.category-pill.green {
  color: #29d6ad;
}

.category-pill.amber {
  color: #ffb83e;
}

.category-pill.purple {
  color: #ad66ff;
}

.scroll {
  min-height: 0;
  height: 100%;
}

.items {
  display: grid;
  gap: 12px;
  padding: 0 2px 2px;
}

.task-item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 78px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: rgba(27, 35, 55, 0.62);
  color: inherit;
  cursor: pointer;
  padding: 14px 14px 13px 16px;
  text-align: left;
  transition:
    border-color 160ms ease,
    background 160ms ease,
    box-shadow 160ms ease;
}

.task-item:hover,
.task-item-active {
  border-color: rgba(67, 109, 255, 0.9);
  background:
    radial-gradient(circle at 100% 0%, rgba(82, 90, 255, 0.22), transparent 48%),
    rgba(28, 38, 68, 0.8);
  box-shadow: 0 0 0 1px rgba(60, 94, 161, 0.2), 0 12px 30px rgba(19, 42, 119, 0.22);
}

.task-item-disabled {
  opacity: 0.52;
}

.task-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
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

.task-icon-mark {
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.26));
}

.task-main {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.task-name,
.task-time {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-name {
  color: #f4f7ff;
  font-size: 15px;
  font-weight: 700;
}

.task-category {
  position: relative;
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 5px;
  color: #58a2ff;
  font-size: 11px;
  line-height: 1.2;
}

.task-category::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  content: "";
}

.task-category.green {
  color: #29d6ad;
}

.task-category.amber {
  color: #ffb83e;
}

.task-category.purple {
  color: #ad66ff;
}

.task-category.slate {
  color: #8b96b8;
}

.task-time {
  color: #8b96b8;
  font-size: 12px;
}

.task-actions {
  display: inline-flex;
  min-width: max-content;
  align-items: center;
  gap: 10px;
}

.favorite-toggle,
.small-run {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border: 0;
  border-radius: 10px;
  background: rgba(63, 82, 159, 0.62);
  color: #dce9ff;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
}

.favorite-toggle {
  background: rgba(63, 82, 159, 0.32);
  color: #aeb9d8;
  font-size: 15px;
}

.favorite-toggle.active {
  color: #ffd76a;
}

.more-dots {
  color: #aab8d8;
  font-size: 13px;
  letter-spacing: 2px;
}

.list-footer {
  color: #8b96b8;
  font-size: 12px;
  text-align: center;
}

.empty-state {
  padding-top: 48px;
  --n-text-color: #8b96b8 !important;
  --n-icon-color: #445071 !important;
}

@media (max-width: 1279px) {
  .task-list {
    gap: 14px;
  }

  .section-row {
    padding-top: 14px;
  }

  .task-item {
    grid-template-columns: 40px minmax(0, 1fr) 68px;
    gap: 10px;
    min-height: 72px;
    padding: 12px;
  }

  .task-icon {
    width: 40px;
    height: 40px;
  }

  .task-actions {
    display: grid;
    grid-template-columns: repeat(2, 30px);
    justify-content: end;
    gap: 6px;
  }

  .more-dots {
    display: none;
  }

  .favorite-toggle,
  .small-run {
    width: 30px;
    height: 30px;
  }
}

@media (max-width: 960px) {
  .task-list {
    grid-template-rows: auto auto auto auto auto;
    max-height: none;
    min-height: auto;
    overflow: visible;
  }

  .scroll {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
}

@media (max-width: 520px) {
  .search-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .filter-button {
    display: none;
  }

  .task-item {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .task-actions {
    grid-column: 2;
    grid-row: 2;
    justify-content: start;
  }

  .task-icon {
    width: 36px;
    height: 36px;
  }
}
</style>
