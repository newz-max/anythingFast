import { describe, expect, it } from 'vitest'
import riskCases from '../../fixtures/risk-cases.json'
import { deriveActionRisk } from '@/domain/risk'
import type { RiskLevel, TaskAction } from '@/types/domain'

interface RiskCase {
  name: string
  action: TaskAction
  expectedRisk: RiskLevel
}

const cases = riskCases as RiskCase[]

describe('shared risk cases', () => {
  it.each(cases)('classifies $name as $expectedRisk', ({ action, expectedRisk }) => {
    expect(deriveActionRisk(action)).toBe(expectedRisk)
  })
})
