import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { clonePlainDto } from '@/utils/clonePlainDto'
import type { TaskItem } from '@/types/domain'

describe('clonePlainDto', () => {
  it('clones Vue reactive DTO state without retaining references', () => {
    const draft = ref<TaskItem>({
      id: 'task-1',
      name: '启动项目',
      category: '开发',
      keywords: ['dev'],
      description: '',
      actions: [
        {
          id: 'action-1',
          type: 'runCommand',
          name: '启动服务',
          params: {
            command: 'yarn dev',
            workingDir: 'D:\\Project\\anythingFast',
            env: {
              NODE_ENV: 'development'
            },
            showTerminal: false,
            shell: 'powershell'
          },
          enabled: true,
          continueOnError: false,
          riskLevel: 'medium'
        }
      ],
      riskLevel: 'medium',
      enabled: true,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z'
    })

    expect(() => structuredClone(draft.value)).toThrow()

    const clone = clonePlainDto(draft.value)
    clone.name = '复制项目'
    clone.actions[0].name = '复制动作'

    expect(clone).toEqual({
      ...draft.value,
      name: '复制项目',
      actions: [
        {
          ...draft.value.actions[0],
          name: '复制动作'
        }
      ]
    })
    expect(draft.value.name).toBe('启动项目')
    expect(draft.value.actions[0].name).toBe('启动服务')
  })
})
