// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TemplateIntroPanel from './TemplateIntroPanel.vue'

describe('TemplateIntroPanel', () => {
  it('renders template intro copy', () => {
    const wrapper = mount(TemplateIntroPanel)

    expect(wrapper.text()).toContain('从模板创建事项')
    expect(wrapper.text()).toContain('模板只会生成可编辑的事项草稿')
    expect(wrapper.find('.template-intro-icon').exists()).toBe(true)
  })

  it('emits create-task from the create button', async () => {
    const wrapper = mount(TemplateIntroPanel)

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('create-task')).toEqual([[]])
  })
})
