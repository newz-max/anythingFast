import { describe, expect, it } from 'vitest'
import {
  createTemplatePreview,
  createTemplateViews,
  filterTemplateViews,
  getTemplateCategories
} from '@/domain/templateViews'
import type { TaskTemplate } from '@/types/domain'

const builtInTemplate = makeTemplate({
  id: 'built-in',
  name: '启动前端服务',
  category: '开发者',
  keywords: ['Vite', 'Frontend'],
  description: '打开项目并启动开发服务。'
})
const savedTemplate = makeTemplate({
  id: 'saved',
  name: '会议准备',
  category: '办公',
  keywords: ['meeting'],
  description: '打开会议资料。'
})

describe('template views', () => {
  it('keeps built-in and saved source identity with derived counts', () => {
    const views = createTemplateViews([builtInTemplate], [savedTemplate])

    expect(views.map((view) => view.source)).toEqual(['built-in', 'saved'])
    expect(views[0]).toMatchObject({ actionCount: 2, variableCount: 3, requiredVariableCount: 3, riskLevel: 'medium' })
    expect(getTemplateCategories(views)).toEqual(['办公', '开发者'])
  })

  it('searches all metadata case-insensitively and combines category filters', () => {
    const views = createTemplateViews([builtInTemplate], [savedTemplate])

    expect(filterTemplateViews(views, { query: 'vite' }).map(({ template }) => template.id)).toEqual(['built-in'])
    expect(filterTemplateViews(views, { query: '办公' }).map(({ template }) => template.id)).toEqual(['saved'])
    expect(filterTemplateViews(views, { query: '会议资料' }).map(({ template }) => template.id)).toEqual(['saved'])
    expect(filterTemplateViews(views, { category: '办公', query: 'FRONTEND' })).toEqual([])
    expect(filterTemplateViews(views, { category: '全部', query: 'missing' })).toEqual([])
  })

  it('derives ordered actions, variable groups, inferred references, and command guidance', () => {
    const preview = createTemplatePreview(builtInTemplate)

    expect(preview.actions.map((action) => action.name)).toEqual(['执行命令', '打开结果'])
    expect(preview.actions[0]).toMatchObject({ typeLabel: '执行命令', enabled: true, riskLevel: 'medium' })
    expect(preview.firstConfigurationVariables.map((variable) => variable.key)).toEqual(['projectDir'])
    expect(preview.perRunVariables.map((variable) => variable.key)).toEqual(['branchName', 'generatedPath'])
    expect(preview.perRunVariables.find((variable) => variable.key === 'generatedPath')).toMatchObject({ inferred: true })
    expect(preview.firstConfigurationVariables[0].references).toEqual([
      '动作 1“执行命令” · workingDir'
    ])
    expect(preview.containsCommand).toBe(true)
    expect(preview.riskLevel).toBe('medium')
  })

  it('masks secret defaults and references in preview text', () => {
    const preview = createTemplatePreview(makeTemplate({
      variables: [
        { key: 'token', label: '访问令牌', defaultValue: 'plain-secret', required: false, secret: true }
      ],
      actions: [
        {
          type: 'writeClipboard',
          name: '复制令牌',
          params: { text: 'plain-secret {{token}}' },
          enabled: true,
          riskLevel: 'low'
        }
      ]
    }))

    expect(preview.configuredVariables[0].defaultValue).toBe('••••')
    expect(preview.actions[0].detail).not.toContain('plain-secret')
    expect(JSON.stringify(preview)).not.toContain('plain-secret')
  })
})

function makeTemplate(patch: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id: 'template',
    name: '模板',
    category: '未分类',
    keywords: [],
    description: '',
    variables: [
      { key: 'projectDir', label: '项目目录', defaultValue: '', required: false, secret: false },
      { key: 'branchName', label: '分支名', defaultValue: '', required: true, secret: false }
    ],
    actions: [
      {
        type: 'runCommand',
        name: '执行命令',
        params: { command: 'git switch {{branchName}}', workingDir: '{{projectDir}}', shell: 'powershell' },
        enabled: true,
        riskLevel: 'medium'
      },
      {
        type: 'openFolder',
        name: '打开结果',
        params: { path: '{{generatedPath}}' },
        enabled: true,
        riskLevel: 'low'
      }
    ],
    ...patch
  }
}
