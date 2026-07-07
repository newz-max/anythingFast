import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauriRuntime as defaultIsTauriRuntime } from '@/utils/tauriRuntime'

interface WindowControlApi {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
}

export interface UseWindowControlsDeps {
  getCurrentWindow?: () => WindowControlApi
  isTauriRuntime?: () => boolean
}

export function useWindowControls(deps: UseWindowControlsDeps = {}) {
  const getWindow = deps.getCurrentWindow ?? getCurrentWindow
  const isTauriRuntime = deps.isTauriRuntime ?? defaultIsTauriRuntime

  async function minimizeWindow() {
    if (!isTauriRuntime()) return
    await getWindow().minimize()
  }

  async function toggleMaximizeWindow() {
    if (!isTauriRuntime()) return
    await getWindow().toggleMaximize()
  }

  async function closeWindow() {
    if (!isTauriRuntime()) return
    await getWindow().close()
  }

  return {
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow
  }
}
