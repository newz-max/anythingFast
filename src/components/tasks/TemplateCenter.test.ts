// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import TemplateCenter from './TemplateCenter.vue'
import type { TaskTemplate } from '@/types/domain'

const stubs = {
  NEmpty: defineComponent({
    name: 'NEmpty',
    props: ['description'],
    template: '<section class="empty-state">{{ description }}</section>'
  }),
  NInput: defineComponent({
    name: 'NInput',
    inheritAttrs: false,
    props: ['value', 'placeholder'],
    emits: ['update:value'],
    template: '<input class="search-input" :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)" />'
  }),
  NButton: defineComponent({
    name: 'NButton',
    inheritAttrs: false,
    emits: ['click'],
    template: '<button type="button" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>'
  }),
  NTag: defineComponent({
    name: 'NTag',
    template: '<span class="tag"><slot /></span>'
  })
}

const builtInTemplate = makeTemplate()
const savedTemplate = makeTemplate({
  id: 'saved-template',
  name: '会议准备',
  category: '办公',
  keywords: ['meeting'],
  description: '打开会议资料。',
  variables: [],
  actions: [{
    type: 'openUrl',
    name: '打开会议',
    params: { url: '{{meetingUrl}}' },
    enabled: true,
    riskLevel: 'low'
  }]
})

function mountCenter(props: { builtInTemplates?: TaskTemplate[]; savedTemplates?: TaskTemplate[] } = {}) {
  return mount(TemplateCenter, {
    props: {
      builtInTemplates: props.builtInTemplates ?? [builtInTemplate],
      savedTemplates: props.savedTemplates ?? [savedTemplate]
    },
    global: { stubs }
  })
}

describe('TemplateCenter', () => {
  it('renders source, action, variable, risk, and result summaries', () => {
    const wrapper = mountCenter()

    expect(wrapper.text()).toContain('模板中心')
    expect(wrapper.text()).toContain('2 个模板')
    expect(wrapper.text()).toContain('部署前检查')
    expect(wrapper.text()).toContain('内置')
    expect(wrapper.text()).toContain('2 个动作')
    expect(wrapper.text()).toContain('需填写 1 个变量')
    expect(wrapper.text()).toContain('中风险')
    expect(wrapper.text()).toContain('会议准备')
    expect(wrapper.text()).toContain('已保存')
  })

  it('combines category and search filters and renders a no-results state', async () => {
    const wrapper = mountCenter()

    await wrapper.findAll('.category-segment').find((button) => button.text() === '办公')?.trigger('click')
    expect(wrapper.text()).toContain('会议准备')
    expect(wrapper.text()).not.toContain('部署前检查')
    expect(wrapper.text()).toContain('1 / 2 个模板')

    await wrapper.get('.search-input').setValue('VITE')
    await nextTick()
    expect(wrapper.text()).toContain('没有找到匹配模板')

    await wrapper.findAll('.category-segment').find((button) => button.text() === '全部')?.trigger('click')
    expect(wrapper.text()).toContain('部署前检查')
    expect(wrapper.text()).not.toContain('会议准备')
  })

  it('searches name, category, keyword, and description metadata', async () => {
    const wrapper = mountCenter()

    for (const query of ['会议准备', '办公', 'meeting', '会议资料']) {
      await wrapper.get('.search-input').setValue(query)
      expect(wrapper.text(), query).toContain('会议准备')
      expect(wrapper.text(), query).not.toContain('部署前检查')
    }
  })

  it('emits preview and use with the selected template', async () => {
    const wrapper = mountCenter({ savedTemplates: [] })

    await findButton(wrapper, '预览').trigger('click')
    await findButton(wrapper, '使用').trigger('click')

    expect(wrapper.emitted('preview')).toEqual([[builtInTemplate]])
    expect(wrapper.emitted('use')).toEqual([[builtInTemplate]])
  })

  it('distinguishes an empty catalog and keeps saved-template export available', async () => {
    const wrapper = mountCenter({ builtInTemplates: [], savedTemplates: [] })

    expect(wrapper.text()).toContain('0 个模板')
    expect(wrapper.text()).toContain('没有可用模板')
    await findButton(wrapper, '导入配置').trigger('click')
    await findButton(wrapper, '导出模板').trigger('click')

    expect(wrapper.emitted('import')).toEqual([[]])
    expect(wrapper.emitted('export')).toEqual([[]])
    expect(wrapper.find('button[aria-label="导出模板，0 个已保存模板"]').exists()).toBe(true)
  })
})

function findButton(wrapper: ReturnType<typeof mountCenter>, text: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!button) throw new Error(`Button not found: ${text}`)
  return button
}

function makeTemplate(patch: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: 'built-in-template',
    name: '部署前检查',
    category: '开发者',
    keywords: ['Vite', 'release'],
    description: '检查构建状态。',
    variables: [
      { key: 'projectDir', label: '项目目录', defaultValue: '', required: false, secret: false }
    ],
    actions: [
      {
        type: 'runCommand',
        name: '执行检查',
        params: { command: 'yarn test', workingDir: '{{projectDir}}', shell: 'powershell' },
        enabled: true,
        riskLevel: 'medium'
      },
      {
        type: 'delay',
        name: '等待服务',
        params: { durationMs: 1000 },
        enabled: true,
        riskLevel: 'low'
      }
    ],
    ...patch
  }
}
