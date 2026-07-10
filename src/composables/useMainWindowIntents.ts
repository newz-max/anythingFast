import { onMounted, onUnmounted } from 'vue'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { listenMainWindowIntentEvents } from '@/api/events'
import { logDevError } from '@/utils/errors'
import { isTauriRuntime as defaultIsTauriRuntime } from '@/utils/tauriRuntime'

export interface UseMainWindowIntentsOptions {
  createTask: () => void
}

export interface UseMainWindowIntentsDeps {
  listenMainWindowIntentEvents?: typeof listenMainWindowIntentEvents
  isTauriRuntime?: () => boolean
}

export function useMainWindowIntents(options: UseMainWindowIntentsOptions, deps: UseMainWindowIntentsDeps = {}) {
  const listenIntents = deps.listenMainWindowIntentEvents ?? listenMainWindowIntentEvents
  const isTauriRuntime = deps.isTauriRuntime ?? defaultIsTauriRuntime
  let unlistenMainWindowIntent: UnlistenFn | null = null
  let disposed = false

  onMounted(() => {
    if (!isTauriRuntime() || unlistenMainWindowIntent) return
    disposed = false
    void listenIntents((intent) => {
      if (intent === 'createTask') options.createTask()
    })
      .then((unlisten) => {
        if (disposed) {
          unlisten()
          return
        }
        unlistenMainWindowIntent = unlisten
      })
      .catch((err) => {
        logDevError('Setup main window intent listener failed', err)
      })
  })

  onUnmounted(() => {
    disposed = true
    unlistenMainWindowIntent?.()
    unlistenMainWindowIntent = null
  })
}
