import { describeAction, describeCondition, getActionTypeLabel } from '@/domain/actionPresentation'
import { deriveActionRisk } from '@/domain/risk'
import { deriveTemplateRisk } from '@/domain/taskTemplates'
import {
  inferMissingInputVariableKeys,
  maskSecretVariableText,
  scanActionVariableReferences
} from '@/domain/variables'
import type { RiskLevel, TaskTemplate, TaskVariable } from '@/types/domain'

export type TemplateSource = 'built-in' | 'saved'

export interface TemplateView {
  template: TaskTemplate
  source: TemplateSource
  actionCount: number
  variableCount: number
  requiredVariableCount: number
  riskLevel: RiskLevel
}

export interface TemplateActionPreview {
  index: number
  name: string
  typeLabel: string
  detail: string
  condition: string
  enabled: boolean
  riskLevel: RiskLevel
}

export interface TemplateVariablePreview extends TaskVariable {
  references: string[]
  inferred: boolean
}

export interface TemplatePreview {
  actions: TemplateActionPreview[]
  firstConfigurationVariables: TemplateVariablePreview[]
  perRunVariables: TemplateVariablePreview[]
  configuredVariables: TemplateVariablePreview[]
  riskLevel: RiskLevel
  containsCommand: boolean
}

export function createTemplateViews(
  builtInTemplates: TaskTemplate[],
  savedTemplates: TaskTemplate[]
): TemplateView[] {
  return [
    ...builtInTemplates.map((template) => createTemplateView(template, 'built-in')),
    ...savedTemplates.map((template) => createTemplateView(template, 'saved'))
  ]
}

export function getTemplateCategories(templates: TemplateView[]) {
  return Array.from(
    new Set(templates.map(({ template }) => template.category?.trim() || '未分类'))
  ).sort((left, right) => left.localeCompare(right, 'zh-CN'))
}

export function filterTemplateViews(
  templates: TemplateView[],
  options: { category?: string; query?: string }
) {
  const category = options.category?.trim() || '全部'
  const query = normalizeSearchText(options.query || '')
  return templates.filter(({ template }) => {
    const templateCategory = template.category?.trim() || '未分类'
    if (category !== '全部' && templateCategory !== category) return false
    if (!query) return true
    return normalizeSearchText([
      template.name,
      templateCategory,
      ...(template.keywords || []),
      template.description || ''
    ].join(' ')).includes(query)
  })
}

export function createTemplatePreview(template: TaskTemplate): TemplatePreview {
  const explicitVariables = template.variables || []
  const inferredVariables: TaskVariable[] = inferMissingInputVariableKeys(
    template.actions,
    explicitVariables
  ).map((key) => ({
    key,
    label: key,
    defaultValue: '',
    required: true,
    secret: false
  }))
  const variables = [...explicitVariables, ...inferredVariables]
  const inferredKeys = new Set(inferredVariables.map((variable) => variable.key))
  const references = collectVariableReferences(template)
  const variablePreviews = variables.map<TemplateVariablePreview>((variable) => ({
    ...variable,
    defaultValue: variable.secret && variable.defaultValue ? '••••' : variable.defaultValue,
    references: references.get(variable.key) || [],
    inferred: inferredKeys.has(variable.key)
  }))

  return {
    actions: template.actions.map((action, index) => {
      const taskAction = { ...action, id: `template-preview-${index}` }
      return {
        index,
        name: action.name?.trim() || `动作 ${index + 1}`,
        typeLabel: getActionTypeLabel(action.type),
        detail: maskSecretVariableText(describeAction(taskAction), variables),
        condition: maskSecretVariableText(describeCondition(action.condition), variables),
        enabled: action.enabled,
        riskLevel: deriveActionRisk(taskAction)
      }
    }),
    firstConfigurationVariables: variablePreviews.filter(
      (variable) => !variable.required && !variable.defaultValue
    ),
    perRunVariables: variablePreviews.filter((variable) => variable.required),
    configuredVariables: variablePreviews.filter(
      (variable) => !variable.required && Boolean(variable.defaultValue)
    ),
    riskLevel: deriveTemplateRisk(template),
    containsCommand: template.actions.some((action) => action.enabled && action.type === 'runCommand')
  }
}

function createTemplateView(template: TaskTemplate, source: TemplateSource): TemplateView {
  const variables = template.variables || []
  const missingVariables = inferMissingInputVariableKeys(template.actions, variables)
  return {
    template,
    source,
    actionCount: template.actions.length,
    variableCount: variables.length + missingVariables.length,
    requiredVariableCount:
      variables.filter((variable) => variable.required || !variable.defaultValue).length +
      missingVariables.length,
    riskLevel: deriveTemplateRisk(template)
  }
}

function collectVariableReferences(template: TaskTemplate) {
  const references = new Map<string, string[]>()
  template.actions.forEach((action, index) => {
    const actionName = action.name?.trim() || `动作 ${index + 1}`
    const scan = scanActionVariableReferences(action)
    const add = (key: string, field: string) => {
      const location = `动作 ${index + 1}“${actionName}” · ${field}`
      const current = references.get(key) || []
      if (!current.includes(location)) references.set(key, [...current, location])
    }
    scan.textReferences.forEach(({ key, field }) => add(key, field))
    scan.conditionVariableKeys.forEach(({ key, field }) => add(key, field))
  })
  return references
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase()
}
