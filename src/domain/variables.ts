import type { ActionCondition, ActionParams, TaskAction, TaskVariable } from '@/types/domain'

export const variableKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/
const referencePattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g
const mask = '••••'

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

export function collectActionStringValues(action: TaskAction) {
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

export function actionHasVariableReference(action: TaskAction) {
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
