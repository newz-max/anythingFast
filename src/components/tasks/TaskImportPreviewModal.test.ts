import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TaskImportPreviewModal from '@/components/tasks/TaskImportPreviewModal.vue'
import type { ImportPreview } from '@/types/domain'

const stubs = {
  NModal: {
    props: ['show'],
    template: '<section v-if="show"><slot /><footer><slot name="footer" /></footer></section>'
  },
  NAlert: { template: '<aside><slot /></aside>' },
  NTag: { template: '<span><slot /></span>' },
  NEmpty: { props: ['description'], template: '<div>{{ description }}</div>' },
  NButton: {
    props: ['disabled'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  }
}

describe('TaskImportPreviewModal', () => {
  it('renders import preview risk, conflicts, and missing path warnings', () => {
    const preview: ImportPreview = {
      schemaVersion: 1,
      validTaskCount: 1,
      templateCount: 1,
      totalActionCount: 2,
      riskSummary: { low: 1, medium: 0, high: 1, commandActions: 1 },
      conflictSummary: { taskIdsRegenerated: 1, actionIdsRegenerated: 0, templateIdsRegenerated: 1 },
      pathHints: [
        {
          ownerId: 'task-a',
          ownerName: '导入事项',
          actionName: '执行命令',
          field: 'workingDir',
          path: 'Z:\\missing',
          exists: false,
          message: '当前机器上未找到该路径'
        }
      ],
      tasks: [
        {
          id: 'task-new',
          originalId: 'task-a',
          name: '导入事项',
          actionTypes: ['runCommand'],
          actionCount: 1,
          riskLevel: 'high',
          commandActionCount: 1
        }
      ],
      templates: [
        {
          id: 'template-new',
          originalId: 'template-a',
          name: '导入模板',
          category: '工作',
          keywords: ['work'],
          actionTypes: ['openUrl'],
          actionCount: 1,
          riskLevel: 'low',
          commandActionCount: 0
        }
      ]
    }

    const wrapper = mount(TaskImportPreviewModal, {
      props: { show: true, preview, confirming: false },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('导入事项')
    expect(wrapper.text()).toContain('导入模板')
    expect(wrapper.text()).toContain('高风险')
    expect(wrapper.text()).toContain('已重生成 1 个事项 ID')
    expect(wrapper.text()).toContain('Z:\\missing')
  })
})
