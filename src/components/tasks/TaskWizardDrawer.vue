<script setup lang="ts">
import { computed, shallowRef, toRef, watch } from 'vue'
import { useMessage } from 'naive-ui'
import ActionWizardPanel, { type ActionWizardMode } from '@/components/tasks/ActionWizardPanel.vue'
import TaskWizardActionStep from '@/components/tasks/TaskWizardActionStep.vue'
import TaskWizardBasicStep from '@/components/tasks/TaskWizardBasicStep.vue'
import TaskWizardConfirmStep from '@/components/tasks/TaskWizardConfirmStep.vue'
import { useTaskWizardDraft, type TaskWizardMode } from '@/composables/useTaskWizardDraft'
import { clonePlainDto } from '@/utils/clonePlainDto'
import type { TaskAction, TaskItem, TaskTag } from '@/types/domain'

const props = defineProps<{
  show: boolean
  mode: TaskWizardMode
  task: TaskItem | null
  allTasks: TaskItem[]
  categories?: string[]
  tags?: TaskTag[]
  saving: boolean
  initialStep?: number
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  save: [task: TaskItem]
  close: []
  delete: [task: TaskItem]
  duplicate: [task: TaskItem]
}>()

const currentStep = shallowRef(1)
const actionWizardVisible = shallowRef(false)
const actionWizardMode = shallowRef<ActionWizardMode>('create')
const editingAction = shallowRef<TaskAction | null>(null)
const message = useMessage()
const modeRef = toRef(props, 'mode')
const taskRef = toRef(props, 'task')
const allTasksRef = toRef(props, 'allTasks')
const { draft, validation, actionCount, containsCommand, addAction, replaceAction, removeAction, moveAction, normalizeRisks, clearDraft } = useTaskWizardDraft({
  mode: modeRef,
  sourceTask: taskRef,
  allTasks: allTasksRef
})

const title = computed(() => (props.mode === 'create' ? '新增事项' : '编辑事项'))
const stepStatus = computed(() => (currentStep.value === 3 && validation.value?.valid === false ? 'error' : 'process'))
const canGoNext = computed(() => Boolean(draft.value) && currentStep.value < 3)
const canSave = computed(() => Boolean(draft.value))

watch(
  () => props.show,
  (show) => {
    if (show) {
      currentStep.value = props.initialStep ?? 1
      return
    }
    clearDraft()
  }
)

watch(
  draft,
  () => normalizeRisks(),
  { deep: true }
)

function close() {
  emit('update:show', false)
  emit('close')
}

function nextStep() {
  if (!canGoNext.value) return
  currentStep.value += 1
}

function previousStep() {
  if (currentStep.value <= 1) return
  currentStep.value -= 1
}

function save() {
  if (!draft.value || validation.value?.valid === false) {
    currentStep.value = 3
    message.warning(validation.value?.issues[0]?.message || '保存前需要修正事项配置')
    return
  }
  const savedTask = clonePlainDto(draft.value)
  emit('save', savedTask)
}

function duplicate() {
  if (!draft.value) return
  emit('duplicate', clonePlainDto(draft.value))
}

function remove() {
  if (!draft.value) return
  emit('delete', clonePlainDto(draft.value))
}

function createAction() {
  actionWizardMode.value = 'create'
  editingAction.value = null
  actionWizardVisible.value = true
}

function editAction(action: TaskAction) {
  actionWizardMode.value = 'edit'
  editingAction.value = action
  actionWizardVisible.value = true
}

function saveAction(action: TaskAction) {
  const saved = actionWizardMode.value === 'create' ? addAction(action) : replaceAction(action)
  if (!saved) {
    message.error('动作保存失败：事项草稿不存在或动作已被移除')
    return
  }

  actionWizardVisible.value = false
  editingAction.value = null
  if (actionWizardMode.value === 'create') {
    message.success('已新增动作')
    return
  }
  message.success('已保存动作')
}
</script>

<template>
  <NDrawer
    :show="show"
    placement="right"
    width="min(542px, 100vw)"
    :mask-closable="true"
    @update:show="(value: boolean) => (value ? emit('update:show', true) : close())"
  >
    <NDrawerContent :title="title" closable class="task-wizard-drawer">
      <template v-if="draft">
        <div class="wizard">
          <NSteps v-model:current="currentStep" :status="stepStatus" size="small" class="wizard-steps">
            <NStep title="基础信息" />
            <NStep title="动作序列" />
            <NStep title="确认保存" />
          </NSteps>

          <section class="step-body">
            <TaskWizardBasicStep v-show="currentStep === 1" v-model="draft" :categories="categories" :tags="tags" />
            <TaskWizardActionStep
              v-show="currentStep === 2"
              v-model:actions="draft.actions"
              @create="createAction"
              @edit="editAction"
              @remove="removeAction"
              @move="moveAction"
            />
            <TaskWizardConfirmStep
              v-show="currentStep === 3"
              :task="draft"
              :validation="validation"
              :action-count="actionCount"
              :contains-command="containsCommand"
            />
          </section>
        </div>
      </template>

      <template #footer>
        <div class="footer">
          <div class="footer-secondary">
            <NButton class="close-footer-button" @click="close">关闭</NButton>
            <template v-if="mode === 'edit'">
              <NButton class="compact-footer-button" secondary @click="duplicate">复制</NButton>
              <NButton class="compact-footer-button" secondary type="error" @click="remove">删除</NButton>
            </template>
          </div>
          <div class="footer-primary">
            <NButton class="nav-footer-button" :disabled="currentStep === 1" @click="previousStep">上一步</NButton>
            <NButton v-if="currentStep < 3" class="nav-footer-button" type="primary" :disabled="!canGoNext" @click="nextStep">
              下一步
            </NButton>
            <NButton v-else class="nav-footer-button" type="primary" :loading="saving" :disabled="!canSave" @click="save">
              保存
            </NButton>
          </div>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>

  <ActionWizardPanel
    v-model:show="actionWizardVisible"
    :mode="actionWizardMode"
    :action="editingAction"
    @save="saveAction"
  />
</template>

<style scoped>
.wizard {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
}

.wizard-steps {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.step-body {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding-right: 4px;
}

.footer {
  display: grid;
  gap: 10px;
  width: 100%;
}

.footer-secondary,
.footer-primary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.footer-primary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.footer :deep(.n-button) {
  width: 100%;
  min-width: 0 !important;
  height: 44px !important;
  font-size: 14px !important;
}

:global(.task-wizard-drawer) {
  height: 100%;
}

:global(.task-wizard-drawer .n-drawer-body) {
  min-height: 0;
  flex: 1 1 auto;
}

:global(.task-wizard-drawer .n-drawer-body-content-wrapper) {
  height: 100%;
  min-height: 0;
}

:global(.task-wizard-drawer .n-drawer-footer) {
  min-height: 0;
}

:global(.task-wizard-drawer .n-drawer-footer .n-button) {
  min-width: 0 !important;
  height: 44px !important;
  font-size: 14px !important;
}

</style>
