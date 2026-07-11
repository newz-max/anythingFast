import { describe, expect, it } from 'vitest'
import {
  actionTypeOptions,
  createDefaultActionParams,
  describeActionByDefinition,
  getActionTypeLabel,
  inferActionRiskByDefinition,
  validateActionParamsByDefinition
} from '@/domain/actionTypes'
import type { ActionType, FieldIssue, TaskAction } from '@/types/domain'

const actionTypes: ActionType[] = ['openProgram', 'openUrl', 'openFile', 'openFolder', 'runCommand', 'delay', 'writeClipboard', 'readClipboard', 'showNotification', 'waitForPort']

function makeAction(type: ActionType, params = createDefaultActionParams(type)): TaskAction {
  return {
    id: `action-${type}`,
    type,
    name: getActionTypeLabel(type),
    params,
    enabled: true,
    timeoutMs: type === 'waitForPort' ? 60000 : null,
    riskLevel: 'low'
  }
}

describe('action type definitions', () => {
  it('registers every supported action type with stable labels and options', () => {
    expect(actionTypeOptions.map((option) => option.value)).toEqual(actionTypes)
    expect(actionTypeOptions.map((option) => option.label)).toEqual([
      '打开程序',
      '打开 URL',
      '打开文件',
      '打开文件夹',
      '执行命令',
      '延时等待',
      '写入剪贴板',
      '读取剪贴板',
      '系统通知',
      '等待端口'
    ])
    expect(actionTypeOptions.every((option) => option.description.length > 0)).toBe(true)
  })

  it('creates default params for every supported action type', () => {
    expect(createDefaultActionParams('openProgram')).toEqual({ path: '', args: [], workingDir: '' })
    expect(createDefaultActionParams('openUrl')).toEqual({ url: 'https://' })
    expect(createDefaultActionParams('openFile')).toEqual({ path: '' })
    expect(createDefaultActionParams('openFolder')).toEqual({ path: '' })
    expect(createDefaultActionParams('runCommand')).toEqual({
      source: 'inline',
      command: '',
      workingDir: '',
      env: {},
      showTerminal: false,
      closeTerminalOnFinish: true,
      terminalHost: 'systemTerminal',
      shell: 'pwsh',
      scriptPath: '',
      scriptArgs: []
    })
    expect(createDefaultActionParams('delay')).toEqual({ durationMs: 1000 })
    expect(createDefaultActionParams('writeClipboard')).toEqual({ text: '' })
    expect(createDefaultActionParams('readClipboard')).toEqual({ targetVariable: 'clipboardText' })
    expect(createDefaultActionParams('showNotification')).toEqual({ title: '', body: '' })
    expect(createDefaultActionParams('waitForPort')).toEqual({ host: '127.0.0.1', port: 3000 })
  })

  it('describes every supported action type from its definition', () => {
    expect(describeActionByDefinition(makeAction('openProgram', { path: 'C:\\Tools\\app.exe' }))).toBe('C:\\Tools\\app.exe')
    expect(describeActionByDefinition(makeAction('openUrl', { url: 'https://example.com' }))).toBe('https://example.com')
    expect(describeActionByDefinition(makeAction('openFile', { path: 'C:\\Temp\\a.txt' }))).toBe('C:\\Temp\\a.txt')
    expect(describeActionByDefinition(makeAction('openFolder', { path: 'C:\\Temp' }))).toBe('C:\\Temp')
    expect(
      describeActionByDefinition(
        makeAction('runCommand', {
          source: 'inline',
          command: 'yarn test',
          workingDir: 'D:\\Project\\anythingFast',
          shell: 'powershell',
          showTerminal: false
        })
      )
    ).toBe('yarn test · 后台运行')
    expect(describeActionByDefinition(makeAction('delay', { durationMs: 500 }))).toBe('等待 500 ms')
    expect(describeActionByDefinition(makeAction('writeClipboard', { text: 'sensitive value' }))).toBe('写入剪贴板文本')
    expect(describeActionByDefinition(makeAction('readClipboard', { targetVariable: 'clipboardText' }))).toBe('读取剪贴板到变量：clipboardText')
    expect(describeActionByDefinition(makeAction('showNotification', { title: 'sensitive value', body: 'hidden' }))).toBe('发送系统通知')
    expect(describeActionByDefinition(makeAction('waitForPort', { host: '127.0.0.1', port: 3000 }))).toBe('等待 127.0.0.1:3000')
  })

  it('validates action params through definitions', () => {
    const validActions = [
      makeAction('openProgram', { path: 'C:\\Tools\\app.exe' }),
      makeAction('openUrl', { url: 'https://example.com' }),
      makeAction('openFile', { path: 'C:\\Temp\\a.txt' }),
      makeAction('openFolder', { path: 'C:\\Temp' }),
      makeAction('runCommand', {
        source: 'inline',
        command: 'yarn test',
        workingDir: 'D:\\Project\\anythingFast',
        shell: 'powershell'
      }),
      makeAction('delay', { durationMs: 1000 }),
      makeAction('writeClipboard', { text: '{{message}}' }),
      makeAction('readClipboard', { targetVariable: 'clipboardText' }),
      makeAction('showNotification', { title: '{{title}}', body: '{{body}}' }),
      makeAction('waitForPort', { host: '{{host}}', port: 3000 })
    ]

    validActions.forEach((action) => {
      const issues: FieldIssue[] = []
      validateActionParamsByDefinition(action, issues)
      expect(issues).toEqual([])
    })
  })

  it('allows terminal default shell only for visible system terminal commands', () => {
    const issues: FieldIssue[] = []
    validateActionParamsByDefinition(
      makeAction('runCommand', {
        source: 'inline',
        command: 'Write-Output ok',
        workingDir: 'D:\\Project\\anythingFast',
        showTerminal: true,
        terminalHost: 'systemTerminal',
        shell: 'terminal'
      }),
      issues
    )
    expect(issues).toEqual([])

    const hiddenIssues: FieldIssue[] = []
    validateActionParamsByDefinition(
      makeAction('runCommand', {
        source: 'inline',
        command: 'Write-Output ok',
        workingDir: 'D:\\Project\\anythingFast',
        showTerminal: false,
        terminalHost: 'systemTerminal',
        shell: 'terminal'
      }),
      hiddenIssues
    )
    expect(hiddenIssues.map((issue) => issue.field)).toContain('shell')
  })

  it('keeps command risk inference in the action definition', () => {
    expect(
      inferActionRiskByDefinition(
        makeAction('runCommand', {
          source: 'inline',
          command: 'echo ok',
          workingDir: 'D:\\Project\\anythingFast',
          shell: 'powershell'
        })
      )
    ).toBe('medium')
    expect(
      inferActionRiskByDefinition(
        makeAction('runCommand', {
          source: 'inline',
          command: 'Remove-Item -Recurse dist',
          workingDir: 'D:\\Project\\anythingFast',
          shell: 'powershell'
        })
      )
    ).toBe('high')
    expect(
      inferActionRiskByDefinition(
        makeAction('runCommand', {
          source: 'script',
          command: '',
          workingDir: 'D:\\Project\\anythingFast',
          shell: 'powershell',
          scriptPath: 'D:\\Project\\anythingFast\\start.ps1'
        })
      )
    ).toBe('high')
    expect(inferActionRiskByDefinition(makeAction('readClipboard', { targetVariable: 'clipboardText' }))).toBe('high')
  })
})
