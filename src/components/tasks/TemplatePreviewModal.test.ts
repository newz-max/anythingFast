// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TemplatePreviewModal from './TemplatePreviewModal.vue'
import type { TaskTemplate } from '@/types/domain'

const stubs = {
  NModal: defineComponent({
    name: 'NModal',
    props: ['show', 'title'],
    emits: ['update:show'],
    template: '<section v-if="show" class="modal"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></section>'
  }),
  NInput: defineComponent({
    name: 'NInput',
    inheritAttrs: false,
    props: ['value', 'type', 'placeholder'],
    emits: ['update:value'],
    template: '<input :value="value" :type="type" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)" />'
  }),
  NButton: defineComponent({
    name: 'NButton',
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }),
  NTag: defineComponent({
    name: 'NTag',
    template: '<span class="tag"><slot /></span>'
  }),
  NAlert: defineComponent({
    name: 'NAlert',
    template: '<aside><slot /></aside>'
  }),
  NEmpty: defineComponent({
    name: 'NEmpty',
    props: ['description'],
    template: '<div>{{ description }}</div>'
  })
}

describe('TemplatePreviewModal', () => {
  it('renders ordered action, condition, risk, command, and grouped variable summaries', () => {
    const wrapper = mountPreview(makeTemplate())
    const text = wrapper.text()

    expect(text).toContain('模板预览 · 切换项目分支')
    expect(text).toContain('执行命令')
    expect(text).toContain('打开文件夹')
    expect(text.indexOf('切换分支')).toBeLessThan(text.indexOf('打开项目'))
    expect(text).toContain('始终执行')
    expect(text).toContain('仅当变量 branchName 非空')
    expect(text).toContain('中风险')
    expect(text).toContain('命令模板仅适合手动运行')
    expect(text).toContain('首次配置')
    expect(text).toContain('每次运行')
    expect(text).toContain('动作 1“切换分支” · workingDir')
    expect(text).toContain('generatedPath · 由引用推导')
  })

  it('emits only first-configuration values and resets them for another template', async () => {
    const wrapper = mountPreview(makeTemplate())
    const projectInput = wrapper.get('input[placeholder="填写 项目目录"]')

    await projectInput.setValue('D:\\Work')
    await findButton(wrapper, '使用模板').trigger('click')
    expect(wrapper.emitted('use')).toEqual([[{ projectDir: 'D:\\Work' }]])
    expect(wrapper.find('input[placeholder="填写 分支名"]').exists()).toBe(false)

    await wrapper.setProps({ template: makeTemplate({ id: 'other', name: '另一个模板' }) })
    await nextTick()
    expect((wrapper.get('input[placeholder="填写 项目目录"]').element as HTMLInputElement).value).toBe('')
  })

  it('masks secret defaults and uses password inputs for secret first configuration', () => {
    const template = makeTemplate({
      variables: [
        { key: 'projectDir', label: '项目目录', defaultValue: '', required: false, secret: false },
        { key: 'secretPath', label: '秘密路径', defaultValue: '', required: false, secret: true },
        { key: 'token', label: '访问令牌', defaultValue: 'plain-secret', required: false, secret: true }
      ],
      actions: [{
        type: 'writeClipboard',
        name: '写入变量',
        params: { text: '{{secretPath}} plain-secret {{token}}' },
        enabled: true,
        riskLevel: 'low'
      }]
    })
    const wrapper = mountPreview(template)

    expect(wrapper.get('input[placeholder="填写 秘密路径"]').attributes('type')).toBe('password')
    expect(wrapper.text()).toContain('••••')
    expect(wrapper.text()).not.toContain('plain-secret')
  })

  it('does not create anything when cancelled and handles templates without variables', async () => {
    const wrapper = mountPreview(makeTemplate({ variables: [], actions: [{
      type: 'delay',
      name: '等待',
      params: { durationMs: 1000 },
      enabled: true,
      riskLevel: 'low'
    }] }))

    expect(wrapper.text()).toContain('此模板没有变量')
    await findButton(wrapper, '取消').trigger('click')
    expect(wrapper.emitted('update:show')).toEqual([[false]])
    expect(wrapper.emitted('use')).toBeUndefined()
  })
})

function mountPreview(template: TaskTemplate) {
  return mount(TemplatePreviewModal, {
    props: { show: true, template },
    global: { stubs }
  })
}

function findButton(wrapper: ReturnType<typeof mountPreview>, text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

function makeTemplate(patch: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: 'switch-branch',
    name: '切换项目分支',
    category: '开发者',
    description: '切换分支并打开项目。',
    keywords: ['git'],
    variables: [
      { key: 'projectDir', label: '项目目录', defaultValue: '', required: false, secret: false },
      { key: 'branchName', label: '分支名', defaultValue: '', required: true, secret: false }
    ],
    actions: [
      {
        type: 'runCommand',
        name: '切换分支',
        params: { command: 'git switch {{branchName}}', workingDir: '{{projectDir}}', shell: 'powershell' },
        enabled: true,
        condition: { type: 'always' },
        riskLevel: 'medium'
      },
      {
        type: 'openFolder',
        name: '打开项目',
        params: { path: '{{generatedPath}}' },
        enabled: false,
        condition: { type: 'variableNotEmpty', variable: 'branchName' },
        riskLevel: 'low'
      }
    ],
    ...patch
  }
}
