import { describe, expect, it } from 'vitest'
import {
  createQuickTaskFromIntent,
  defaultQuickTaskName,
  parseQuickInputIntent,
  parseQuickInputTokens,
  quickIntentActionLabel,
  withQuickPathInspection
} from '@/domain/quickInput'
import type { CommandParams, PathParams } from '@/types/domain'

describe('quickInput parsing', () => {
  it('recognizes HTTP and HTTPS URLs and rejects unsupported protocols', () => {
    expect(parseQuickInputIntent('https://github.com')?.kind).toBe('url')
    expect(parseQuickInputIntent('http://example.com')?.value).toBe('http://example.com/')
    expect(parseQuickInputIntent('ftp://example.com')).toBeNull()
  })

  it('recognizes non-empty cmd input and rejects empty commands', () => {
    const intent = parseQuickInputIntent('cmd: yarn dev')

    expect(intent).toMatchObject({
      kind: 'command',
      value: 'yarn dev'
    })
    expect(parseQuickInputIntent('cmd:')).toBeNull()
    expect(parseQuickInputIntent('CMD: pnpm test')?.value).toBe('pnpm test')
  })

  it('recognizes drive, UNC, and quoted Windows path candidates', () => {
    expect(parseQuickInputIntent('D:\\Project\\anythingFast')).toMatchObject({
      kind: 'path',
      value: 'D:\\Project\\anythingFast',
      pathKind: 'unknown'
    })
    expect(parseQuickInputIntent('D:/Project/anythingFast')?.kind).toBe('path')
    expect(parseQuickInputIntent('\\\\server\\share\\file.txt')?.kind).toBe('path')
    expect(parseQuickInputIntent('"D:\\Project\\file.txt"')?.value).toBe('D:\\Project\\file.txt')
  })

  it('strips lightweight tokens from the intent body', () => {
    const tokens = parseQuickInputTokens('https://github.com #工作 @临时 ?github !run')

    expect(tokens.body).toBe('https://github.com')
    expect(tokens.category).toBe('工作')
    expect(tokens.tagNames).toEqual(['临时'])
    expect(tokens.keywords).toEqual(['github'])
    expect(tokens.runImmediately).toBe(true)
  })

  it('creates default labels and task names', () => {
    const urlIntent = parseQuickInputIntent('https://github.com')!
    const commandIntent = parseQuickInputIntent('cmd: 123456789012345678901234567890')!
    const fileIntent = withQuickPathInspection(parseQuickInputIntent('D:\\tmp\\a.txt')!, {
      exists: true,
      kind: 'file',
      normalizedPath: 'D:\\tmp\\a.txt'
    })

    expect(defaultQuickTaskName(urlIntent)).toBe('打开 github.com')
    expect(defaultQuickTaskName(commandIntent)).toBe('执行 123456789012345678901234...')
    expect(defaultQuickTaskName(fileIntent)).toBe('打开 a.txt')
    expect(quickIntentActionLabel(fileIntent)).toBe('创建打开文件事项')
  })

  it('creates URL, command, file, and folder task drafts', () => {
    const urlTask = createQuickTaskFromIntent(parseQuickInputIntent('https://github.com #工作 ?github')!)
    expect(urlTask).toMatchObject({
      name: '打开 github.com',
      category: '工作',
      keywords: ['github'],
      riskLevel: 'low'
    })
    expect(urlTask.actions[0]).toMatchObject({
      type: 'openUrl',
      params: { url: 'https://github.com/' },
      riskLevel: 'low'
    })

    const commandTask = createQuickTaskFromIntent(parseQuickInputIntent('cmd: yarn dev')!, {
      workingDir: 'C:\\Users\\Admin',
      favorite: true
    })
    const commandParams = commandTask.actions[0].params as CommandParams
    expect(commandTask.favorite).toBe(true)
    expect(commandTask.riskLevel).toBe('medium')
    expect(commandParams).toMatchObject({
      source: 'inline',
      command: 'yarn dev',
      workingDir: 'C:\\Users\\Admin',
      shell: 'pwsh',
      terminalHost: 'systemTerminal'
    })

    const fileIntent = withQuickPathInspection(parseQuickInputIntent('D:\\tmp\\a.txt')!, {
      exists: true,
      kind: 'file',
      normalizedPath: 'D:\\tmp\\a.txt'
    })
    const folderIntent = withQuickPathInspection(parseQuickInputIntent('D:\\tmp')!, {
      exists: true,
      kind: 'folder',
      normalizedPath: 'D:\\tmp'
    })
    expect((createQuickTaskFromIntent(fileIntent).actions[0].params as PathParams).path).toBe('D:\\tmp\\a.txt')
    expect(createQuickTaskFromIntent(fileIntent).actions[0].type).toBe('openFile')
    expect(createQuickTaskFromIntent(folderIntent).actions[0].type).toBe('openFolder')
  })

  it('does not create direct task drafts for unknown paths', () => {
    expect(() => createQuickTaskFromIntent(parseQuickInputIntent('D:\\missing\\future.txt')!)).toThrow('当前输入不能直接创建事项')
  })
})
