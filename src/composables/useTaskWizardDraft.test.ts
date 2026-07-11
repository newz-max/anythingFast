import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { builtInTaskTemplates, createTaskFromTemplate } from '@/domain/taskTemplates'
import { useTaskWizardDraft, type TaskWizardMode } from '@/composables/useTaskWizardDraft'
import type { TaskItem } from '@/types/domain'

describe('useTaskWizardDraft', () => {
  it('preserves a supplied template draft in create mode', async () => {
    const sourceTask = ref(createTaskFromTemplate(builtInTaskTemplates[0]))
    const mode = ref<TaskWizardMode>('create')
    const allTasks = ref<TaskItem[]>([])
    const { draft, clearDraft } = useTaskWizardDraft({
      mode,
      sourceTask,
      allTasks
    })

    await nextTick()

    expect(draft.value).not.toBe(sourceTask.value)
    expect(draft.value).toMatchObject({
      id: sourceTask.value.id,
      name: '打开工作看板',
      triggers: [{ type: 'manual', enabled: true }]
    })
    expect(draft.value?.actions).toHaveLength(1)
    expect(draft.value?.actions[0].name).toBe('打开看板')

    draft.value!.name = '已编辑草稿'
    expect(sourceTask.value.name).toBe('打开工作看板')

    clearDraft()
  })
})
