<script setup lang="ts">
import type { QuickContextSuggestion } from '@/composables/useQuickContext'

interface Props {
  suggestions: QuickContextSuggestion[]
  selectedId?: string
  optionId: (suggestion: QuickContextSuggestion) => string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [suggestion: QuickContextSuggestion]
  create: [suggestion: QuickContextSuggestion]
}>()

function selectSuggestion(suggestion: QuickContextSuggestion) {
  if (!suggestion.canSaveDirectly) return
  emit('select', suggestion)
}

function createSuggestion(suggestion: QuickContextSuggestion) {
  if (!suggestion.canSaveDirectly) return
  emit('create', suggestion)
}
</script>

<template>
  <section class="context-suggestions" aria-label="建议">
    <h2 class="context-heading">建议</h2>
    <button
      v-for="suggestion in props.suggestions"
      :id="props.optionId(suggestion)"
      :key="suggestion.id"
      type="button"
      role="option"
      class="context-suggestion"
      :class="{ active: props.selectedId === suggestion.id, pending: suggestion.pending }"
      :aria-selected="props.selectedId === suggestion.id"
      :disabled="!suggestion.canSaveDirectly"
      @mouseenter="selectSuggestion(suggestion)"
      @click="createSuggestion(suggestion)"
    >
      <span class="context-icon" aria-hidden="true">+</span>
      <span class="context-main">
        <span class="context-title-row">
          <span class="context-title">{{ suggestion.title }}</span>
          <span class="context-source">来自剪贴板</span>
        </span>
        <span class="context-detail">{{ suggestion.detail }}</span>
      </span>
      <NTag v-if="suggestion.pending" size="small" type="info">确认中</NTag>
      <NTag v-else-if="!suggestion.canSaveDirectly" size="small" type="warning">不能创建</NTag>
    </button>
  </section>
</template>

<style scoped>
.context-suggestions {
  display: grid;
  gap: 7px;
}

.context-heading {
  margin: 0;
  color: #aab5d4;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
}

.context-suggestion {
  position: relative;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  min-height: 70px;
  border: 1px solid rgba(70, 186, 158, 0.32);
  border-radius: 8px;
  background: rgba(20, 56, 61, 0.62);
  color: inherit;
  cursor: pointer;
  overflow: hidden;
  padding: 11px 13px;
  text-align: left;
}

.context-suggestion:hover:not(:disabled),
.context-suggestion.active {
  border-color: rgba(70, 205, 172, 0.94);
  background: rgba(22, 72, 74, 0.88);
  box-shadow: 0 0 0 2px rgba(64, 191, 160, 0.22);
}

.context-suggestion:focus-visible {
  outline: 2px solid rgba(128, 239, 209, 0.84);
  outline-offset: 2px;
}

.context-suggestion:disabled {
  cursor: default;
  opacity: 0.78;
}

.context-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 8px;
  background: rgba(65, 201, 167, 0.18);
  color: #a7f2dc;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

.context-main,
.context-title-row {
  display: grid;
  min-width: 0;
}

.context-main {
  gap: 4px;
}

.context-title-row {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.context-title,
.context-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.context-title {
  color: #f4fdfb;
  font-size: 14px;
  font-weight: 800;
}

.context-source {
  color: #79cbb5;
  font-size: 11px;
  white-space: nowrap;
}

.context-detail {
  color: #b6d6cf;
  font-size: 12px;
}
</style>
