import { describe, expect, it } from 'vitest'
import { builtInTaskTemplates, createTaskFromTemplate } from '@/domain/taskTemplates'

describe('task templates', () => {
  it('creates an editable task draft from a built-in template', () => {
    const template = builtInTaskTemplates[0]
    const task = createTaskFromTemplate(template)

    expect(task.id).toMatch(/^task-/)
    expect(task.name).toBe(template.name)
    expect(task.actions).toHaveLength(template.actions.length)
    expect(task.actions[0].id).toMatch(/^action-/)
    expect(task.enabled).toBe(true)
    expect(task.favorite).toBe(false)
  })
})
