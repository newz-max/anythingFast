// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useShortcutStatus } from '@/composables/useShortcutStatus'
import type { ShortcutStatus } from '@/types/domain'

describe('useShortcutStatus', () => {
  it('does nothing outside Tauri', async () => {
    const loadShortcutStatus = vi.fn()
    const listenShortcutStatusEvents = vi.fn()
    const component = defineComponent({
      setup() {
        const controller = useShortcutStatus(
          { message: { warning: vi.fn() } as never },
          {
            tauriApi: { loadShortcutStatus },
            listenShortcutStatusEvents,
            isTauriRuntime: () => false
          }
        )
        return { controller }
      },
      template: '<div />'
    })
    const wrapper = mount(component)

    await wrapper.vm.controller.setupShortcutStatus()

    expect(loadShortcutStatus).not.toHaveBeenCalled()
    expect(listenShortcutStatusEvents).not.toHaveBeenCalled()
  })

  it('updates status from load and events, then clears the listener on unmount', async () => {
    const unlisten = vi.fn()
    let handler: (status: ShortcutStatus) => void = () => {}
    const message = { warning: vi.fn() }
    const component = defineComponent({
      setup() {
        const controller = useShortcutStatus(
          { message: message as never },
          {
            tauriApi: {
              loadShortcutStatus: vi.fn().mockResolvedValue({ shortcut: 'Alt+Space', registered: true })
            },
            listenShortcutStatusEvents: vi.fn(async (nextHandler) => {
              handler = nextHandler
              return unlisten
            }),
            isTauriRuntime: () => true
          }
        )
        return { controller }
      },
      template: '<div />'
    })
    const wrapper = mount(component)

    await wrapper.vm.controller.setupShortcutStatus()
    expect(wrapper.vm.controller.shortcutStatus.value).toEqual({ shortcut: 'Alt+Space', registered: true })

    handler({ shortcut: 'Alt+Space', registered: false, message: '注册失败' })
    expect(wrapper.vm.controller.shortcutWarning.value).toBe('注册失败')
    expect(message.warning).toHaveBeenCalledWith('注册失败')

    wrapper.unmount()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('quietly refreshes status without warning messages', async () => {
    const message = { warning: vi.fn() }
    const component = defineComponent({
      setup() {
        const controller = useShortcutStatus(
          { message: message as never },
          {
            tauriApi: {
              loadShortcutStatus: vi.fn().mockResolvedValue({
                shortcut: 'Alt+Space',
                registered: false,
                message: '注册失败'
              })
            },
            listenShortcutStatusEvents: vi.fn(),
            isTauriRuntime: () => true
          }
        )
        return { controller }
      },
      template: '<div />'
    })
    const wrapper = mount(component)

    await wrapper.vm.controller.refreshShortcutStatusQuiet('quiet refresh')

    expect(wrapper.vm.controller.shortcutWarning.value).toBe('注册失败')
    expect(message.warning).not.toHaveBeenCalled()
  })
})
