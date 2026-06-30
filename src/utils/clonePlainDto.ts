import { toRaw } from 'vue'

export function clonePlainDto<T>(value: T): T {
  return structuredClone(toRaw(value))
}
