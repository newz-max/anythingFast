// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppTitlebar from './AppTitlebar.vue'

function mountTitlebar(props = {}) {
  return mount(AppTitlebar, {
    props: {
      logoUrl: '/logo.png',
      title: 'FlowTask - 事项管理器',
      ...props
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

  it('renders compact update progress without a restart action', () => {
    const wrapper = mountTitlebar({
      updateStatus: {
        tone: 'busy',
        label: '下载更新 42%',
        detail: '版本 0.5.3',
        actionLabel: '',
        actionDisabled: true,
        disabledReason: ''
      }
    })

    expect(wrapper.text()).toContain('下载更新 42%')
    expect(wrapper.text()).toContain('版本 0.5.3')
    expect(wrapper.find('.titlebar-update-action').exists()).toBe(false)
  })

  it('emits restart update intent from the titlebar action', async () => {
    const wrapper = mountTitlebar({
      updateStatus: {
        tone: 'ready',
        label: '更新已就绪',
        detail: '版本 0.5.3',
        actionLabel: '重启更新',
        actionDisabled: false,
        disabledReason: ''
      }
    })

    await wrapper.get('.titlebar-update-action').trigger('click')

    expect(wrapper.emitted('restart-update')).toHaveLength(1)
  })

  it('communicates update restart blockers on the action', () => {
    const wrapper = mountTitlebar({
      updateStatus: {
        tone: 'ready',
        label: '更新已就绪',
        detail: '版本 0.5.3',
        actionLabel: '重启更新',
        actionDisabled: true,
        disabledReason: '当前有运行变量输入窗口，处理后可重启安装'
      }
    })
    const action = wrapper.get('.titlebar-update-action')

    expect(action.attributes('disabled')).toBeDefined()
    expect(action.attributes('title')).toBe('当前有运行变量输入窗口，处理后可重启安装')
  })
})
