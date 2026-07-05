// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import ActionParamForm from '@/components/tasks/ActionParamForm.vue'
import type { CommandParams, TaskAction } from '@/types/domain'

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn()
}))

const passThroughStub = (name: string) =>
  defineComponent({
    name,
    template: '<div><slot /></div>'
  })

const formStubs = {
  NForm: passThroughStub('NForm'),
  NGrid: passThroughStub('NGrid'),
  NGi: passThroughStub('NGi'),
  NFormItem: defineComponent({
    name: 'NFormItem',
    props: ['label'],
    template: '<div><span v-if="label">{{ label }}</span><slot /></div>'
  }),
  NAlert: passThroughStub('NAlert'),
  NInputGroup: passThroughStub('NInputGroup'),
  NCollapse: passThroughStub('NCollapse'),
  NCollapseItem: passThroughStub('NCollapseItem'),
  NRadioButton: passThroughStub('NRadioButton'),
  NButton: defineComponent({
    name: 'NButton',
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }),
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
  NSwitch: defineComponent({
    name: 'NSwitch',
    props: ['value'],
    emits: ['update:value'],
    template: '<button type="button" @click="$emit(\'update:value\', !value)"><slot /></button>'
  })
}

function makeCommandAction(): TaskAction {
  return {
    id: 'action-1',
    type: 'runCommand',
    name: '执行命令',
    params: {
      source: 'inline',
      command: 'yarn test',
      workingDir: 'D:\\Project\\anythingFast',
      env: {},
      showTerminal: false,
      closeTerminalOnFinish: true,
      terminalHost: 'systemTerminal',
      shell: 'powershell',
      scriptPath: '',
      scriptArgs: []
    },
    enabled: true,
    continueOnError: false,
    riskLevel: 'medium'
  }
}

describe('ActionParamForm', () => {
  it('emits a new action when toggling showTerminal', async () => {
    const sourceAction = makeCommandAction()

    const wrapper = mount(ActionParamForm, {
      props: {
        modelValue: sourceAction
      },
      global: {
        stubs: formStubs
      }
    })

    const switches = wrapper.findAllComponents({ name: 'NSwitch' })
    expect(switches.length).toBeGreaterThanOrEqual(2)

    await switches[1].vm.$emit('update:value', true)

    const updates = wrapper.emitted('update:modelValue')
    const updatedAction = updates?.at(-1)?.[0] as TaskAction
    expect(updatedAction).not.toBe(sourceAction)
    expect(updatedAction.params).not.toBe(sourceAction.params)
    expect((updatedAction.params as CommandParams).showTerminal).toBe(true)
    expect((updatedAction.params as CommandParams).shell).toBe('terminal')
  })

  it('shows and updates closeTerminalOnFinish only when terminal is shown', async () => {
    const hiddenTerminalAction = makeCommandAction()
    const wrapper = mount(ActionParamForm, {
      props: {
        modelValue: hiddenTerminalAction
      },
      global: {
        stubs: formStubs
      }
    })

    expect(wrapper.text()).not.toContain('成功后自动关闭')

    await wrapper.setProps({
      modelValue: {
        ...hiddenTerminalAction,
        params: {
          ...hiddenTerminalAction.params,
          showTerminal: true
        }
      }
    })

    expect(wrapper.text()).toContain('成功后自动关闭')

    const switches = wrapper.findAllComponents({ name: 'NSwitch' })
    expect(switches.length).toBeGreaterThanOrEqual(3)
    await switches[2].vm.$emit('update:value', false)

    const updates = wrapper.emitted('update:modelValue')
    const updatedAction = updates?.at(-1)?.[0] as TaskAction
    expect((updatedAction.params as CommandParams).closeTerminalOnFinish).toBe(false)
  })

  it('offers PowerShell 7 as a command shell option', () => {
    const wrapper = mount(ActionParamForm, {
      props: {
        modelValue: makeCommandAction()
      },
      global: {
        stubs: formStubs
      }
    })

    const selects = wrapper.findAllComponents({ name: 'NSelect' })
    const shellSelect = selects[1]

    expect(shellSelect.props('options')).toContainEqual({ label: 'PowerShell 7', value: 'pwsh' })
    expect(shellSelect.props('options')).toContainEqual({ label: '终端默认配置', value: 'terminal' })
  })

  it('shows command shell selection for script commands', () => {
    const wrapper = mount(ActionParamForm, {
      props: {
        modelValue: {
          ...makeCommandAction(),
          params: {
            ...makeCommandAction().params,
            source: 'script',
            command: '',
            scriptPath: 'D:\\Project\\anythingFast\\start.ps1'
          }
        }
      },
      global: {
        stubs: formStubs
      }
    })

    const selects = wrapper.findAllComponents({ name: 'NSelect' })
    const shellSelect = selects.find((select) => {
      const options = select.props('options') as Array<{ value: string }> | undefined
      return options?.some((option) => option.value === 'pwsh')
    })

    expect(shellSelect?.exists()).toBe(true)
    expect(shellSelect?.props('options')).toContainEqual({ label: 'PowerShell 7', value: 'pwsh' })
    expect(shellSelect?.props('options')).toContainEqual({ label: '终端默认配置', value: 'terminal' })
  })

  it('shows and updates terminal host only when terminal is shown', async () => {
    const hiddenTerminalAction = makeCommandAction()
    const wrapper = mount(ActionParamForm, {
      props: {
        modelValue: hiddenTerminalAction
      },
      global: {
        stubs: formStubs
      }
    })

    expect(wrapper.text()).not.toContain('终端宿主')

    await wrapper.setProps({
      modelValue: {
        ...hiddenTerminalAction,
        params: {
          ...hiddenTerminalAction.params,
          showTerminal: true
        }
      }
    })

    expect(wrapper.text()).toContain('终端宿主')

    const terminalHostSelect = wrapper.findAllComponents({ name: 'NSelect' }).find((select) => {
      const options = select.props('options') as Array<{ value: string }> | undefined
      return options?.some((option) => option.value === 'systemTerminal')
    })
    expect(terminalHostSelect?.props('options')).toContainEqual({ label: '系统终端', value: 'systemTerminal' })
    expect(terminalHostSelect?.props('options')).toContainEqual({ label: '直接启动 Shell', value: 'direct' })

    await terminalHostSelect?.vm.$emit('update:value', 'direct')

    const updates = wrapper.emitted('update:modelValue')
    const updatedAction = updates?.at(-1)?.[0] as TaskAction
    expect((updatedAction.params as CommandParams).terminalHost).toBe('direct')
  })

  it('explains command output logging behavior', () => {
    const wrapper = mount(ActionParamForm, {
      props: {
        modelValue: makeCommandAction()
      },
      global: {
        stubs: formStubs
      }
    })

    expect(wrapper.text()).toContain('显示终端窗口时会同步记录输出到执行日志')
    expect(wrapper.text()).toContain('交互式命令仍以终端窗口中的提示和输入为准')
  })

  it('updates command output bindings', async () => {
    const wrapper = mount(ActionParamForm, {
      props: {
        modelValue: makeCommandAction()
      },
      global: {
        stubs: formStubs
      }
    })

    const stdoutInput = wrapper
      .findAllComponents({ name: 'NFormItem' })
      .find((item) => item.text().includes('stdout 保存到变量'))
      ?.findComponent({ name: 'NInput' })

    expect(stdoutInput?.exists()).toBe(true)
    await stdoutInput?.vm.$emit('update:value', 'generatedPath')

    const updates = wrapper.emitted('update:modelValue')
    const updatedAction = updates?.at(-1)?.[0] as TaskAction
    expect(updatedAction.outputBinding?.stdoutVariable).toBe('generatedPath')
  })

  it('updates advanced action conditions', async () => {
    const wrapper = mount(ActionParamForm, {
      props: {
        modelValue: makeCommandAction(),
        variables: [{ key: 'projectDir', label: '项目目录', defaultValue: 'D:\\Project', required: false, secret: false }]
      },
      global: {
        stubs: formStubs
      }
    })

    const conditionSelect = wrapper.findAllComponents({ name: 'NSelect' }).find((select) => {
      const options = select.props('options') as Array<{ value: string }> | undefined
      return options?.some((option) => option.value === 'fileExists')
    })
    expect(conditionSelect?.exists()).toBe(true)
    await conditionSelect?.vm.$emit('update:value', 'fileExists')

    let updates = wrapper.emitted('update:modelValue')
    let updatedAction = updates?.at(-1)?.[0] as TaskAction
    expect(updatedAction.condition).toEqual({ type: 'fileExists', path: '' })

    await wrapper.setProps({ modelValue: updatedAction })
    const filePathInput = wrapper
      .findAllComponents({ name: 'NFormItem' })
      .find((item) => item.text().includes('文件路径'))
      ?.findComponent({ name: 'NInput' })

    await filePathInput?.vm.$emit('update:value', '{{projectDir}}\\input.txt')
    updates = wrapper.emitted('update:modelValue')
    updatedAction = updates?.at(-1)?.[0] as TaskAction
    expect(updatedAction.condition).toEqual({ type: 'fileExists', path: '{{projectDir}}\\input.txt' })
  })
})
