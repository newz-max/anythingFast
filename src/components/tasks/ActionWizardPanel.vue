<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useMessage } from 'naive-ui'
import ActionParamForm from '@/components/tasks/ActionParamForm.vue'
import { actionTypeOptions, describeAction, describeCondition, getActionTypeLabel } from '@/domain/actionPresentation'
import { createActionDraft } from '@/domain/taskFactory'
import { deriveActionRisk } from '@/domain/risk'
import { validateActionLocal } from '@/domain/validation'
import { clonePlainDto } from '@/utils/clonePlainDto'
import type { ActionType, TaskAction, TaskVariable } from '@/types/domain'

export type ActionWizardMode = 'create' | 'edit'

const props = defineProps<{
  show: boolean
  mode: ActionWizardMode
  action: TaskAction | null
  variables?: TaskVariable[]
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  save: [action: TaskAction]
}>()

const currentStep = shallowRef(1)
const draft = ref<TaskAction>(createActionDraft('openUrl'))
const message = useMessage()

const title = computed(() => (props.mode === 'create' ? '新增动作' : '编辑动作'))
const validation = computed(() => validateActionLocal(draft.value))
const stepStatus = computed(() => (currentStep.value === 3 && !validation.value.valid ? 'error' : 'process'))

watch(
  () => props.show,
  (show) => {
    if (!show) return
    currentStep.value = 1
    draft.value = props.action ? clonePlainDto(props.action) : createActionDraft('openUrl')
    normalizeRisk()
  }
)

watch(
  draft,
  () => normalizeRisk(),
  { deep: true }
)

function selectType(type: ActionType) {
  if (draft.value.type === type) return
  const nextAction = createActionDraft(type)
  draft.value = {
            ...nextAction,
            id: draft.value.id,
            enabled: draft.value.enabled,
            continueOnError: draft.value.continueOnError,
            condition: draft.value.condition
  }
}

function nextStep() {
  if (currentStep.value >= 3) return
  currentStep.value += 1
}

function previousStep() {
  if (currentStep.value <= 1) return
  currentStep.value -= 1
}

function close() {
  emit('update:show', false)
}

function save() {
  if (!validation.value.valid) {
    currentStep.value = 3
    message.warning(validation.value.issues[0]?.message || '保存前需要修正动作配置')
    return
  }
  emit('save', clonePlainDto(draft.value))
}

function normalizeRisk() {
  const nextRisk = deriveActionRisk(draft.value)
  if (draft.value.riskLevel !== nextRisk) {
    draft.value.riskLevel = nextRisk
  }
}
</script>

<template>
  <NDrawer
    :show="show"
    placement="right"
    width="min(720px, calc(100vw - 24px))"
    :mask-closable="false"
    @update:show="(value: boolean) => (value ? emit('update:show', true) : close())"
  >
    <NDrawerContent :title="title" closable class="action-wizard-drawer">
      <div class="action-wizard">
        <NSteps v-model:current="currentStep" :status="stepStatus" size="small">
          <NStep title="选择类型" />
          <NStep title="具体设置" />
          <NStep title="确认动作" />
        </NSteps>

        <section class="step-body">
          <div v-show="currentStep === 1" class="type-grid">
            <button
              v-for="option in actionTypeOptions"
              :key="option.value"
              class="type-option"
              :class="{ 'type-option-active': draft.type === option.value }"
              type="button"
              @click="selectType(option.value)"
            >
              <span class="type-title">{{ option.label }}</span>
              <span class="type-description">{{ option.description }}</span>
            </button>
          </div>

          <ActionParamForm v-show="currentStep === 2" v-model="draft" :variables="variables" />

          <div v-show="currentStep === 3" class="confirm">
            <NDescriptions label-placement="left" :column="1" bordered>
              <NDescriptionsItem label="动作名称">{{ draft.name || getActionTypeLabel(draft.type) }}</NDescriptionsItem>
              <NDescriptionsItem label="动作类型">{{ getActionTypeLabel(draft.type) }}</NDescriptionsItem>
              <NDescriptionsItem label="关键设置">{{ describeAction(draft) }}</NDescriptionsItem>
              <NDescriptionsItem label="执行条件">{{ describeCondition(draft.condition) }}</NDescriptionsItem>
              <NDescriptionsItem label="启用状态">{{ draft.enabled ? '启用' : '停用' }}</NDescriptionsItem>
              <NDescriptionsItem label="风险等级">
                <NTag :type="draft.riskLevel === 'high' ? 'error' : draft.riskLevel === 'medium' ? 'warning' : 'success'">
                  {{ draft.riskLevel }}
                </NTag>
              </NDescriptionsItem>
            </NDescriptions>

            <NAlert v-if="!validation.valid" type="warning" title="保存前需要修正">
              <ul class="issue-list">
                <li v-for="issue in validation.issues" :key="`${issue.field}-${issue.message}`">{{ issue.message }}</li>
              </ul>
            </NAlert>
          </div>
        </section>
      </div>

      <template #footer>
        <div class="footer">
          <NButton @click="close">取消</NButton>
          <div class="action-footer-primary">
            <NButton :disabled="currentStep === 1" @click="previousStep">上一步</NButton>
            <NButton v-if="currentStep < 3" type="primary" @click="nextStep">下一步</NButton>
            <NButton v-else type="primary" @click="save">保存动作</NButton>
          </div>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.action-wizard {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  gap: 18px;
}

.step-body {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding-right: 2px;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.type-option {
  display: grid;
  gap: 6px;
  border: 1px solid var(--app-field-border);
  border-radius: 8px;
  background: var(--app-field-bg);
  padding: 14px;
  color: var(--app-text);
  cursor: pointer;
  text-align: left;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.type-option:hover,
.type-option-active {
  border-color: var(--app-primary);
  color: var(--app-text);
}

:global([data-app-theme="dark"]) .type-option:hover,
:global([data-app-theme="dark"]) .type-option-active {
  background:
    linear-gradient(135deg, rgba(61, 120, 253, 0.18), rgba(82, 76, 255, 0.12)),
    rgba(25, 32, 54, 0.86);
  box-shadow: 0 14px 30px rgba(6, 12, 28, 0.22);
}

:global([data-app-theme="light"]) .type-option:hover,
:global([data-app-theme="light"]) .type-option-active {
  background:
    linear-gradient(135deg, rgba(61, 120, 253, 0.1), rgba(82, 76, 255, 0.06)),
    #f8fbff;
  box-shadow: 0 12px 24px rgba(49, 90, 166, 0.12);
}

.type-title {
  color: var(--app-text);
  font-weight: 700;
}

.type-description {
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.5;
}

.confirm {
  display: grid;
  gap: 14px;
}

.issue-list {
  margin: 0;
  padding-left: 18px;
}

.footer {
  display: grid;
  grid-template-columns: minmax(96px, 0.6fr) minmax(0, 1.4fr);
  align-items: center;
  gap: 10px;
  width: 100%;
}

.footer :deep(.n-button) {
  width: 100%;
  min-width: 0 !important;
  height: 44px !important;
  font-size: 14px !important;
}

.action-footer-primary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

:global(.action-wizard-drawer) {
  height: 100%;
}

:global(.action-wizard-drawer .n-drawer-body) {
  min-height: 0;
  flex: 1 1 auto;
}

:global(.action-wizard-drawer .n-drawer-body-content-wrapper) {
  height: 100%;
  min-height: 0;
}

:global(.action-wizard-drawer .n-drawer-footer) {
  min-height: 0;
}

:global(.action-wizard-drawer .n-drawer-footer .n-button) {
  min-width: 0 !important;
  height: 44px !important;
  font-size: 14px !important;
}

@media (max-width: 640px) {
  .type-grid {
    grid-template-columns: 1fr;
  }

  .footer {
    grid-template-columns: 1fr;
  }
}
</style>
