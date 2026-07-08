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
const keybindingCount = computed(() => keybindings.effective.value.length)
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
      <div class="keybinding-title">
        <h3>软件内快捷键</h3>
        <p>这些快捷键只在对应窗口或编辑器聚焦时生效；全局唤起和事项触发快捷键仍由系统级注册控制。</p>
        <div class="keybinding-meta">
          <NTag size="small" :bordered="false">{{ keybindingCount }} 项</NTag>
          <NTag size="small" :bordered="false">即时保存</NTag>
        </div>
      </div>
      <div class="keybinding-actions">
        <NButton size="small" secondary @click="openFile">打开配置文件</NButton>
        <NButton size="small" secondary @click="resetAll">全部恢复默认</NButton>
      </div>
    </header>

    <div v-if="configWarning || externalWarnings.length > 0" class="keybinding-alerts">
      <NAlert v-if="configWarning" type="warning" :show-icon="false" class="keybinding-alert">
        {{ configWarning }}
      </NAlert>
      <NAlert v-if="externalWarnings.length > 0" type="info" :show-icon="false" class="keybinding-alert">
        {{ externalWarnings[0] }}
      </NAlert>
    </div>

    <section v-for="group in groups" :key="group.scope" class="keybinding-group">
      <header class="keybinding-group-header">
        <h4>{{ group.label }}</h4>
        <span>{{ group.items.length }} 个命令</span>
      </header>
      <div class="keybinding-list">
        <article v-for="item in group.items" :key="item.command" class="keybinding-row">
          <div class="keybinding-copy">
            <strong>{{ item.label }}</strong>
            <span>{{ item.description }}</span>
            <small>{{ item.command }}</small>
          </div>
          <div class="keybinding-controls">
            <NInput
              v-model:value="drafts[item.command]"
              class="keybinding-input"
              size="small"
              :disabled="!item.enabled"
              :placeholder="formatKeybinding(item.defaultKey)"
              @keyup.enter="saveKeybinding(item)"
            />
            <div class="keybinding-switch">
              <span>{{ item.enabled ? '启用' : '禁用' }}</span>
              <NSwitch :value="item.enabled" @update:value="(enabled: boolean) => setEnabled(item, enabled)" />
            </div>
            <div class="keybinding-row-actions">
              <NButton size="small" secondary :disabled="!item.enabled" @click="saveKeybinding(item)">保存</NButton>
              <NButton size="small" quaternary @click="resetCommand(item.command)">默认</NButton>
            </div>
          </div>
        </article>
      </div>
    </section>
  </section>
</template>

<style scoped>
.keybinding-settings {
  display: grid;
  gap: 16px;
}

.keybinding-settings-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 16px;
  border: 1px solid var(--app-field-border);
  border-radius: 8px;
  background: var(--app-field-bg);
  padding: 14px;
}

.keybinding-settings-header h3,
.keybinding-group h4 {
  margin: 0;
  color: var(--app-text);
}

.keybinding-title {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.keybinding-settings-header p {
  margin: 0;
  color: var(--app-muted);
  font-size: 13px;
  line-height: 1.5;
}

.keybinding-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.keybinding-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.keybinding-alerts {
  display: grid;
  gap: 8px;
}

.keybinding-alert {
  font-size: 13px;
}

.keybinding-group {
  display: grid;
  gap: 10px;
}

.keybinding-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.keybinding-group-header span {
  color: var(--app-subtle);
  font-size: 12px;
  font-weight: 700;
}

.keybinding-list {
  display: grid;
  gap: 8px;
}

.keybinding-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(300px, 0.95fr);
  align-items: center;
  gap: 12px;
  min-width: 0;
  border: 1px solid var(--app-field-border);
  border-radius: 8px;
  background: var(--app-field-bg);
  padding: 12px;
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

.keybinding-controls {
  display: grid;
  grid-template-columns: minmax(116px, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.keybinding-input {
  min-width: 0;
}

.keybinding-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 700;
}

.keybinding-row-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

@media (max-width: 720px) {
  .keybinding-settings-header,
  .keybinding-row {
    grid-template-columns: 1fr;
  }

  .keybinding-actions,
  .keybinding-row-actions {
    justify-content: flex-start;
  }

  .keybinding-controls {
    grid-template-columns: 1fr;
  }

  .keybinding-switch {
    justify-content: space-between;
  }
}

@media (max-width: 420px) {
  .keybinding-row-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
