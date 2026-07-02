import { describe, expect, it } from 'vitest'
import { searchTasks } from '@/domain/search'
import type { ActionType, TaskAction, TaskItem } from '@/types/domain'

describe('searchTasks', () => {
  it('matches name keywords and prioritizes enabled tasks', () => {
    const tasks: TaskItem[] = [
      makeTask('1', '启动项目', false, ['dev']),
      makeTask('2', '开始写作', true, ['obsidian']),
      makeTask('3', '开发 anythingFast', true, ['dev', 'af'])
    ]

    const results = searchTasks(tasks, 'dev', '全部')

    expect(results.map((task) => task.id)).toEqual(['3', '1'])
  })

  it('matches url action entries', () => {
    const tasks: TaskItem[] = [
      makeTask('1', '打开文档', true, [], [makeAction('openUrl', { url: 'https://docs.example.com/guide' })]),
      makeTask('2', '打开控制台', true, [], [makeAction('openUrl', { url: 'https://console.example.com' })])
    ]

    const results = searchTasks(tasks, 'docs.example', '全部')

    expect(results.map((task) => task.id)).toEqual(['1'])
  })

  it('matches program file and folder paths', () => {
    const tasks: TaskItem[] = [
      makeTask('1', '启动编辑器', true, [], [makeAction('openProgram', { path: 'C:\\Tools\\Code\\Code.exe', args: [], workingDir: '' })]),
      makeTask('2', '打开报表', true, [], [makeAction('openFile', { path: 'D:\\Reports\\weekly.xlsx' })]),
      makeTask('3', '打开素材库', true, [], [makeAction('openFolder', { path: 'E:\\Assets\\Icons' })])
    ]

    expect(searchTasks(tasks, 'code.exe', '全部').map((task) => task.id)).toEqual(['1'])
    expect(searchTasks(tasks, 'weekly.xlsx', '全部').map((task) => task.id)).toEqual(['2'])
    expect(searchTasks(tasks, 'assets', '全部').map((task) => task.id)).toEqual(['3'])
  })

  it('matches command text script path and action names', () => {
    const tasks: TaskItem[] = [
      makeTask('1', '运行构建', true, [], [makeAction('runCommand', { source: 'inline', command: 'yarn build', workingDir: '', env: {}, showTerminal: false, shell: 'powershell', scriptPath: '', scriptArgs: [] }, '前端构建')]),
      makeTask('2', '同步数据', true, [], [makeAction('runCommand', { source: 'script', command: '', workingDir: '', env: {}, showTerminal: false, shell: 'powershell', scriptPath: 'D:\\Scripts\\sync-data.ps1', scriptArgs: [] })])
    ]

    expect(searchTasks(tasks, 'yarn build', '全部').map((task) => task.id)).toEqual(['1'])
    expect(searchTasks(tasks, 'sync-data.ps1', '全部').map((task) => task.id)).toEqual(['2'])
    expect(searchTasks(tasks, '前端构建', '全部').map((task) => task.id)).toEqual(['1'])
  })

  it('keeps category filtering and recent task ordering', () => {
    const tasks: TaskItem[] = [
      { ...makeTask('1', '打开控制台', true, ['ops']), category: '工作', lastRunAt: '2026-07-01T09:00:00.000Z' },
      { ...makeTask('2', '打开控制台', true, ['ops']), category: '学习', lastRunAt: '2026-07-02T09:00:00.000Z' },
      { ...makeTask('3', '打开控制台', true, ['ops']), category: '工作', lastRunAt: '2026-07-03T09:00:00.000Z' }
    ]

    const results = searchTasks(tasks, 'ops', '工作')

    expect(results.map((task) => task.id)).toEqual(['3', '1'])
  })
})

function makeTask(id: string, name: string, enabled: boolean, keywords: string[], actions: TaskAction[] = []): TaskItem {
  return {
    id,
    name,
    category: '开发',
    keywords,
    description: '',
    actions,
    riskLevel: 'low',
    enabled,
    favorite: false,
    tagIds: [],
    triggers: [{ type: 'manual', enabled: true }],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z'
  }
}

function makeAction(type: ActionType, params: TaskAction['params'], name?: string): TaskAction {
  return {
    id: `action-${crypto.randomUUID()}`,
    type,
    name,
    params,
    enabled: true,
    riskLevel: 'low'
  }
}
