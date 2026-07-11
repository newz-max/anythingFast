# 事项入口管理器

Windows 本地优先的预设入口管理器，用于把程序、URL、文件、文件夹、命令、脚本和延时等待组合成可搜索、可一键执行的“事项”。

它的使用体验接近 macOS 全局搜索或 Spotlight：通过全局快捷键唤起搜索面板，输入关键词后快速执行目标。区别是本项目不做系统级全局搜索，而是管理用户在软件内预设的各种入口和动作流程。

主配置窗口用于管理事项、动作序列、触发器和设置，快捷搜索面板用于快速搜索、执行事项，也可以从 URL、Windows 路径或命令直接创建事项。本地系统能力由 Tauri/Rust 后端统一处理，前端负责交互、表单、搜索和反馈。

## 技术栈

- 桌面端：Tauri v2
- 后端：Rust
- 前端：Vue 3 + TypeScript + Vite
- UI：Naive UI
- 状态管理：Pinia
- 测试：Vitest、Rust unit tests
- 存储：本地 JSON 配置文件和本地执行摘要日志

## 功能概览

- 本地事项列表管理
- 事项分类、关键词和模糊搜索
- 类 Spotlight 的快捷搜索面板
- 快捷面板智能识别 URL、已有文件/文件夹路径和 `cmd:` 命令，可确认后快速创建事项
- 可配置全局快捷键和应用内快捷键
- 每个事项可配置独立快捷键
- 计划触发无人值守执行
- 动作序列配置和流程预览
- 支持打开程序、URL、文件、文件夹、执行命令、运行脚本、延时等待
- 按顺序执行动作
- 执行失败提示和摘要日志
- 高风险动作二次确认
- 本地 JSON 持久化配置

## 功能文档导航

| 文档 | 内容 |
| --- | --- |
| [快速上手](./docs/getting-started.md) | 核心概念、主窗口、快捷搜索面板和创建第一个事项的流程 |
| [动作配置](./docs/actions.md) | 动作类型、执行顺序、条件、超时、失败后继续和流程预览 |
| [运行变量](./docs/runtime-variables.md) | 变量 Key、默认值、必填、敏感变量、`{{ variableKey }}` 引用和命令输出绑定 |
| [触发器与快捷键](./docs/triggers-and-shortcuts.md) | 手动触发、全局唤起、事项快捷键、软件内快捷键和周期触发 |
| [执行、风险与日志](./docs/execution-risk-and-logs.md) | 手动/无人值守执行、高风险确认、命令输出和执行日志 |
| [导入、导出与模板](./docs/import-export-templates.md) | JSON 导入导出、模板、导入预览、ID 冲突和路径提示 |
| [上下文感知入口设计](./doc/上下文感知入口实现方案.md) | 剪贴板建议的范围、隐私边界、交互规则与分阶段实施方案 |

## 快捷面板智能输入

当搜索词没有匹配到已有事项时，快捷面板会识别以下输入并显示创建建议：

| 输入 | 创建结果 |
| --- | --- |
| `https://github.com` | 创建一个“打开 URL”事项，仅支持 HTTP(S) URL |
| `D:\Project\anythingFast\README.md` | 后端确认文件存在后，创建一个“打开文件”事项 |
| `D:\Project\anythingFast` | 后端确认文件夹存在后，创建一个“打开文件夹”事项 |
| `"D:\Project\anythingFast\README.md"` | 自动移除路径外层引号后检查 |
| `cmd: yarn dev` | 创建一个“执行命令”事项，并使用后端提供的默认工作目录 |

输入末尾可以追加轻量 token，用于填充确认表单：

- `#分类`：设置事项分类。
- `?关键词`：添加关键词，可以重复使用。
- `!run`：默认勾选“保存后立即执行”。
- `@标签`：当前仅识别并提示，MVP 不会创建或关联标签。

例如：

```text
https://github.com #工作 ?github !run
```

创建建议不会覆盖已有事项结果。存在匹配事项时，`Enter` 仍执行选中事项；没有结果且建议可直接保存时，`Enter` 打开轻量确认表单。确认时可以修改名称、分类、关键词、收藏状态和“保存后立即执行”。

文件和文件夹类型由 Rust 后端读取文件系统元数据判断，不存在的路径只会显示提示，不能直接保存。“保存后立即执行”仍使用手动执行流程，首次执行命令或高风险命令依然需要二次确认。

## 快捷键

- 默认全局快捷键：`Alt+Space`，用于唤起或隐藏快捷搜索面板。
- 快捷搜索面板：`ArrowUp` / `ArrowDown` 选择结果，`Enter` 执行选中事项或打开智能创建确认，`Escape` 取消确认或关闭面板，`/` 聚焦搜索框，`Ctrl+N` 打开主窗口新增事项。
- 主窗口和编辑器快捷键可在设置中调整，覆盖搜索、运行选中事项、新增事项、编辑事项、保存和关闭编辑器等常用操作。
- 事项快捷键用于直接触发指定事项的无人值守执行；如果事项需要运行变量输入或高风险二次确认，则不会静默执行，只会记录阻塞结果。

## 界面预览

主配置窗口：

![主配置窗口](./screenshots/main-window.png)

事项详情：

![事项详情](./screenshots/task-detail.png)

快捷搜索面板：

![快捷搜索面板](./screenshots/quick-search.png)

## 快速开始

安装依赖：

```powershell
yarn
```

仅预览前端 UI：

```powershell
yarn dev
```

启动真实桌面应用：

```powershell
yarn tauri:dev
```

构建前端：

```powershell
yarn build
```

构建桌面应用：

```powershell
yarn tauri:build
```

## 自动发布

GitHub Actions 会在推送 `v*` 标签时自动构建 Windows 安装包并创建 GitHub Release：

```powershell
git tag v0.1.0
git push github v0.1.0
```

也可以在 GitHub 的 Actions 页面手动运行 `Release` workflow。当前发布包未配置代码签名，Windows 可能会提示未知发布者。

## 验证命令

前端类型检查：

```powershell
yarn typecheck
```

前端测试：

```powershell
yarn test
```

Rust 测试：

```powershell
cd src-tauri
cargo test
```

Rust 编译检查：

```powershell
cd src-tauri
cargo check
```

## 项目结构

```text
src/
  api/                 Tauri invoke 和事件封装
  components/          Vue UI 组件
  composables/         前端业务组合逻辑
  domain/              前端搜索、快捷输入、风险、校验、工厂函数
  stores/              Pinia 状态
  styles/              全局样式
  types/               TypeScript 领域模型

src-tauri/
  src/commands.rs      Tauri commands
  src/domain.rs        Rust 领域模型
  src/executor.rs      动作执行器
  src/risk.rs          风险识别
  src/storage.rs       本地配置和日志存储
  src/validation.rs    后端校验
  tauri.conf.json      Tauri 窗口和构建配置
```

## 关键模块

- `src/types/domain.ts` 和 `src-tauri/src/domain.rs`：前后端领域模型，需要保持字段同步。
- `src/stores/taskStore.ts`：事项配置加载、保存、选择和设置。
- `src/stores/executionStore.ts`：执行状态、执行事件和日志。
- `src/components/layout/MainLayout.vue`：主配置窗口。
- `src/components/quick/QuickSearchPanel.vue`：快捷搜索面板。
- `src/components/quick/QuickCreateConfirm.vue`：快捷创建事项的轻量确认表单。
- `src/composables/useQuickInputIntent.ts`：快捷输入意图和异步路径检查状态。
- `src/domain/quickInput.ts`：快捷输入 token、意图识别和事项草稿生成。
- `src-tauri/src/commands.rs`：前端可调用的后端接口。
- `src-tauri/src/executor.rs`：本地动作执行。

## 开发注意事项

- `yarn dev` 只能预览前端，不能验证全局快捷键、本地文件打开、命令执行等 Tauri 能力。
- 系统动作必须通过 Rust/Tauri commands 执行，前端不要直接执行本地命令。
- 风险控制在前后端都有实现：前端用于即时反馈，后端用于保存和执行前强制校验。
- 高风险命令和首次执行命令事项必须二次确认。
- 命令动作的 stdout/stderr 仅在隐藏终端执行时写入执行日志；显示终端窗口时输出只显示在终端里，日志只保留退出码和执行结果。
- 本地配置写入应保持原子写入思路，避免产生空文件或损坏文件。
- `doc/`、构建产物、依赖目录、Tauri 生成目录和本地 AI 协作说明文件已在 `.gitignore` 中忽略。

## 默认约定

- 默认全局快捷键：`Alt+Space`
- 快捷搜索面板：`Enter` 执行选中事项或确认智能创建建议，`Escape` 取消确认或关闭面板
- 命令动作 shell：`powershell` 或 `cmd`
- 提交信息默认使用中文

## 开源协议

本项目使用 MIT License，详见 [LICENSE](./LICENSE)。
