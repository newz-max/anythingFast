<script setup lang="ts">
import { computed } from 'vue'
import type { TaskItem, TaskTag } from '@/types/domain'

const task = defineModel<TaskItem>({ required: true })
const props = defineProps<{
  categories?: string[]
  tags?: TaskTag[]
}>()

const taskNameLimit = 50
const keywordLimit = 10
const tagLimit = 10
const descriptionLimit = 200

const categoryOptions = computed(() =>
  (props.categories || [])
    .filter((category) => category !== '全部')
    .map((category) => ({ label: category, value: category }))
)
const tagOptions = computed(() => (props.tags || []).map((tag) => ({ label: tag.name, value: tag.id })))
const nameCount = computed(() => task.value.name.length)
const keywordCount = computed(() => task.value.keywords?.length || 0)
const selectedTagCount = computed(() => task.value.tagIds?.length || 0)
const descriptionCount = computed(() => task.value.description?.length || 0)

const keywordText = computed({
  get: () => task.value.keywords?.join(', ') || '',
  set: (value: string) => {
    task.value.keywords = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
})
</script>

<template>
  <NForm class="basic-step" label-placement="top">
    <NFormItem label="事项名称" required>
      <NInput
        v-model:value="task.name"
        placeholder="请输入事项名称"
        :maxlength="taskNameLimit"
        show-count
      >
        <template #count>{{ nameCount }}/{{ taskNameLimit }}</template>
      </NInput>
    </NFormItem>

    <NFormItem label="分类" required>
      <NSelect
        v-model:value="task.category"
        filterable
        tag
        clearable
        :options="categoryOptions"
        placeholder="请选择分类"
      />
    </NFormItem>

    <NFormItem label="关键词">
      <NInput v-model:value="keywordText" placeholder="请输入关键词，用英文逗号分隔" show-count>
        <template #count>{{ keywordCount }}/{{ keywordLimit }}</template>
      </NInput>
    </NFormItem>

    <NFormItem label="标签">
      <div class="field-control">
        <NSelect
          v-model:value="task.tagIds"
          class="counted-select"
          multiple
          clearable
          :options="tagOptions"
          placeholder="选择标签"
          :max-tag-count="'responsive'"
        />
        <span class="field-count">{{ selectedTagCount }}/{{ tagLimit }}</span>
      </div>
    </NFormItem>

    <NFormItem label="描述">
      <NInput
        v-model:value="task.description"
        type="textarea"
        placeholder="请输入事项描述（可选）"
        :maxlength="descriptionLimit"
        show-count
        :autosize="{ minRows: 3, maxRows: 5 }"
      >
        <template #count>{{ descriptionCount }}/{{ descriptionLimit }}</template>
      </NInput>
    </NFormItem>

    <div class="status-row">
      <div class="status-copy">
        <strong>启用事项</strong>
        <span>启用后该事项可在运行面板中使用</span>
      </div>
      <NSwitch v-model:value="task.enabled" />
    </div>
  </NForm>
</template>

<style scoped>
.basic-step {
  display: grid;
  gap: 0;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-top: 1px solid var(--app-divider);
  padding-top: 24px;
  color: var(--app-text);
}

.status-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.status-copy strong {
  font-size: 16px;
  line-height: 1.25;
}

.status-copy span {
  color: var(--app-muted);
  font-size: 14px;
  line-height: 1.45;
}

.field-control {
  position: relative;
  width: 100%;
}

.counted-select {
  width: 100%;
}

.field-count {
  position: absolute;
  top: 50%;
  right: 14px;
  z-index: 1;
  transform: translateY(-50%);
  color: var(--app-subtle);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}

.field-control :deep(.n-base-selection) {
  padding-right: 52px;
}

@media (max-width: 420px) {
  .status-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
