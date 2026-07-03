// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import ActionWizardPanel from '@/components/tasks/ActionWizardPanel.vue'
import TaskWizardDrawer from '@/components/tasks/TaskWizardDrawer.vue'
import type { TaskAction, TaskItem } from '@/types/domain'

const messageApi = vi.hoisted(() => ({
  warning: vi.fn()
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn()
}))

vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>()
  return {
    ...actual,
    useMessage: () => messageApi
  }
})

const passThroughStub = (name: string) =>
  defineComponent({
    name,
    template: '<div><slot /></div>'
  })

const naiveStubs = {
  NDrawer: defineComponent({
    name: 'NDrawer',
    props: ['show'],
    emits: ['update:show'],
    template: '<div v-if="show"><slot /></div>'
  }),
  NDrawerContent: defineComponent({
    name: 'NDrawerContent',
    template: '<section><slot /><footer><slot name="footer" /></footer></section>'
  }),
  NSteps: passThroughStub('NSteps'),
  NStep: passThroughStub('NStep'),
  NSpace: passThroughStub('NSpace'),
  NDescriptions: passThroughStub('NDescriptions'),
  NDescriptionsItem: passThroughStub('NDescriptionsItem'),
  NTag: passThroughStub('NTag'),
  NAlert: passThroughStub('NAlert'),
  NButton: defineComponent({
    name: 'NButton',
    props: ['disabled'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  })
}

const actionWizardStubs = {
  ...naiveStubs,
  ActionParamForm: passThroughStub('ActionParamForm')
}

const taskWizardStubs = {
  ...naiveStubs,
  ActionWizardPanel: passThroughStub('ActionWizardPanel'),
  TaskWizardBasicStep: defineComponent({
    name: 'TaskWizardBasicStep',
    props: ['modelValue'],
    template: '<section class="basic-step">{{ modelValue?.name }}</section>'
  }),
  TaskWizardActionStep: defineComponent({
    name: 'TaskWizardActionStep',
    props: ['actions'],
    template: '<section class="action-step">{{ actions?.length }}</section>'
  }),
  TaskWizardConfirmStep: defineComponent({
    name: 'TaskWizardConfirmStep',
    props: ['task'],
    template: '<section class="confirm-step">{{ task?.name }}</section>'
  })
}

function findButton(wrapper: VueWrapper, label: string) {
  const button = wrapper.findAll('button').find((item) => item.text().includes(label))
  if (!button) {
    throw new Error(`Button not found: ${label}`)
  }
  return button
}

async function goToConfirmStep(wrapper: VueWrapper) {
  await findButton(wrapper, '下一步').trigger('click')
  await nextTick()
  await findButton(wrapper, '下一步').trigger('click')
  await nextTick()
}

function makeInvalidCommandAction(): TaskAction {
  return {
    id: 'action-1',
    type: 'runCommand',
    name: '执行命令',
    params: {
      source: 'inline',
      command: '',
      workingDir: '',
      env: {},
      showTerminal: true,
      shell: 'powershell',
      scriptPath: '',
      scriptArgs: []
    },
    enabled: true,
    continueOnError: false,
    riskLevel: 'medium'
  }
}

function makeTask(actions: TaskAction[], id = 'task-1'): TaskItem {
  return {
    id,
    name: '可保存事项',
    category: '未分类',
    keywords: [],
    description: '',
    actions,
    riskLevel: 'low',
    enabled: true,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
}

describe('wizard save feedback', () => {
  beforeEach(() => {
    messageApi.warning.mockClear()
  })

  it('shows a warning when saving an invalid action', async () => {
    const wrapper = mount(ActionWizardPanel, {
      props: {
        show: false,
        mode: 'edit',
        action: makeInvalidCommandAction()
      },
      global: {
        stubs: actionWizardStubs
      }
    })

    await wrapper.setProps({ show: true })
    await nextTick()
    await goToConfirmStep(wrapper)
    await findButton(wrapper, '保存动作').trigger('click')

    expect(messageApi.warning).toHaveBeenCalledWith('命令内容不能为空')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('shows a warning when saving an invalid task', async () => {
    const wrapper = mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'edit',
        task: makeTask([], 'task-invalid'),
        allTasks: [],
        saving: false
      },
      global: {
        stubs: taskWizardStubs
      }
    })

    await nextTick()
    await goToConfirmStep(wrapper)
    await findButton(wrapper, '保存').trigger('click')

    expect(messageApi.warning).toHaveBeenCalledWith('至少需要一个动作')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('keeps the task draft after emitting save while the drawer remains open', async () => {
    const action: TaskAction = {
      id: 'action-1',
      type: 'delay',
      name: '等待',
      params: { durationMs: 1000 },
      enabled: true,
      continueOnError: false,
      riskLevel: 'low'
    }
    const wrapper = mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'edit',
        task: makeTask([action], 'task-valid'),
        allTasks: [],
        saving: false
      },
      global: {
        stubs: taskWizardStubs
      }
    })

    await nextTick()
    await goToConfirmStep(wrapper)
    await findButton(wrapper, '保存').trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.find('.confirm-step').text()).toContain('可保存事项')
  })
})
