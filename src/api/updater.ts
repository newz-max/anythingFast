import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

export type AppUpdate = Update
export type AppUpdateDownloadEvent = DownloadEvent

function assertTauriRuntime() {
  if (!('__TAURI_INTERNALS__' in window)) {
    throw new Error('浏览器预览环境不能检查或安装更新，请使用 Tauri 运行。')
  }
}

export const updaterApi = {
  async checkForUpdate() {
    assertTauriRuntime()
    return check()
  },
  async downloadUpdate(update: AppUpdate, onEvent: (event: AppUpdateDownloadEvent) => void) {
    assertTauriRuntime()
    await update.download(onEvent)
  },
  async installUpdate(update: AppUpdate) {
    assertTauriRuntime()
    await update.install()
  },
  async relaunchApp() {
    assertTauriRuntime()
    await relaunch()
  }
}
