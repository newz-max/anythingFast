import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useQuickContext } from '@/composables/useQuickContext'
import type { ClipboardContextSnapshot } from '@/types/context'

function snapshot(text: string, patch: Partial<ClipboardContextSnapshot> = {}): ClipboardContextSnapshot {
  return {
    source: 'clipboard',
    capturedAt: '2026-07-11T00:00:00.000Z',
    status: 'available',
    text,
    truncated: false,
    ...patch
  }
}

describe('useQuickContext', () => {
  it('creates a clipboard URL suggestion', async () => {
    const getClipboardContext = vi.fn().mockResolvedValue(snapshot('https://github.com'))
    const inspectPathInput = vi.fn()
    const controller = useQuickContext({
      tauriApi: { getClipboardContext, inspectClipboardPathInput: inspectPathInput },
      isTauriRuntime: () => true
    })

    await controller.refresh()

    expect(controller.suggestions.value).toMatchObject([{
      source: 'clipboard',
      title: '创建打开 URL 事项',
      canSaveDirectly: true,
      displayValue: 'https://github.com/'
    }])
    expect(inspectPathInput).not.toHaveBeenCalled()
  })

  it('inspects clipboard paths before making them saveable', async () => {
    const getClipboardContext = vi.fn().mockResolvedValue(snapshot('D:\\tmp\\notes.txt'))
    const inspectPathInput = vi.fn().mockResolvedValue({
      input: 'D:\\tmp\\notes.txt',
      exists: true,
      kind: 'file',
      normalizedPath: 'D:\\tmp\\notes.txt'
    })
    const controller = useQuickContext({
      tauriApi: { getClipboardContext, inspectClipboardPathInput: inspectPathInput },
      isTauriRuntime: () => true
    })

    await controller.refresh()

    expect(inspectPathInput).toHaveBeenCalledWith('D:\\tmp\\notes.txt')
    expect(controller.suggestions.value[0]).toMatchObject({
      title: '创建打开文件事项',
      canSaveDirectly: true,
      displayValue: 'D:\\tmp\\notes.txt'
    })
  })

  it('keeps unsupported, truncated, and ordinary clipboard text out of suggestions', async () => {
    const getClipboardContext = vi
      .fn()
      .mockResolvedValueOnce(snapshot('cmd: yarn dev'))
      .mockResolvedValueOnce(snapshot('plain text'))
      .mockResolvedValueOnce(snapshot('https://github.com', { truncated: true }))
      .mockResolvedValueOnce(snapshot('', { status: 'unsupported' }))
    const controller = useQuickContext({
      tauriApi: { getClipboardContext, inspectClipboardPathInput: vi.fn() },
      isTauriRuntime: () => true
    })

    await controller.refresh()
    expect(controller.suggestions.value).toEqual([])
    await controller.refresh()
    expect(controller.suggestions.value).toEqual([])
    await controller.refresh()
    expect(controller.suggestions.value).toEqual([])
    await controller.refresh()
    expect(controller.suggestions.value).toEqual([])
  })

  it('does not include a clipboard path in the path-inspection failure message', async () => {
    const secretPath = 'D:\\sensitive\\accounting.xlsx'
    const controller = useQuickContext({
      tauriApi: {
        getClipboardContext: vi.fn().mockResolvedValue(snapshot(secretPath)),
        inspectClipboardPathInput: vi.fn().mockRejectedValue(new Error(secretPath))
      },
      isTauriRuntime: () => true
    })

    await controller.refresh()

    expect(controller.suggestions.value[0]?.detail).toBe('无法确认路径类型，不能创建')
    expect(controller.suggestions.value[0]?.detail).not.toContain(secretPath)
  })

  it('ignores stale results and performs one queued latest refresh', async () => {
    let resolveFirst!: (value: ClipboardContextSnapshot) => void
    const first = new Promise<ClipboardContextSnapshot>((resolve) => {
      resolveFirst = resolve
    })
    const getClipboardContext = vi
      .fn<() => Promise<ClipboardContextSnapshot>>()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(snapshot('https://new.example'))
    const controller = useQuickContext({
      tauriApi: { getClipboardContext, inspectClipboardPathInput: vi.fn() },
      isTauriRuntime: () => true
    })

    const firstRefresh = controller.refresh()
    const secondRefresh = controller.refresh()
    resolveFirst(snapshot('https://old.example'))
    await firstRefresh
    await secondRefresh
    await Promise.resolve()
    await nextTick()

    expect(getClipboardContext).toHaveBeenCalledTimes(2)
    expect(controller.suggestions.value[0]?.displayValue).toBe('https://new.example/')
  })
})
