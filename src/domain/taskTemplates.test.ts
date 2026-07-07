import { describe, expect, it } from 'vitest'
import { builtInTaskTemplates, createTaskFromTemplate, deriveTemplateRisk } from '@/domain/taskTemplates'
import type { TaskTemplate } from '@/types/domain'

describe('task templates', () => {
  it('creates an editable task draft from a built-in template', () => {
    const template = builtInTaskTemplates[0]
    const task = createTaskFromTemplate(template)

    expect(task.id).toMatch(/^task-/)
    expect(task.name).toBe(template.name)
    expect(task.actions).toHaveLength(template.actions.length)
    expect(task.actions[0].id).toMatch(/^action-/)
    expect(task.enabled).toBe(true)
    expect(task.favorite).toBe(false)
  })

  it('derives template risk from its action sequence', () => {
    expect(deriveTemplateRisk(builtInTaskTemplates[2])).toBe('medium')
  })

  it('preserves advanced action fields while assigning new action ids', () => {
    const template: TaskTemplate = {
      id: 'template-advanced',
      name: '高级动作模板',
      category: '工作',
      keywords: ['advanced'],
      description: '保留输出绑定和条件',
      variables: [
        { key: 'generatedPath', label: '生成路径', defaultValue: '', required: false, secret: false }
      ],
      actions: [
        {
          type: 'runCommand',
          name: '生成路径',
          params: {
            source: 'inline',
            command: 'echo C:\\workspace\\result.txt',
            workingDir: 'C:\\workspace',
            env: {},
            showTerminal: false,
            closeTerminalOnFinish: true,
            terminalHost: 'direct',
            shell: 'powershell',
            scriptPath: '',
            scriptArgs: []
          },
          enabled: true,
          continueOnError: false,
          outputBinding: { stdoutVariable: 'generatedPath' },
          riskLevel: 'medium'
        },
        {
          type: 'openFile',
          name: '打开生成文件',
          params: { path: '{{generatedPath}}' },
          enabled: true,
          continueOnError: false,
          condition: { type: 'variableNotEmpty', variable: 'generatedPath' },
          riskLevel: 'low'
        }
      ]
    }

    const task = createTaskFromTemplate(template)

    expect(task.actions).toHaveLength(2)
    expect(task.actions[0].id).toMatch(/^action-/)
    expect(task.actions[1].id).toMatch(/^action-/)
    expect(task.actions[0].id).not.toBe(task.actions[1].id)
    expect(task.actions[0].outputBinding).toEqual({ stdoutVariable: 'generatedPath' })
    expect(task.actions[1].condition).toEqual({ type: 'variableNotEmpty', variable: 'generatedPath' })
    expect(task.variables).toEqual(template.variables)
  })

  it('generates missing input variables from template references in stable order', () => {
    const template: TaskTemplate = {
      id: 'template-missing-vars',
      name: '缺失变量模板',
      variables: [
        { key: 'explicitVar', label: '显式变量', defaultValue: 'ready', required: false, secret: false }
      ],
      actions: [
        {
          type: 'openFolder',
          name: '打开目录',
          params: { path: '{{secondVar}}\\{{firstVar}}\\{{secondVar}}' },
          enabled: true,
          condition: { type: 'variableEquals', variable: 'statusVar', value: '{{explicitVar}}' },
          riskLevel: 'low'
        }
      ]
    }

    const task = createTaskFromTemplate(template)

    expect(task.variables?.map((variable) => variable.key)).toEqual(['explicitVar', 'secondVar', 'firstVar', 'statusVar'])
    expect(task.variables?.slice(1)).toEqual([
      { key: 'secondVar', label: 'secondVar', defaultValue: '', required: true, secret: false },
      { key: 'firstVar', label: 'firstVar', defaultValue: '', required: true, secret: false },
      { key: 'statusVar', label: 'statusVar', defaultValue: '', required: true, secret: false }
    ])
  })

  it('does not generate inputs for variables supplied by earlier enabled output bindings', () => {
    const template: TaskTemplate = {
      id: 'template-output-vars',
      name: '输出变量模板',
      variables: [],
      actions: [
        {
          type: 'runCommand',
          name: '生成路径',
          params: { command: 'echo path', workingDir: 'D:\\Project', shell: 'powershell' },
          enabled: true,
          outputBinding: { stdoutVariable: 'generatedPath' },
          riskLevel: 'medium'
        },
        {
          type: 'openFolder',
          name: '打开目录',
          params: { path: '{{generatedPath}}\\{{manualSuffix}}' },
          enabled: true,
          riskLevel: 'low'
        }
      ]
    }

    const task = createTaskFromTemplate(template)

    expect(task.variables?.map((variable) => variable.key)).toEqual(['manualSuffix'])
  })
})
