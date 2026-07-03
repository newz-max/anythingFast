<script setup lang="ts">
import { computed } from 'vue'
import { getActionTypeLabel } from '@/domain/actionPresentation'
import type { ActionType, ImportPreview, RiskLevel } from '@/types/domain'

const props = defineProps<{
  show: boolean
  preview: ImportPreview | null
  confirming: boolean
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  confirm: []
}>()

const missingPathHints = computed(() => props.preview?.pathHints.filter((hint) => !hint.exists) || [])
const conflictText = computed(() => {
  const summary = props.preview?.conflictSummary
  if (!summary) return '无冲突'
  const total = summary.taskIdsRegenerated + summary.actionIdsRegenerated + summary.templateIdsRegenerated
  if (total === 0) return '无冲突'
  return `已重生成 ${summary.taskIdsRegenerated} 个事项 ID、${summary.actionIdsRegenerated} 个动作 ID、${summary.templateIdsRegenerated} 个模板 ID`
})

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

function actionTypesLabel(types: ActionType[]) {
  const uniqueTypes = Array.from(new Set(types))
  return uniqueTypes.map(getActionTypeLabel).join('、') || '无动作'
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="import-preview-modal"
    title="导入预览"
    :bordered="false"
    @update:show="(value: boolean) => emit('update:show', value)"
  >
    <template v-if="preview">
      <section class="summary-grid">
        <div class="summary-item">
          <span>事项</span>
          <strong>{{ preview.validTaskCount }}</strong>
        </div>
        <div class="summary-item">
          <span>模板</span>
          <strong>{{ preview.templateCount }}</strong>
        </div>
        <div class="summary-item">
          <span>动作</span>
          <strong>{{ preview.totalActionCount }}</strong>
        </div>
        <div class="summary-item">
          <span>命令动作</span>
          <strong>{{ preview.riskSummary.commandActions }}</strong>
        </div>
      </section>

      <NAlert class="preview-alert" type="info" :show-icon="false">
        {{ conflictText }}
      </NAlert>

      <section class="preview-section">
        <h3>事项</h3>
        <div class="preview-list">
          <article v-for="task in preview.tasks" :key="task.id" class="preview-row">
            <div>
              <strong>{{ task.name }}</strong>
              <span>{{ actionTypesLabel(task.actionTypes) }} · {{ task.actionCount }} 个动作</span>
            </div>
            <NTag :type="riskType(task.riskLevel)" size="small">{{ riskLabel(task.riskLevel) }}</NTag>
          </article>
          <NEmpty v-if="preview.tasks.length === 0" description="没有可导入事项" />
        </div>
      </section>

      <section class="preview-section">
        <h3>模板</h3>
        <div class="preview-list">
          <article v-for="template in preview.templates" :key="template.id" class="preview-row">
            <div>
              <strong>{{ template.name }}</strong>
              <span>{{ template.category || '未分类' }} · {{ actionTypesLabel(template.actionTypes) }} · {{ template.actionCount }} 个动作</span>
            </div>
            <NTag :type="riskType(template.riskLevel)" size="small">{{ riskLabel(template.riskLevel) }}</NTag>
          </article>
          <NEmpty v-if="preview.templates.length === 0" description="没有可导入模板" />
        </div>
      </section>

      <section class="preview-section">
        <h3>路径提示</h3>
        <div class="path-list">
          <div v-for="hint in missingPathHints" :key="`${hint.ownerId}-${hint.field}-${hint.path}`" class="path-row">
            <strong>{{ hint.ownerName }}</strong>
            <span>{{ hint.actionName }} · {{ hint.field }} · {{ hint.path }}</span>
          </div>
          <NEmpty v-if="missingPathHints.length === 0" description="没有缺失路径" />
        </div>
      </section>
    </template>
    <NEmpty v-else description="没有导入预览" />

    <template #footer>
      <div class="modal-footer">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" :loading="confirming" :disabled="!preview" @click="emit('confirm')">确认导入</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.summary-item {
  display: grid;
  gap: 4px;
  border: 1px solid rgba(82, 106, 171, 0.16);
  border-radius: 8px;
  background: rgba(27, 35, 55, 0.08);
  padding: 12px;
}

.summary-item span,
.preview-row span,
.path-row span {
  color: #667085;
  font-size: 12px;
}

.summary-item strong {
  font-size: 20px;
}

.preview-alert,
.preview-section {
  margin-top: 16px;
}

.preview-section {
  display: grid;
  gap: 10px;
}

.preview-section h3 {
  margin: 0;
  font-size: 15px;
}

.preview-list,
.path-list {
  display: grid;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
}

.preview-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(82, 106, 171, 0.14);
  border-radius: 8px;
  padding: 10px 12px;
}

.preview-row div,
.path-row {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.preview-row strong,
.preview-row span,
.path-row strong,
.path-row span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.path-row {
  border: 1px solid rgba(255, 184, 62, 0.22);
  border-radius: 8px;
  background: rgba(255, 184, 62, 0.08);
  padding: 10px 12px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .preview-row {
    grid-template-columns: 1fr;
  }
}
</style>
