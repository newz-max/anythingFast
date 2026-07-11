import { computed, readonly, shallowRef } from 'vue'
import { tauriApi } from '@/api/tauri'
import { createQuickCreateSuggestion, parseQuickInputIntent, withQuickPathInspection, type QuickCreateSuggestion, type QuickInputIntent } from '@/domain/quickInput'
import type { ClipboardContextSnapshot } from '@/types/context'
import { isTauriRuntime as defaultIsTauriRuntime } from '@/utils/tauriRuntime'

export interface QuickContextSuggestion extends QuickCreateSuggestion {
  source: 'clipboard'
  confidence: 'high'
  displayValue: string
}

export interface UseQuickContextDeps {
  tauriApi?: Pick<typeof tauriApi, 'getClipboardContext' | 'inspectClipboardPathInput'>
  isTauriRuntime?: () => boolean
}

export function useQuickContext(deps: UseQuickContextDeps = {}) {
  const api = deps.tauriApi ?? tauriApi
  const isTauriRuntime = deps.isTauriRuntime ?? defaultIsTauriRuntime
  const snapshot = shallowRef<ClipboardContextSnapshot | null>(null)
  const intent = shallowRef<QuickInputIntent | null>(null)
  const inspectedIntent = shallowRef<QuickInputIntent | null>(null)
  const loading = shallowRef(false)
  const pathPending = shallowRef(false)
  const unavailable = shallowRef(false)
  const pathMessage = shallowRef<string | null>(null)
  let requestId = 0
  let activeRequestId = 0
  let queuedRefresh = false

  const suggestions = computed<QuickContextSuggestion[]>(() => {
    const currentIntent = inspectedIntent.value ?? intent.value
    if (!currentIntent) return []

    const suggestion = createQuickCreateSuggestion(currentIntent, {
      pending: pathPending.value,
      message: pathMessage.value || undefined
    })
    if (!suggestion) return []

    return [{
      ...suggestion,
      id: `clipboard:${suggestion.id}`,
      source: 'clipboard',
      confidence: 'high',
      displayValue: currentIntent.value
    }]
  })

  async function refresh() {
    const currentRequestId = ++requestId
    if (loading.value) {
      queuedRefresh = true
      return
    }

    activeRequestId = currentRequestId
    loading.value = true
    unavailable.value = false
    snapshot.value = null
    intent.value = null
    inspectedIntent.value = null
    pathPending.value = false
    pathMessage.value = null

    try {
      if (!isTauriRuntime()) {
        if (currentRequestId === requestId) {
          unavailable.value = true
        }
        return
      }

      const nextSnapshot = await api.getClipboardContext()
      if (currentRequestId !== requestId) return

      snapshot.value = nextSnapshot
      unavailable.value = nextSnapshot.status === 'unavailable'
      if (nextSnapshot.status !== 'available' || nextSnapshot.truncated || !nextSnapshot.text) return

      const nextIntent = parseQuickInputIntent(nextSnapshot.text)
      if (!nextIntent || (nextIntent.kind !== 'url' && nextIntent.kind !== 'path')) return

      intent.value = nextIntent
      if (nextIntent.kind !== 'path') return

      pathPending.value = true
      try {
        const inspection = await api.inspectClipboardPathInput(nextIntent.value)
        if (currentRequestId !== requestId) return

        inspectedIntent.value = withQuickPathInspection(nextIntent, inspection)
        pathMessage.value = inspection.exists ? inspection.message || null : inspection.message || '路径不存在，不能创建'
      } catch {
        if (currentRequestId !== requestId) return

        pathMessage.value = '无法确认路径类型，不能创建'
      } finally {
        if (currentRequestId === requestId) {
          pathPending.value = false
        }
      }
    } catch {
      if (currentRequestId === requestId) {
        unavailable.value = true
        snapshot.value = {
          source: 'clipboard',
          capturedAt: new Date().toISOString(),
          status: 'unavailable',
          text: '',
          truncated: false
        }
      }
    } finally {
      if (activeRequestId === currentRequestId) {
        loading.value = false
        if (queuedRefresh) {
          queuedRefresh = false
          void refresh()
        }
      }
    }
  }

  return {
    snapshot: readonly(snapshot),
    loading: readonly(loading),
    unavailable: readonly(unavailable),
    suggestions,
    refresh
  }
}
