export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  const editable = target.closest(
    [
      'input',
      'textarea',
      'select',
      '[contenteditable=""]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      '.n-input',
      '.n-input-number',
      '.n-select',
      '.n-base-selection'
    ].join(',')
  )
  return Boolean(editable)
}

export function isCtrlShortcut(event: KeyboardEvent, key: string) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === key.toLowerCase()
}
