import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './errors'

describe('getErrorMessage', () => {
  it('returns the message from Error values', () => {
    expect(getErrorMessage(new Error('保存失败'))).toBe('保存失败')
  })

  it('returns string errors directly', () => {
    expect(getErrorMessage('命令失败')).toBe('命令失败')
  })

  it('serializes plain object errors', () => {
    expect(getErrorMessage({ code: 'E_CONFIG', message: '配置错误' })).toBe(
      '{"code":"E_CONFIG","message":"配置错误"}'
    )
  })
})
