// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import ScheduleTriggerCard from '@/components/tasks/ScheduleTriggerCard.vue'
import type { ScheduleTaskTrigger } from '@/types/domain'

const passThroughStub = (name: string) =>
  defineComponent({
    name,
    template: '<div><slot /></div>'
  })

const stubs = {
  NSpace: passThroughStub('NSpace'),
  NButton: defineComponent({
    name: 'NButton',
    props: ['disabled'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
  }),
  NInput: defineComponent({
    name: 'NInput',
    inheritAttrs: false,
    props: ['value'],
    emits: ['update:value'],
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
  }),
  NInputNumber: defineComponent({
    name: 'NInputNumber',
    inheritAttrs: false,
    props: ['value'],
    emits: ['update:value'],
    template: '<input :value="value" type="number" @input="$emit(\'update:value\', Number($event.target.value))" />'
  }),
  NSelect: defineComponent({
    name: 'NSelect',
    props: ['value', 'options'],
    emits: ['update:value'],
    template: '<select :value="value" @change="$emit(\'update:value\', $event.target.value)"></select>'
  }),
  NSwitch: defineComponent({
    name: 'NSwitch',
    props: ['value'],
    emits: ['update:value'],
    template: '<button type="button" @click="$emit(\'update:value\', !value)"><slot /></button>'
  }),
  NCheckboxGroup: passThroughStub('NCheckboxGroup'),
  NCheckbox: defineComponent({
    name: 'NCheckbox',
    props: ['value'],
    template: '<label><slot /></label>'
  })
}

describe('ScheduleTriggerCard', () => {
  it('emits a normalized schedule with nextRunAt when saved', async () => {
    const trigger: ScheduleTaskTrigger = {
      type: 'schedule',
      enabled: true,
      mode: 'daily',
      timeOfDay: ' 09:00 ',
      intervalMinutes: 60,
      weekdays: [],
      misfirePolicy: 'skip',
      preventOverlap: true
    }
    const wrapper = mount(ScheduleTriggerCard, {
      props: { trigger },
      global: { stubs }
    })

    await wrapper.findComponent({ name: 'NButton' }).vm.$emit('click')

    const saved = wrapper.emitted('save')?.[0]?.[0] as ScheduleTaskTrigger
    expect(saved).toMatchObject({
      type: 'schedule',
      enabled: true,
      mode: 'daily',
      timeOfDay: '09:00',
      misfirePolicy: 'skip',
      preventOverlap: true
    })
    expect(saved.nextRunAt).toBeTruthy()
  })

  it('surfaces invalid schedule settings before save', async () => {
    const trigger: ScheduleTaskTrigger = {
      type: 'schedule',
      enabled: true,
      mode: 'weekly',
      timeOfDay: '25:00',
      intervalMinutes: 60,
      weekdays: [],
      misfirePolicy: 'skip',
      preventOverlap: true
    }
    const wrapper = mount(ScheduleTriggerCard, {
      props: { trigger },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('执行时间必须是 HH:mm 格式')
    await wrapper.findComponent({ name: 'NButton' }).vm.$emit('click')
    expect(wrapper.emitted('save')).toBeUndefined()
  })
})
