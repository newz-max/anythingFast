import { describe, expect, it, vi } from 'vitest'
import { useWindowControls } from '@/composables/useWindowControls'

describe('useWindowControls', () => {
  it('does nothing outside Tauri', async () => {
    const win = makeWindow()
    const controller = useWindowControls({
      getCurrentWindow: () => win,
      isTauriRuntime: () => false
    })

    await controller.minimizeWindow()
    await controller.toggleMaximizeWindow()
    await controller.closeWindow()

    expect(win.minimize).not.toHaveBeenCalled()
    expect(win.toggleMaximize).not.toHaveBeenCalled()
    expect(win.close).not.toHaveBeenCalled()
  })

  it('delegates titlebar actions in Tauri', async () => {
    const win = makeWindow()
    const controller = useWindowControls({
      getCurrentWindow: () => win,
      isTauriRuntime: () => true
    })

    await controller.minimizeWindow()
    await controller.toggleMaximizeWindow()
    await controller.closeWindow()

    expect(win.minimize).toHaveBeenCalledTimes(1)
    expect(win.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(win.close).toHaveBeenCalledTimes(1)
  })
})

function makeWindow() {
  const win = {
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined)
  }
  return win
}
