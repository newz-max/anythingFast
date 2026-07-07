import type { ActionCondition, ActionParams, TaskAction, TaskVariable } from '@/types/domain'

export const variableKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/
const referencePattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g
const mask = '••••'

export interface VariableReference {
  field: string
  key: string
  value?: string
}

export interface ActionVariableReferenceScan {
  textReferences: VariableReference[]
  conditionVariableKeys: VariableReference[]
  outputBindingKeys: VariableReference[]
}

export type VariableScannableAction = Pick<TaskAction, 'type' | 'params' | 'enabled' | 'condition' | 'outputBinding'>

export function isValidVariableKey(key: string) {
  return variableKeyPattern.test(key.trim())
}

export function extractVariableReferences(value: string) {
  const refs = new Set<string>()
  for (const match of value.matchAll(referencePattern)) {
    refs.add(match[1])
  }
  return [...refs]
}

export function hasVariableSyntax(value: string) {
  return value.includes('{{') || value.includes('}}')
}

export function hasInvalidVariableSyntax(value: string) {
  if (!hasVariableSyntax(value)) return false
  const stripped = value.replace(referencePattern, '')
  return stripped.includes('{{') || stripped.includes('}}')
}

export function maskSecretVariableText(value: string, variables: TaskVariable[] = []) {
  return variables
    .filter((variable) => variable.secret)
    .reduce((text, variable) => {
      const reference = new RegExp(`\\{\\{\\s*${escapeRegExp(variable.key)}\\s*\\}\\}`, 'g')
      const maskedReference = text.replace(reference, mask)
      return variable.defaultValue ? maskedReference.split(variable.defaultValue).join(mask) : maskedReference
  }, value)
}

export function collectActionStringValues(action: VariableScannableAction) {
  const params = action.params as Record<string, unknown>
  const values: Array<{ field: string; value: string }> = []
  const add = (field: string) => {
    const value = params[field]
    if (typeof value === 'string') {
      values.push({ field, value })
    }
  }
  const addList = (field: string) => {
    const value = params[field]
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'string') values.push({ field: `${field}.${index}`, value: item })
      })
    }
  }

  switch (action.type) {
    case 'openProgram':
      add('path')
      add('workingDir')
      addList('args')
      break
    case 'openUrl':
      add('url')
      add('browser')
      break
    case 'openFile':
    case 'openFolder':
      add('path')
      break
    case 'runCommand':
      add('command')
      add('workingDir')
      add('scriptPath')
      addList('scriptArgs')
      collectEnvValues(action.params, values)
      break
  }

  return values
}

export function collectConditionStringValues(condition: ActionCondition | null | undefined) {
  const values: Array<{ field: string; value: string }> = []
  if (!condition || condition.type === 'always') return values
  if (condition.type === 'fileExists' || condition.type === 'folderExists') {
    values.push({ field: 'condition.path', value: condition.path })
  }
  if (condition.type === 'variableEquals') {
    values.push({ field: 'condition.value', value: condition.value })
  }
  return values
}

export function collectConditionVariableKeys(condition: ActionCondition | null | undefined) {
  const values: VariableReference[] = []
  if (!condition) return values
  if (condition.type === 'variableEquals' || condition.type === 'variableNotEmpty') {
    values.push({ field: 'condition.variable', key: condition.variable.trim() })
  }
  return values
}

export function collectOutputBindingKeys(action: VariableScannableAction) {
  if (!action.outputBinding) return []
  const bindings = [
    ['outputBinding.stdoutVariable', action.outputBinding.stdoutVariable],
    ['outputBinding.stderrVariable', action.outputBinding.stderrVariable],
    ['outputBinding.exitCodeVariable', action.outputBinding.exitCodeVariable]
  ] as const
  return bindings
    .filter(([, key]) => typeof key === 'string' && key.trim())
    .map(([field, key]) => ({ field, key: key!.trim() }))
}

export function scanActionVariableReferences(action: VariableScannableAction): ActionVariableReferenceScan {
  const textReferences = [...collectActionStringValues(action), ...collectConditionStringValues(action.condition)]
    .flatMap(({ field, value }) => extractVariableReferences(value).map((key) => ({ field, key, value })))

  return {
    textReferences,
    conditionVariableKeys: collectConditionVariableKeys(action.condition),
    outputBindingKeys: collectOutputBindingKeys(action)
  }
}

export function inferMissingInputVariableKeys(actions: VariableScannableAction[], variables: TaskVariable[] = []) {
  const availableKeys = new Set(variables.map((variable) => variable.key.trim()).filter(Boolean))
  const missingKeys: string[] = []
  const addMissing = (key: string) => {
    if (!isValidVariableKey(key) || availableKeys.has(key)) return
    availableKeys.add(key)
    missingKeys.push(key)
  }

  actions.forEach((action) => {
    const scan = scanActionVariableReferences(action)
    scan.textReferences.forEach(({ key }) => addMissing(key))
    scan.conditionVariableKeys.forEach(({ key }) => addMissing(key))
    if (action.enabled && action.type === 'runCommand') {
      scan.outputBindingKeys.forEach(({ key }) => {
        if (isValidVariableKey(key)) availableKeys.add(key)
      })
    }
  })

  return missingKeys
}

export function actionHasVariableReference(action: VariableScannableAction) {
  return [...collectActionStringValues(action), ...collectConditionStringValues(action.condition)].some(({ value }) => hasVariableSyntax(value))
}

export function defaultRuntimeVariableValues(variables: TaskVariable[]) {
  return variables.reduce<Record<string, string>>((values, variable) => {
    values[variable.key] = variable.defaultValue || ''
    return values
  }, {})
}

export function variablesNeedingInput(variables: TaskVariable[]) {
  return variables.filter((variable) => variable.required || !variable.defaultValue)
}

function collectEnvValues(actionParams: ActionParams, values: Array<{ field: string; value: string }>) {
  if (!('env' in actionParams) || !actionParams.env) return
  Object.entries(actionParams.env).forEach(([key, value]) => {
    if (typeof value === 'string') {
      values.push({ field: `env.${key}`, value })
    }
  })
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
