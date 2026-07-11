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

  it('invokes path inspection command', async () => {
    invokeMock.mockResolvedValueOnce({
      input: 'D:\\Project',
      exists: true,
      kind: 'folder',
      normalizedPath: 'D:\\Project'
    })

    await expect(tauriApi.inspectPathInput('D:\\Project')).resolves.toEqual({
      input: 'D:\\Project',
      exists: true,
      kind: 'folder',
      normalizedPath: 'D:\\Project'
    })

    expect(invokeMock).toHaveBeenCalledWith('inspect_path_input', { input: 'D:\\Project' })
  })

  it('invokes the clipboard context command without arguments', async () => {
    invokeMock.mockResolvedValueOnce({
      source: 'clipboard',
      capturedAt: '2026-07-11T00:00:00.000Z',
      status: 'available',
      text: 'https://example.com',
      truncated: false
    })

    await expect(tauriApi.getClipboardContext()).resolves.toMatchObject({
      source: 'clipboard',
      status: 'available'
    })

    expect(invokeMock).toHaveBeenCalledWith('get_clipboard_context', undefined)
  })

  it('sanitizes clipboard path inspection errors without logging the path', async () => {
    const secretPath = 'D:\\sensitive\\accounting.xlsx'
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    invokeMock.mockRejectedValueOnce(new Error(`无法读取 ${secretPath}`))

    await expect(tauriApi.inspectClipboardPathInput(secretPath)).rejects.toThrow(secretPath)

    expect(consoleError).toHaveBeenCalledWith(
      '[anythingFast] Tauri command failed: inspect_path_input',
      expect.objectContaining({
        message: '剪贴板路径检查失败',
        extra: { source: 'clipboard', kind: 'path', textLength: secretPath.length }
      })
    )
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(secretPath)
  })

  it('invokes default working directory command', async () => {
    invokeMock.mockResolvedValueOnce('C:\\Users\\Administrator')

    await expect(tauriApi.getDefaultWorkingDir()).resolves.toBe('C:\\Users\\Administrator')

    expect(invokeMock).toHaveBeenCalledWith('get_default_working_dir', undefined)
  })
})
