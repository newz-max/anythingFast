import { shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useGlobalSettingsFlow } from '@/composables/useGlobalSettingsFlow'
import type { AppSettings } from '@/types/domain'

const logDevErrorMock = vi.hoisted(() => vi.fn())

vi.mock('@/utils/errors', () => ({
  logDevError: logDevErrorMock
}))

describe('useGlobalSettingsFlow', () => {
  it('opens settings and reports autostart load failures', async () => {
    const harness = makeHarness()
    harness.autostartApi.isEnabled.mockRejectedValue(new Error('denied'))

    await harness.controller.openSettings()

    expect(harness.controller.settingsModalVisible.value).toBe(true)
    expect(harness.keybindings.loadKeybindings).toHaveBeenCalledTimes(1)
    expect(harness.reportUiError).toHaveBeenCalledWith('Load autostart status failed', expect.any(Error))
  })

  it('saves settings and refreshes shortcut status', async () => {
    const harness = makeHarness()
    harness.controller.settingsShortcutDraft.value = 'Ctrl+Space'
    harness.controller.themeDraft.value = 'light'
    harness.controller.launchOnStartupDraft.value = true

    await harness.controller.saveSettings()

    expect(harness.autostartApi.setEnabled).toHaveBeenCalledWith(true)
    expect(harness.taskStore.updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      globalShortcut: 'Ctrl+Space',
      theme: 'light',
      launchOnStartup: true
    }))
    expect(harness.shortcutDraft.value).toBe('Ctrl+Space')
    expect(harness.refreshShortcutStatus).toHaveBeenCalledTimes(1)
    expect(harness.controller.settingsModalVisible.value).toBe(false)
  })

  it('keeps the modal open and rolls back autostart on save failure', async () => {
    const harness = makeHarness()
    harness.taskStore.updateSettings.mockRejectedValue(new Error('save failed'))
    harness.controller.settingsModalVisible.value = true
    harness.controller.launchOnStartupDraft.value = true

    await harness.controller.saveSettings()

    expect(harness.autostartApi.setEnabled).toHaveBeenNthCalledWith(1, true)
    expect(harness.autostartApi.setEnabled).toHaveBeenNthCalledWith(2, false)
    expect(harness.controller.settingsModalVisible.value).toBe(true)
    expect(harness.refreshShortcutStatusQuiet).toHaveBeenCalledWith('Refresh shortcut status after failed settings save')
    expect(harness.reportUiError).toHaveBeenCalledWith('Save settings failed', expect.any(Error), expect.any(Object))
  })

  it('logs rollback failures', async () => {
    const harness = makeHarness()
    harness.taskStore.updateSettings.mockRejectedValue(new Error('save failed'))
    harness.autostartApi.setEnabled
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rollback failed'))
    harness.controller.launchOnStartupDraft.value = true

    await harness.controller.saveSettings()

    expect(logDevErrorMock).toHaveBeenCalledWith('Rollback autostart status failed', expect.any(Error), {
      previousLaunchOnStartup: false
    })
  })

  it('cycles and persists theme preference', async () => {
    const harness = makeHarness()

    await harness.controller.cycleTheme()

    expect(harness.taskStore.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }))
    expect(harness.controller.themeDraft.value).toBe('light')
    expect(harness.message.success).toHaveBeenCalledWith('主题已切换为浅色')
  })
})

function makeHarness() {
  const settings: AppSettings = {
    globalShortcut: 'Alt+Space',
    theme: 'system',
    launchOnStartup: false
  }
  const taskStore = {
    get settings() {
      return settings
    },
    updateSettings: vi.fn(async (next: AppSettings) => {
      Object.assign(settings, next)
    })
  }
  const autostartApi = {
    isEnabled: vi.fn().mockResolvedValue(false),
    setEnabled: vi.fn().mockResolvedValue(undefined)
  }
  const keybindings = { loadKeybindings: vi.fn().mockResolvedValue(undefined) }
  const shortcutDraft = shallowRef('')
  const refreshShortcutStatus = vi.fn().mockResolvedValue(undefined)
  const refreshShortcutStatusQuiet = vi.fn().mockResolvedValue(undefined)
  const reportUiError = vi.fn()
  const message = { success: vi.fn() }
  const controller = useGlobalSettingsFlow(
    {
      taskStore: taskStore as never,
      keybindings,
      shortcutDraft,
      message: message as never,
      refreshShortcutStatus,
      refreshShortcutStatusQuiet,
      reportUiError
    },
    { autostartApi: autostartApi as never }
  )

  return {
    autostartApi,
    controller,
    keybindings,
    message,
    refreshShortcutStatus,
    refreshShortcutStatusQuiet,
    reportUiError,
    shortcutDraft,
    taskStore
  }
}
