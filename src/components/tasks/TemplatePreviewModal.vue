<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { createTemplatePreview } from '@/domain/templateViews'
import type { RiskLevel, TaskTemplate } from '@/types/domain'

const props = defineProps<{
  show: boolean
  template: TaskTemplate | null
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  use: [values: Record<string, string>]
}>()

const initialValues = reactive<Record<string, string>>({})
const preview = computed(() => props.template ? createTemplatePreview(props.template) : null)
const modalTitle = computed(() => props.template ? `模板预览 · ${props.template.name}` : '模板预览')

watch(
  [() => props.show, () => props.template],
  () => {
    Object.keys(initialValues).forEach((key) => delete initialValues[key])
    preview.value?.firstConfigurationVariables.forEach((variable) => {
      initialValues[variable.key] = ''
    })
  },
  { immediate: true }
)

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

function updateInitialValue(key: string, value: string) {
  initialValues[key] = value
}

function useTemplate() {
  if (!props.template) return
  emit('use', { ...initialValues })
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="template-preview-modal"
    :title="modalTitle"
    :bordered="false"
    @update:show="emit('update:show', $event)"
  >
    <div v-if="template && preview" class="template-preview-content">
      <section class="preview-summary">
        <div>
          <span>{{ template.category || '未分类' }}</span>
          <strong>{{ template.description || '暂无说明' }}</strong>
        </div>
        <NTag :type="riskType(preview.riskLevel)" :bordered="false">
          {{ riskLabel(preview.riskLevel) }}
        </NTag>
      </section>

      <NAlert v-if="preview.containsCommand" type="warning" :show-icon="false">
        命令模板仅适合手动运行，保存后仍会经过变量输入与风险确认。
      </NAlert>

      <section class="preview-section">
        <div class="section-heading">
          <h3>动作序列</h3>
          <span>{{ preview.actions.length }} 个动作</span>
        </div>
        <div class="action-list">
          <article v-for="action in preview.actions" :key="action.index" class="action-row">
            <span class="action-index">{{ action.index + 1 }}</span>
            <div class="action-main">
              <div class="action-heading">
                <strong>{{ action.name }}</strong>
                <NTag size="small" :bordered="false">{{ action.typeLabel }}</NTag>
                <NTag v-if="!action.enabled" size="small" :bordered="false">已停用</NTag>
                <NTag size="small" :bordered="false" :type="riskType(action.riskLevel)">
                  {{ riskLabel(action.riskLevel) }}
                </NTag>
              </div>
              <span>{{ action.detail }}</span>
              <small>{{ action.condition }}</small>
            </div>
          </article>
        </div>
      </section>

      <section class="preview-section">
        <div class="section-heading">
          <h3>变量</h3>
          <span>{{ preview.firstConfigurationVariables.length + preview.perRunVariables.length + preview.configuredVariables.length }} 个</span>
        </div>

        <div v-if="preview.firstConfigurationVariables.length" class="variable-group first-configuration-group">
          <h4>首次配置</h4>
          <label v-for="variable in preview.firstConfigurationVariables" :key="variable.key" class="variable-row">
            <span class="variable-label">
              <strong>{{ variable.label }}</strong>
              <small>{{ variable.key }}</small>
            </span>
            <NInput
              :value="initialValues[variable.key]"
              :type="variable.secret ? 'password' : 'text'"
              :show-password-on="variable.secret ? 'click' : undefined"
              :placeholder="`填写 ${variable.label}`"
              @update:value="updateInitialValue(variable.key, $event)"
            />
            <small v-if="variable.references.length" class="variable-references">
              {{ variable.references.join('；') }}
            </small>
          </label>
        </div>

        <div v-if="preview.perRunVariables.length" class="variable-group per-run-group">
          <h4>每次运行</h4>
          <div v-for="variable in preview.perRunVariables" :key="variable.key" class="variable-readonly-row">
            <span class="variable-label">
              <strong>{{ variable.label }}</strong>
              <small>{{ variable.key }}{{ variable.inferred ? ' · 由引用推导' : '' }}</small>
            </span>
            <small v-if="variable.references.length">{{ variable.references.join('；') }}</small>
          </div>
        </div>

        <div v-if="preview.configuredVariables.length" class="variable-group configured-group">
          <h4>已有默认值</h4>
          <div v-for="variable in preview.configuredVariables" :key="variable.key" class="variable-readonly-row">
            <span class="variable-label">
              <strong>{{ variable.label }}</strong>
              <small>{{ variable.key }}</small>
            </span>
            <code>{{ variable.defaultValue }}</code>
            <small v-if="variable.references.length">{{ variable.references.join('；') }}</small>
          </div>
        </div>

        <NEmpty
          v-if="preview.firstConfigurationVariables.length + preview.perRunVariables.length + preview.configuredVariables.length === 0"
          description="此模板没有变量"
        />
      </section>
    </div>
    <NEmpty v-else description="没有可预览模板" />

    <template #footer>
      <div class="modal-footer">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" :disabled="!template" @click="useTemplate">使用模板</NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.template-preview-content,
.preview-section,
.action-list,
.variable-group {
  display: grid;
}

.template-preview-content {
  gap: 18px;
}

.preview-summary,
.section-heading,
.action-heading,
.modal-footer {
  display: flex;
  align-items: center;
}

.preview-summary,
.section-heading {
  justify-content: space-between;
  gap: 16px;
}

.preview-summary > div,
.variable-label {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.preview-summary span,
.section-heading span,
.action-main span,
.action-main small,
.variable-label small,
.variable-readonly-row > small,
.variable-references {
  color: #7f8aa8;
  font-size: 12px;
  line-height: 1.5;
}

.preview-summary strong,
.action-main strong,
.variable-label strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.preview-section {
  gap: 10px;
}

.section-heading h3,
.variable-group h4 {
  margin: 0;
}

.section-heading h3 {
  font-size: 15px;
}

.variable-group h4 {
  color: #a9b3cf;
  font-size: 12px;
  font-weight: 700;
}

.action-list,
.variable-group {
  gap: 8px;
}

.action-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 10px;
  border-top: 1px solid rgba(82, 106, 171, 0.16);
  padding-top: 10px;
}

.action-index {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(103, 126, 255, 0.34);
  border-radius: 6px;
  color: #95a5ff;
  font-size: 12px;
  font-weight: 800;
}

.action-main {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.action-heading {
  flex-wrap: wrap;
  gap: 7px;
}

.variable-row,
.variable-readonly-row {
  display: grid;
  grid-template-columns: minmax(130px, 0.8fr) minmax(180px, 1.2fr);
  align-items: center;
  gap: 8px 12px;
  border-top: 1px solid rgba(82, 106, 171, 0.14);
  padding-top: 9px;
}

.variable-references,
.variable-readonly-row > small {
  grid-column: 2;
  overflow-wrap: anywhere;
}

.variable-readonly-row code {
  min-width: 0;
  overflow-wrap: anywhere;
}

.modal-footer {
  justify-content: flex-end;
  gap: 10px;
}

:global(.template-preview-modal) {
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
}

@media (max-width: 640px) {
  .variable-row,
  .variable-readonly-row {
    grid-template-columns: 1fr;
  }

  .variable-references,
  .variable-readonly-row > small {
    grid-column: 1;
  }
}
</style>
