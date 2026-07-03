import { toRaw } from 'vue'

export function clonePlainDto<T>(value: T): T {
  return structuredClone(toPlainValue(value)) as T
}

function toPlainValue(value: unknown): unknown {
  const rawValue = toRaw(value)
  if (Array.isArray(rawValue)) {
    return rawValue.map(toPlainValue)
  }
  if (!rawValue || typeof rawValue !== 'object') {
    return rawValue
  }
  return Object.fromEntries(Object.entries(rawValue).map(([key, item]) => [key, toPlainValue(item)]))
}
