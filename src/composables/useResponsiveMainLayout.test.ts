// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { useResponsiveMainLayout } from './useResponsiveMainLayout'

type ResponsiveController = ReturnType<typeof useResponsiveMainLayout>

interface MockMediaQueryList extends MediaQueryList {
  dispatch: (matches: boolean) => void
}

describe('useResponsiveMainLayout', () => {
  let queries: Record<string, MockMediaQueryList>

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps task list visible without a toggle on desktop width', async () => {
    const { controller, wrapper } = mountHarness()

    expect(controller.isStackedLayout.value).toBe(false)
    expect(controller.shouldShowTaskListToggle.value).toBe(false)
    expect(controller.shouldCollapseTaskList.value).toBe(false)

    wrapper.unmount()
  })

  it('shows a collapsed task-list toggle in narrow layout', async () => {
    const { controller, wrapper } = mountHarness({ stacked: true })

    expect(controller.isStackedLayout.value).toBe(true)
    expect(controller.shouldShowTaskListToggle.value).toBe(true)
    expect(controller.shouldCollapseTaskList.value).toBe(true)
    expect(controller.taskListToggleLabel.value).toBe('展开事项列表')

    wrapper.unmount()
  })

  it('hides the task-list toggle for template center', () => {
    const { controller, showTemplateCenter, wrapper } = mountHarness({ stacked: true })

    showTemplateCenter.value = true

    expect(controller.shouldShowTaskListToggle.value).toBe(false)
    expect(controller.shouldCollapseTaskList.value).toBe(false)

    wrapper.unmount()
  })

  it('toggles expansion and resets scroll positions', async () => {
    const { controller, layoutScrollTo, contentScrollTo, wrapper } = mountHarness({ stacked: true })

    controller.toggleTaskListPanel()
    await nextTick()

    expect(controller.taskListExpanded.value).toBe(true)
    expect(controller.taskListToggleLabel.value).toBe('收起事项列表')
    expect(layoutScrollTo).toHaveBeenCalledWith({ top: 0, left: 0 })
    expect(contentScrollTo).toHaveBeenCalledWith({ top: 0, left: 0 })

    queries['(max-width: 960px)'].dispatch(true)
    await Promise.resolve()

    expect(controller.taskListExpanded.value).toBe(false)

    wrapper.unmount()
    expect(queries['(min-width: 961px)'].removeEventListener).toHaveBeenCalled()
    expect(queries['(max-width: 960px)'].removeEventListener).toHaveBeenCalled()
  })

  function mountHarness(options: { stacked?: boolean } = {}) {
    installMatchMedia(Boolean(options.stacked))
    let controller: ResponsiveController
    const showTemplateCenter = shallowRef(false)
    const layoutEl = document.createElement('div')
    const contentEl = document.createElement('div')
    const layoutScrollTo = vi.fn()
    const contentScrollTo = vi.fn()
    Object.defineProperty(layoutEl, 'scrollTo', { configurable: true, value: layoutScrollTo })
    Object.defineProperty(contentEl, 'scrollTo', { configurable: true, value: contentScrollTo })
    const layoutRef: Ref<HTMLElement | null> = shallowRef(layoutEl)
    const contentRef: Ref<HTMLElement | null> = shallowRef(contentEl)

    const wrapper = mount(defineComponent({
      setup() {
        controller = useResponsiveMainLayout({ showTemplateCenter, layoutRef, contentRef })
        return {}
      },
      template: '<div />'
    }))

    return { controller: controller!, showTemplateCenter, layoutEl, contentEl, layoutScrollTo, contentScrollTo, wrapper }
  }

  function installMatchMedia(stacked: boolean) {
    queries = {}
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => {
        const listeners = new Set<(event: MediaQueryListEvent) => void>()
        let matchesValue = query === '(max-width: 960px)' ? stacked : !stacked
        const mediaQuery = {
          get matches() {
            return matchesValue
          },
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener)
          }),
          removeEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.delete(listener)
          }),
          dispatchEvent: vi.fn(),
          dispatch: (matches: boolean) => {
            matchesValue = matches
            listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent))
          }
        } as unknown as MockMediaQueryList
        queries[query] = mediaQuery
        return mediaQuery
      })
    })
  }
})
