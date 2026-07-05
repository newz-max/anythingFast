<script setup lang="ts">
import { computed } from 'vue'
import ActionConditionForm from '@/components/tasks/ActionConditionForm.vue'
import { usePathPicker } from '@/composables/usePathPicker'
import { actionTypeOptions, createDefaultActionParams } from '@/domain/actionTypes'
import type { ActionParams, ActionType, TaskAction, TaskVariable } from '@/types/domain'

const action = defineModel<TaskAction>({ required: true })
defineProps<{
  variables?: TaskVariable[]
}>()
type MutableParams = Record<string, any>
const { pickDirectory, pickScriptFile } = usePathPicker()

const commandShellOptions = [
  { label: '终端默认配置', value: 'terminal' },
  { label: 'PowerShell 7', value: 'pwsh' },
  { label: 'PowerShell', value: 'powershell' },
  { label: 'cmd', value: 'cmd' }
]

const commandTerminalHostOptions = [
  { label: '系统终端', value: 'systemTerminal' },
  { label: '直接启动 Shell', value: 'direct' }
]

const commandSourceOptions = [
  { label: '命令文本', value: 'inline' },
  { label: '脚本文件', value: 'script' }
]

const actionSelectOptions = actionTypeOptions.map(({ label, value }) => ({ label, value }))

const pathLabel = computed(() => (action.value.type === 'openProgram' ? '程序路径' : action.value.type === 'openFolder' ? '文件夹路径' : '文件路径'))
const params = computed(() => action.value.params as MutableParams)
const commandSource = computed({
  get: () => params.value.source || 'inline',
  set: (value: string) => {
    patchParams({ source: value })
  }
})

function patchAction(patch: Partial<TaskAction>) {
  action.value = {
    ...action.value,
    ...patch
  }
}

function patchOutputBinding(patch: NonNullable<TaskAction['outputBinding']>) {
  const next = {
    ...(action.value.outputBinding || {}),
    ...patch
  }
  patchAction({
    outputBinding: next.stdoutVariable || next.stderrVariable || next.exitCodeVariable ? next : null
  })
}

function patchCondition(condition: TaskAction['condition']) {
  patchAction({ condition })
}

function patchParams(patch: MutableParams) {
  patchAction({
    params: {
      ...params.value,
      ...patch
    } as ActionParams
  })
}

function setActionType(type: ActionType) {
  patchAction({
    type,
    params: createDefaultActionParams(type)
  })
}

async function chooseWorkingDir() {
  const selected = await pickDirectory(textParam('workingDir'))
  if (selected) {
    patchParams({ workingDir: selected })
  }
}

async function chooseScriptFile() {
  const selected = await pickScriptFile(textParam('scriptPath'))
  if (selected) {
    patchParams({ scriptPath: selected })
  }
}

function textParam(key: string) {
  const value = params.value[key]
  return typeof value === 'string' ? value : ''
}

function numberParam(key: string) {
  const value = params.value[key]
  return typeof value === 'number' ? value : null
}

function stringListParam(key: string) {
  const value = params.value[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function updateStringListParam(key: string, value: string) {
  patchParams({ [key]: value.split(' ').filter(Boolean) })
}

function updateScriptArgs(value: string) {
  updateStringListParam('scriptArgs', value)
}

function updateShowTerminal(value: boolean) {
  if (value && (textParam('terminalHost') || 'systemTerminal') === 'systemTerminal' && textParam('shell') === 'powershell') {
    patchParams({ showTerminal: value, shell: 'terminal' })
    return
  }
  patchParams({ showTerminal: value })
}

function updateShell(value: string) {
  if (Boolean(params.value.showTerminal) && (textParam('terminalHost') || 'systemTerminal') === 'systemTerminal' && value === 'powershell') {
    patchParams({ shell: 'terminal' })
    return
  }
  patchParams({ shell: value })
}

function updateTerminalHost(value: string) {
  if (value === 'systemTerminal' && Boolean(params.value.showTerminal) && textParam('shell') === 'powershell') {
    patchParams({ terminalHost: value, shell: 'terminal' })
    return
  }
  patchParams({ terminalHost: value })
}
</script>

<template>
  <NForm class="param-form" label-placement="top">
    <NGrid :cols="3" :x-gap="12" :y-gap="8" responsive="screen">
      <NGi>
        <NFormItem label="动作类型">
          <NSelect :value="action.type" :options="actionSelectOptions" @update:value="setActionType" />
        </NFormItem>
      </NGi>
      <NGi>
        <NFormItem label="超时时间 ms">
          <NInputNumber
            :value="action.timeoutMs ?? null"
            clearable
            :min="1"
            placeholder="可选"
            @update:value="(value: number | null) => patchAction({ timeoutMs: value })"
          />
        </NFormItem>
      </NGi>
      <NGi>
        <NFormItem label="失败后继续">
          <NSwitch
            :value="Boolean(action.continueOnError)"
            @update:value="(value: boolean) => patchAction({ continueOnError: value })"
          />
        </NFormItem>
      </NGi>
    </NGrid>

    <template v-if="action.type === 'openProgram' && 'path' in action.params">
      <NGrid :cols="3" :x-gap="12" responsive="screen">
        <NGi>
          <NFormItem :label="pathLabel" required>
            <NInput :value="textParam('path')" placeholder="C:\\Program Files\\..." @update:value="(value: string) => patchParams({ path: value })" />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="启动参数">
            <NInput
              :value="stringListParam('args').join(' ')"
              placeholder="按空格分隔"
              @update:value="(value: string) => updateStringListParam('args', value)"
            />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="工作目录">
            <NInput :value="textParam('workingDir')" placeholder="可选" @update:value="(value: string) => patchParams({ workingDir: value })" />
          </NFormItem>
        </NGi>
      </NGrid>
    </template>

    <template v-else-if="action.type === 'openUrl' && 'url' in action.params">
      <NFormItem label="URL" required>
        <NInput :value="textParam('url')" placeholder="https://example.com" @update:value="(value: string) => patchParams({ url: value })" />
      </NFormItem>
    </template>

    <template v-else-if="(action.type === 'openFile' || action.type === 'openFolder') && 'path' in action.params">
      <NFormItem :label="pathLabel" required>
        <NInput :value="textParam('path')" placeholder="C:\\Users\\..." @update:value="(value: string) => patchParams({ path: value })" />
      </NFormItem>
    </template>

    <template v-else-if="action.type === 'runCommand' && 'command' in action.params">
      <NGrid :cols="3" :x-gap="12" responsive="screen">
        <NGi>
          <NFormItem label="输入方式">
            <NRadioGroup v-model:value="commandSource">
              <NRadioButton v-for="option in commandSourceOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </NRadioButton>
            </NRadioGroup>
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="Shell">
            <NSelect :value="textParam('shell')" :options="commandShellOptions" @update:value="updateShell" />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="显示终端窗口">
            <NSwitch :value="Boolean(params.showTerminal)" @update:value="updateShowTerminal" />
          </NFormItem>
        </NGi>
        <NGi v-if="Boolean(params.showTerminal)">
          <NFormItem label="终端宿主">
            <NSelect
              :value="textParam('terminalHost') || 'systemTerminal'"
              :options="commandTerminalHostOptions"
              @update:value="updateTerminalHost"
            />
          </NFormItem>
        </NGi>
        <NGi v-if="Boolean(params.showTerminal)">
          <NFormItem label="成功后自动关闭">
            <NSwitch
              :value="params.closeTerminalOnFinish !== false"
              @update:value="(value: boolean) => patchParams({ closeTerminalOnFinish: value })"
            />
          </NFormItem>
        </NGi>
      </NGrid>
      <NAlert class="command-log-note" type="info" :show-icon="false">
        显示终端窗口时会同步记录输出到执行日志；交互式命令仍以终端窗口中的提示和输入为准。
      </NAlert>
      <NGrid v-if="commandSource === 'inline'" :cols="3" :x-gap="12" responsive="screen">
        <NGi :span="3">
          <NFormItem label="命令内容" required>
            <NInput
              :value="textParam('command')"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              @update:value="(value: string) => patchParams({ command: value })"
            />
          </NFormItem>
        </NGi>
      </NGrid>
      <NGrid v-else :cols="3" :x-gap="12" responsive="screen">
        <NGi :span="2">
          <NFormItem label="脚本文件" required>
            <NInputGroup>
              <NInput :value="textParam('scriptPath')" placeholder="选择 .ps1、.cmd 或 .bat 文件" @update:value="(value: string) => patchParams({ scriptPath: value })" />
              <NButton secondary @click="chooseScriptFile">选择</NButton>
            </NInputGroup>
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="脚本参数">
            <NInput
              :value="stringListParam('scriptArgs').join(' ')"
              placeholder="按空格分隔"
              @update:value="updateScriptArgs"
            />
          </NFormItem>
        </NGi>
      </NGrid>
      <NFormItem label="工作目录" required>
        <NInputGroup>
          <NInput :value="textParam('workingDir')" placeholder="C:\\Project\\anythingFast" @update:value="(value: string) => patchParams({ workingDir: value })" />
          <NButton secondary @click="chooseWorkingDir">选择</NButton>
        </NInputGroup>
      </NFormItem>
      <NGrid :cols="3" :x-gap="12" responsive="screen">
        <NGi>
          <NFormItem label="stdout 保存到变量">
            <NInput
              :value="action.outputBinding?.stdoutVariable || ''"
              placeholder="可选"
              @update:value="(value: string) => patchOutputBinding({ stdoutVariable: value })"
            />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="stderr 保存到变量">
            <NInput
              :value="action.outputBinding?.stderrVariable || ''"
              placeholder="可选"
              @update:value="(value: string) => patchOutputBinding({ stderrVariable: value })"
            />
          </NFormItem>
        </NGi>
        <NGi>
          <NFormItem label="exitCode 保存到变量">
            <NInput
              :value="action.outputBinding?.exitCodeVariable || ''"
              placeholder="可选"
              @update:value="(value: string) => patchOutputBinding({ exitCodeVariable: value })"
            />
          </NFormItem>
        </NGi>
      </NGrid>
    </template>

    <template v-else-if="action.type === 'delay'">
      <NFormItem label="等待时长 ms">
        <NInputNumber
          :value="numberParam('durationMs')"
          clearable
          :min="1"
          placeholder="可选，留空为 0ms"
          @update:value="(value: number | null) => patchParams({ durationMs: value })"
        />
      </NFormItem>
    </template>

    <NCollapse class="advanced-condition" display-directive="show">
      <NCollapseItem title="高级条件" name="condition">
        <ActionConditionForm :model-value="action.condition" :variables="variables" @update:model-value="patchCondition" />
      </NCollapseItem>
    </NCollapse>
  </NForm>
</template>

<style scoped>
.param-form {
  padding-top: 4px;
}

.command-log-note {
  margin-bottom: 10px;
}

.advanced-condition {
  margin-top: 8px;
}
</style>
