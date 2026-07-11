<script setup lang="ts">
import { QUICK_RECOMMENDATION_SOURCE_LABEL } from '@/domain/quickRecommendations'
import type { TaskItem } from '@/types/domain'

interface QuickRecommendationRow {
  task: TaskItem
  actionDetail: string
  categoryTone: string
  lastRunLabel: string
  running: boolean
  riskLabel: string
  riskTagType: 'success' | 'warning' | 'error'
}

interface Props {
  title: string
  rows: QuickRecommendationRow[]
  selectedId?: string
  optionId: (task: TaskItem) => string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [task: TaskItem]
  execute: [task: TaskItem]
}>()
</script>

<template>
  <section class="recommendation-section" :aria-label="props.title">
    <h2 class="recommendation-heading">{{ props.title }}</h2>
    <button
      v-for="row in props.rows"
      :id="props.optionId(row.task)"
      :key="row.task.id"
      type="button"
      role="option"
      class="recommendation-item"
      :class="{ active: props.selectedId === row.task.id, running: row.running }"
      :aria-selected="props.selectedId === row.task.id"
      @mouseenter="emit('select', row.task)"
      @click="emit('execute', row.task)"
    >
      <span class="recommendation-icon" :class="row.categoryTone" aria-hidden="true">
        {{ row.task.name.slice(0, 1) || '事' }}
      </span>
      <span class="recommendation-main">
        <span class="recommendation-title-row">
          <span class="recommendation-name">{{ row.task.name || '未命名事项' }}</span>
          <span class="recommendation-time">上次 {{ row.lastRunLabel }}</span>
        </span>
        <span class="recommendation-detail">{{ row.actionDetail }}</span>
        <span class="recommendation-source">{{ QUICK_RECOMMENDATION_SOURCE_LABEL }}</span>
      </span>
      <span class="recommendation-tags">
        <NTag v-if="row.running" size="small" type="info">
          <span class="running-tag">
            <NSpin size="small" />
            执行中
          </span>
        </NTag>
        <NTag size="small" :type="row.riskTagType">{{ row.riskLabel }}</NTag>
      </span>
    </button>
  </section>
</template>

<style scoped>
.recommendation-section {
  display: grid;
  gap: 7px;
}

.recommendation-heading {
  margin: 2px 0 0;
  color: #aab5d4;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.recommendation-item {
  position: relative;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  width: 100%;
  min-width: 0;
  min-height: 78px;
  overflow: hidden;
  border: 1px solid rgba(82, 106, 171, 0.16);
  border-radius: 8px;
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

.recommendation-item::before {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 0 8px 8px 0;
  background: transparent;
  content: '';
  transition: background 160ms ease, box-shadow 160ms ease;
}

.recommendation-item:hover,
.recommendation-item.active {
  border-color: rgba(112, 154, 255, 0.98);
  background:
    linear-gradient(90deg, rgba(83, 132, 255, 0.18), transparent 42%),
    rgba(31, 43, 78, 0.94);
  box-shadow: 0 0 0 2px rgba(102, 146, 255, 0.28);
}

.recommendation-item.active::before {
  background: #8db4ff;
  box-shadow: 0 0 18px rgba(141, 180, 255, 0.9);
}

.recommendation-item:focus-visible {
  outline: 2px solid rgba(168, 194, 255, 0.82);
  outline-offset: 2px;
}

.recommendation-icon {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: 8px;
  background: linear-gradient(145deg, #2563eb, #6d5dff);
  color: #dce9ff;
  font-weight: 800;
}

.recommendation-icon.green {
  background: linear-gradient(145deg, #0e9f83, #163c6e);
}

.recommendation-icon.amber {
  background: linear-gradient(145deg, #dd9a20, #594018);
}

.recommendation-icon.purple {
  background: linear-gradient(145deg, #8a4cff, #41246c);
}

.recommendation-icon.slate {
  background: linear-gradient(145deg, #385072, #1b2740);
}

.recommendation-main {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.recommendation-title-row {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 10px;
}

.recommendation-name,
.recommendation-time,
.recommendation-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recommendation-name {
  min-width: 0;
  color: #f4f7ff;
  font-size: 15px;
  font-weight: 800;
}

.recommendation-time {
  flex: 0 0 auto;
  color: #8b96b8;
  font-size: 12px;
}

.recommendation-detail {
  color: #b3bddb;
  font-size: 13px;
}

.recommendation-source {
  color: #8db4ff;
  font-size: 11px;
}

.recommendation-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.running-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

@media (max-width: 520px) {
  .recommendation-item {
    grid-template-columns: 40px minmax(0, 1fr);
  }

  .recommendation-tags {
    grid-column: 2;
    justify-self: start;
    justify-content: flex-start;
  }

  .recommendation-title-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
  }
}
</style>
