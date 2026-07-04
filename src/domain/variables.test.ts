import { describe, expect, it } from 'vitest'
import { collectConditionStringValues, maskSecretVariableText, variablesNeedingInput } from '@/domain/variables'
import type { TaskVariable } from '@/types/domain'

describe('variables', () => {
  it('masks secret variable references and default values', () => {
    const variables: TaskVariable[] = [
      { key: 'token', label: 'Token', defaultValue: 'secret-value', required: true, secret: true }
    ]

    expect(maskSecretVariableText('curl -H {{token}} secret-value', variables)).toBe('curl -H •••• ••••')
  })

  it('collects required variables and variables without defaults for runtime input', () => {
    const variables: TaskVariable[] = [
      { key: 'projectDir', label: 'Project', defaultValue: 'D:\\Project', required: false, secret: false },
      { key: 'branch', label: 'Branch', defaultValue: '', required: false, secret: false },
      { key: 'token', label: 'Token', defaultValue: 'abc', required: true, secret: true }
    ]

    expect(variablesNeedingInput(variables).map((variable) => variable.key)).toEqual(['branch', 'token'])
  })

  it('collects condition string values for variable validation', () => {
    expect(collectConditionStringValues({ type: 'fileExists', path: '{{projectDir}}\\out.txt' })).toEqual([
      { field: 'condition.path', value: '{{projectDir}}\\out.txt' }
    ])
    expect(collectConditionStringValues({ type: 'variableEquals', variable: 'status', value: '{{expectedStatus}}' })).toEqual([
      { field: 'condition.value', value: '{{expectedStatus}}' }
    ])
    expect(collectConditionStringValues({ type: 'always' })).toEqual([])
  })
})
