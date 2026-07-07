// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import TaskTriggerSettings from '@/components/tasks/TaskTriggerSettings.vue'
import type { ScheduleTaskTrigger, ShortcutTaskTrigger } from '@/types/domain'

const scheduleTrigger: ScheduleTaskTrigger = {
  type: 'schedule',
  enabled: true,
  mode: 'daily',
  timeOfDay: '09:00',
  intervalMinutes: 60,
  weekdays: [],
  misfirePolicy: 'skip',
  preventOverlap: true
}

const shortcutTrigger: ShortcutTaskTrigger = {
  type: 'shortcut',
  enabled: true,
  shortcut: 'Ctrl+Alt+P'
}

const stubs = {
  NInputGroup: defineComponent({
    name: 'NInputGroup',
    template: '<div><slot /></div>'
  }),
  NInput: defineComponent({
    name: 'NInput',
    inheritAttrs: false,
    props: ['value'],
    emits: ['update:value'],
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />'
  }),
  NButton: defineComponent({
    name: 'NButton',
    emits: ['click'],
    template: '<button type="button" @click="$emit(\'click\')"><slot /></button>'
  }),
  ScheduleTriggerCard: defineComponent({
    name: 'ScheduleTriggerCard',
    props: ['trigger'],
    emits: ['save', 'remove'],
    template: `
      <section class="schedule-stub">
        <button type="button" class="save-schedule" @click="$emit('save', trigger)">保存计划</button>
        <button type="button" class="remove-schedule" @click="$emit('remove')">移除计划</button>
      </section>
    `
  })
}

describe('TaskTriggerSettings', () => {
  it('renders shortcut state and emits shortcut draft updates', async () => {
    const wrapper = mount(TaskTriggerSettings, {
      props: {
        shortcutTrigger,
        scheduleTrigger,
        shortcutDraft: 'Ctrl+Alt+P'
      },
      global: { stubs }
    })

    expect(wrapper.text()).toContain('手动触发')
    expect(wrapper.text()).toContain('事项快捷键')
    expect(wrapper.text()).toContain('Ctrl+Alt+P')

    await wrapper.find('input').setValue('Ctrl+Shift+K')

    expect(wrapper.emitted('update:shortcutDraft')).toEqual([['Ctrl+Shift+K']])
  })

  it('forwards shortcut save and clear intents', async () => {
    const wrapper = mount(TaskTriggerSettings, {
      props: {
        shortcutTrigger,
        scheduleTrigger,
        shortcutDraft: 'Ctrl+Alt+P'
      },
      global: { stubs }
    })

    const buttons = wrapper.findAll('button')
    await buttons.find((button) => button.text() === '保存')?.trigger('click')
    await buttons.find((button) => button.text() === '移除')?.trigger('click')

    expect(wrapper.emitted('save-shortcut')).toHaveLength(1)
    expect(wrapper.emitted('clear-shortcut')).toHaveLength(1)
  })

  it('forwards schedule save and remove intents', async () => {
    const wrapper = mount(TaskTriggerSettings, {
      props: {
        shortcutTrigger: null,
        scheduleTrigger,
        shortcutDraft: ''
      },
      global: { stubs }
    })

    await wrapper.find('.save-schedule').trigger('click')
    await wrapper.find('.remove-schedule').trigger('click')

    expect(wrapper.emitted('save-schedule')).toEqual([[scheduleTrigger]])
    expect(wrapper.emitted('clear-schedule')).toHaveLength(1)
  })
})
