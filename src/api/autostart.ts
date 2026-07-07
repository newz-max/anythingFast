import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart'
import { isTauriRuntime } from '@/utils/tauriRuntime'

export const autostartApi = {
  async isEnabled() {
    return isTauriRuntime() ? await isEnabled() : false
  },

  async setEnabled(enabled: boolean) {
    if (!isTauriRuntime()) return
    if (enabled) {
      await enable()
      return
    }
    await disable()
  }
}
