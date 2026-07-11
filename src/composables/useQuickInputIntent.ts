import { computed, readonly, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { tauriApi } from '@/api/tauri'
import {
  createQuickCreateSuggestion,
  parseQuickInputIntent,
  withQuickPathInspection,
  type QuickCreateSuggestion,
  type QuickInputIntent
} from '@/domain/quickInput'
import { getErrorMessage, logDevError } from '@/utils/errors'
import { isTauriRuntime as defaultIsTauriRuntime } from '@/utils/tauriRuntime'

export interface UseQuickInputIntentDeps {
  tauriApi?: Pick<typeof tauriApi, 'inspectPathInput'>
  isTauriRuntime?: () => boolean
}

export interface UseQuickInputIntentOptions {
  debounceMs?: number
}

export function useQuickInputIntent(
  query: MaybeRefOrGetter<string>,
  options: UseQuickInputIntentOptions = {},
  deps: UseQuickInputIntentDeps = {}
) {
  const api = deps.tauriApi ?? tauriApi
  const isTauriRuntime = deps.isTauriRuntime ?? defaultIsTauriRuntime
  const debounceMs = options.debounceMs ?? 180
  const inspectedIntent = shallowRef<QuickInputIntent | null>(null)
  const pending = shallowRef(false)
  const error = shallowRef<string | null>(null)
  let requestId = 0

  const parsedIntent = computed(() => parseQuickInputIntent(toValue(query)))
  const intent = computed(() => inspectedIntent.value ?? parsedIntent.value)
  const suggestions = computed<QuickCreateSuggestion[]>(() => {
    const currentIntent = intent.value
    if (!currentIntent) return []

    const suggestion = createQuickCreateSuggestion(currentIntent, {
      pending: pending.value,
      message: error.value || undefined
    })
    return suggestion ? [suggestion] : []
  })

  watch(
    parsedIntent,
    (nextIntent, _previous, onCleanup) => {
      requestId += 1
      const currentRequest = requestId
      inspectedIntent.value = null
      error.value = null
      pending.value = false

      if (!nextIntent || nextIntent.kind !== 'path') return
      if (!isTauriRuntime()) {
        error.value = '桌面运行时确认路径类型'
        return
      }

      pending.value = true
      const timer = window.setTimeout(async () => {
        try {
          const inspection = await api.inspectPathInput(nextIntent.value)
          if (currentRequest !== requestId) return
          inspectedIntent.value = withQuickPathInspection(nextIntent, inspection)
          error.value = inspection.exists ? inspection.message || null : inspection.message || '路径不存在'
        } catch (err) {
          if (currentRequest !== requestId) return
          logDevError('Inspect quick input path failed', err, { input: nextIntent.value })
          error.value = getErrorMessage(err)
        } finally {
          if (currentRequest === requestId) {
            pending.value = false
          }
        }
      }, debounceMs)

      onCleanup(() => {
        window.clearTimeout(timer)
      })
    },
    { immediate: true }
  )

  return {
    intent,
    pending: readonly(pending),
    error: readonly(error),
    suggestions
  }
}
