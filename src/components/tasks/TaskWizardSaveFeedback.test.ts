// @vitest-environment jsdom
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import ActionWizardPanel from '@/components/tasks/ActionWizardPanel.vue'
import TaskWizardDrawer from '@/components/tasks/TaskWizardDrawer.vue'
import type { CommandParams, TaskAction, TaskItem } from '@/types/domain'

const messageApi = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
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
  NCollapse: passThroughStub('NCollapse'),
  NCollapseItem: passThroughStub('NCollapseItem'),
  NButton: defineComponent({
    name: 'NButton',
    props: ['disabled'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  }),
  NForm: passThroughStub('NForm'),
  NGrid: passThroughStub('NGrid'),
  NGi: passThroughStub('NGi'),
  NFormItem: passThroughStub('NFormItem'),
  NInputGroup: passThroughStub('NInputGroup'),
  NInput: defineComponent({
    name: 'NInput',
    props: ['value'],
    emits: ['update:value'],
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
  }),
  NInputNumber: defineComponent({
    name: 'NInputNumber',
    props: ['value'],
    emits: ['update:value'],
    template: '<input :value="value" type="number" @input="$emit(\'update:value\', Number($event.target.value))" />'
  }),
  NSelect: defineComponent({
    name: 'NSelect',
    inheritAttrs: false,
    props: ['value', 'options'],
    emits: ['update:value'],
    template: '<select :value="value" @change="$emit(\'update:value\', $event.target.value)"><slot /></select>'
  }),
  NRadioGroup: defineComponent({
    name: 'NRadioGroup',
    props: ['value'],
    emits: ['update:value'],
    template: '<div><slot /></div>'
  }),
  NRadioButton: passThroughStub('NRadioButton'),
  NSwitch: defineComponent({
    name: 'NSwitch',
    props: ['value'],
    emits: ['update:value'],
    template: '<button type="button" @click="$emit(\'update:value\', !value)"><slot /></button>'
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

const taskWizardWithRealActionStubs = {
  ...naiveStubs,
  TaskWizardBasicStep: defineComponent({
    name: 'TaskWizardBasicStep',
    props: ['modelValue'],
    template: '<section class="basic-step">{{ modelValue?.name }}</section>'
  }),
  TaskWizardActionStep: defineComponent({
    name: 'TaskWizardActionStep',
    props: ['actions'],
    emits: ['create', 'edit', 'remove', 'move'],
    template: '<section class="action-step"><button type="button" class="edit-action" @click="$emit(\'edit\', actions[0])">编辑动作</button></section>'
  }),
  TaskWizardConfirmStep: defineComponent({
    name: 'TaskWizardConfirmStep',
    props: ['task'],
    template: '<section class="confirm-step">{{ task?.name }}</section>'
  })
}

const initialActionStubs = {
  ...taskWizardStubs,
  ActionWizardPanel: defineComponent({
    name: 'ActionWizardPanel',
    props: ['show', 'mode', 'action'],
    template: '<section v-if="show" class="initial-action-editor">{{ mode }}:{{ action?.id }}</section>'
  })
}

const mountedWrappers: VueWrapper[] = []

function trackWrapper<T extends VueWrapper>(wrapper: T) {
  mountedWrappers.push(wrapper)
  return wrapper
}

const missingActionSaveStubs = {
  ...taskWizardStubs,
  TaskWizardActionStep: defineComponent({
    name: 'TaskWizardActionStep',
    props: ['actions'],
    emits: ['edit'],
    template: '<section class="action-step"><button type="button" class="edit-action" @click="$emit(\'edit\', actions[0])">编辑动作</button></section>'
  }),
  ActionWizardPanel: defineComponent({
    name: 'ActionWizardPanel',
    props: ['show'],
    emits: ['save'],
    template: '<section v-if="show" class="action-wizard-stub"><button type="button" class="save-missing-action" @click="$emit(\'save\', { id: \'missing-action\', type: \'delay\', name: \'等待\', params: { durationMs: 1000 }, enabled: true, continueOnError: false, riskLevel: \'low\' })">保存缺失动作</button></section>'
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

async function pressKey(key: string, options: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))
  await nextTick()
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
      closeTerminalOnFinish: true,
      shell: 'powershell',
      scriptPath: '',
      scriptArgs: []
    },
    enabled: true,
    continueOnError: false,
    riskLevel: 'medium'
  }
}

function makeCommandAction(showTerminal = false): TaskAction {
  return {
    id: 'action-1',
    type: 'runCommand',
    name: '执行命令',
    params: {
      source: 'inline',
      command: 'yarn test',
      workingDir: 'D:\\Project\\anythingFast',
      env: {},
      showTerminal,
      closeTerminalOnFinish: true,
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
    messageApi.error.mockClear()
    messageApi.success.mockClear()
    messageApi.warning.mockClear()
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('shows a warning when saving an invalid action', async () => {
    const wrapper = trackWrapper(mount(ActionWizardPanel, {
      props: {
        show: false,
        mode: 'edit',
        action: makeInvalidCommandAction()
      },
      global: {
        stubs: actionWizardStubs
      }
    }))

    await wrapper.setProps({ show: true })
    await nextTick()
    await goToConfirmStep(wrapper)
    await findButton(wrapper, '保存动作').trigger('click')

    expect(messageApi.warning).toHaveBeenCalledWith('命令内容不能为空')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('shows a warning when saving an invalid task', async () => {
    const wrapper = trackWrapper(mount(TaskWizardDrawer, {
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
    }))

    await nextTick()
    await goToConfirmStep(wrapper)
    await findButton(wrapper, '保存').trigger('click')

    expect(messageApi.warning).toHaveBeenCalledWith('至少需要一个动作')
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('uses normal validation before save and run', async () => {
    const wrapper = trackWrapper(mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'create',
        task: makeTask([], 'task-invalid-run'),
        allTasks: [],
        saving: false
      },
      global: { stubs: taskWizardStubs }
    }))

    await nextTick()
    await goToConfirmStep(wrapper)
    await findButton(wrapper, '保存并运行').trigger('click')

    expect(messageApi.warning).toHaveBeenCalledWith('至少需要一个动作')
    expect(wrapper.emitted('save-and-run')).toBeUndefined()
  })

  it('emits save and run only in create mode and blocks submission while saving', async () => {
    const action: TaskAction = {
      id: 'action-save-run',
      type: 'delay',
      name: '等待',
      params: { durationMs: 1000 },
      enabled: true,
      riskLevel: 'low'
    }
    const createWrapper = trackWrapper(mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'create',
        task: makeTask([action], 'task-save-run'),
        allTasks: [],
        saving: false
      },
      global: { stubs: taskWizardStubs }
    }))

    await nextTick()
    await goToConfirmStep(createWrapper)
    await findButton(createWrapper, '保存并运行').trigger('click')
    expect(createWrapper.emitted('save-and-run')).toHaveLength(1)
    expect(createWrapper.emitted('save')).toBeUndefined()

    const editWrapper = trackWrapper(mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'edit',
        task: makeTask([action], 'task-edit'),
        allTasks: [],
        saving: false
      },
      global: { stubs: taskWizardStubs }
    }))
    await nextTick()
    await goToConfirmStep(editWrapper)
    expect(editWrapper.findAll('button').some((button) => button.text() === '保存并运行')).toBe(false)

    await createWrapper.setProps({ saving: true })
    const saveAndRunButton = findButton(createWrapper, '保存并运行')
    expect(saveAndRunButton.attributes('disabled')).toBeDefined()
    await saveAndRunButton.trigger('click')
    expect(createWrapper.emitted('save-and-run')).toHaveLength(1)
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
    const wrapper = trackWrapper(mount(TaskWizardDrawer, {
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
    }))

    await nextTick()
    await goToConfirmStep(wrapper)
    await findButton(wrapper, '保存').trigger('click')

    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.find('.confirm-step').text()).toContain('可保存事项')
  })

  it('saves an edited command action with terminal auto close disabled into the task draft', async () => {
    const wrapper = trackWrapper(mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'edit',
        task: makeTask([makeCommandAction()], 'task-command'),
        allTasks: [],
        saving: false
      },
      global: {
        stubs: taskWizardWithRealActionStubs
      }
    }))

    await nextTick()
    await findButton(wrapper, '下一步').trigger('click')
    await nextTick()
    await wrapper.find('.edit-action').trigger('click')
    await nextTick()

    const actionWizard = wrapper.findComponent(ActionWizardPanel)
    await findButton(actionWizard, '下一步').trigger('click')
    await nextTick()

    const switches = actionWizard.findAllComponents({ name: 'NSwitch' })
    expect(switches.length).toBeGreaterThanOrEqual(2)
    await switches[1].vm.$emit('update:value', true)
    await nextTick()

    const terminalSwitches = actionWizard.findAllComponents({ name: 'NSwitch' })
    expect(terminalSwitches.length).toBeGreaterThanOrEqual(3)
    await terminalSwitches[2].vm.$emit('update:value', false)
    await nextTick()

    await findButton(actionWizard, '下一步').trigger('click')
    await nextTick()
    await findButton(actionWizard, '保存动作').trigger('click')
    await nextTick()

    expect(messageApi.success).toHaveBeenCalledWith('已保存动作')
    expect(wrapper.findComponent(ActionWizardPanel).props('show')).toBe(false)

    await findButton(wrapper, '下一步').trigger('click')
    await nextTick()
    await findButton(wrapper, '保存').trigger('click')

    const savedTask = wrapper.emitted('save')?.[0]?.[0] as TaskItem
    const savedAction = savedTask.actions[0]
    expect((savedAction.params as CommandParams).showTerminal).toBe(true)
    expect((savedAction.params as CommandParams).closeTerminalOnFinish).toBe(false)
  })

  it('keeps the action drawer open and shows an error when the edited action no longer exists', async () => {
    const wrapper = trackWrapper(mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'edit',
        task: makeTask([makeCommandAction()], 'task-missing-action'),
        allTasks: [],
        saving: false
      },
      global: {
        stubs: missingActionSaveStubs
      }
    }))

    await nextTick()
    await findButton(wrapper, '下一步').trigger('click')
    await nextTick()
    await wrapper.find('.edit-action').trigger('click')
    await nextTick()
    await wrapper.find('.save-missing-action').trigger('click')
    await nextTick()

    expect(messageApi.error).toHaveBeenCalledWith('动作保存失败：事项草稿不存在或动作已被移除')
    expect(wrapper.find('.action-wizard-stub').exists()).toBe(true)
  })

  it('opens the exact requested action when initialized from an execution result', async () => {
    const actions: TaskAction[] = [
      { id: 'action-first', type: 'delay', name: '第一个', params: { durationMs: 1 }, enabled: true, riskLevel: 'low' },
      { id: 'action-target', type: 'delay', name: '目标动作', params: { durationMs: 2 }, enabled: true, riskLevel: 'low' }
    ]
    const wrapper = trackWrapper(mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'edit',
        task: makeTask(actions, 'task-initial-action'),
        allTasks: [],
        saving: false,
        initialStep: 2,
        initialActionId: 'action-target'
      },
      global: { stubs: initialActionStubs }
    }))

    await nextTick()

    expect(wrapper.get('.initial-action-editor').text()).toBe('edit:action-target')
    expect(messageApi.warning).not.toHaveBeenCalled()

    await wrapper.setProps({ show: false })
    await nextTick()
    await wrapper.setProps({ show: true })
    await nextTick()

    expect(wrapper.get('.initial-action-editor').text()).toBe('edit:action-target')
  })

  it('does not open an unrelated action when the requested draft action is stale', async () => {
    const wrapper = trackWrapper(mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'edit',
        task: makeTask([
          { id: 'action-existing', type: 'delay', name: '现有动作', params: { durationMs: 1 }, enabled: true, riskLevel: 'low' }
        ], 'task-stale-initial-action'),
        allTasks: [],
        saving: false,
        initialStep: 2,
        initialActionId: 'action-missing'
      },
      global: { stubs: initialActionStubs }
    }))

    await nextTick()

    expect(wrapper.find('.initial-action-editor').exists()).toBe(false)
    expect(messageApi.warning).toHaveBeenCalledWith('动作已不存在，无法打开编辑器')
  })

  it('supports task editor keyboard save, close, and step navigation', async () => {
    const wrapper = trackWrapper(mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'edit',
        task: makeTask([{ id: 'action-1', type: 'delay', name: '等待', params: { durationMs: 1000 }, enabled: true, continueOnError: false, riskLevel: 'low' }]),
        allTasks: [],
        saving: false
      },
      global: {
        stubs: taskWizardStubs
      }
    }))

    await pressKey('ArrowRight', { ctrlKey: true })
    expect(wrapper.find('.action-step').exists()).toBe(true)

    await pressKey('ArrowLeft', { ctrlKey: true })
    expect(wrapper.find('.basic-step').exists()).toBe(true)

    await pressKey('ArrowRight', { ctrlKey: true })
    await pressKey('ArrowRight', { ctrlKey: true })
    await pressKey('s', { ctrlKey: true })
    expect(wrapper.emitted('save')).toHaveLength(1)

    await pressKey('Escape')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('supports action editor keyboard save, close, and step navigation', async () => {
    const wrapper = trackWrapper(mount(ActionWizardPanel, {
      props: {
        show: false,
        mode: 'edit',
        action: { id: 'action-1', type: 'delay', name: '等待', params: { durationMs: 1000 }, enabled: true, continueOnError: false, riskLevel: 'low' }
      },
      global: {
        stubs: actionWizardStubs
      }
    }))
    await wrapper.setProps({ show: true })
    await nextTick()

    await pressKey('ArrowRight', { ctrlKey: true })
    await pressKey('ArrowLeft', { ctrlKey: true })
    await pressKey('ArrowRight', { ctrlKey: true })
    await pressKey('ArrowRight', { ctrlKey: true })
    await pressKey('s', { ctrlKey: true })
    expect(wrapper.emitted('save')).toHaveLength(1)

    await pressKey('Escape')
    expect(wrapper.emitted('update:show')?.at(-1)).toEqual([false])
  })

  it('lets the nested action editor handle Escape before the task editor', async () => {
    const wrapper = trackWrapper(mount(TaskWizardDrawer, {
      props: {
        show: true,
        mode: 'edit',
        task: makeTask([makeCommandAction()], 'task-nested-shortcuts'),
        allTasks: [],
        saving: false
      },
      global: {
        stubs: taskWizardWithRealActionStubs
      }
    }))

    await nextTick()
    await findButton(wrapper, '下一步').trigger('click')
    await nextTick()
    await wrapper.find('.edit-action').trigger('click')
    await nextTick()

    expect(wrapper.findComponent(ActionWizardPanel).props('show')).toBe(true)
    await pressKey('Escape')

    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.findComponent(ActionWizardPanel).props('show')).toBe(false)
  })
})
