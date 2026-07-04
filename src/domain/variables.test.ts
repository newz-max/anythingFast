import { describe, expect, it } from 'vitest'
import { maskSecretVariableText, variablesNeedingInput } from '@/domain/variables'
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
})
