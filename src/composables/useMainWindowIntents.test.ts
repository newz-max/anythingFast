// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useMainWindowIntents } from './useMainWindowIntents'
import type { MainWindowIntent } from '@/api/events'

describe('useMainWindowIntents', () => {
  it('routes create-task intents and cleans up the listener on unmount', async () => {
    const createTask = vi.fn()
    const unlisten = vi.fn()
    let handler: ((intent: MainWindowIntent) => void) | undefined
    const Harness = defineComponent({
      setup() {
        useMainWindowIntents(
          { createTask },
          {
            isTauriRuntime: () => true,
            listenMainWindowIntentEvents: vi.fn(async (nextHandler) => {
              handler = nextHandler
              return unlisten
            })
          }
        )
        return () => h('div')
      }
    })

    const wrapper = mount(Harness)
    await nextTick()
    await Promise.resolve()

    handler?.('createTask')
    expect(createTask).toHaveBeenCalledTimes(1)

    wrapper.unmount()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('does not subscribe outside the Tauri runtime', async () => {
    const listenMainWindowIntentEvents = vi.fn()
    const Harness = defineComponent({
      setup() {
        useMainWindowIntents(
          { createTask: vi.fn() },
          { isTauriRuntime: () => false, listenMainWindowIntentEvents }
        )
        return () => h('div')
      }
    })

    mount(Harness)
    await nextTick()

    expect(listenMainWindowIntentEvents).not.toHaveBeenCalled()
  })
})
