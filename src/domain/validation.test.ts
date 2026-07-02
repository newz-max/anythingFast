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
})
