import { describe, expect, it } from 'vitest'
import { collectActionProducedVariableKeys, collectActionStringValues, collectConditionStringValues, collectConditionVariableKeys, collectOutputBindingKeys, extractVariableReferences, inferMissingInputVariableKeys, maskSecretVariableText, scanActionVariableReferences, variablesNeedingInput } from '@/domain/variables'
import type { TaskAction, TaskVariable } from '@/types/domain'

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

  it('extracts variable references in first occurrence order without duplicates', () => {
    expect(extractVariableReferences('{{second}} {{ first }} {{second}}')).toEqual(['second', 'first'])
  })

  it('collects supported action string fields and command env values', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'runCommand',
      name: 'command',
      params: {
        source: 'script',
        command: '{{command}}',
        workingDir: '{{projectDir}}',
        shell: 'powershell',
        scriptPath: '{{scriptPath}}',
        scriptArgs: ['{{argOne}}'],
        env: { TOKEN: '{{token}}' }
      },
      enabled: true,
      riskLevel: 'medium'
    }

    expect(collectActionStringValues(action)).toEqual([
      { field: 'command', value: '{{command}}' },
      { field: 'workingDir', value: '{{projectDir}}' },
      { field: 'scriptPath', value: '{{scriptPath}}' },
      { field: 'scriptArgs.0', value: '{{argOne}}' },
      { field: 'env.TOKEN', value: '{{token}}' }
    ])
  })

  it('classifies condition variable keys and output binding keys', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'runCommand',
      name: 'command',
      params: { command: 'echo {{input}}', workingDir: 'D:\\Project', shell: 'powershell' },
      enabled: true,
      condition: { type: 'variableEquals', variable: 'status', value: '{{expectedStatus}}' },
      outputBinding: { stdoutVariable: 'generatedPath', exitCodeVariable: 'lastExitCode' },
      riskLevel: 'medium'
    }

    expect(collectConditionVariableKeys(action.condition)).toEqual([
      { field: 'condition.variable', key: 'status' }
    ])
    expect(collectOutputBindingKeys(action)).toEqual([
      { field: 'outputBinding.stdoutVariable', key: 'generatedPath' },
      { field: 'outputBinding.exitCodeVariable', key: 'lastExitCode' }
    ])
    expect(scanActionVariableReferences(action)).toMatchObject({
      textReferences: [
        { field: 'command', key: 'input' },
        { field: 'condition.value', key: 'expectedStatus' }
      ],
      conditionVariableKeys: [{ field: 'condition.variable', key: 'status' }],
      outputBindingKeys: [
        { field: 'outputBinding.stdoutVariable', key: 'generatedPath' },
        { field: 'outputBinding.exitCodeVariable', key: 'lastExitCode' }
      ]
    })
  })

  it('makes a clipboard output available only to later actions without requesting it as input', () => {
    const readClipboard: TaskAction = {
      id: 'read',
      type: 'readClipboard',
      name: 'read clipboard',
      params: { targetVariable: 'clipboardText' },
      enabled: true,
      riskLevel: 'high'
    }
    const laterAction: TaskAction = {
      id: 'open',
      type: 'openUrl',
      name: 'open',
      params: { url: 'https://example.com/?q={{clipboardText}}' },
      enabled: true,
      riskLevel: 'low'
    }

    expect(collectActionProducedVariableKeys(readClipboard)).toEqual([{ field: 'targetVariable', key: 'clipboardText' }])
    expect(scanActionVariableReferences(readClipboard).producedVariableKeys).toEqual([{ field: 'targetVariable', key: 'clipboardText' }])
    expect(inferMissingInputVariableKeys([readClipboard, laterAction])).toEqual([])
    expect(inferMissingInputVariableKeys([laterAction, readClipboard])).toEqual(['clipboardText'])
  })
})
