// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import SettingsModal from './SettingsModal.vue'

const NModalStub = defineComponent({
  name: 'NModal',
  props: ['show'],
  emits: ['update:show'],
  template: '<section v-if="show" class="modal"><slot /><slot name="footer" /></section>'
})

const NInputStub = defineComponent({
  name: 'NInput',
  props: ['value'],
  emits: ['update:value'],
  template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
})

const NSelectStub = defineComponent({
  name: 'NSelect',
  props: ['value', 'options'],
  emits: ['update:value'],
  template: `
    <select :value="value" @change="$emit('update:value', $event.target.value)">
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
  `
})

const NSwitchStub = defineComponent({
  name: 'NSwitch',
  props: ['value'],
  emits: ['update:value'],
  template: '<button type="button" data-testid="startup-switch" @click="$emit(\'update:value\', !value)">{{ value ? \'开\' : \'关\' }}</button>'
})

const stubs = {
  NModal: NModalStub,
  NForm: defineComponent({
    name: 'NForm',
    template: '<form><slot /></form>'
  }),
  NFormItem: defineComponent({
    name: 'NFormItem',
    props: ['label'],
    template: '<label><span>{{ label }}</span><slot /></label>'
  }),
  NInput: NInputStub,
  NSelect: NSelectStub,
  NSwitch: NSwitchStub,
  NSpace: defineComponent({
    name: 'NSpace',
    template: '<div><slot /></div>'
  }),
  NButton: defineComponent({
    name: 'NButton',
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }),
  KeybindingSettings: defineComponent({
    name: 'KeybindingSettings',
    template: '<section>软件内快捷键</section>'
  }),
  UpdateSettings: defineComponent({
    name: 'UpdateSettings',
    template: '<section>应用更新</section>'
  })
}

describe('SettingsModal', () => {
  it('renders settings controls and embedded settings sections', () => {
    const wrapper = mountSettingsModal()

    expect(wrapper.text()).toContain('全局快捷键')
    expect(wrapper.find('input').element.value).toBe('Alt+Space')
    expect(wrapper.text()).toContain('主题')
    expect(wrapper.find('select').element.value).toBe('dark')
    expect(wrapper.text()).toContain('开机自启动')
    expect(wrapper.text()).toContain('软件内快捷键')
    expect(wrapper.text()).toContain('应用更新')
  })

  it('emits updates and save from user interactions', async () => {
    const wrapper = mountSettingsModal()

    await wrapper.find('input').setValue('Ctrl+Alt+P')
    await wrapper.find('select').setValue('light')
    await wrapper.find('[data-testid="startup-switch"]').trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === '保存')?.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === '取消')?.trigger('click')

    expect(wrapper.emitted('update:shortcut')).toEqual([['Ctrl+Alt+P']])
    expect(wrapper.emitted('update:theme')).toEqual([['light']])
    expect(wrapper.emitted('update:launchOnStartup')).toEqual([[false]])
    expect(wrapper.emitted('save')).toEqual([[]])
    expect(wrapper.emitted('update:show')).toEqual([[false]])
  })
})

function mountSettingsModal() {
  return mount(SettingsModal, {
    props: {
      show: true,
      shortcut: 'Alt+Space',
      theme: 'dark',
      launchOnStartup: true,
      themeOptions: [
        { label: '跟随系统', value: 'system' },
        { label: '浅色', value: 'light' },
        { label: '深色', value: 'dark' }
      ],
      taskShortcuts: ['Ctrl+Alt+T']
    },
    global: { stubs }
  })
}
