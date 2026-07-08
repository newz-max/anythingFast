// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useStartupUpdateCheck } from '@/composables/useStartupUpdateCheck'

describe('useStartupUpdateCheck', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not start outside Tauri', () => {
    vi.useFakeTimers()
    const checkForUpdateAndDownload = vi.fn()
    mountHarness(checkForUpdateAndDownload, false)

    vi.advanceTimersByTime(10)

    expect(checkForUpdateAndDownload).not.toHaveBeenCalled()
  })

  it('runs startup update check and automatic download after the delay', () => {
    vi.useFakeTimers()
    const checkForUpdateAndDownload = vi.fn().mockResolvedValue(undefined)
    mountHarness(checkForUpdateAndDownload, true)

    vi.advanceTimersByTime(9)
    expect(checkForUpdateAndDownload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(checkForUpdateAndDownload).toHaveBeenCalledWith('startup')
  })

  it('clears the timer on unmount', () => {
    vi.useFakeTimers()
    const checkForUpdateAndDownload = vi.fn()
    const wrapper = mountHarness(checkForUpdateAndDownload, true)

    wrapper.unmount()
    vi.advanceTimersByTime(10)

    expect(checkForUpdateAndDownload).not.toHaveBeenCalled()
  })
})

function mountHarness(checkForUpdateAndDownload: ReturnType<typeof vi.fn>, isTauriRuntime: boolean) {
  return mount(defineComponent({
    setup() {
      useStartupUpdateCheck(
        { updateStore: { checkForUpdateAndDownload } as never, delayMs: 10 },
        { isTauriRuntime: () => isTauriRuntime }
      )
    },
    template: '<div />'
  }))
}
