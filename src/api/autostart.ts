import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const autostartApi = {
  async isEnabled() {
    return isTauri() ? await isEnabled() : false
  },

  async setEnabled(enabled: boolean) {
    if (!isTauri()) return
    if (enabled) {
      await enable()
      return
    }
    await disable()
  }
}
