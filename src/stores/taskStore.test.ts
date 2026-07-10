import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AppConfig, TaskItem } from '@/types/domain'

const listenConfigUpdatedEventsMock = vi.hoisted(() => vi.fn())
const loadConfigMock = vi.hoisted(() => vi.fn())
const saveConfigMock = vi.hoisted(() => vi.fn(async (config: AppConfig) => config))
const updateSettingsMock = vi.hoisted(() => vi.fn(async (settings: AppConfig['settings']) => makeConfig([], settings)))

vi.mock('@/api/events', () => ({
  listenConfigUpdatedEvents: listenConfigUpdatedEventsMock
}))

vi.mock('@/api/tauri', () => ({
  tauriApi: {
    loadConfig: loadConfigMock,
    saveConfig: saveConfigMock,
    updateSettings: updateSettingsMock
  }
}))

import { useTaskStore } from '@/stores/taskStore'

describe('taskStore templates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    listenConfigUpdatedEventsMock.mockReset()
    loadConfigMock.mockReset()
    saveConfigMock.mockClear()
    updateSettingsMock.mockClear()
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })

  it('saves a task action sequence as a non-runnable template', async () => {
    const store = useTaskStore()
    const task: TaskItem = {
      id: 'task-a',
      name: '工作流',
      category: '工作',
      keywords: ['work'],
      description: '打开工作入口',
      variables: [
        { key: 'projectDir', label: '项目目录', defaultValue: 'C:\\workspace', required: true, secret: false },
        { key: 'token', label: '令牌', defaultValue: 'secret-value', required: false, secret: true }
      ],
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
    expect(template.variables).toEqual(task.variables)
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

  it('replaces provisional risk metadata with backend save result', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    const store = useTaskStore()
    const task = makeTask('task-risk', '风险事项')
    task.actions = [
      {
        id: 'action-risk',
        type: 'runCommand',
        name: '删除目录',
        params: {
          source: 'inline',
          command: 'Remove-Item -Recurse dist',
          workingDir: 'D:\\Project',
          shell: 'powershell'
        },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ]
    task.riskLevel = 'low'
    const backendTask: TaskItem = {
      ...task,
      actions: task.actions.map((action) => ({ ...action, riskLevel: 'high' })),
      riskLevel: 'high'
    }
    saveConfigMock.mockResolvedValueOnce(makeConfig([backendTask]))

    await store.upsertTask(task)

    expect(saveConfigMock).toHaveBeenCalledTimes(1)
    expect(store.tasks[0].riskLevel).toBe('high')
    expect(store.tasks[0].actions[0].riskLevel).toBe('high')
  })

  it('registers a single config update listener in Tauri runtime', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    const unlisten = vi.fn()
    listenConfigUpdatedEventsMock.mockResolvedValue(unlisten)
    const store = useTaskStore()

    await store.setupConfigSync()
    await store.setupConfigSync()

    expect(listenConfigUpdatedEventsMock).toHaveBeenCalledTimes(1)

    store.teardownConfigSync()
    expect(unlisten).toHaveBeenCalledTimes(1)
  })

  it('reloads canonical backend config after a config update event', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    let handler: ((payload: { source: 'saveConfig' }) => void) | undefined
    listenConfigUpdatedEventsMock.mockImplementation(async (nextHandler) => {
      handler = nextHandler
      return vi.fn()
    })
    const store = useTaskStore()
    store.replaceConfig(makeConfig([makeTask('task-1', '旧事项')]))
    store.selectTask('task-1')
    loadConfigMock.mockResolvedValue(makeConfig([makeTask('task-1', '旧事项'), makeTask('task-2', '新增事项')]))

    await store.setupConfigSync()
    if (!handler) throw new Error('config update handler was not registered')
    handler({ source: 'saveConfig' })
    await vi.waitFor(() => expect(store.tasks.map((task) => task.id)).toEqual(['task-1', 'task-2']))

    expect(store.selectedTaskId).toBe('task-1')
    expect(loadConfigMock).toHaveBeenCalledTimes(1)
  })

  it('preserves previous config when sync reload fails', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    const store = useTaskStore()
    store.replaceConfig(makeConfig([makeTask('task-old', '旧事项')]))
    loadConfigMock.mockRejectedValue(new Error('reload failed'))

    await store.reloadFromConfigUpdate()

    expect(store.tasks.map((task) => task.id)).toEqual(['task-old'])
    expect(store.error).toBe('reload failed')
  })

  it('queues rapid config update reloads without overlapping backend loads', async () => {
    Reflect.set(window, '__TAURI_INTERNALS__', {})
    const store = useTaskStore()
    const firstLoad = deferred<AppConfig>()
    loadConfigMock
      .mockReturnValueOnce(firstLoad.promise)
      .mockResolvedValueOnce(makeConfig([makeTask('task-2', '第二次同步')]))

    const firstReload = store.reloadFromConfigUpdate()
    const secondReload = store.reloadFromConfigUpdate()

    expect(loadConfigMock).toHaveBeenCalledTimes(1)

    firstLoad.resolve(makeConfig([makeTask('task-1', '第一次同步')]))
    await firstReload
    await secondReload

    expect(loadConfigMock).toHaveBeenCalledTimes(2)
    expect(store.tasks.map((task) => task.id)).toEqual(['task-2'])
  })
})

function makeConfig(tasks: TaskItem[], settings: AppConfig['settings'] = {
  globalShortcut: 'Alt+Space',
  theme: 'system',
  launchOnStartup: false
}): AppConfig {
  return {
    version: 1,
    tasks,
    tags: [],
    templates: [],
    settings
  }
}

function makeTask(id: string, name: string): TaskItem {
  return {
    id,
    name,
    category: '工作',
    keywords: [],
    description: '',
    actions: [
      {
        id: `${id}-action`,
        type: 'openUrl',
        name: '打开网页',
        params: { url: 'https://example.com' },
        enabled: true,
        continueOnError: false,
        riskLevel: 'low'
      }
    ],
    riskLevel: 'low',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z'
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}
