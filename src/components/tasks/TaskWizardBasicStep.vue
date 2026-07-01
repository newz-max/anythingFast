<script setup lang="ts">
import { computed } from 'vue'
import type { TaskItem, TaskTag } from '@/types/domain'

const task = defineModel<TaskItem>({ required: true })
const props = defineProps<{
  tags?: TaskTag[]
}>()

const tagOptions = computed(() => (props.tags || []).map((tag) => ({ label: tag.name, value: tag.id })))

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
    <NGrid :cols="2" :x-gap="12" responsive="screen">
      <NGi>
        <NFormItem label="事项名称" required>
          <NInput v-model:value="task.name" placeholder="例如：启动 anythingFast 项目" />
        </NFormItem>
      </NGi>
      <NGi>
        <NFormItem label="分类">
          <NInput v-model:value="task.category" placeholder="开发、学习、写作" />
        </NFormItem>
      </NGi>
    </NGrid>
    <NFormItem label="关键词">
      <NInput v-model:value="keywordText" placeholder="用英文逗号分隔，例如 af, 项目, dev" />
    </NFormItem>
    <NFormItem label="标签">
      <NSelect
        v-model:value="task.tagIds"
        multiple
        clearable
        :options="tagOptions"
        placeholder="选择标签"
      />
    </NFormItem>
    <NFormItem label="描述">
      <NInput v-model:value="task.description" type="textarea" :autosize="{ minRows: 3, maxRows: 5 }" />
    </NFormItem>
    <div class="status-row">
      <NSwitch v-model:value="task.enabled" />
      <span>启用事项</span>
      <NTag :type="task.riskLevel === 'high' ? 'error' : task.riskLevel === 'medium' ? 'warning' : 'success'">
        {{ task.riskLevel }}
      </NTag>
    </div>
  </NForm>
</template>

<style scoped>
.basic-step {
  display: grid;
  gap: 2px;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #475467;
}
</style>
