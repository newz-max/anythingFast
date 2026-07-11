import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { useQuickInputIntent } from '@/composables/useQuickInputIntent'
import type { PathInspection } from '@/types/domain'

describe('useQuickInputIntent', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('returns synchronous URL and command suggestions', () => {
    const query = shallowRef('https://github.com')
    const controller = useQuickInputIntent(query, { debounceMs: 1 }, { isTauriRuntime: () => false })

    expect(controller.intent.value?.kind).toBe('url')
    expect(controller.suggestions.value[0]).toMatchObject({
      title: '创建打开 URL 事项',
      canSaveDirectly: true,
      actionType: 'openUrl'
    })

    query.value = 'cmd: yarn dev'

    expect(controller.intent.value?.kind).toBe('command')
    expect(controller.suggestions.value[0]).toMatchObject({
      title: '创建命令事项',
      actionType: 'runCommand'
    })
  })

  it('inspects path candidates through Tauri and creates file suggestions', async () => {
    vi.useFakeTimers()
    const query = shallowRef('D:\\tmp\\a.txt')
    const inspectPathInput = vi.fn(async () => ({
      input: 'D:\\tmp\\a.txt',
      exists: true,
      kind: 'file' as const,
      normalizedPath: 'D:\\tmp\\a.txt'
    }))
    const controller = useQuickInputIntent(
      query,
      { debounceMs: 100 },
      { isTauriRuntime: () => true, tauriApi: { inspectPathInput } }
    )

    expect(controller.pending.value).toBe(true)
    vi.advanceTimersByTime(100)
    await Promise.resolve()
    await nextTick()

    expect(inspectPathInput).toHaveBeenCalledWith('D:\\tmp\\a.txt')
    expect(controller.pending.value).toBe(false)
    expect(controller.intent.value).toMatchObject({ kind: 'path', pathKind: 'file' })
    expect(controller.suggestions.value[0]).toMatchObject({
      title: '创建打开文件事项',
      canSaveDirectly: true,
      actionType: 'openFile'
    })
  })

  it('ignores stale path inspection responses', async () => {
    vi.useFakeTimers()
    const query = shallowRef('D:\\tmp\\old.txt')
    let resolveOld!: (value: PathInspection) => void
    const oldPromise = new Promise<PathInspection>((resolve) => {
      resolveOld = resolve
    })
    const inspectPathInput = vi
      .fn<(input: string) => Promise<PathInspection>>()
      .mockReturnValueOnce(oldPromise)
      .mockResolvedValueOnce({
        input: 'D:\\tmp\\new',
        exists: true,
        kind: 'folder',
        normalizedPath: 'D:\\tmp\\new'
      })
    const controller = useQuickInputIntent(
      query,
      { debounceMs: 1 },
      { isTauriRuntime: () => true, tauriApi: { inspectPathInput } }
    )

    vi.advanceTimersByTime(1)
    await Promise.resolve()
    query.value = 'D:\\tmp\\new'
    await nextTick()
    vi.advanceTimersByTime(1)
    await Promise.resolve()
    await nextTick()

    resolveOld({
      input: 'D:\\tmp\\old.txt',
      exists: true,
      kind: 'file',
      normalizedPath: 'D:\\tmp\\old.txt'
    })
    await Promise.resolve()
    await nextTick()

    expect(controller.intent.value).toMatchObject({
      kind: 'path',
      value: 'D:\\tmp\\new',
      pathKind: 'folder'
    })
  })

  it('does not offer direct path save in non-Tauri runtime', () => {
    const query = shallowRef('D:\\tmp\\a.txt')
    const controller = useQuickInputIntent(query, {}, { isTauriRuntime: () => false })

    expect(controller.error.value).toBe('桌面运行时确认路径类型')
    expect(controller.suggestions.value[0]).toMatchObject({
      title: '识别到路径',
      canSaveDirectly: false
    })
  })
})
