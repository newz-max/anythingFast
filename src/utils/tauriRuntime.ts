export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function assertTauriRuntime(message: string) {
  if (!isTauriRuntime()) {
    throw new Error(message)
  }
}
