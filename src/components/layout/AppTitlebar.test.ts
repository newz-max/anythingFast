// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppTitlebar from './AppTitlebar.vue'

function mountTitlebar() {
  return mount(AppTitlebar, {
    props: {
      logoUrl: '/logo.png',
      title: 'FlowTask - 事项管理器'
    }
  })
}

describe('AppTitlebar', () => {
  it('emits window control intents', async () => {
    const wrapper = mountTitlebar()

    await wrapper.get('button[aria-label="最小化"]').trigger('click')
    await wrapper.get('button[aria-label="最大化"]').trigger('click')
    await wrapper.get('button[aria-label="关闭"]').trigger('click')

    expect(wrapper.emitted('minimize')).toHaveLength(1)
    expect(wrapper.emitted('toggle-maximize')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('keeps drag-region attributes off window controls', () => {
    const wrapper = mountTitlebar()

    expect(wrapper.get('header').attributes()).toHaveProperty('data-tauri-drag-region')
    expect(wrapper.get('.window-brand').attributes()).toHaveProperty('data-tauri-drag-region')
    expect(wrapper.get('.titlebar-mark').attributes()).toHaveProperty('data-tauri-drag-region')
    expect(wrapper.get('.titlebar-mark img').attributes()).toHaveProperty('data-tauri-drag-region')

    for (const button of wrapper.findAll('.window-control')) {
      expect(button.attributes('data-tauri-drag-region')).toBeUndefined()
    }
  })
})
