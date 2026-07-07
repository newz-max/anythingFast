import { shallowRef, type Ref } from 'vue'
import type { MessageApi } from 'naive-ui'
import { autostartApi } from '@/api/autostart'
import { logDevError } from '@/utils/errors'
import type { useKeybindings } from '@/composables/useKeybindings'
import type { useTaskStore } from '@/stores/taskStore'
import type { AppTheme } from '@/types/domain'

type TaskStore = ReturnType<typeof useTaskStore>
type Keybindings = ReturnType<typeof useKeybindings>

export const themeOptions: Array<{ label: string; value: AppTheme }> = [
  { label: '跟随系统', value: 'system' },
  { label: '浅色', value: 'light' },
  { label: '深色', value: 'dark' }
]

export interface UseGlobalSettingsFlowOptions {
  taskStore: Pick<TaskStore, 'settings' | 'updateSettings'>
  keybindings: Pick<Keybindings, 'loadKeybindings'>
  shortcutDraft: Ref<string>
  message: MessageApi
  refreshShortcutStatus: () => Promise<void>
  refreshShortcutStatusQuiet: (context: string) => Promise<void>
  reportUiError: (context: string, err: unknown, details?: Record<string, unknown>) => void
}

export interface UseGlobalSettingsFlowDeps {
  autostartApi?: typeof autostartApi
}

export function useGlobalSettingsFlow(options: UseGlobalSettingsFlowOptions, deps: UseGlobalSettingsFlowDeps = {}) {
  const api = deps.autostartApi ?? autostartApi
  const settingsShortcutDraft = shallowRef('')
  const themeDraft = shallowRef<AppTheme>('dark')
  const launchOnStartupDraft = shallowRef(false)
  const settingsModalVisible = shallowRef(false)

  syncSettingsDrafts()

  function syncSettingsDrafts() {
    settingsShortcutDraft.value = options.taskStore.settings.globalShortcut
    themeDraft.value = options.taskStore.settings.theme
    launchOnStartupDraft.value = options.taskStore.settings.launchOnStartup
  }

  async function openSettings() {
    syncSettingsDrafts()
    settingsModalVisible.value = true
    await options.keybindings.loadKeybindings()
    try {
      launchOnStartupDraft.value = await api.isEnabled()
    } catch (err) {
      launchOnStartupDraft.value = options.taskStore.settings.launchOnStartup
      options.reportUiError('Load autostart status failed', err)
    }
  }

  async function saveSettings() {
    const previousLaunchOnStartup = options.taskStore.settings.launchOnStartup
    const nextLaunchOnStartup = launchOnStartupDraft.value
    try {
      await api.setEnabled(nextLaunchOnStartup)
      await options.taskStore.updateSettings({
        ...options.taskStore.settings,
        globalShortcut: settingsShortcutDraft.value.trim() || 'Alt+Space',
        theme: themeDraft.value,
        launchOnStartup: nextLaunchOnStartup
      })
      options.shortcutDraft.value = options.taskStore.settings.globalShortcut
      await options.refreshShortcutStatus()
      settingsModalVisible.value = false
      options.message.success('设置已保存')
    } catch (err) {
      syncSettingsDrafts()
      if (nextLaunchOnStartup !== previousLaunchOnStartup) {
        try {
          await api.setEnabled(previousLaunchOnStartup)
        } catch (rollbackErr) {
          logDevError('Rollback autostart status failed', rollbackErr, { previousLaunchOnStartup })
        }
      }
      await options.refreshShortcutStatusQuiet('Refresh shortcut status after failed settings save')
      options.reportUiError('Save settings failed', err, {
        shortcut: settingsShortcutDraft.value,
        theme: themeDraft.value,
        launchOnStartup: nextLaunchOnStartup
      })
    }
  }

  async function cycleTheme() {
    const order: AppTheme[] = ['system', 'light', 'dark']
    const nextTheme = order[(order.indexOf(options.taskStore.settings.theme) + 1) % order.length]
    await options.taskStore.updateSettings({ ...options.taskStore.settings, theme: nextTheme })
    themeDraft.value = nextTheme
    options.message.success(`主题已切换为${themeLabel(nextTheme)}`)
  }

  return {
    settingsShortcutDraft,
    themeDraft,
    launchOnStartupDraft,
    settingsModalVisible,
    themeOptions,
    syncSettingsDrafts,
    openSettings,
    saveSettings,
    cycleTheme
  }
}

export function themeLabel(theme: AppTheme) {
  if (theme === 'light') return '浅色'
  if (theme === 'dark') return '深色'
  return '跟随系统'
}
