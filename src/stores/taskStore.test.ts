import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useTaskStore } from '@/stores/taskStore'
import type { TaskItem } from '@/types/domain'

describe('taskStore templates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('saves a task action sequence as a non-runnable template', async () => {
    const store = useTaskStore()
    const task: TaskItem = {
      id: 'task-a',
      name: '工作流',
      category: '工作',
      keywords: ['work'],
      description: '打开工作入口',
      actions: [
        {
          id: 'action-a',
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
          id: 'action-b',
          type: 'openFile',
          name: '打开生成文件',
          params: { path: '{{generatedPath}}' },
          enabled: true,
          continueOnError: false,
          condition: { type: 'variableNotEmpty', variable: 'generatedPath' },
          riskLevel: 'low'
        }
      ],
      riskLevel: 'medium',
      enabled: true,
      favorite: false,
      tagIds: [],
      triggers: [{ type: 'shortcut', enabled: true, shortcut: 'Ctrl+Alt+W' }],
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z'
    }

    const template = await store.saveTaskAsTemplate(task)

    expect(store.savedTemplates).toHaveLength(1)
    expect(template.name).toBe(task.name)
    expect(template.actions).toHaveLength(2)
    expect('id' in template.actions[0]).toBe(false)
    expect('id' in template.actions[1]).toBe(false)
    expect(template.actions[0].outputBinding).toEqual({ stdoutVariable: 'generatedPath' })
    expect(template.actions[1].condition).toEqual({ type: 'variableNotEmpty', variable: 'generatedPath' })
    expect(template.description).toBe(task.description)
  })

  it('persists scheduled triggers in browser fallback config', async () => {
    const store = useTaskStore()
    const task: TaskItem = {
      id: 'task-schedule',
      name: '周期事项',
      category: '工作',
      keywords: [],
      description: '',
      actions: [
        {
          id: 'action-a',
          type: 'openUrl',
          name: '打开网页',
          params: { url: 'https://example.com' },
          enabled: true,
          riskLevel: 'low'
        }
      ],
      riskLevel: 'low',
      enabled: true,
      favorite: false,
      tagIds: [],
      triggers: [
        {
          type: 'schedule',
          enabled: true,
          mode: 'daily',
          timeOfDay: '09:00',
          weekdays: [],
          intervalMinutes: 60,
          misfirePolicy: 'skip',
          preventOverlap: true
        }
      ],
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z'
    }

    await store.upsertTask(task)

    const stored = JSON.parse(localStorage.getItem('anything-fast-config') || '{}')
    expect(stored.tasks[0].triggers[0]).toMatchObject({
      type: 'schedule',
      enabled: true,
      mode: 'daily',
      timeOfDay: '09:00',
      misfirePolicy: 'skip',
      preventOverlap: true
    })
  })
})
