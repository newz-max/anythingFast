import { describe, expect, it } from 'vitest'
import { builtInTaskTemplates, createTaskFromTemplate, deriveTemplateRisk } from '@/domain/taskTemplates'
import { collectActionStringValues } from '@/domain/variables'
import { validateTaskLocal } from '@/domain/validation'
import type { TaskTemplate } from '@/types/domain'

describe('task templates', () => {
  it('provides a portable catalog across all required scene categories', () => {
    expect(builtInTaskTemplates).toHaveLength(12)
    expect(new Set(builtInTaskTemplates.map((template) => template.category))).toEqual(
      new Set(['开发者', '办公', '学习', '系统维护', '个人常用'])
    )

    builtInTaskTemplates.forEach((template) => {
      const task = createTaskFromTemplate(template)
      expect(validateTaskLocal(task).issues, template.name).toEqual([])
      expect(task.triggers).toEqual([{ type: 'manual', enabled: true }])
      expect(template.variables?.filter((variable) => variable.secret && variable.defaultValue)).toEqual([])
    })
  })

  it('keeps environment-specific values variable-based and excludes destructive commands', () => {
    const parameterValues = builtInTaskTemplates.flatMap((template) =>
      template.actions.flatMap((action) => collectActionStringValues(action).map(({ value }) => value))
    )
    const commands = builtInTaskTemplates.flatMap((template) =>
      template.actions
        .filter((action) => action.type === 'runCommand' && 'command' in action.params)
        .map((action) => ('command' in action.params ? action.params.command : ''))
    )

    expect(parameterValues).not.toContain('https://example.com')
    expect(parameterValues.filter((value) => /^[A-Za-z]:\\/.test(value))).toEqual([])
    expect(commands.join(' ')).not.toMatch(/\b(del|erase|rmdir|rd|format|remove-item|rm)\b/i)
    expect(builtInTaskTemplates.some((template) => /清理|删除|覆盖/.test(template.name))).toBe(false)
  })

  it('derives every command template as at least medium risk', () => {
    const commandTemplates = builtInTaskTemplates.filter((template) =>
      template.actions.some((action) => action.type === 'runCommand')
    )

    expect(commandTemplates.length).toBeGreaterThan(0)
    commandTemplates.forEach((template) => {
      expect(['medium', 'high']).toContain(deriveTemplateRisk(template))
    })
  })

  it('creates an editable task draft from a built-in template', () => {
    const template = builtInTaskTemplates[0]
    const task = createTaskFromTemplate(template)
    const anotherTask = createTaskFromTemplate(template)

    expect(task.id).toMatch(/^task-/)
    expect(task.id).not.toBe(anotherTask.id)
    expect(task.name).toBe(template.name)
    expect(task.actions).toHaveLength(template.actions.length)
    expect(task.actions[0].id).toMatch(/^action-/)
    expect(task.actions[0].id).not.toBe(anotherTask.actions[0].id)
    expect(task.enabled).toBe(true)
    expect(task.favorite).toBe(false)
    expect(task.triggers).toEqual([{ type: 'manual', enabled: true }])
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
    expect(task.actions.map((action) => action.name)).toEqual(['生成路径', '打开生成文件'])

    task.actions[0].outputBinding!.stdoutVariable = 'changedPath'
    task.variables![0].label = '已修改'

    expect(template.actions[0].outputBinding).toEqual({ stdoutVariable: 'generatedPath' })
    expect(template.variables![0].label).toBe('生成路径')
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

  it('normalizes stale risk metadata and incomplete task fields', () => {
    const template: TaskTemplate = {
      id: 'template-stale-risk',
      name: '归一化模板',
      category: '  ',
      actions: [
        {
          type: 'runCommand',
          name: '不完整命令',
          params: { command: 'echo ready', workingDir: '', shell: 'powershell' },
          enabled: true,
          riskLevel: 'low'
        },
        {
          type: 'readClipboard',
          name: '读取剪贴板',
          params: { targetVariable: 'clipboardText' },
          enabled: true,
          riskLevel: 'low'
        }
      ]
    }

    const task = createTaskFromTemplate(template)

    expect(task.category).toBe('未分类')
    expect(task.keywords).toEqual([])
    expect(task.description).toBe('')
    expect(task.favorite).toBe(false)
    expect(task.triggers).toEqual([{ type: 'manual', enabled: true }])
    expect(task.actions[0].params).toEqual({
      source: 'inline',
      command: 'echo ready',
      workingDir: '',
      env: {},
      showTerminal: false,
      closeTerminalOnFinish: true,
      terminalHost: 'systemTerminal',
      shell: 'powershell',
      scriptPath: '',
      scriptArgs: []
    })
    expect(task.actions[0].condition).toEqual({ type: 'always' })
    expect(task.actions[0].outputBinding).toBeNull()
    expect(task.actions[0].riskLevel).toBe('medium')
    expect(task.actions[1].riskLevel).toBe('high')
    expect(task.riskLevel).toBe('high')
  })
})
