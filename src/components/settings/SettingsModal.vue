<script setup lang="ts">
import KeybindingSettings from '@/components/settings/KeybindingSettings.vue'
import UpdateSettings from '@/components/settings/UpdateSettings.vue'
import type { AppTheme } from '@/types/domain'

defineProps<{
  show: boolean
  shortcut: string
  theme: AppTheme
  launchOnStartup: boolean
  themeOptions: Array<{ label: string; value: AppTheme }>
  taskShortcuts: string[]
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
  'update:shortcut': [shortcut: string]
  'update:theme': [theme: AppTheme]
  'update:launchOnStartup': [enabled: boolean]
  save: []
}>()
</script>

<template>
  <NModal :show="show" preset="card" class="settings-modal" title="全局设置" @update:show="emit('update:show', $event)">
    <NForm label-placement="top">
      <NFormItem label="全局快捷键">
        <NInput :value="shortcut" placeholder="Alt+Space" @update:value="emit('update:shortcut', $event)" />
      </NFormItem>
      <NFormItem label="主题">
        <NSelect :value="theme" :options="themeOptions" @update:value="emit('update:theme', $event as AppTheme)" />
      </NFormItem>
      <NFormItem label="开机自启动">
        <NSwitch :value="launchOnStartup" @update:value="emit('update:launchOnStartup', $event)" />
      </NFormItem>
    </NForm>
    <KeybindingSettings :global-shortcut="shortcut" :task-shortcuts="taskShortcuts" />
    <UpdateSettings />
    <template #footer>
      <NSpace justify="end">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" @click="emit('save')">保存</NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped>
:deep(.settings-modal) {
  max-width: min(920px, calc(100vw - 32px));
}
</style>
