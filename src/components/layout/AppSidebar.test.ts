// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppSidebar from './AppSidebar.vue'
import type { TaskTag } from '@/types/domain'

const tags: Array<TaskTag & { tone: string }> = [
  { id: 'tag-1', name: '工作', tone: 'green' },
  { id: 'tag-2', name: '个人', tone: 'amber' }
]

function mountSidebar() {
  return mount(AppSidebar, {
    props: {
      logoUrl: '/logo.png',
      navigationItems: [
        { key: 'all', icon: '▣', label: '我的事项', count: 3, active: true, disabled: false },
        { key: 'favorites', icon: '☆', label: '收藏事项', count: 1, active: false, disabled: false },
        { key: 'recent', icon: '◷', label: '最近运行', count: 2, active: false, disabled: false },
        { key: 'templates', icon: '▱', label: '模板中心', count: 4, active: false, disabled: false }
      ],
      tags,
      selectedTagId: 'tag-1',
      shortcutWarning: '',
      theme: 'dark'
    }
  })
}

describe('AppSidebar', () => {
  it('renders navigation items and counts', () => {
    const wrapper = mountSidebar()

    expect(wrapper.text()).toContain('我的事项')
    expect(wrapper.text()).toContain('收藏事项')
    expect(wrapper.text()).toContain('最近运行')
    expect(wrapper.text()).toContain('模板中心')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('4')
  })

  it('emits create-task and set-view intents', async () => {
    const wrapper = mountSidebar()

    await wrapper.get('.create-button').trigger('click')
    await wrapper.findAll('.nav-item').find((button) => button.text().includes('收藏事项'))?.trigger('click')

    expect(wrapper.emitted('create-task')).toHaveLength(1)
    expect(wrapper.emitted('set-view')).toEqual([['favorites']])
  })

  it('emits tag selection and tag management intents', async () => {
    const wrapper = mountSidebar()

    await wrapper.findAll('.tag-item').find((button) => button.text().includes('全部标签'))?.trigger('click')
    await wrapper.findAll('.tag-item').find((button) => button.text().includes('个人'))?.trigger('click')
    await wrapper.get('button[aria-label="新增标签"]').trigger('click')
    await wrapper.findAll('button[aria-label="编辑标签"]')[0].trigger('click')
    await wrapper.findAll('button[aria-label="删除标签"]')[1].trigger('click')

    expect(wrapper.emitted('select-tag')).toEqual([[null], ['tag-2']])
    expect(wrapper.emitted('create-tag')).toHaveLength(1)
    expect(wrapper.emitted('rename-tag')).toEqual([[tags[0]]])
    expect(wrapper.emitted('delete-tag')).toEqual([[tags[1]]])
  })

  it('emits footer and promo actions', async () => {
    const wrapper = mountSidebar()

    await wrapper.get('button[aria-label="设置"]').trigger('click')
    await wrapper.get('button[aria-label="帮助"]').trigger('click')
    await wrapper.get('button[aria-label="主题"]').trigger('click')
    await wrapper.find('.promo-card button').trigger('click')

    expect(wrapper.emitted('open-settings')).toHaveLength(1)
    expect(wrapper.emitted('cycle-theme')).toHaveLength(1)
    expect(wrapper.emitted('open-help')).toHaveLength(2)
  })
})
