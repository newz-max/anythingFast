import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExecutionStore } from './executionStore'
import { useUpdateStore } from './updateStore'

const updaterApiMock = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  relaunchApp: vi.fn()
}))

vi.mock('@/api/updater', () => ({
  updaterApi: updaterApiMock
}))

vi.mock('@/api/events', () => ({
  listenExecutionEvents: vi.fn()
}))

vi.mock('@/api/tauri', () => ({
  tauriApi: {
    runTask: vi.fn(),
    runTaskAction: vi.fn(),
    loadExecutionLogs: vi.fn()
  }
}))

describe('updateStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('deduplicates concurrent checks and stores available update metadata', async () => {
    const store = useUpdateStore()
    const update = makeUpdate()
    let resolveCheck: (value: unknown) => void = () => {}
    updaterApiMock.checkForUpdate.mockReturnValue(new Promise((resolve) => {
      resolveCheck = resolve
    }))

    const first = store.checkForUpdate('manual')
    const second = store.checkForUpdate('manual')
    resolveCheck(update)
    await Promise.all([first, second])

    expect(updaterApiMock.checkForUpdate).toHaveBeenCalledTimes(1)
    expect(store.state).toBe('available')
    expect(store.availableVersion).toBe('0.3.1')
    expect(store.currentVersion).toBe('0.3.0')
  })

  it('distinguishes manual and startup check failures', async () => {
    const manualStore = useUpdateStore()
    updaterApiMock.checkForUpdate.mockRejectedValueOnce(new Error('network down'))

    await expect(manualStore.checkForUpdate('manual')).rejects.toThrow('network down')
    expect(manualStore.state).toBe('error')
    expect(manualStore.error).toBe('network down')

    setActivePinia(createPinia())
    const startupStore = useUpdateStore()
    updaterApiMock.checkForUpdate.mockRejectedValueOnce(new Error('endpoint missing'))

    await expect(startupStore.checkForUpdate('startup')).resolves.toBeUndefined()
    expect(startupStore.state).toBe('error')
    expect(startupStore.error).toBe('endpoint missing')
  })

  it('deduplicates downloads and tracks progress events until downloaded', async () => {
    const store = useUpdateStore()
    const update = makeUpdate()
    updaterApiMock.checkForUpdate.mockResolvedValue(update)
    updaterApiMock.downloadUpdate.mockImplementation(async (_update, onEvent) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } })
      onEvent({ event: 'Progress', data: { chunkLength: 40 } })
      onEvent({ event: 'Progress', data: { chunkLength: 60 } })
      onEvent({ event: 'Finished' })
    })

    await store.checkForUpdate('manual')
    await Promise.all([store.downloadUpdate(), store.downloadUpdate()])

    expect(updaterApiMock.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(store.state).toBe('downloaded')
    expect(store.progress).toEqual({
      downloadedBytes: 100,
      contentLength: 100,
      percent: 100
    })
    expect(store.canInstallNow).toBe(true)
  })

  it('blocks install while execution runs or interactions are pending', async () => {
    const update = makeUpdate()
    const store = await useDownloadedUpdateStore(update)
    const executionStore = useExecutionStore()

    executionStore.applyExecutionEvent({
      runId: 'run-1',
      taskId: 'task-1',
      taskName: '测试事项',
      scope: 'task',
      status: 'started',
      totalActions: 1
    })

    await expect(store.installDownloadedUpdateAndRelaunch()).rejects.toThrow('当前有事项正在运行')

    executionStore.applyExecutionEvent({
      runId: 'run-1',
      taskId: 'task-1',
      taskName: '测试事项',
      scope: 'task',
      status: 'finished',
      totalActions: 1
    })
    executionStore.beginRuntimeInput()
    await expect(store.installDownloadedUpdateAndRelaunch()).rejects.toThrow('当前有运行变量输入窗口')
    executionStore.endRuntimeInput()

    executionStore.beginRiskConfirmation()
    await expect(store.installDownloadedUpdateAndRelaunch()).rejects.toThrow('当前有执行确认窗口')
    executionStore.endRiskConfirmation()

    expect(updaterApiMock.installUpdate).not.toHaveBeenCalled()
    expect(updaterApiMock.relaunchApp).not.toHaveBeenCalled()
  })

  it('installs downloaded update and relaunches when safe', async () => {
    const update = makeUpdate()
    const store = await useDownloadedUpdateStore(update)

    await store.installDownloadedUpdateAndRelaunch()

    expect(updaterApiMock.installUpdate).toHaveBeenCalledWith(update)
    expect(updaterApiMock.relaunchApp).toHaveBeenCalledTimes(1)
    expect(store.state).toBe('installing')
  })
})

function makeUpdate() {
  return {
    currentVersion: '0.3.0',
    version: '0.3.1',
    date: '2026-07-06T00:00:00Z',
    body: '更新说明',
    download: vi.fn(),
    install: vi.fn()
  }
}

function useDownloadedUpdateStore(update: ReturnType<typeof makeUpdate>) {
  const store = useUpdateStore()
  updaterApiMock.checkForUpdate.mockResolvedValue(update)
  updaterApiMock.downloadUpdate.mockResolvedValue(undefined)
  return store.checkForUpdate('manual')
    .then(() => store.downloadUpdate())
    .then(() => store)
}
