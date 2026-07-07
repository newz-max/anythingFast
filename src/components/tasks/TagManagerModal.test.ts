// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import TagManagerModal from './TagManagerModal.vue'
import type { TaskTag } from '@/types/domain'

const editingTag: TaskTag = {
  id: 'tag-1',
  name: '工作'
}

const stubs = {
  NModal: defineComponent({
    name: 'NModal',
    props: ['show', 'title'],
    emits: ['update:show'],
    template: '<section v-if="show" class="modal"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>'
  }),
  NInput: defineComponent({
    name: 'NInput',
    props: ['value'],
    emits: ['update:value', 'keyup'],
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" @keyup="$emit(\'keyup\', $event)" />'
  }),
  NSpace: defineComponent({
    name: 'NSpace',
    template: '<div><slot /></div>'
  }),
  NButton: defineComponent({
    name: 'NButton',
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  })
}

describe('TagManagerModal', () => {
  it('renders create and edit titles', () => {
    const createWrapper = mount(TagManagerModal, {
      props: { show: true, editingTag: null, draftName: '' },
      global: { stubs }
    })
    const editWrapper = mount(TagManagerModal, {
      props: { show: true, editingTag, draftName: '工作' },
      global: { stubs }
    })

    expect(createWrapper.text()).toContain('新增标签')
    expect(editWrapper.text()).toContain('编辑标签')
  })

  it('emits draft updates, cancel, and save intents', async () => {
    const wrapper = mount(TagManagerModal, {
      props: { show: true, editingTag: null, draftName: '' },
      global: { stubs }
    })

    await wrapper.get('input').setValue('新标签')
    await wrapper.findAll('button').find((button) => button.text() === '取消')?.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === '保存')?.trigger('click')

    expect(wrapper.emitted('update:draftName')).toEqual([['新标签']])
    expect(wrapper.emitted('update:show')).toEqual([[false]])
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('emits save when pressing Enter in the input', async () => {
    const wrapper = mount(TagManagerModal, {
      props: { show: true, editingTag: null, draftName: '' },
      global: { stubs }
    })

    await wrapper.get('input').trigger('keyup', { key: 'Enter' })

    expect(wrapper.emitted('save')).toHaveLength(1)
  })
})
