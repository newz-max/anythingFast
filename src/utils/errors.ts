export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error === null || error === undefined) return String(error)

  try {
    const serialized = JSON.stringify(error)
    return serialized && serialized !== '{}' ? serialized : String(error)
  } catch {
    return String(error)
  }
}

export function logDevError(context: string, error: unknown, extra?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return

  console.error(`[anythingFast] ${context}`, {
    message: getErrorMessage(error),
    error,
    ...(extra ? { extra } : {})
  })
}
