<script setup lang="ts">
defineProps<{
  show: boolean
  globalShortcut: string
  keybindingHelpGroups: Array<{
    scope: string
    label: string
    items: Array<{
      command: string
      label: string
      key?: string
      enabled: boolean
    }>
  }>
}>()

const emit = defineEmits<{
  'update:show': [show: boolean]
}>()
</script>

<template>
  <NModal :show="show" preset="card" class="help-modal" title="帮助" @update:show="emit('update:show', $event)">
    <div class="help-content">
      <p>事项由基础信息和动作序列组成，可以手动运行，也可以配置事项快捷键触发。</p>
      <p>动作支持打开程序、URL、文件、文件夹、执行命令和延时等待；本地动作始终通过 Tauri 后端执行。</p>
      <p>包含高风险命令或首次执行命令事项时，需要二次确认。执行结果会写入执行日志。</p>
      <section class="help-shortcuts">
        <h3>快捷键</h3>
        <p>全局唤起快捷键和事项快捷键是系统级快捷键；下面的软件内快捷键只在对应窗口或编辑器聚焦时生效。</p>
        <div class="help-shortcut-system">
          <span>全局唤起：{{ globalShortcut }}</span>
          <span>事项触发：在事项详情的触发设置中配置</span>
        </div>
        <section v-for="group in keybindingHelpGroups" :key="group.scope" class="help-shortcut-group">
          <h4>{{ group.label }}</h4>
          <dl>
            <template v-for="item in group.items" :key="item.command">
              <dt>{{ item.enabled ? item.key : '已禁用' }}</dt>
              <dd>{{ item.label }}</dd>
            </template>
          </dl>
        </section>
      </section>
    </div>
  </NModal>
</template>

<style scoped>
:deep(.help-modal) {
  max-width: 420px;
}

.help-content {
  display: grid;
  gap: 10px;
  color: #475467;
  line-height: 1.7;
}

.help-content p {
  margin: 0;
}

.help-shortcuts {
  display: grid;
  gap: 10px;
  border-top: 1px solid var(--app-field-border);
  padding-top: 10px;
}

.help-shortcuts h3,
.help-shortcut-group h4 {
  margin: 0;
  color: var(--app-text);
}

.help-shortcut-system {
  display: grid;
  gap: 4px;
  color: var(--app-muted);
  font-size: 13px;
}

.help-shortcut-group {
  display: grid;
  gap: 6px;
}

.help-shortcut-group dl {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 10px;
  margin: 0;
}

.help-shortcut-group dt {
  color: var(--app-text);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
}

.help-shortcut-group dd {
  min-width: 0;
  margin: 0;
  color: var(--app-muted);
}
</style>
