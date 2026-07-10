import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock
}))

import { tauriApi } from './tauri'

describe('tauriApi', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    vi.restoreAllMocks()
  })

  it('logs failed invoke calls in development and rethrows a readable error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    invokeMock.mockRejectedValueOnce('配置读取失败')

    await expect(tauriApi.loadConfig()).rejects.toThrow('配置读取失败')

    expect(consoleError).toHaveBeenCalledWith(
      '[anythingFast] Tauri command failed: load_config',
      expect.objectContaining({
        message: '配置读取失败',
        error: '配置读取失败'
      })
    )
  })

  it('invokes the update proxy resolver command', async () => {
    invokeMock.mockResolvedValueOnce({
      proxyUrl: 'http://127.0.0.1:7890/',
      source: 'windowsUserProxy',
      status: 'resolved'
    })

    await expect(tauriApi.resolveUpdateProxy()).resolves.toEqual({
      proxyUrl: 'http://127.0.0.1:7890/',
      source: 'windowsUserProxy',
      status: 'resolved'
    })

    expect(invokeMock).toHaveBeenCalledWith('resolve_update_proxy', undefined)
  })

  it('invokes the main-window create-task command', async () => {
    invokeMock.mockResolvedValueOnce(undefined)

    await expect(tauriApi.openMainWindowCreateTask()).resolves.toBeUndefined()

    expect(invokeMock).toHaveBeenCalledWith('open_main_window_create_task', undefined)
  })
})
