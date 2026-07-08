import { onMounted, onUnmounted } from 'vue'
import { isTauriRuntime as defaultIsTauriRuntime } from '@/utils/tauriRuntime'
import type { useUpdateStore } from '@/stores/updateStore'

type UpdateStore = ReturnType<typeof useUpdateStore>

export interface UseStartupUpdateCheckOptions {
  updateStore: Pick<UpdateStore, 'checkForUpdateAndDownload'>
  delayMs?: number
}

export interface UseStartupUpdateCheckDeps {
  isTauriRuntime?: () => boolean
}

export function useStartupUpdateCheck(options: UseStartupUpdateCheckOptions, deps: UseStartupUpdateCheckDeps = {}) {
  const isTauriRuntime = deps.isTauriRuntime ?? defaultIsTauriRuntime
  const delayMs = options.delayMs ?? 3000
  let startupUpdateTimer: number | null = null

  function setupStartupUpdateCheck() {
    if (!isTauriRuntime()) return
    if (startupUpdateTimer !== null) return
    startupUpdateTimer = window.setTimeout(() => {
      startupUpdateTimer = null
      void options.updateStore.checkForUpdateAndDownload('startup')
    }, delayMs)
  }

  function clearStartupUpdateCheck() {
    if (startupUpdateTimer !== null) {
      window.clearTimeout(startupUpdateTimer)
      startupUpdateTimer = null
    }
  }

  onMounted(setupStartupUpdateCheck)
  onUnmounted(clearStartupUpdateCheck)

  return {
    setupStartupUpdateCheck,
    clearStartupUpdateCheck
  }
}
