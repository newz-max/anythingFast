<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useKeybindings } from '@/composables/useKeybindings'
import { formatKeybinding, keybindingScopeLabels, type EffectiveKeybinding, type KeybindingCommand } from '@/domain/keybindings'

const props = defineProps<{
  globalShortcut: string
  taskShortcuts: string[]
}>()

const message = useMessage()
const keybindings = useKeybindings()
const drafts = reactive<Record<string, string>>({})

const groups = computed(() =>
  Object.entries(keybindingScopeLabels).map(([scope, label]) => ({
    scope,
    label,
    items: keybindings.effective.value.filter((item) => item.scope === scope)
  }))
)
const externalWarnings = computed(() => keybindings.externalWarnings([props.globalShortcut, ...props.taskShortcuts]))
const configWarning = computed(() => keybindings.warning.value || '')

watch(
  keybindings.effective,
  (items) => {
    for (const item of items) {
      drafts[item.command] = item.key
    }
  },
  { immediate: true }
)

async function saveKeybinding(item: EffectiveKeybinding) {
  try {
    await keybindings.setCommandKey(item.command, drafts[item.command] || '')
    message.success('快捷键已保存')
  } catch (err) {
    drafts[item.command] = item.key
    message.error(err instanceof Error ? err.message : '快捷键保存失败')
  }
}

async function setEnabled(item: EffectiveKeybinding, enabled: boolean) {
  try {
    if (enabled) {
      await keybindings.resetCommand(item.command)
      message.success('已恢复默认快捷键')
      return
    }
    await keybindings.disableCommand(item.command)
    message.success('快捷键已禁用')
  } catch (err) {
    message.error(err instanceof Error ? err.message : '快捷键更新失败')
  }
}

async function resetCommand(command: KeybindingCommand) {
  await keybindings.resetCommand(command)
  message.success('已恢复默认快捷键')
}

async function resetAll() {
  await keybindings.resetAll()
  message.success('已恢复全部默认快捷键')
}

async function openFile() {
  try {
    await keybindings.openFile()
  } catch (err) {
    message.error(err instanceof Error ? err.message : '无法打开快捷键配置文件')
  }
}
</script>

<template>
  <section class="keybinding-settings">
    <header class="keybinding-settings-header">
      <div>
        <h3>软件内快捷键</h3>
        <p>这些快捷键只在对应窗口或编辑器聚焦时生效；全局唤起和事项触发快捷键仍由系统级注册控制。</p>
      </div>
      <div class="keybinding-actions">
        <NButton size="small" secondary @click="openFile">打开配置文件</NButton>
        <NButton size="small" secondary @click="resetAll">全部恢复默认</NButton>
      </div>
    </header>

    <NAlert v-if="configWarning" type="warning" :show-icon="false" class="keybinding-alert">
      {{ configWarning }}
    </NAlert>
    <NAlert v-if="externalWarnings.length > 0" type="info" :show-icon="false" class="keybinding-alert">
      {{ externalWarnings[0] }}
    </NAlert>

    <section v-for="group in groups" :key="group.scope" class="keybinding-group">
      <h4>{{ group.label }}</h4>
      <div class="keybinding-list">
        <article v-for="item in group.items" :key="item.command" class="keybinding-row">
          <div class="keybinding-copy">
            <strong>{{ item.label }}</strong>
            <span>{{ item.description }}</span>
            <small>{{ item.command }}</small>
          </div>
          <NInput
            v-model:value="drafts[item.command]"
            class="keybinding-input"
            size="small"
            :disabled="!item.enabled"
            :placeholder="formatKeybinding(item.defaultKey)"
            @keyup.enter="saveKeybinding(item)"
          />
          <NSwitch :value="item.enabled" @update:value="(enabled: boolean) => setEnabled(item, enabled)" />
          <NButton size="small" secondary :disabled="!item.enabled" @click="saveKeybinding(item)">保存</NButton>
          <NButton size="small" quaternary @click="resetCommand(item.command)">默认</NButton>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.keybinding-settings {
  display: grid;
  gap: 14px;
}

.keybinding-settings-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px;
}

.keybinding-settings-header h3,
.keybinding-group h4 {
  margin: 0;
  color: var(--app-text);
}

.keybinding-settings-header p {
  margin: 5px 0 0;
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.5;
}

.keybinding-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.keybinding-alert {
  font-size: 13px;
}

.keybinding-group {
  display: grid;
  gap: 8px;
}

.keybinding-list {
  display: grid;
  gap: 8px;
}

.keybinding-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(120px, 160px) auto auto auto;
  align-items: center;
  gap: 9px;
  min-width: 0;
  border: 1px solid var(--app-field-border);
  border-radius: 8px;
  background: var(--app-field-bg);
  padding: 10px;
}

.keybinding-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.keybinding-copy strong,
.keybinding-copy span,
.keybinding-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keybinding-copy span,
.keybinding-copy small {
  color: var(--app-muted);
  font-size: 12px;
}

.keybinding-input {
  min-width: 0;
}

@media (max-width: 720px) {
  .keybinding-settings-header,
  .keybinding-row {
    grid-template-columns: 1fr;
  }

  .keybinding-actions {
    justify-content: flex-start;
  }
}
</style>
