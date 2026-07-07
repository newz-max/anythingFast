<script setup lang="ts">
import type { TaskTag } from '@/types/domain'

defineProps<{
  show: boolean
  editingTag: TaskTag | null
  draftName: string
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  'update:draftName': [name: string]
  save: []
}>()
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="tag-modal"
    :title="editingTag ? '编辑标签' : '新增标签'"
    @update:show="emit('update:show', $event)"
  >
    <NInput :value="draftName" placeholder="标签名称" @update:value="emit('update:draftName', $event)" @keyup.enter="emit('save')" />
    <template #footer>
      <NSpace justify="end">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" @click="emit('save')">保存</NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped>
:deep(.tag-modal) {
  max-width: 420px;
}
</style>
