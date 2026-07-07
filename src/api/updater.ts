import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { assertTauriRuntime } from '@/utils/tauriRuntime'

export type AppUpdate = Update
export type AppUpdateDownloadEvent = DownloadEvent

function assertUpdaterRuntime() {
  assertTauriRuntime('浏览器预览环境不能检查或安装更新，请使用 Tauri 运行。')
}

export const updaterApi = {
  async checkForUpdate() {
    assertUpdaterRuntime()
    return check()
  },
  async downloadUpdate(update: AppUpdate, onEvent: (event: AppUpdateDownloadEvent) => void) {
    assertUpdaterRuntime()
    await update.download(onEvent)
  },
  async installUpdate(update: AppUpdate) {
    assertUpdaterRuntime()
    await update.install()
  },
  async relaunchApp() {
    assertUpdaterRuntime()
    await relaunch()
  }
}
