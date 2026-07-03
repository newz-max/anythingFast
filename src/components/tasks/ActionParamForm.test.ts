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
  NFormItem: passThroughStub('NFormItem'),
  NInputGroup: passThroughStub('NInputGroup'),
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
  })
})
