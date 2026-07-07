import { beforeEach, describe, expect, it, vi } from 'vitest'

const checkMock = vi.hoisted(() => vi.fn())
const relaunchMock = vi.hoisted(() => vi.fn())
const tauriApiMock = vi.hoisted(() => ({
  resolveUpdateProxy: vi.fn()
}))
const assertTauriRuntimeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: checkMock
}))

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: relaunchMock
}))

vi.mock('@/api/tauri', () => ({
  tauriApi: tauriApiMock
}))

vi.mock('@/utils/tauriRuntime', () => ({
  assertTauriRuntime: assertTauriRuntimeMock
}))

import { updaterApi } from './updater'
import type { AppUpdate } from './updater'

describe('updaterApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('passes the resolved system proxy to update checks and matching downloads', async () => {
    const update = makeUpdate()
    const onEvent = vi.fn()
    tauriApiMock.resolveUpdateProxy.mockResolvedValue({
      proxyUrl: 'http://127.0.0.1:7890/',
      source: 'windowsUserProxy',
      status: 'resolved'
    })
    checkMock.mockResolvedValue(update)

    await expect(updaterApi.checkForUpdate()).resolves.toBe(update)
    await updaterApi.downloadUpdate(update, onEvent)

    expect(checkMock).toHaveBeenCalledWith({ proxy: 'http://127.0.0.1:7890/' })
    expect(update.download).toHaveBeenCalledWith(onEvent, { proxy: 'http://127.0.0.1:7890/' })
  })

  it('omits updater proxy options when no supported proxy is resolved', async () => {
    const update = makeUpdate()
    const onEvent = vi.fn()
    tauriApiMock.resolveUpdateProxy.mockResolvedValue({
      proxyUrl: null,
      source: 'windowsUserProxy',
      status: 'disabled'
    })
    checkMock.mockResolvedValue(update)

    await updaterApi.checkForUpdate()
    await updaterApi.downloadUpdate(update, onEvent)

    expect(checkMock).toHaveBeenCalledWith(undefined)
    expect(update.download).toHaveBeenCalledWith(onEvent, undefined)
  })

  it('falls back to direct update checks when proxy resolution fails', async () => {
    const update = makeUpdate()
    tauriApiMock.resolveUpdateProxy.mockRejectedValue(new Error('registry unavailable'))
    checkMock.mockResolvedValue(update)

    await expect(updaterApi.checkForUpdate()).resolves.toBe(update)

    expect(checkMock).toHaveBeenCalledWith(undefined)
  })
})

function makeUpdate() {
  const update = {
    currentVersion: '0.5.0',
    version: '0.5.1',
    date: '2026-07-07T00:00:00Z',
    body: '更新说明',
    download: vi.fn(),
    install: vi.fn()
  }
  return update as typeof update & AppUpdate
}
