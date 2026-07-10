// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  defaultKeybindings,
  eventMatchesKeybinding,
  keybindingMatchesCommand,
  normalizeKeybinding,
  resolveEffectiveKeybindings,
  validateKeybindingOverrides
} from './keybindings'

function keyEvent(key: string, options: KeyboardEventInit = {}) {
  return new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
}

describe('keybindings domain', () => {
  it('normalizes common keybinding strings', () => {
    expect(normalizeKeybinding('ctrl+enter')).toBe('Ctrl+Enter')
    expect(normalizeKeybinding('Alt+f')).toBe('Alt+F')
    expect(normalizeKeybinding('esc')).toBe('Escape')
    expect(normalizeKeybinding('`')).toBe('Backquote')
    expect(normalizeKeybinding('Ctrl+')).toBe('')
  })

  it('matches keyboard events against normalized shortcuts', () => {
    expect(eventMatchesKeybinding(keyEvent('Enter', { ctrlKey: true }), 'Ctrl+Enter')).toBe(true)
    expect(eventMatchesKeybinding(keyEvent('Enter', { metaKey: true }), 'Ctrl+Enter')).toBe(true)
    expect(eventMatchesKeybinding(keyEvent('f', { altKey: true }), 'Alt+F')).toBe(true)
    expect(eventMatchesKeybinding(keyEvent('`', { ctrlKey: true, code: 'Backquote' }), 'Ctrl+Backquote')).toBe(true)
    expect(eventMatchesKeybinding(keyEvent('f'), 'Alt+F')).toBe(false)
  })

  it('resolves overrides and disabled commands over defaults', () => {
    const effective = resolveEffectiveKeybindings([
      { command: 'main.runSelectedTask', key: 'Alt+R' },
      { command: 'main.addAction', disabled: true }
    ])

    expect(keybindingMatchesCommand(keyEvent('r', { altKey: true }), 'main.runSelectedTask', effective)).toBe(true)
    expect(keybindingMatchesCommand(keyEvent('Enter', { ctrlKey: true }), 'main.runSelectedTask', effective)).toBe(false)
    expect(keybindingMatchesCommand(keyEvent('a'), 'main.addAction', effective)).toBe(false)
  })

  it('configures quick search task creation independently from the main window command', () => {
    const defaults = resolveEffectiveKeybindings([])
    const defaultCreate = defaults.find((item) => item.command === 'quick.createTask')

    expect(defaultCreate).toMatchObject({
      scope: 'quick-search',
      defaultKey: 'Ctrl+N',
      key: 'Ctrl+N',
      enabled: true
    })
    expect(defaultKeybindings.some((item) => item.command === 'main.createTask' && item.defaultKey === 'Ctrl+N')).toBe(true)
    expect(validateKeybindingOverrides([{ command: 'quick.createTask', key: 'Ctrl+N' }])).toHaveLength(0)

    const customized = resolveEffectiveKeybindings([{ command: 'quick.createTask', key: 'Alt+N' }])
    expect(keybindingMatchesCommand(keyEvent('n', { altKey: true }), 'quick.createTask', customized)).toBe(true)

    const disabled = resolveEffectiveKeybindings([{ command: 'quick.createTask', disabled: true }])
    expect(keybindingMatchesCommand(keyEvent('n', { ctrlKey: true }), 'quick.createTask', disabled)).toBe(false)
  })

  it('validates malformed keys and same-scope conflicts while allowing cross-scope reuse', () => {
    expect(validateKeybindingOverrides([{ command: 'main.focusSearch', key: 'Ctrl+' }])).toEqual([
      expect.objectContaining({ field: 'key' })
    ])

    const conflicts = validateKeybindingOverrides([{ command: 'main.focusSearch', key: 'F' }])
    expect(conflicts.some((issue) => issue.message.includes('冲突'))).toBe(true)

    expect(validateKeybindingOverrides([{ command: 'quick.focusSearch', key: 'F' }])).toHaveLength(0)
  })
})
