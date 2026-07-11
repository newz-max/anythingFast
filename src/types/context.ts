export type ClipboardContextStatus = 'available' | 'empty' | 'unavailable' | 'unsupported'

export interface ClipboardContextSnapshot {
  source: 'clipboard'
  capturedAt: string
  status: ClipboardContextStatus
  text: string
  truncated: boolean
}
