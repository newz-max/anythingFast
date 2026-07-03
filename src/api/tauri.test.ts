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
})
