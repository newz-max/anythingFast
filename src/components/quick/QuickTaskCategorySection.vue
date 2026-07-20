<script setup lang="ts">
import { computed } from 'vue'
import QuickTaskSection from '@/components/quick/QuickTaskSection.vue'
import type { QuickTaskRow } from '@/components/quick/quickTaskRows'

interface Props {
  categoryKey: string
  label: string
  rows: QuickTaskRow[]
  expanded: boolean
  selectedKey?: string | null
  optionId: (key: string) => string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  toggle: [categoryKey: string]
  select: [row: QuickTaskRow]
  execute: [row: QuickTaskRow]
}>()

const contentId = computed(() => `quick-category-${categoryIdPart(props.categoryKey)}`)
const toggleLabel = computed(() =>
  `${props.expanded ? '收起' : '展开'}分类 ${props.label}，共 ${props.rows.length} 个事项`
)

function categoryIdPart(categoryKey: string) {
  return Array.from(categoryKey, (character) => character.codePointAt(0)?.toString(16) || '0').join('-')
}
</script>

<template>
  <section class="quick-task-category-section" :aria-label="props.label">
    <button
      type="button"
      class="category-toggle"
      :aria-label="toggleLabel"
      :aria-expanded="props.expanded"
      :aria-controls="contentId"
      @click="emit('toggle', props.categoryKey)"
    >
      <span class="category-chevron" :class="{ expanded: props.expanded }" aria-hidden="true">›</span>
      <span class="category-name" :title="props.label">{{ props.label }}</span>
      <span class="category-count" aria-hidden="true">{{ props.rows.length }}</span>
    </button>

    <div v-if="props.expanded" :id="contentId" class="category-content">
      <QuickTaskSection
        :rows="props.rows"
        :selected-key="props.selectedKey"
        :option-id="props.optionId"
        @select="emit('select', $event)"
        @execute="emit('execute', $event)"
      />
    </div>
  </section>
</template>

<style scoped>
.quick-task-category-section {
  display: grid;
  min-width: 0;
  gap: 7px;
}

.category-toggle {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 34px;
  min-width: 0;
  border: 0;
  border-top: 1px solid rgba(82, 106, 171, 0.2);
  border-radius: 0;
  background: transparent;
  color: #aab5d4;
  cursor: pointer;
  padding: 0 4px;
  text-align: left;
}

.category-toggle:hover,
.category-toggle:focus-visible {
  background: rgba(58, 79, 129, 0.22);
  color: #d7e2ff;
  outline: none;
}

.category-toggle:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(168, 194, 255, 0.68);
}

.category-chevron {
  display: inline-grid;
  width: 16px;
  height: 16px;
  place-items: center;
  color: #8194c2;
  font-size: 20px;
  line-height: 1;
  transform: rotate(0deg);
  transform-origin: center;
}

.category-chevron.expanded {
  transform: rotate(90deg);
}

.category-name {
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-count {
  min-width: 20px;
  color: #7f8daf;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.category-content {
  min-width: 0;
}
</style>
