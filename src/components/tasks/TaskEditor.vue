<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import ActionSequenceEditor from '@/components/tasks/ActionSequenceEditor.vue'
import ActionPreview from '@/components/tasks/ActionPreview.vue'
import { useTaskDraft } from '@/composables/useTaskDraft'
import type { TaskItem } from '@/types/domain'

const props = defineProps<{
  task: TaskItem
  allTasks: TaskItem[]
  saving: boolean
}>()

const emit = defineEmits<{
  save: [task: TaskItem]
  duplicate: [task: TaskItem]
  delete: [task: TaskItem]
}>()

const taskRef = toRef(props, 'task')
const allTasksRef = toRef(props, 'allTasks')
const { draft, validation, actionCount, containsCommand, addAction, removeAction, moveAction, normalizeRisks } = useTaskDraft(taskRef, allTasksRef)

const keywordText = computed({
  get: () => draft.value?.keywords?.join(', ') || '',
  set: (value: string) => {
    if (!draft.value) return
    draft.value.keywords = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
})

watch(
  draft,
  () => normalizeRisks(),
  { deep: true }
)

function save() {
  if (!draft.value || validation.value?.valid === false) return
  emit('save', structuredClone(draft.value))
}
</script>

<template>
  <section v-if="draft" class="editor">
    <NCard class="panel" :bordered="false">
      <template #header>
        <div class="header">
          <div>
            <h2 class="title">{{ draft.name || '未命名事项' }}</h2>
            <p class="subtitle">编辑事项基础信息和动作序列</p>
          </div>
          <NSpace>
            <NButton secondary @click="emit('duplicate', draft)">复制</NButton>
            <NButton secondary type="error" @click="emit('delete', draft)">删除</NButton>
            <NButton type="primary" :loading="saving" :disabled="validation?.valid === false" @click="save">保存</NButton>
          </NSpace>
        </div>
      </template>

      <NGrid :cols="3" :x-gap="14" :y-gap="14" responsive="screen">
        <NGi :span="2">
          <NForm label-placement="top">
            <NGrid :cols="2" :x-gap="12">
              <NGi>
                <NFormItem label="事项名称" required>
                  <NInput v-model:value="draft.name" placeholder="例如：启动 anythingFast 项目" />
                </NFormItem>
              </NGi>
              <NGi>
                <NFormItem label="分类">
                  <NInput v-model:value="draft.category" placeholder="开发、学习、写作" />
                </NFormItem>
              </NGi>
            </NGrid>
            <NFormItem label="关键词">
              <NInput v-model:value="keywordText" placeholder="用英文逗号分隔，例如 af, 项目, dev" />
            </NFormItem>
            <NFormItem label="描述">
              <NInput v-model:value="draft.description" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" />
            </NFormItem>
            <NSpace align="center">
              <NSwitch v-model:value="draft.enabled" />
              <span>启用事项</span>
              <NTag :type="draft.riskLevel === 'high' ? 'error' : draft.riskLevel === 'medium' ? 'warning' : 'success'">
                {{ draft.riskLevel }}
              </NTag>
            </NSpace>
          </NForm>
        </NGi>
        <NGi>
          <ActionPreview :task="draft" :action-count="actionCount" :contains-command="containsCommand" />
        </NGi>
      </NGrid>

      <NDivider />
      <ActionSequenceEditor
        v-model:actions="draft.actions"
        @add="addAction"
        @remove="removeAction"
        @move="moveAction"
      />

      <NAlert v-if="validation && !validation.valid" class="issues" type="warning" title="保存前需要修正">
        <ul class="issue-list">
          <li v-for="issue in validation.issues" :key="`${issue.field}-${issue.message}`">{{ issue.message }}</li>
        </ul>
      </NAlert>
    </NCard>
  </section>
</template>

<style scoped>
.editor {
  min-width: 0;
}

.panel {
  border-radius: 8px;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.title {
  margin: 0;
  font-size: 22px;
}

.subtitle {
  margin: 4px 0 0;
  color: #667085;
  font-size: 13px;
}

.issues {
  margin-top: 14px;
}

.issue-list {
  margin: 0;
  padding-left: 18px;
}
</style>
