import { check, type CheckOptions, type DownloadEvent, type DownloadOptions, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { tauriApi } from '@/api/tauri'
import { logDevError } from '@/utils/errors'
import { assertTauriRuntime } from '@/utils/tauriRuntime'

export type AppUpdate = Update
export type AppUpdateDownloadEvent = DownloadEvent
type UpdateDownloadOptions = DownloadOptions & { proxy?: string }

const updateProxyUrls = new WeakMap<AppUpdate, string>()

function assertUpdaterRuntime() {
  assertTauriRuntime('浏览器预览环境不能检查或安装更新，请使用 Tauri 运行。')
}

export const updaterApi = {
  async checkForUpdate() {
    assertUpdaterRuntime()
    const proxyUrl = await resolveProxyUrl()
    const update = await check(checkOptions(proxyUrl))
    if (update && proxyUrl) {
      updateProxyUrls.set(update, proxyUrl)
    }
    return update
  },
  async downloadUpdate(update: AppUpdate, onEvent: (event: AppUpdateDownloadEvent) => void) {
    assertUpdaterRuntime()
    await update.download(onEvent, downloadOptions(updateProxyUrls.get(update)))
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

async function resolveProxyUrl() {
  try {
    const resolution = await tauriApi.resolveUpdateProxy()
    return resolution.proxyUrl?.trim() || undefined
  } catch (err) {
    logDevError('Resolve update proxy failed; falling back to direct updater request', err)
    return undefined
  }
}

function checkOptions(proxyUrl: string | undefined): CheckOptions | undefined {
  return proxyUrl ? { proxy: proxyUrl } : undefined
}

function downloadOptions(proxyUrl: string | undefined): UpdateDownloadOptions | undefined {
  return proxyUrl ? { proxy: proxyUrl } : undefined
}
