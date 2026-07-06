// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.vue'

const loadMock = vi.hoisted(() => vi.fn())

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: () => ({
    load: loadMock
  })
}))

vi.mock('@/components/app/AppProvider.vue', () => ({
  default: {
    name: 'AppProvider',
    template: '<div><slot /></div>'
  }
}))

vi.mock('@/components/layout/MainLayout.vue', () => ({
  default: {
    name: 'MainLayout',
    template: '<section data-testid="main-layout">main</section>'
  }
}))

vi.mock('@/components/quick/QuickSearchPanel.vue', () => ({
  default: {
    name: 'QuickSearchPanel',
    template: '<section data-testid="quick-panel">quick</section>'
  }
}))

describe('App window routing', () => {
  beforeEach(() => {
    loadMock.mockReset()
    window.history.replaceState(null, '', '/')
  })

  it('renders the quick panel without mounting the main layout for quick window URLs', () => {
    window.history.replaceState(null, '', '/?window=quick')

    const wrapper = mount(App)

    expect(wrapper.find('[data-testid="quick-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="main-layout"]').exists()).toBe(false)
    expect(document.documentElement.dataset.appWindow).toBe('quick')
  })

  it('renders the main layout for normal main window URLs', () => {
    const wrapper = mount(App)

    expect(wrapper.find('[data-testid="main-layout"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="quick-panel"]').exists()).toBe(false)
    expect(document.documentElement.dataset.appWindow).toBe('main')
  })
})
