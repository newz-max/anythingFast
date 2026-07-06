import { computed, readonly, shallowRef } from 'vue'
import { tauriApi } from '@/api/tauri'
import {
  defaultKeybindings,
  disabledOverride,
  isKnownKeybindingCommand,
  keybindingWarningsForExternalShortcuts,
  normalizeKeybinding,
  overrideForKey,
  resolveEffectiveKeybindings,
  validateKeybindingOverrides,
  type KeybindingCommand
} from '@/domain/keybindings'
import { getErrorMessage, logDevError } from '@/utils/errors'
import type { KeybindingOverride } from '@/types/domain'

const STORAGE_KEY = 'anything-fast-keybindings'
const isTauri = () => Boolean('__TAURI_INTERNALS__' in window)

const overrides = shallowRef<KeybindingOverride[]>([])
const warning = shallowRef('')
const path = shallowRef('')
const loading = shallowRef(false)
const saving = shallowRef(false)
const loaded = shallowRef(false)

const effective = computed(() => resolveEffectiveKeybindings(overrides.value))
const validationIssues = computed(() => validateKeybindingOverrides(overrides.value))
const unknownOverrideCount = computed(() => overrides.value.filter((override) => !isKnownKeybindingCommand(override.command)).length)
const statusWarning = computed(() => {
  if (warning.value) return warning.value
  if (unknownOverrideCount.value > 0) return `包含 ${unknownOverrideCount.value} 个未知快捷键命令，已忽略`
  return ''
})

export function useKeybindings() {
  async function loadKeybindings() {
    if (loading.value) return
    loading.value = true
    try {
      if (isTauri()) {
        const result = await tauriApi.loadKeybindings()
        overrides.value = result.overrides
        warning.value = result.warning || ''
        path.value = result.path
      } else {
        const raw = localStorage.getItem(STORAGE_KEY)
        overrides.value = raw ? (JSON.parse(raw) as KeybindingOverride[]) : []
        warning.value = ''
        path.value = 'localStorage:anything-fast-keybindings'
      }
      loaded.value = true
    } catch (err) {
      overrides.value = []
      warning.value = getErrorMessage(err)
      logDevError('Load keybindings failed', err)
    } finally {
      loading.value = false
    }
  }

  async function saveOverrides(nextOverrides: KeybindingOverride[]) {
    const issues = validateKeybindingOverrides(nextOverrides)
    if (issues.length > 0) {
      throw new Error(issues[0].message)
    }

    const normalized = normalizeOverrides(nextOverrides)
    saving.value = true
    try {
      if (isTauri()) {
        const result = await tauriApi.saveKeybindings(normalized)
        overrides.value = result.overrides
        warning.value = result.warning || ''
        path.value = result.path
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized, null, 2))
        overrides.value = normalized
        warning.value = ''
      }
      loaded.value = true
    } catch (err) {
      logDevError('Save keybindings failed', err, { nextOverrides: normalized })
      throw err
    } finally {
      saving.value = false
    }
  }

  async function setCommandKey(command: KeybindingCommand, key: string) {
    const override = overrideForKey(command, key)
    const next = overrides.value.filter((item) => item.command !== command)
    await saveOverrides(override ? [...next, override] : next)
  }

  async function disableCommand(command: KeybindingCommand) {
    const next = overrides.value.filter((item) => item.command !== command)
    await saveOverrides([...next, disabledOverride(command)])
  }

  async function resetCommand(command: KeybindingCommand) {
    await saveOverrides(overrides.value.filter((item) => item.command !== command))
  }

  async function resetAll() {
    saving.value = true
    try {
      if (isTauri()) {
        const result = await tauriApi.resetKeybindings()
        overrides.value = result.overrides
        warning.value = result.warning || ''
        path.value = result.path
      } else {
        localStorage.removeItem(STORAGE_KEY)
        overrides.value = []
        warning.value = ''
      }
      loaded.value = true
    } finally {
      saving.value = false
    }
  }

  async function openFile() {
    if (isTauri()) {
      await tauriApi.openKeybindingsFile()
    }
  }

  function externalWarnings(externalShortcuts: string[]) {
    return keybindingWarningsForExternalShortcuts(effective.value, externalShortcuts)
  }

  return {
    definitions: defaultKeybindings,
    overrides: readonly(overrides),
    effective,
    validationIssues,
    warning: statusWarning,
    path: readonly(path),
    loading: readonly(loading),
    saving: readonly(saving),
    loaded: readonly(loaded),
    loadKeybindings,
    saveOverrides,
    setCommandKey,
    disableCommand,
    resetCommand,
    resetAll,
    openFile,
    externalWarnings
  }
}

function normalizeOverrides(nextOverrides: KeybindingOverride[]) {
  return nextOverrides
    .map((override) => {
      const key = normalizeKeybinding(override.key || '')
      return {
        command: override.command,
        ...(override.disabled ? { disabled: true } : {}),
        ...(!override.disabled && key ? { key } : {})
      }
    })
    .filter((override) => isKnownKeybindingCommand(override.command) && (override.disabled || override.key))
}
