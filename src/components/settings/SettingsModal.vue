<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import KeybindingSettings from '@/components/settings/KeybindingSettings.vue'
import UpdateSettings from '@/components/settings/UpdateSettings.vue'
import type { AppTheme } from '@/types/domain'

type SettingsSectionId = 'general' | 'shortcuts' | 'updates'

const props = defineProps<{
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

const activeSection = shallowRef<SettingsSectionId>('general')

const sections: Array<{
  id: SettingsSectionId
  title: string
  description: string
  meta: string
}> = [
  {
    id: 'general',
    title: '常规',
    description: '唤起、主题和启动偏好',
    meta: '需保存'
  },
  {
    id: 'shortcuts',
    title: '快捷键',
    description: '软件内快捷键配置',
    meta: '即时生效'
  },
  {
    id: 'updates',
    title: '更新',
    description: '检查、下载和安装更新',
    meta: '即时操作'
  }
]

const activeSectionDetail = computed(() => sections.find((section) => section.id === activeSection.value) || sections[0])
const themeLabel = computed(() => props.themeOptions.find((option) => option.value === props.theme)?.label || '未设置')
const startupLabel = computed(() => (props.launchOnStartup ? '已开启' : '未开启'))
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="settings-modal"
    :bordered="false"
    title="全局设置"
    @update:show="emit('update:show', $event)"
  >
    <section class="settings-shell">
      <header class="settings-header">
        <div class="settings-heading">
          <span class="settings-kicker">Preferences</span>
          <h2>全局设置</h2>
          <p>管理唤起、快捷键、更新和启动偏好。</p>
        </div>
        <div class="settings-status">
          <span>{{ themeLabel }}</span>
          <span>{{ startupLabel }}</span>
        </div>
      </header>

      <div class="settings-body">
        <nav class="settings-nav" aria-label="设置分类">
          <button
            v-for="section in sections"
            :key="section.id"
            class="settings-nav-item"
            :class="{ 'settings-nav-item-active': activeSection === section.id }"
            type="button"
            :aria-pressed="activeSection === section.id"
            @click="activeSection = section.id"
          >
            <span class="settings-nav-title">{{ section.title }}</span>
            <span class="settings-nav-description">{{ section.description }}</span>
            <small>{{ section.meta }}</small>
          </button>
        </nav>

        <main class="settings-content">
          <header class="section-header">
            <div>
              <h3>{{ activeSectionDetail.title }}</h3>
              <p>{{ activeSectionDetail.description }}</p>
            </div>
            <span class="section-meta-pill">{{ activeSectionDetail.meta }}</span>
          </header>

          <section v-show="activeSection === 'general'" class="settings-section general-settings" aria-label="常规设置">
            <article class="setting-row">
              <div class="setting-copy">
                <strong>全局快捷键</strong>
                <span>用于打开快捷搜索面板，保存后会刷新系统级快捷键注册状态。</span>
              </div>
              <NInput
                class="setting-control"
                :value="shortcut"
                placeholder="Alt+Space"
                @update:value="emit('update:shortcut', $event)"
              />
            </article>

            <article class="setting-row">
              <div class="setting-copy">
                <strong>主题</strong>
                <span>选择浅色、深色，或跟随 Windows 系统外观。</span>
              </div>
              <NSelect
                class="setting-control"
                :value="theme"
                :options="themeOptions"
                @update:value="emit('update:theme', $event as AppTheme)"
              />
            </article>

            <article class="setting-row">
              <div class="setting-copy">
                <strong>开机自启动</strong>
                <span>登录 Windows 后自动启动 anythingFast。</span>
              </div>
              <div class="switch-control">
                <span>{{ launchOnStartup ? '开启' : '关闭' }}</span>
                <NSwitch :value="launchOnStartup" @update:value="emit('update:launchOnStartup', $event)" />
              </div>
            </article>

            <aside class="settings-note">
              常规偏好会先保存在草稿中，点击底部保存后统一提交。
            </aside>
          </section>

          <KeybindingSettings v-show="activeSection === 'shortcuts'" :global-shortcut="shortcut" :task-shortcuts="taskShortcuts" />
          <UpdateSettings v-show="activeSection === 'updates'" />
        </main>
      </div>
    </section>

    <template #footer>
      <div class="settings-footer">
        <span>保存仅应用常规偏好；快捷键和更新操作会立即生效。</span>
        <div class="settings-footer-actions">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" @click="emit('save')">保存</NButton>
        </div>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
:global(.settings-modal) {
  width: min(980px, calc(100vw - 32px));
  max-width: min(980px, calc(100vw - 32px));
}

:global(.settings-modal .n-card-header) {
  display: none;
}

:global(.settings-modal .n-card__content) {
  padding: 0;
}

:global(.settings-modal .n-card__footer) {
  padding: 16px 20px 20px;
}

.settings-shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: min(680px, calc(100vh - 168px));
  min-height: 0;
  color: var(--app-text);
}

.settings-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 18px;
  border-bottom: 1px solid var(--app-divider);
  padding: 22px 24px 18px;
}

.settings-heading {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.settings-kicker {
  color: var(--app-primary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.settings-heading h2,
.settings-heading p,
.section-header h3,
.section-header p {
  margin: 0;
}

.settings-heading h2 {
  color: var(--app-text);
  font-size: 22px;
  line-height: 1.2;
}

.settings-heading p,
.section-header p,
.settings-footer,
.setting-copy span {
  color: var(--app-muted);
}

.settings-status {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.settings-status span {
  border: 1px solid var(--app-field-border);
  border-radius: 999px;
  background: var(--app-field-bg);
  padding: 5px 10px;
  color: var(--app-muted);
  font-size: 12px;
  font-weight: 700;
}

.settings-body {
  display: grid;
  grid-template-columns: 218px minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
}

.settings-nav {
  display: grid;
  align-content: start;
  gap: 8px;
  border-right: 1px solid var(--app-divider);
  padding: 18px 14px;
}

.settings-nav-item {
  display: grid;
  gap: 3px;
  width: 100%;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  padding: 11px 12px;
  color: var(--app-text);
  cursor: pointer;
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.settings-nav-item:hover,
.settings-nav-item:focus-visible {
  border-color: var(--app-field-border-hover);
  outline: none;
}

.settings-nav-item-active {
  border-color: var(--app-primary);
  background: var(--app-field-bg);
  box-shadow: inset 3px 0 0 var(--app-primary);
}

:global([data-app-theme="dark"]) .settings-nav-item:hover,
:global([data-app-theme="dark"]) .settings-nav-item:focus-visible {
  background:
    linear-gradient(135deg, rgba(61, 120, 253, 0.18), rgba(82, 76, 255, 0.1)),
    var(--app-field-bg);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

:global([data-app-theme="light"]) .settings-nav-item:hover,
:global([data-app-theme="light"]) .settings-nav-item:focus-visible {
  background:
    linear-gradient(135deg, rgba(61, 120, 253, 0.1), rgba(82, 76, 255, 0.05)),
    var(--app-field-bg);
}

.settings-nav-title {
  color: var(--app-text);
  font-weight: 800;
}

.settings-nav-description,
.settings-nav-item small {
  overflow: hidden;
  color: var(--app-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-nav-item small {
  color: var(--app-subtle);
  font-weight: 700;
}

.settings-content {
  display: grid;
  align-content: start;
  gap: 16px;
  min-width: 0;
  max-height: min(620px, calc(100vh - 238px));
  overflow-y: auto;
  padding: 20px;
}

.section-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 14px;
}

.section-header h3 {
  color: var(--app-text);
  font-size: 18px;
}

.section-header p {
  margin-top: 4px;
  font-size: 13px;
}

.section-meta-pill {
  border-radius: 999px;
  background: rgba(61, 120, 253, 0.16);
  padding: 4px 9px;
  color: #c9d5ff;
  font-size: 12px;
  font-weight: 800;
}

:global([data-app-theme="light"]) .section-meta-pill {
  color: #2d5fd8;
}

.settings-section,
.general-settings {
  display: grid;
  gap: 10px;
}

.setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 280px);
  align-items: center;
  gap: 16px;
  min-width: 0;
  border: 1px solid var(--app-field-border);
  border-radius: 8px;
  background: var(--app-field-bg);
  padding: 14px;
}

.setting-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.setting-copy strong {
  color: var(--app-text);
  font-size: 14px;
}

.setting-copy span {
  font-size: 13px;
  line-height: 1.5;
}

.setting-control {
  min-width: 0;
}

.switch-control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  color: var(--app-muted);
  font-size: 13px;
  font-weight: 700;
}

.settings-note {
  border: 1px solid var(--app-field-border);
  border-radius: 8px;
  background: rgba(61, 120, 253, 0.1);
  padding: 10px 12px;
  color: var(--app-muted);
  font-size: 13px;
}

.settings-footer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  font-size: 12px;
}

.settings-footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 760px) {
  :global(.settings-modal) {
    width: min(100vw - 20px, 680px);
    max-width: calc(100vw - 20px);
  }

  .settings-shell {
    height: min(620px, calc(100vh - 160px));
  }

  .settings-header,
  .settings-body,
  .section-header,
  .setting-row,
  .settings-footer {
    grid-template-columns: 1fr;
  }

  .settings-header {
    padding: 18px;
  }

  .settings-status,
  .settings-footer-actions,
  .switch-control {
    justify-content: flex-start;
  }

  .settings-body {
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
  }

  .settings-nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-right: 0;
    border-bottom: 1px solid var(--app-divider);
    padding: 12px;
  }

  .settings-nav-description {
    display: none;
  }

  .settings-content {
    max-height: min(520px, calc(100vh - 340px));
    padding: 16px;
  }
}

@media (max-width: 520px) {
  .settings-nav {
    grid-template-columns: 1fr;
  }

  .settings-content {
    max-height: min(460px, calc(100vh - 380px));
  }

  .settings-footer-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
