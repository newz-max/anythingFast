// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import UpdateSettings from './UpdateSettings.vue'
import { useExecutionStore } from '@/stores/executionStore'
import { useUpdateStore } from '@/stores/updateStore'

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn()
}))
const dialogMock = vi.hoisted(() => ({
  warning: vi.fn()
}))
const updaterApiMock = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
  relaunchApp: vi.fn()
}))

vi.mock('naive-ui', () => ({
  useMessage: () => messageMock,
  useDialog: () => dialogMock
}))

vi.mock('@/api/updater', () => ({
  updaterApi: updaterApiMock
}))

vi.mock('@/api/events', () => ({
  listenExecutionEvents: vi.fn()
}))

vi.mock('@/api/tauri', () => ({
  tauriApi: {
    runTask: vi.fn(),
    runTaskAction: vi.fn(),
    loadExecutionLogs: vi.fn()
  }
}))

const NButtonStub = defineComponent({
  name: 'NButton',
  props: {
    disabled: Boolean
  },
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'
})

const stubs = {
  NButton: NButtonStub,
  NAlert: defineComponent({
    name: 'NAlert',
    template: '<div><slot /></div>'
  }),
  NProgress: defineComponent({
    name: 'NProgress',
    template: '<div />'
  })
}

describe('UpdateSettings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders available update metadata and plain-text release notes', async () => {
    updaterApiMock.checkForUpdate.mockResolvedValue(makeUpdate())
    const store = useUpdateStore()
    await store.checkForUpdate('manual')

    const wrapper = mount(UpdateSettings, { global: { stubs } })

    expect(wrapper.text()).toContain('发现新版本 0.3.1')
    expect(wrapper.text()).toContain('当前版本')
    expect(wrapper.text()).toContain('0.3.0')
    expect(wrapper.text()).toContain('更新说明')
    expect(wrapper.html()).not.toContain('<strong>更新说明</strong>')
  })

  it('downloads from the available state when the user clicks download', async () => {
    updaterApiMock.checkForUpdate.mockResolvedValue(makeUpdate())
    updaterApiMock.downloadUpdate.mockImplementation(async (_update, onEvent) => {
      onEvent({ event: 'Started', data: { contentLength: 50 } })
      onEvent({ event: 'Progress', data: { chunkLength: 50 } })
      onEvent({ event: 'Finished' })
    })
    const store = useUpdateStore()
    await store.checkForUpdate('manual')
    const wrapper = mount(UpdateSettings, { global: { stubs } })

    await wrapper.findAll('button')[1].trigger('click')
    await flushPromises()

    expect(updaterApiMock.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(store.state).toBe('downloaded')
    expect(messageMock.success).toHaveBeenCalledWith('更新已下载')
  })

  it('disables restart install while execution interaction is pending', async () => {
    updaterApiMock.checkForUpdate.mockResolvedValue(makeUpdate())
    updaterApiMock.downloadUpdate.mockResolvedValue(undefined)
    const updateStore = useUpdateStore()
    await updateStore.checkForUpdate('manual')
    await updateStore.downloadUpdate()
    useExecutionStore().beginRuntimeInput()

    const wrapper = mount(UpdateSettings, { global: { stubs } })
    const installButton = wrapper.findAll('button')[2]

    expect(wrapper.text()).toContain('当前有运行变量输入窗口')
    expect(installButton.attributes('disabled')).toBeDefined()
  })
})

function makeUpdate() {
  return {
    currentVersion: '0.3.0',
    version: '0.3.1',
    date: '2026-07-06T00:00:00Z',
    body: '<strong>更新说明</strong>',
    download: vi.fn(),
    install: vi.fn()
  }
}

function flushPromises() {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}
