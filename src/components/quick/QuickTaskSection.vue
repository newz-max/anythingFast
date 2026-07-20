<script setup lang="ts">
import type { QuickTaskRow } from '@/components/quick/quickTaskRows'

interface Props {
  title?: string
  rows: QuickTaskRow[]
  selectedKey?: string | null
  optionId: (key: string) => string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [row: QuickTaskRow]
  execute: [row: QuickTaskRow]
}>()

function rowMetaLabel(row: QuickTaskRow) {
  return row.sourceLabel ? `${row.meta} · ${row.sourceLabel}` : row.meta
}
</script>

<template>
  <section class="quick-task-section" :aria-label="props.title || '事项'">
    <h2 v-if="props.title" class="section-heading">{{ props.title }}</h2>
    <button
      v-for="row in props.rows"
      :id="props.optionId(row.key)"
      :key="row.key"
      type="button"
      role="option"
      class="task-row"
      :class="{ active: props.selectedKey === row.key, running: row.running }"
      :aria-selected="props.selectedKey === row.key"
      @mouseenter="emit('select', row)"
      @click="emit('execute', row)"
    >
      <span class="task-icon" :class="row.categoryTone" aria-hidden="true">
        {{ row.task.name.slice(0, 1) || '事' }}
      </span>
      <span class="task-main">
        <span class="task-title-row">
          <span class="task-name" :title="row.task.name || '未命名事项'">
            {{ row.task.name || '未命名事项' }}
          </span>
          <span class="task-meta" :title="rowMetaLabel(row)">{{ rowMetaLabel(row) }}</span>
        </span>
        <span class="task-detail" :title="row.actionDetail">{{ row.actionDetail }}</span>
      </span>
      <span class="task-tags">
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
.quick-task-section {
  display: grid;
  gap: 7px;
}

.section-heading {
  margin: 2px 0 0;
  color: #aab5d4;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.task-row {
  position: relative;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  min-height: 66px;
  overflow: hidden;
  border: 1px solid rgba(82, 106, 171, 0.16);
  border-radius: 8px;
  background: rgba(27, 35, 55, 0.62);
  color: inherit;
  cursor: pointer;
  padding: 10px 12px 9px 14px;
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}

.task-row::before {
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 0;
  width: 3px;
  border-radius: 0 8px 8px 0;
  background: transparent;
  content: '';
}

.task-row:hover,
.task-row.active {
  border-color: rgba(112, 154, 255, 0.98);
  background: linear-gradient(90deg, rgba(83, 132, 255, 0.18), transparent 42%), rgba(31, 43, 78, 0.94);
  box-shadow: 0 0 0 2px rgba(102, 146, 255, 0.28);
}

.task-row.active::before {
  background: #8db4ff;
  box-shadow: 0 0 18px rgba(141, 180, 255, 0.9);
}

.task-row:focus-visible {
  outline: 2px solid rgba(168, 194, 255, 0.82);
  outline-offset: 2px;
}

.task-row.running {
  border-color: rgba(77, 135, 255, 0.66);
}

.task-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 8px;
  background: linear-gradient(145deg, #2563eb, #6d5dff);
  color: #dce9ff;
  font-weight: 800;
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

.task-main {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.task-title-row {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 10px;
}

.task-name,
.task-meta,
.task-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-name {
  min-width: 0;
  color: #f4f7ff;
  font-size: 14px;
  font-weight: 800;
}

.task-meta {
  flex: 0 0 auto;
  color: #8b96b8;
  font-size: 11px;
}

.task-detail {
  color: #b3bddb;
  font-size: 12px;
}

.task-tags {
  display: flex;
  min-width: 0;
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
  .task-row {
    grid-template-columns: 36px minmax(0, 1fr);
  }

  .task-icon {
    width: 36px;
    height: 36px;
  }

  .task-tags {
    grid-column: 2;
    justify-self: start;
    justify-content: flex-start;
  }
}

@media (max-height: 620px) {
  .task-row {
    min-height: 60px;
    padding-block: 7px;
  }
}
</style>
