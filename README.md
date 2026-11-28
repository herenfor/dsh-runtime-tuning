<div align="center">

# DSH Tune

**看清审批，减少等待，让长任务有进展、有收尾。**

DeepSeek Harness 运行调优插件 · `@herenfor/dsh-tune`

[![npm](https://img.shields.io/npm/v/%40herenfor%2Fdsh-tune)](https://www.npmjs.com/package/@herenfor/dsh-tune)
[![Tests](https://github.com/herenfor/dsh-runtime-tuning/actions/workflows/test.yml/badge.svg)](https://github.com/herenfor/dsh-runtime-tuning/actions/workflows/test.yml)
[![MIT](https://img.shields.io/badge/license-MIT-25845b)](https://github.com/herenfor/dsh-runtime-tuning/blob/main/LICENSE)

[安装](#安装) · [实际效果](#实际效果) · [本次更新](#本次更新) · [已测版本](#已测版本) · [配置文档](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md)

</div>

让 DeepSeek Harness 更适合真实工程与长程任务：审批卡精简清晰、提问和等待不再卡死进程、长任务自动提醒进展与收尾、模型可在右侧栏自主打开网页或文件供即时预览、对话内支持 `Ctrl+F` 全历史正文查找、提供 Git Worktree 树可视化与安全管理，并提供「协作」与「调优」两个可选预设。

> **生效范围说明**：常规增强（审批、等待、提问、进展提醒、表格与回答修复、凭据保护、`open_sidebar` 侧栏预览、对话内查找、Git Worktree 可视化与管理、Responses 流式文本补完）**安装即自动生效**，无需切换预设；`collaborative`（「协作」）可在新建会话时按需选用，`tuned`（「调优」）默认关闭，需在配置启用。

<a id="快速开始"></a>

## 安装

在对应运行端的 **插件页 → 添加第三方插件** 中填写：

```text
@herenfor/dsh-tune
```

WSL / Linux 的 CLI `web` profile 也可使用：

```bash
dsh plugin --profile web add @herenfor/dsh-tune
```

安装或更新后，等当前任务结束，再重启 DSH 并刷新页面。Desktop 和 WSL 桥接端请在各自的插件页操作。[源码安装、旧包迁移 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#安装)

<a id="功能一览"></a>

## 能帮你做什么

| 能力领域 | 原版痛点 | 插件改动与实际行为 | 生效方式 / 模块 |
| --- | --- | --- | --- |
| **审批看懂再点** | 长命令与原始 JSON 参数占满卡片，核心目的不直观 | 收敛为「申请原因 + 权限范围」两行纯文本，保留原生按钮、黄色等待条、风险提示与审批后参数完整性校验；格式不合格自动回退原生卡片 | 默认开启 · `approval-info` / `ui-chat` |
| **模型自主侧栏预览** | 模型生成 HTML、报告、图片或启动服务后，需用户手动找文件或复制 URL | 新增 `open_sidebar` 工具：模型可直接在当前在屏会话的右侧栏打开工作区/本地文件（支持行号、`sidebar`/`float`）或 HTTP(S) 网页；后台会话切回时补开一次，刷新/翻历史不重弹 | 默认开启 · `ui-sidebar-open` |
| **Git Worktree 树与管理** | 多 Worktree 派生与提交分叉缺乏直观全局视图；手动切分支易混入未完成修改 | 右侧栏与顶栏分支徽章提供只读 Worktree 树 + Commit 分叉图、自由选目录/文件夹浏览、一键新建/Fork 会话、双门禁无 `--force` 安全删除，以及新对话窗口内一键启用首条消息自动切入隔离 Worktree | 默认开启 · `ui-worktree` / `ui-worktree-manage` |
| **对话内全历史查找** | Desktop 缺失 `Ctrl+F` 找对话历史，长对话未加载更早轮次时浏览器原生查找够不到，全历史常混入大量工具/Bash 噪声 | 主对话右上栏提供放大镜按钮，Desktop 注册 `Ctrl+F`/`Cmd+F`、Web 注册 `Ctrl+Alt+F`/`Cmd+Alt+F`（可选开关接管 Web `Ctrl+F`）；浮窗支持拖拽移动、边界钳制、位置记忆与双击复位；默认仅搜用户提问与助手回复正文，思考过程、工具/Bash 与系统上下文等可在范围按钮或浮窗右键菜单按需勾选，支持向后增量全历史扫描（8 MiB 分页缓存）与跳转定位 | 默认开启 · `ui-conversation-find` |
| **慢任务与提问不阻塞** | `sleep` / `job_output` 容易卡住整轮，提问需干等回答，后台任务常遗漏 | 超长前台等待自动封顶转后台；`ask_user_question` 超时先返回 `pending` 以便继续并行；`task_status` 声明状态、结束前清点遗漏后台任务并设兜底唤醒；沙箱与文件工具共享会话 `/tmp` | 默认开启 · `wait-guard` / `ask-nonblocking` / `session-tmp` |
| **长任务有进展、有收尾** | 连续数十步无正文汇报、todo 只写不管、流停滞干等 | 沉默超 3 分钟且满 3 步后附带轻提醒，清单过期或收尾未对齐时提醒顺带更新，流卡住超时主动触发重试，避免带收尾工具结束时正文被折叠 | 默认开启 · `progress-note` / `todo-reminder` / `stream-stall` / `ui-chat` |
| **聊天表格与文件兼容** | 宽表挤压正文，直接 `edit` 未读/陈旧文件或后缀错标的图易失败 | 表格随实际消息列宽自适应滚动并保留完整数值；`edit` 自动对齐当前文件版本，`read_image` 按文件头真实格式嗅探读取 | 默认开启 · `ui-chat` / `fs-view` |
| **凭据三层防护** | 沙箱默认可读宿主文件，对话或输出易意外带出令牌 | 拦截索要或直接传入明文令牌的调用；对沙箱及 `read` / `write` / `edit` / `grep` / `open_sidebar` 遮蔽常见云、仓库与 DSH 凭据目录；工具结果中的密钥自动打码 | 默认开启 · `secret-guard` / `secret-files` |
| **「协作」预设** | 缺目标承接与延迟发现，复杂检索模式有限 | 基于完整 `standard` 构建，保留内置技能、计划、goal、定时、工作流与子代理；补充协作规范、`tool_search` 低频能力按需发现，以及增强版 `grep`（上下文/排除/跨行/计数） | 新建会话可选 · `collaborative`（[详情](docs/collaborative-preset.md)） |
| **「调优」预设与缓存修复** | 日常编码很少用到定时/工作流工具；压缩摘要未沿用推理档位导致同模型前缀缓存失效 | 去掉定时、goal、计划、工作流与 `subagent_fork`，保留思考深度；手动/自动/溢出压缩继承同模型有效 `reasoningEffort`，降低非缓存输入费用 | 需配置启用 · `tuned` / `compaction-effort` |

所有模块均可按 id 独立开关或调整参数。[配置项、默认值与逐项说明 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#配置)

<a id="审批预览"></a>

## 实际效果

### 审批先看懂，再决定

![真实审批示例：申请原因、仅本次调用的完整访问权限，以及拒绝和允许一次按钮](https://raw.githubusercontent.com/herenfor/dsh-runtime-tuning/main/.github/assets/approval/create-tuned.png)

上图来自真实会话：**414 字符、11 行命令**对应 **38 字符的申请原因**。模型自行填写原因，用户通过原生按钮决定是否允许。简洁展示不改变授权范围；格式不合格时回退官方展示。

[更多真实截图与兼容验证 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/approval-examples.md)

### 压缩时复用已有缓存

直接挂载本插件的受控手动压缩对照：

| 指标 | 官方默认摘要 | 开启修复 |
| --- | ---: | ---: |
| 缓存命中率 | 0% | **98.85%** |
| 非缓存输入 tokens | 34,055 | **391** |
| 摘要费用，包含实际输出 | 基准 | **减少 70.7%** |

这组实验采用同一份合成上下文，分别运行官方摘要器与修复插件。服务端原始用量与适配器统计逐项核对，表中费用由实际输入、输出按公开 API 费率折算。两组总输入均为 34,055 tokens。

[实验环境、方法与数据 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/compaction-cache.md)

历史前端任务采用同一模型、同一输入和两个新会话做一对 A/B：官方原版对比「整包 + `tuned`」。调优组步数减少约 31%、累计输入含缓存减少约 21%，耗时基本持平。[完整 A/B 记录 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/ab/2026-11-10-folder-import.md)

## 本次更新

**`0.2.22` · 兼容 `nanodsh` 等外部启动器与非 pnpm 宿主依赖解析**

- **优先使用实例安装锚点解析宿主依赖**：`findHostPackage`、`hostImport` / `hostDirectory` 与 `approval-info`、`tool-discovery`、`ask-nonblocking`、`tuned-preset`、`compaction-effort` 等模块改为优先读取 `ctx.profileContext.installAnchor` / `dir` 与 `DSH_INSTALL_ANCHOR`，并补充仅导出 `.` 入口的包根回溯以及经 `@deepseek-ai/dsh` / `dsh-base` / `dsh-web-app` 的依赖跳板，再保留 `process.argv[1]` 与 `.pnpm` 仓库回退；解决使用 `nanodsh` 或自定义布局启动 Web profile 时 `runtime-tuning-approval-info` 找不到 `dsh-typert-protocol` 导致接口未注册的问题。
- **`0.2.21` 主要能力沿用**：继续包含 `ui-worktree` 只读树 / Commit 分叉图、`ui-worktree-manage` 可控建删与新对话切换器、`responses-text-recovery` 与 `ui-conversation-find` 文件链接高亮。

[完整更新记录（含 0.2.20 及更早版本） →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/CHANGELOG.md) · [Worktree 设计说明 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/worktree-design.md)

## 可选：开启调优预设

在当前 profile 的 `cordis.patch.yml` 中启用：

```yaml
- id: runtime-tuning-preset-tuned
  disabled: false
```

然后在会话中选择「调优」。常规插件安装后即可使用；现有会话继续沿用各自记录的预设，`tuned` 会话也保持原有绑定。

如只想关闭压缩档位继承，请**保留 `tuned`**，在其 `compaction-basic` 配置中设 `inheritReasoningEffort: false`，清除显式 `summarizationReasoningEffort` 和逐模型继承覆盖。直接禁用整个预设或卸载插件前，应先迁移仍绑定它的会话。[详细配置与回退 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#上下文压缩推理档位修复compaction-effort)

## 已测版本

**当前版本：`@herenfor/dsh-tune@0.2.22`。** npm 徽章显示 registry 当前已发布版本；安装前可在 [npm 版本页](https://www.npmjs.com/package/@herenfor/dsh-tune?activeTab=versions)核对。

| 验证项目 | DSH 版本 | 环境与已验证范围 |
| --- | --- | --- |
| 宿主锚点与启动器兼容（`0.2.22`） | **0.2.2-rc.5** | Linux / WSL，Node.js **22.23.4**；`profileContext.installAnchor` / `dir` / wrapper hop / 无 `./package.json` 导出单测与 `approval-info.apply`（`nanodsh` `argv[1]` 模拟）回归及离线打包安装校验 |
| Worktree 可视化与管理 / 流式恢复（`0.2.21`） | **0.2.2-rc.5** | Linux / WSL，Node.js **22.23.4**；真实 Git Worktree L1 + 真实 DSH Host / Cordis / `dsh-tools` / `dsh-session` / WebServer HTTP L2、离线打包安装校验与本机 `desktop-wsl` 实测 |
| 对话内全历史查找（`0.2.20`） | **0.2.2-rc.5** | Linux / WSL，Node.js **22.23.4** / **24.22.3**；L1/L2 单测（含真实 `dsh-client-shortcuts` 6 端注册、宿主配置与流式/跳转回归）、离线打包与隔离 Chromium 端到端实测（快捷键、拖拽复位、`Aa` 悬停、范围菜单、全历史扫描与折叠展开） |
| 自主侧栏预览（`0.2.19`） | **0.2.2-rc.3** | Linux / WSL，Node.js **22.23.4**；L1/L2 契约、启动图与 `dsh-wsl` 镜像校验、离线宿主集成；并在本机 `desktop-wsl` 桥接实测侧栏打开效果 |
| 压缩修复与升级 | **0.2.2-rc.3** | Linux / WSL，Node.js **24.22.2** / **22.23.4**；压缩、能力回退、并发与旧预设升级回归，另有真实服务端手动对照 |
| 协作预设（`collaborative`） | **0.2.2-rc.3** | Linux / WSL，Node.js **24.22.2** / **22.23.4**；真实隔离 Host + 模拟 adapter，工具发现、步骤准入、grep、重启恢复与会话隔离 |
| 既有审批与表格页面 | **0.2.2-rc.2、0.2.2-rc.3** | Web + Chromium；实际卡片、深浅色、窄窗、键鼠交互与官方执行契约；CUA 为测试桩 |
| 历史真实 Web 会话 | **0.2.2-rc.1、0.2.2-rc.2** | Windows / WSL，Node.js **22.23.4**；历史 Web 功能、调优预设和显示设置验证 |


**自动检查：221 项，214 通过、7 跳过、0 失败**（跳过项为本机未保留的旧版 `rc.2` / `rc.3` 宿主路径或缺少对应环境条目，另完成包内 62 文件离线安装与预设解析校验）。

安装版本范围：**`>=0.2.2-rc.1 <0.3.0-0`**。测试使用交互式 Web profile，浏览器为 Chromium；审批中的 CUA 由测试桩提供，压缩实验通过官方模块与真实模型服务运行。

[审批与表格详细范围](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/visual-verification.md) · [压缩实验详细范围](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/compaction-cache.md)

## 配置、排错与卸载

| 你想做什么 | 去哪里看 |
| --- | --- |
| 调整等待、提醒、凭据保护或压缩选项 | [配置项与默认值](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#配置) |
| 从旧 GitHub / link 安装迁移 | [安装与迁移](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#安装)；旧包名链接可继续使用，避免同时启用两份 |
| 查运行日志 | `$DSH_HOME/logs/dsh-runtime-tuning/`，默认 `~/.dsh/logs/dsh-runtime-tuning/` |
| 卸载或退出调优预设 | [卸载步骤](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#卸载)；先处理仍绑定 `tuned` 的会话 |
| 查看设计依据 | [设计记录](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/design-notes.md) |

凭据保护作用于工具调用、工具结果和配置的敏感文件；审批保留原生权限检查与用户决定。各模块的运行方式和适配细节见配置文档。

审批提醒、托盘启动和崩溃防护是另一个插件：[DSH Sentinel](https://github.com/herenfor/dsh-sentinel)。

## 开发与发布

```bash
npm test
npm run check:package
npm run check:preset-upgrade -- /path/to/dsh
npm run check:collaborative -- /path/to/dsh /outside/repository/results
```

仓库名保留为 `dsh-runtime-tuning`，npm 包名为 `@herenfor/dsh-tune`。[发布命令与版本管理 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/publishing.md)

[MIT License](https://github.com/herenfor/dsh-runtime-tuning/blob/main/LICENSE)
