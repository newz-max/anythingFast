import { describe, expect, it } from 'vitest'
import { createActionDraft, createDefaultConfig, normalizeConfig, normalizeTemplate } from '@/domain/taskFactory'
import type { CommandParams, TaskItem } from '@/types/domain'

describe('taskFactory config defaults', () => {
  it('uses dark theme by default', () => {
    expect(createDefaultConfig().settings.theme).toBe('dark')
    expect(createDefaultConfig().settings.launchOnStartup).toBe(false)
  })

  it('migrates the old system theme default to dark', () => {
    const config = normalizeConfig({
      version: 1,
      tasks: [],
      tags: [],
      settings: {
        globalShortcut: 'Alt+Space',
        theme: 'system'
      }
    })

    expect(config.version).toBe(2)
    expect(config.settings.theme).toBe('dark')
    expect(config.settings.launchOnStartup).toBe(false)
  })

  it('migrates visible system terminal PowerShell commands to terminal default shell', () => {
    const task: TaskItem = {
      id: 'task-1',
      name: '脚本',
      category: '工具',
      keywords: [],
      description: '',
      variables: [],
      actions: [
        {
          id: 'action-1',
          type: 'runCommand',
          name: '运行脚本',
          params: {
            source: 'script',
            command: '',
            workingDir: 'D:\\Project\\anythingFast',
            env: {},
            showTerminal: true,
            closeTerminalOnFinish: true,
            shell: 'powershell',
            scriptPath: 'D:\\Project\\anythingFast\\start.ps1',
            scriptArgs: []
          },
          enabled: true,
          riskLevel: 'high'
        }
      ],
      riskLevel: 'high',
      enabled: true,
      favorite: false,
      tagIds: [],
      triggers: [{ type: 'manual', enabled: true }],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z'
    }

    const config = normalizeConfig({ tasks: [task], tags: [] })
    const params = config.tasks[0].actions[0].params as CommandParams

    expect(params.terminalHost).toBe('systemTerminal')
    expect(params.shell).toBe('terminal')
  })

  it('preserves normalized scheduled triggers', () => {
    const task: TaskItem = {
      id: 'task-1',
      name: '周期事项',
      category: '工具',
      keywords: [],
      description: '',
      variables: [],
      actions: [],
      riskLevel: 'low',
      enabled: true,
      favorite: false,
      tagIds: [],
      triggers: [
        {
          type: 'schedule',
          enabled: true,
          mode: 'weekly',
          timeOfDay: ' 09:30 ',
          weekdays: [3, 1, 3, 8],
          misfirePolicy: 'runOnce',
          preventOverlap: true,
          nextRunAt: '2026-07-06T01:30:00Z'
        }
      ],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z'
    }

    const config = normalizeConfig({ tasks: [task], tags: [] })

    expect(config.tasks[0].triggers).toEqual([
      {
        type: 'schedule',
        enabled: true,
        mode: 'weekly',
        intervalMinutes: null,
        timeOfDay: '09:30',
        weekdays: [1, 3],
        misfirePolicy: 'runOnce',
        preventOverlap: true,
        nextRunAt: '2026-07-06T01:30:00Z',
        lastScheduledAt: undefined
      }
    ])
  })

  it('normalizes template variables', () => {
    const template = normalizeTemplate({
      id: 'template-vars',
      name: '变量模板',
      variables: [
        { key: ' projectDir ', label: ' 项目目录 ', defaultValue: 'D:\\Project', required: true, secret: true }
      ],
      actions: []
    })

    expect(template.variables).toEqual([
      { key: 'projectDir', label: '项目目录', defaultValue: 'D:\\Project', required: true, secret: true }
    ])
  })

  it('creates port waiting actions with a required finite timeout', () => {
    const action = createActionDraft('waitForPort')

    expect(action.timeoutMs).toBe(60000)
    expect(action.params).toEqual({ host: '127.0.0.1', port: 3000 })
    expect(action.riskLevel).toBe('low')
  })
})
