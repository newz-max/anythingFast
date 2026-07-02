import { describe, expect, it } from 'vitest'
import { createDefaultConfig, normalizeConfig } from '@/domain/taskFactory'

describe('taskFactory config defaults', () => {
  it('uses dark theme by default', () => {
    expect(createDefaultConfig().settings.theme).toBe('dark')
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
  })
})
