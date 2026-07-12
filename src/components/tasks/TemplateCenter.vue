<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import {
  createTemplateViews,
  filterTemplateViews,
  getTemplateCategories,
  type TemplateView
} from '@/domain/templateViews'
import type { RiskLevel, TaskTemplate } from '@/types/domain'

const props = defineProps<{
  builtInTemplates: TaskTemplate[]
  savedTemplates: TaskTemplate[]
}>()

const emit = defineEmits<{
  preview: [template: TaskTemplate]
  use: [template: TaskTemplate]
  import: []
  export: []
}>()

const activeCategory = shallowRef('全部')
const searchQuery = shallowRef('')
const templateViews = computed(() => createTemplateViews(props.builtInTemplates, props.savedTemplates))
const categories = computed(() => getTemplateCategories(templateViews.value))
const filteredTemplates = computed(() => filterTemplateViews(templateViews.value, {
  category: activeCategory.value,
  query: searchQuery.value
}))
const templateCountLabel = computed(() => {
  if (filteredTemplates.value.length === templateViews.value.length) {
    return `${templateViews.value.length} 个模板`
  }
  return `${filteredTemplates.value.length} / ${templateViews.value.length} 个模板`
})
const exportButtonLabel = computed(() => `导出模板，${props.savedTemplates.length} 个已保存模板`)
const hasActiveFilter = computed(() => activeCategory.value !== '全部' || Boolean(searchQuery.value.trim()))

watch(categories, (availableCategories) => {
  if (activeCategory.value !== '全部' && !availableCategories.includes(activeCategory.value)) {
    activeCategory.value = '全部'
  }
})

function sourceLabel(source: TemplateView['source']) {
  return source === 'built-in' ? '内置' : '已保存'
}

function riskLabel(risk: RiskLevel) {
  if (risk === 'high') return '高风险'
  if (risk === 'medium') return '中风险'
  return '低风险'
}

function riskType(risk: RiskLevel) {
  if (risk === 'high') return 'error'
  if (risk === 'medium') return 'warning'
  return 'success'
}

function variableLabel(template: TemplateView) {
  return template.requiredVariableCount > 0
    ? `需填写 ${template.requiredVariableCount} 个变量`
    : '无需填写变量'
}
</script>

<template>
  <section class="template-center" aria-label="模板中心">
    <header class="template-header">
      <div class="template-heading">
        <div>
          <span class="template-title">模板中心</span>
          <small>{{ templateCountLabel }}</small>
        </div>
        <div class="template-header-actions">
          <NButton size="small" secondary @click="emit('import')">导入配置</NButton>
          <NButton size="small" secondary :aria-label="exportButtonLabel" @click="emit('export')">导出模板</NButton>
        </div>
      </div>

      <NInput
        :value="searchQuery"
        class="template-search"
        clearable
        placeholder="搜索模板"
        aria-label="搜索模板"
        @update:value="searchQuery = $event"
      />

      <div class="category-segments" role="group" aria-label="模板分类">
        <button
          v-for="category in ['全部', ...categories]"
          :key="category"
          class="category-segment"
          :class="{ active: activeCategory === category }"
          type="button"
          :aria-pressed="activeCategory === category"
          @click="activeCategory = category"
        >
          {{ category }}
        </button>
      </div>
    </header>

    <div class="template-list">
      <article v-for="entry in filteredTemplates" :key="`${entry.source}-${entry.template.id}`" class="template-card">
        <div class="template-card-main">
          <div class="template-card-heading">
            <strong>{{ entry.template.name }}</strong>
            <NTag size="small" :bordered="false">{{ sourceLabel(entry.source) }}</NTag>
            <NTag size="small" :bordered="false">{{ entry.template.category || '未分类' }}</NTag>
          </div>
          <span class="template-description">{{ entry.template.description || '暂无说明' }}</span>
          <div class="template-meta">
            <span>{{ entry.actionCount }} 个动作</span>
            <span>{{ variableLabel(entry) }}</span>
            <NTag size="small" :bordered="false" :type="riskType(entry.riskLevel)">
              {{ riskLabel(entry.riskLevel) }}
            </NTag>
          </div>
        </div>
        <div class="template-card-actions">
          <NButton size="small" secondary @click="emit('preview', entry.template)">预览</NButton>
          <NButton size="small" type="primary" @click="emit('use', entry.template)">使用</NButton>
        </div>
      </article>

      <NEmpty
        v-if="templateViews.length === 0"
        description="没有可用模板"
      />
      <NEmpty
        v-else-if="filteredTemplates.length === 0"
        :description="hasActiveFilter ? '没有找到匹配模板' : '没有可用模板'"
      />
    </div>
  </section>
</template>

<style scoped>
.template-center {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
}

.template-header {
  display: grid;
  gap: 12px;
  padding: 4px 2px 0;
}

.template-heading,
.template-card-heading,
.template-meta,
.template-header-actions,
.template-card-actions {
  display: flex;
  align-items: center;
}

.template-heading {
  justify-content: space-between;
  gap: 16px;
}

.template-heading > div:first-child {
  display: grid;
  gap: 4px;
}

.template-header-actions,
.template-card-actions,
.template-card-heading,
.template-meta {
  flex-wrap: wrap;
  gap: 8px;
}

.template-title {
  color: #f4f7ff;
  font-size: 18px;
  font-weight: 800;
}

.template-heading small,
.template-description,
.template-meta span {
  color: #9faad0;
  font-size: 12px;
}

.template-search {
  max-width: 520px;
}

.category-segments {
  display: flex;
  align-items: center;
  gap: 0;
  max-width: 100%;
  overflow-x: auto;
}

.category-segment {
  flex: 0 0 auto;
  min-height: 32px;
  border: 1px solid rgba(82, 106, 171, 0.28);
  border-right-width: 0;
  background: rgba(27, 35, 55, 0.42);
  color: #aeb8d6;
  cursor: pointer;
  padding: 0 13px;
}

.category-segment:first-child {
  border-radius: 6px 0 0 6px;
}

.category-segment:last-child {
  border-right-width: 1px;
  border-radius: 0 6px 6px 0;
}

.category-segment.active {
  border-color: rgba(103, 126, 255, 0.72);
  background: #5266d6;
  color: #ffffff;
}

.template-list {
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.template-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  border: 1px solid rgba(82, 106, 171, 0.18);
  border-radius: 8px;
  background: rgba(27, 35, 55, 0.68);
  padding: 14px 16px;
}

.template-card-main {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.template-card-heading strong {
  min-width: 0;
  color: #f4f7ff;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.template-description {
  line-height: 1.5;
  overflow-wrap: anywhere;
}

:global([data-app-theme="light"]) .template-title,
:global([data-app-theme="light"]) .template-card-heading strong {
  color: #172033;
}

:global([data-app-theme="light"]) .template-card {
  background: rgba(255, 255, 255, 0.72);
}

:global([data-app-theme="light"]) .category-segment {
  background: rgba(255, 255, 255, 0.72);
  color: #526078;
}

:global([data-app-theme="light"]) .category-segment.active {
  background: #5266d6;
  color: #ffffff;
}

@media (max-width: 720px) {
  .template-card {
    grid-template-columns: 1fr;
  }

  .template-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .template-card-actions {
    justify-content: flex-end;
  }
}
</style>
