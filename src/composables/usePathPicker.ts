import { open } from '@tauri-apps/plugin-dialog'

export function usePathPicker() {
  async function pickDirectory(defaultPath?: string) {
    const selected = await open({
      title: '选择工作目录',
      directory: true,
      multiple: false,
      defaultPath: defaultPath || undefined
    })
    return typeof selected === 'string' ? selected : null
  }

  async function pickScriptFile(defaultPath?: string) {
    const selected = await open({
      title: '选择脚本文件',
      multiple: false,
      defaultPath: defaultPath || undefined,
      filters: [
        {
          name: '脚本文件',
          extensions: ['ps1', 'cmd', 'bat']
        }
      ]
    })
    return typeof selected === 'string' ? selected : null
  }

  return {
    pickDirectory,
    pickScriptFile
  }
}
