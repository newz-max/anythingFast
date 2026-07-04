import { describe, expect, it } from 'vitest'
import { validateActionLocal, validateTaskLocal } from '@/domain/validation'
import type { TaskAction, TaskItem } from '@/types/domain'

describe('validation', () => {
  it('requires task name and at least one action', () => {
    const task: TaskItem = {
      id: 'task-1',
      name: '',
      actions: [],
      riskLevel: 'low',
      enabled: true,
      favorite: false,
      tagIds: [],
      triggers: [{ type: 'manual', enabled: true }],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z'
    }

    const result = validateTaskLocal(task)

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toContain('name')
    expect(result.issues.map((issue) => issue.field)).toContain('actions')
  })

  it('marks dangerous commands as high risk', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'runCommand',
      name: 'delete',
      params: {
        command: 'Remove-Item -Recurse dist',
        workingDir: 'D:\\Project\\anythingFast',
        shell: 'powershell'
      },
      enabled: true,
      riskLevel: 'medium'
    }

    const result = validateActionLocal(action)

    expect(result.riskLevel).toBe('high')
  })

  it('validates script command parameters locally', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'runCommand',
      name: 'script',
      params: {
        source: 'script',
        command: '',
        workingDir: 'D:\\Project\\anythingFast',
        shell: 'powershell',
        scriptPath: 'D:\\Project\\anythingFast\\start.ps1',
        scriptArgs: ['dev']
      },
      enabled: true,
      riskLevel: 'medium'
    }

    const result = validateActionLocal(action)

    expect(result.valid).toBe(true)
    expect(result.riskLevel).toBe('high')
  })

  it('allows PowerShell 7 for script command parameters locally', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'runCommand',
      name: 'script',
      params: {
        source: 'script',
        command: '',
        workingDir: 'D:\\Project\\anythingFast',
        shell: 'pwsh',
        scriptPath: 'D:\\Project\\anythingFast\\start.ps1',
        scriptArgs: []
      },
      enabled: true,
      riskLevel: 'medium'
    }

    const result = validateActionLocal(action)

    expect(result.valid).toBe(true)
  })

  it('rejects unsupported command shells locally', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'runCommand',
      name: 'script',
      params: {
        source: 'script',
        command: '',
        workingDir: 'D:\\Project\\anythingFast',
        shell: 'bash' as never,
        scriptPath: 'D:\\Project\\anythingFast\\start.ps1',
        scriptArgs: []
      },
      enabled: true,
      riskLevel: 'medium'
    }

    const result = validateActionLocal(action)

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toContain('shell')
  })

  it('rejects cmd shell for PowerShell script files locally', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'runCommand',
      name: 'script',
      params: {
        source: 'script',
        command: '',
        workingDir: 'D:\\Project\\anythingFast',
        shell: 'cmd',
        scriptPath: 'D:\\Project\\anythingFast\\start.ps1',
        scriptArgs: []
      },
      enabled: true,
      riskLevel: 'medium'
    }

    const result = validateActionLocal(action)

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toContain('shell')
  })

  it('rejects unsupported script extensions locally', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'runCommand',
      name: 'script',
      params: {
        source: 'script',
        command: '',
        workingDir: 'D:\\Project\\anythingFast',
        shell: 'powershell',
        scriptPath: 'D:\\Project\\anythingFast\\start.txt',
        scriptArgs: []
      },
      enabled: true,
      riskLevel: 'medium'
    }

    const result = validateActionLocal(action)

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toContain('scriptPath')
  })

  it('allows missing delay duration locally', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'delay',
      name: 'wait',
      params: {},
      enabled: true,
      riskLevel: 'low'
    }

    const result = validateActionLocal(action)

    expect(result.valid).toBe(true)
  })

  it('rejects non-positive delay duration locally when provided', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'delay',
      name: 'wait',
      params: { durationMs: 0 },
      enabled: true,
      riskLevel: 'low'
    }

    const result = validateActionLocal(action)

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.field)).toContain('durationMs')
  })

  it('allows cleared optional timeout locally', () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'delay',
      name: 'wait',
      params: {},
      enabled: true,
      timeoutMs: null,
      riskLevel: 'low'
    }

    const result = validateActionLocal(action)

    expect(result.valid).toBe(true)
  })

  it('validates task variables and action references locally', () => {
    const task: TaskItem = {
      id: 'task-1',
      name: '变量事项',
      variables: [
        { key: 'projectDir', label: '项目目录', defaultValue: 'D:\\Project\\anythingFast', required: true, secret: false },
        { key: 'projectDir', label: '重复', defaultValue: '', required: false, secret: false }
      ],
      actions: [
        {
          id: 'action-1',
          type: 'openFolder',
          name: '打开目录',
          params: { path: '{{missingDir}}' },
          enabled: true,
          riskLevel: 'low'
        }
      ],
      riskLevel: 'low',
      enabled: true,
      favorite: false,
      tagIds: [],
      triggers: [{ type: 'manual', enabled: true }],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z'
    }

    const result = validateTaskLocal(task)

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.message)).toContain('变量 key 不能重复')
    expect(result.issues.map((issue) => issue.message)).toContain('引用了未定义变量：missingDir')
  })

  it('allows placeholders in URL and command working directory before backend resolution', () => {
    const task: TaskItem = {
      id: 'task-1',
      name: '变量事项',
      variables: [{ key: 'projectUrl', label: '项目地址', defaultValue: 'https://example.com', required: true, secret: false }],
      actions: [
        {
          id: 'action-1',
          type: 'openUrl',
          name: '打开地址',
          params: { url: '{{projectUrl}}' },
          enabled: true,
          riskLevel: 'low'
        }
      ],
      riskLevel: 'low',
      enabled: true,
      favorite: false,
      tagIds: [],
      triggers: [{ type: 'manual', enabled: true }],
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z'
    }

    const result = validateTaskLocal(task)

    expect(result.valid).toBe(true)
  })
})
