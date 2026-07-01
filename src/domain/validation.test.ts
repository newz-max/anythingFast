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
})
