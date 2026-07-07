// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import TemplateCenter from './TemplateCenter.vue'
import type { TaskTemplate } from '@/types/domain'

const stubs = {
  NEmpty: defineComponent({
    name: 'NEmpty',
    props: ['description'],
    template: '<section>{{ description }}</section>'
  })
}

function makeTemplate(patch: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: 'template-1',
    name: '部署前检查',
    category: '工作',
    keywords: ['deploy'],
    description: '检查构建状态并等待服务稳定。',
    variables: [],
    actions: [
      {
        type: 'runCommand',
        name: '执行检查',
        params: {
          source: 'inline',
          command: 'yarn test',
          workingDir: 'D:\\Project\\anythingFast',
          env: {},
          showTerminal: false,
          closeTerminalOnFinish: true,
          terminalHost: 'systemTerminal',
          shell: 'powershell',
          scriptPath: '',
          scriptArgs: []
        },
        enabled: true,
        continueOnError: false,
        riskLevel: 'medium'
      },
      {
        type: 'delay',
        name: '等待服务',
        params: { durationMs: 1000 },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ],
    ...patch
  }
}

function mountCenter(props: { templates?: TaskTemplate[]; savedTemplateCount?: number } = {}) {
  return mount(TemplateCenter, {
    props: {
      templates: props.templates ?? [makeTemplate()],
      savedTemplateCount: props.savedTemplateCount ?? 1
    },
    global: { stubs }
  })
}

describe('TemplateCenter', () => {
  it('renders template name, description, and summary metadata', () => {
    const wrapper = mountCenter()

    expect(wrapper.text()).toContain('模板中心')
    expect(wrapper.text()).toContain('1 个模板')
    expect(wrapper.text()).toContain('部署前检查')
    expect(wrapper.text()).toContain('检查构建状态并等待服务稳定。')
    expect(wrapper.text()).toContain('工作 · 2 个动作 · 执行命令、延时等待 · 中风险')
  })

  it('renders fallback metadata and empty state', () => {
    const fallback = mountCenter({
      templates: [makeTemplate({ id: 'template-2', category: '', actions: [] })]
    })
    const empty = mountCenter({ templates: [], savedTemplateCount: 0 })

    expect(fallback.text()).toContain('未分类 · 0 个动作 · 无动作 · 低风险')
    expect(empty.text()).toContain('0 个模板')
    expect(empty.text()).toContain('没有可用模板')
  })

  it('emits use with the selected template', async () => {
    const template = makeTemplate()
    const wrapper = mountCenter({ templates: [template] })

    await wrapper.findAll('button').find((button) => button.text() === '使用')?.trigger('click')

    expect(wrapper.emitted('use')).toEqual([[template]])
  })

  it('emits import and keeps export clickable with no saved templates', async () => {
    const wrapper = mountCenter({ savedTemplateCount: 0 })

    await wrapper.findAll('button').find((button) => button.text() === '导入配置')?.trigger('click')
    await wrapper.findAll('button').find((button) => button.text() === '导出模板')?.trigger('click')

    expect(wrapper.emitted('import')).toEqual([[]])
    expect(wrapper.emitted('export')).toEqual([[]])
    expect(wrapper.find('button[aria-label="导出模板，0 个已保存模板"]').exists()).toBe(true)
  })
})
