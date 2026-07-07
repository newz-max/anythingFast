<script setup lang="ts">
import { computed } from 'vue'
import { getActionTypeLabel } from '@/domain/actionPresentation'
import { deriveTemplateRisk } from '@/domain/taskTemplates'
import type { RiskLevel, TaskTemplate } from '@/types/domain'

const props = defineProps<{
  templates: TaskTemplate[]
  savedTemplateCount: number
}>()

const emit = defineEmits<{
  use: [template: TaskTemplate]
  import: []
  export: []
}>()

const templateCountLabel = computed(() => `${props.templates.length} 个模板`)
const exportButtonLabel = computed(() => `导出模板，${props.savedTemplateCount} 个已保存模板`)

function templateMeta(template: TaskTemplate) {
  const types = Array.from(new Set(template.actions.map((action) => action.type))).map(getActionTypeLabel)
  return `${template.category || '未分类'} · ${template.actions.length} 个动作 · ${types.join('、') || '无动作'} · ${riskLabel(deriveTemplateRisk(template))}`
}

function riskLabel(risk: RiskLevel) {
  if (risk === 'high') return '高风险'
  if (risk === 'medium') return '中风险'
  return '低风险'
}
</script>

<template>
  <section class="template-center" aria-label="模板中心">
    <header class="template-header">
      <span>模板中心</span>
      <small>{{ templateCountLabel }}</small>
      <div class="template-header-actions">
        <button class="template-use-button" type="button" @click="emit('import')">导入配置</button>
        <button class="template-use-button" type="button" :aria-label="exportButtonLabel" @click="emit('export')">
          导出模板
        </button>
      </div>
    </header>

    <div class="template-list">
      <article v-for="template in props.templates" :key="template.id" class="template-card">
        <div class="template-card-main">
          <strong>{{ template.name }}</strong>
          <span>{{ template.description }}</span>
          <small>{{ templateMeta(template) }}</small>
        </div>
        <button class="template-use-button" type="button" @click="emit('use', template)">使用</button>
      </article>
      <NEmpty v-if="props.templates.length === 0" description="没有可用模板" />
    </div>
  </section>
</template>

<style scoped>
.template-center {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
}

.template-header {
  display: grid;
  gap: 6px;
  padding: 4px 2px 0;
}

.template-header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.template-header span {
  color: #f4f7ff;
  font-size: 18px;
  font-weight: 800;
}

.template-header small {
  color: #8b96b8;
  font-size: 12px;
}

.template-list {
  display: grid;
  align-content: start;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}

.template-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  border: 1px solid rgba(82, 106, 171, 0.18);
  border-radius: 12px;
  background: rgba(27, 35, 55, 0.68);
  padding: 16px;
}

.template-card-main {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.template-card-main strong {
  color: #f4f7ff;
  font-size: 15px;
}

.template-card-main span,
.template-card-main small {
  color: #9faad0;
  font-size: 12px;
  line-height: 1.5;
}

.template-use-button {
  height: 32px;
  border: 1px solid rgba(82, 106, 171, 0.3);
  border-radius: 9px;
  background: rgba(63, 82, 159, 0.58);
  color: #f4f7ff;
  cursor: pointer;
  padding: 0 14px;
  font-weight: 700;
}

:global([data-app-theme="light"]) .template-card-main strong,
:global([data-app-theme="light"]) .template-header span {
  color: #172033;
}

:global([data-app-theme="light"]) .template-card {
  background: rgba(255, 255, 255, 0.72);
}

@media (max-width: 860px) {
  .template-card {
    grid-template-columns: 1fr;
  }
}
</style>
