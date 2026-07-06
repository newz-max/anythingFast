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
