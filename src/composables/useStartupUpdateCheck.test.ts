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
    const checkForUpdate = vi.fn()
    mountHarness(checkForUpdate, false)

    vi.advanceTimersByTime(10)

    expect(checkForUpdate).not.toHaveBeenCalled()
  })

  it('runs startup update check after the delay', () => {
    vi.useFakeTimers()
    const checkForUpdate = vi.fn().mockResolvedValue(undefined)
    mountHarness(checkForUpdate, true)

    vi.advanceTimersByTime(9)
    expect(checkForUpdate).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(checkForUpdate).toHaveBeenCalledWith('startup')
  })

  it('clears the timer on unmount', () => {
    vi.useFakeTimers()
    const checkForUpdate = vi.fn()
    const wrapper = mountHarness(checkForUpdate, true)

    wrapper.unmount()
    vi.advanceTimersByTime(10)

    expect(checkForUpdate).not.toHaveBeenCalled()
  })
})

function mountHarness(checkForUpdate: ReturnType<typeof vi.fn>, isTauriRuntime: boolean) {
  return mount(defineComponent({
    setup() {
      useStartupUpdateCheck(
        { updateStore: { checkForUpdate } as never, delayMs: 10 },
        { isTauriRuntime: () => isTauriRuntime }
      )
    },
    template: '<div />'
  }))
}
