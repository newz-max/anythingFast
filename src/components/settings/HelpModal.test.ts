// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import HelpModal from './HelpModal.vue'

const stubs = {
  NModal: defineComponent({
    name: 'NModal',
    props: ['show'],
    emits: ['update:show'],
    template: '<section v-if="show" class="modal"><slot /></section>'
  })
}

describe('HelpModal', () => {
  it('renders global shortcut and grouped keybindings', () => {
    const wrapper = mount(HelpModal, {
      props: {
        show: true,
        globalShortcut: 'Alt+Space',
        keybindingHelpGroups: [
          {
            scope: 'main',
            label: '主窗口',
            items: [
              { command: 'main.focusSearch', label: '聚焦事项搜索', key: '/', enabled: true },
              { command: 'main.runSelectedTask', label: '运行选中事项', key: 'Ctrl+Enter', enabled: false }
            ]
          }
        ]
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('全局唤起：Alt+Space')
    expect(wrapper.text()).toContain('主窗口')
    expect(wrapper.text()).toContain('/')
    expect(wrapper.text()).toContain('聚焦事项搜索')
    expect(wrapper.text()).toContain('已禁用')
    expect(wrapper.text()).toContain('运行选中事项')
  })
})
