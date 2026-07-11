// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import QuickCreateConfirm from './QuickCreateConfirm.vue'
import { parseQuickInputIntent } from '@/domain/quickInput'

const stubs = {
  NInput: {
    inheritAttrs: false,
    props: ['value'],
    emits: ['update:value'],
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" @keydown="$emit(\'keydown\', $event)" />'
  },
  NSelect: {
    inheritAttrs: false,
    props: ['value'],
    emits: ['update:value'],
    template: '<input class="select-stub" :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
  },
  NCheckbox: {
    props: ['checked'],
    emits: ['update:checked'],
    template: '<label><input type="checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" /><slot /></label>'
  },
  NButton: {
    props: ['disabled'],
    template: '<button :disabled="disabled"><slot /></button>'
  },
  NTag: {
    template: '<span><slot /></span>'
  }
}

describe('QuickCreateConfirm', () => {
  it('populates defaults from intent tokens and submits edited values', async () => {
    const wrapper = mount(QuickCreateConfirm, {
      props: {
        intent: parseQuickInputIntent('https://github.com #工作 ?github !run')!,
        categories: ['全部', '工作']
      },
      global: { stubs }
    })
    const inputs = wrapper.findAll('input')

    expect((inputs[0].element as HTMLInputElement).value).toBe('打开 github.com')
    expect((inputs[1].element as HTMLInputElement).value).toBe('工作')
    expect((inputs[2].element as HTMLInputElement).value).toBe('github')
    expect((inputs[4].element as HTMLInputElement).checked).toBe(true)

    await inputs[0].setValue('GitHub')
    await inputs[2].setValue('git, repo')
    await inputs[3].setValue(true)
    await wrapper.findAll('button').at(-1)!.trigger('click')

    expect(wrapper.emitted('submit')?.[0][0]).toEqual({
      name: 'GitHub',
      category: '工作',
      keywords: ['git', 'repo'],
      favorite: true,
      runImmediately: true
    })
  })

  it('shows parsed tag tokens as not saved', () => {
    const wrapper = mount(QuickCreateConfirm, {
      props: {
        intent: parseQuickInputIntent('cmd: yarn dev @临时标签')!
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('@ 标签已识别但本次不会保存')
    expect(wrapper.text()).toContain('临时标签')
  })

  it('emits cancel without saving', async () => {
    const wrapper = mount(QuickCreateConfirm, {
      props: {
        intent: parseQuickInputIntent('cmd: yarn dev')!
      },
      global: { stubs }
    })

    await wrapper.findAll('button')[0].trigger('click')

    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})
