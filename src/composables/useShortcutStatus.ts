import { computed, onUnmounted, shallowRef } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import type { MessageApi } from 'naive-ui'
import { listenShortcutStatusEvents } from '@/api/events'
import { tauriApi } from '@/api/tauri'
import { logDevError } from '@/utils/errors'
import { isTauriRuntime as defaultIsTauriRuntime } from '@/utils/tauriRuntime'
import type { ShortcutStatus } from '@/types/domain'

export interface UseShortcutStatusOptions {
  message: MessageApi
}

export interface UseShortcutStatusDeps {
  tauriApi?: Pick<typeof tauriApi, 'loadShortcutStatus'>
  listenShortcutStatusEvents?: typeof listenShortcutStatusEvents
  isTauriRuntime?: () => boolean
}

export function useShortcutStatus(options: UseShortcutStatusOptions, deps: UseShortcutStatusDeps = {}) {
  const api = deps.tauriApi ?? tauriApi
  const listenStatusEvents = deps.listenShortcutStatusEvents ?? listenShortcutStatusEvents
  const isTauriRuntime = deps.isTauriRuntime ?? defaultIsTauriRuntime
  const shortcutStatus = shallowRef<ShortcutStatus | null>(null)
  let unlistenShortcutStatus: UnlistenFn | null = null

  const shortcutWarning = computed(() => {
    const status = shortcutStatus.value
    if (!status || status.registered) return ''
    return status.message || `全局快捷键 ${status.shortcut} 当前不可用`
  })

  async function setupShortcutStatus() {
    if (!isTauriRuntime()) return
    if (!unlistenShortcutStatus) {
      unlistenShortcutStatus = await listenStatusEvents((status) => {
        shortcutStatus.value = status
        if (!status.registered && status.message) {
          options.message.warning(status.message)
        }
      })
    }
    await refreshShortcutStatus()
  }

  async function refreshShortcutStatus() {
    if (!isTauriRuntime()) return
    shortcutStatus.value = await api.loadShortcutStatus()
  }

  async function refreshShortcutStatusQuiet(context: string) {
    try {
      await refreshShortcutStatus()
    } catch (err) {
      logDevError(context, err)
    }
  }

  onUnmounted(() => {
    unlistenShortcutStatus?.()
    unlistenShortcutStatus = null
  })

  return {
    shortcutStatus,
    shortcutWarning,
    setupShortcutStatus,
    refreshShortcutStatus,
    refreshShortcutStatusQuiet
  }
}
