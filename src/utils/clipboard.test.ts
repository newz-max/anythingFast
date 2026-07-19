import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeClipboardText } from './clipboard'

describe('writeClipboardText', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('writes the exact user-requested text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    await writeClipboardText('已遮罩：***')

    expect(writeText).toHaveBeenCalledWith('已遮罩：***')
  })

  it('propagates clipboard write failures', async () => {
    const failure = new Error('clipboard unavailable')
    const writeText = vi.fn().mockRejectedValue(failure)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    await expect(writeClipboardText('诊断')).rejects.toBe(failure)
  })
})
