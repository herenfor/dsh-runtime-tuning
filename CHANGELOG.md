# 更新记录

## 0.2.24 · 2026-11-27

- 修复在 DSH 插件页（如 `desktop-wsl`）在线更新已运行中的插件时，由于插件目录为无版本号目录且共享模块已由旧版 ESM 缓存，导致新增导出 `hostAnchors` 的入口（`approval-info.mjs`、`ask-nonblocking.mjs` 等）抛出 `SyntaxError: The requested module './host-modules.mjs' does not provide an export named 'hostAnchors'` 的问题：
  - 将内部跨越热更新边界的共享辅助导入（`host-modules.mjs`、`chat-answer-fix.mjs`、`tool-use-prompt.mjs`）统一升级为带 `?v=0.2.24` 版本的相对 ESM specifier，确保在同进程热重载时绕开旧版 `0.2.21` 缓存并立即加载新实现；同时在 `host-modules.mjs` 与 `tool-use-prompt.mjs` 清理 `import.meta.url` 派生路径上的查询参数。
  - 新增从已缓存 `0.2.21` 模块目录覆盖更新并带查询参数重载入口的回归测试。
- 验证：在 DSH `0.2.2-rc.5`（Node.js `v22.23.4`）下完成 `222` 项测试（`215` 通过、`7` 跳过、`0` 失败），并通过 `62` 文件离线打包安装检查。

## 0.2.23 · 2026-11-27

- 调整默认配置，**默认不开启**上下文压缩优化插件（`compaction-effort`），并在 `README.md` 与配置文档中补充说明：DSH `0.2.2-rc.5` 官方已修复其压缩工具的推理档位与前缀缓存问题。
  - [cordis.patch.yml](cordis.patch.yml) 中的 `tuned` 预设与 [collaborative-preset.mjs](plugins/collaborative-preset.mjs) 默认直接使用官方 `@deepseek-ai/dsh-compaction-basic`。
  - [tool-use-prompt.mjs](plugins/tool-use-prompt.mjs) 的 `resolvePresetConfig` 不再自动将官方 `@deepseek-ai/dsh-compaction-basic` 改写为 `compaction-effort.mjs`，仅保留并重定位用户显式引用或历史会话中的 `compaction-effort.mjs`。
  - 为 `< 0.2.2-rc.5` 或需显式覆盖档位的场景保留按需开关：`collaborative` 支持配置 `compactionEffort: true`，`tuned` / 自定义预设可将 `compaction-basic` 指向 `@herenfor/dsh-tune/plugins/compaction-effort.mjs`。
- 验证：在 DSH `0.2.2-rc.5`（Node.js `v22.23.4`）下完成 `221` 项测试（`214` 通过、`7` 跳过、`0` 失败），并通过 `62` 文件离线打包安装检查。

## 0.2.22 · 2026-11-27

- 修复 `approval-info` 等插件在外部启动器（如 `nanodsh`）或非 pnpm 扁平/自定义 profile 布局下加载宿主依赖失败的问题（`Error: host is not a pnpm install; cannot locate dsh-typert-protocol`）：
  - `findHostPackage` 与 `hostImport` / `hostDirectory` 改为支持多锚点与上下文感知解析（`hostAnchors(ctx)`），按优先级依次尝试 `ctx.profileContext.installAnchor`、`ctx.profileContext.dir`、`DSH_INSTALL_ANCHOR`、`process.argv[1]` 以及当前插件安装锚点。
  - 在直接 `createRequire(...).resolve('@deepseek-ai/<pkg>/package.json')` 之外，增加仅导出主入口 `.` 时的包根回溯定位，以及经 `@deepseek-ai/dsh` / `dsh-base` / `dsh-web-app` 依赖跳板查找真实 DSH 实例包的能力，最后保留同级链接与 `.pnpm` store 回退以兼容旧环境与官方启动器。
  - 统一更新 `approval-info`（`dsh-typert-protocol`、`dsh-error`）、`tool-discovery`（`dsh-tools`、`dsh-tool-executor-native`、`dsh-session`）、`ask-nonblocking`（`dsh-tool-ask-user`）、`tuned-preset`、`compaction-effort` 与共享 `host-modules` / `chat-answer-fix` 解析链路。
- 验证：在 DSH `0.2.2-rc.5`（Node.js `v22.23.4`）下完成 `221` 项测试（`214` 通过、`7` 跳过、`0` 失败），含模拟 `nanodsh`（`process.argv[1]` 指向外部 CLI、`profileContext.installAnchor` 指向 Web profile，且 `dsh-typert-protocol` 仅导出 `.`）的 `approval-info.apply` 回归测试，并通过 `62` 文件离线打包安装检查。

## 0.2.21 · 2026-11-24

- 新增 Git Worktree 只读树可视化与一键切换（独立客户端模块 `@herenfor/dsh-tune-worktree` / `runtime-tuning-worktree`）：
  - **多入口集成与只读隔离**：在右侧栏 Guide 注册「Worktree 树」页签、在主对话顶栏展示当前分支徽章（带未提交提示点）、在左侧 Workspace 右键菜单提供「查看 Worktree 树」；在关闭或未挂载管理模块时保持严格只读，零写盘操作与零写入 RPC。
  - **两阶段加载与双视图自适应**：先返回工作树骨架（路径、HEAD、分支、锁定/游离/失效标记与关联会话活动状态），再按需并发补充工作区状态与最近提交并推理派生父子边；宽屏/全屏自动切为支持拖拽/缩放的 2D 卡片图，窄屏切为紧凑缩进连线树，顶部可按需切换到 Commit 分叉图（SVG 多泳道 DAG，20/35/50 条）。
  - **自由选目录与体验打磨**：顶栏支持任意本地/`~`/WSL UNC 路径直达、DSH 工作区切换、最近目录记录与「跟随当前会话」复位，并提供只读内置文件夹浏览弹窗（`list-dirs`，识别 `.git` 仓库与隐藏目录切换，兼容系统原生目录选择器）；补充主次分层、平滑弹窗/悬停/脉冲/骨架屏动画（尊重 `prefers-reduced-motion`），并优先监听实时 `workingDirectory` 投影与 WSL 路径互转。
- 新增可控 Git Worktree 管理与新对话切换（独立可配模块 `@herenfor/dsh-tune-worktree-manage` / `runtime-tuning-worktree-manage`）：
  - **受控创建与会话分叉**：支持按可配路径模板（默认 `../<repo>-wt/<slug>`）或自定义目录新建工作树，支持「打开空白会话」「Fork 当前会话上下文」「仅创建目录」三种模式与可选非破坏性顶层 Agent 工具 `create_worktree`。
  - **双重门禁安全删除与剪枝**：`preflight-remove` / `remove` 强制检查（Git 工作区与暂存区完全干净 + DSH 无活跃运行会话/子代理）且严禁使用 `--force` / `-f`；提供 `prune` 预览与清理。
  - **新对话 Worktree 切换器**：在绑定本地 Git 仓库的空白新对话窗口右下方提供「当前目录 / 新建 Worktree」切换器（含基准分支选择、可选 `wt/...` 分支名或按首条消息自动生成、路径预览及「立即创建并打开」）；选择自动创建时在首条消息提交后原地建树并切入工作目录（`agent/inbox/inserted` + `agent/pre-step`），失败时在输入栏上方提供「重试创建 / 在当前目录继续」恢复而不丢失消息。
- 新增 Responses SSE 文本补完修复（`runtime-tuning-responses-text-recovery`）：当 Responses 流式响应在终结事件前缺少已输出文本/拒答项的完成事件时，在到达 `pi-ai` 前自动补齐对应文本项，避免回复末尾丢失。
- 优化对话内全历史查找（`ui-conversation-find`）：修复已渲染文件链接在对话查找中的高亮展示，并支持跨行内 Markdown 格式边界匹配文本。
- 验证：在 DSH `0.2.2-rc.5`（Node.js `v22.23.4`）下完成 `219` 项测试（`212` 通过、`7` 跳过、`0` 失败），完成 `62` 文件离线打包安装检查，并在本机 `desktop-wsl` 实测面板、自由选目录与新对话 Worktree 切换流程。

## 0.2.20 · 2026-11-18

- 新增对话内全历史查找（独立客户端模块 `@herenfor/dsh-tune-conversation-find` / `runtime-tuning-conversation-find`）：
  - **快捷打开**：在主对话右上栏提供固定放大镜按钮，Desktop 默认注册 `Ctrl+F`（macOS 为 `Cmd+F`）、Web 默认注册 `Ctrl+Alt+F`（macOS 为 `Cmd+Alt+F`），并提供易失配置项 `interceptCtrlFOnWeb`（默认 `false`）按需在 Web 端接管 `Ctrl+F` / `Cmd+F`。
  - **默认仅搜对话正文与二次筛选菜单**：默认只搜索用户提问与助手回复正文（`user` 与 `response`），排除思考过程、工具调用与 Bash 输出、斜杠命令、注入上下文、压缩摘要、待办列表及轮次错误；点击范围筛选按钮或在查找浮窗非输入/摘录区域右键打开范围菜单，可按需勾选上述 7 类额外来源或一键切换「仅搜正文 / 全部范围」，非默认范围激活时按钮亮蓝色提示点。
  - **可拖拽浮窗与视觉交互优化**：支持通过左侧 6 点把手或浮窗空白处拖动位置（写入 `localStorage` 记忆并做视口边界钳制，窗口缩窄或展开摘要卡片时自动收回），双击把手复位回右上角；修复 `Aa` 区分大小写按钮激活后被悬停样式覆盖成深色底的问题，点击与悬停保持蓝底白字；支持 IME 组合输入、`Enter` / `Shift+Enter` 跳转与两段 `Esc` 关闭（优先关闭范围菜单再关闭浮窗并归还焦点）。
  - **全历史扫描与性能/跳转优化**：先匹配已加载窗口并支持按需向后增量扫描至 `seq 0`（单会话 8 MiB LRU 分页缓存，流式与增量事件防抖合并刷新，宿主替换窗口时丢弃过期扫描分页）；跳转更早命中时优先调用宿主 `loadThrough` 加载目标历史并触发 `beforematch` 与收起态展开，不可见目标退化为轮次锚点定位与摘录预览卡片；采用二分法定位轮次、延迟构造命中摘录，并将单块可见 DOM 高亮限制在视口内 250 处以减少重复范围构造开销。
- 验证：在 `DSH 0.2.2-rc.5`（Node.js `v22.23.4` / `v24.22.3`）下完成 `192` 项测试（`186` 通过、`6` 跳过、`0` 失败）、打包与离线安装检查（52 文件），以及隔离环境 Chromium 端到端实测（快捷键、拖拽复位、`Aa` 悬停、范围菜单、全历史扫描与折叠展开）。

## 0.2.19 · 2026-11-16

- 新增「协作」预设 `collaborative`：从宿主完整 standard 组合构建，保留官方技能、计划、goal、定时任务、工作流与子代理，增加目标理解、决策承接、方案推荐与结果沟通规则。
- 增加 `tool_search`：常用工具直接提供，低频能力可查询后从下一步启用；作用域内 native 执行委托、同一步骤准入、会话持久化、模型能力回退和独立开关。
- 协作预设增强 grep：内容/文件名/计数、上下文、排除、跨行与匹配片段；长行保留真实命中，明确截断与结果引用，glob 沿用官方实现。
- 新增模型主动侧栏预览 `open_sidebar`（独立客户端模块 `@herenfor/dsh-tune-sidebar-open`）：模型可将已生成的文件（工作区相对路径或本地绝对路径，支持行号与 `sidebar`/`float`）或 HTTP(S) URL 直接在当前在屏会话的右侧栏打开预览；后台会话切回时自动补开一次，页面重载或翻阅历史不重复弹出；对话中提供可重开操作行；`secret-files` 增加对 `open_sidebar` 凭据路径拦截。
- 修复 `session-tmp` 将 `/tmp` 下真实工作区误当会话临时文件的问题，保留原始/当前工作区绝对路径；修复 grep 单文件计数缺少文件名分隔问题，并在本机 `0.2.2-rc.3` 宿主下同步修复 `chat-answer-fix` 配置字段基线断言。
- 验证：L1/L2 自动测试 179 项（带本机 `DSH_BIN` 173 通过、6 跳过、0 失败）、打包检查（49 文件）、`check:collaborative`、`check:preset-upgrade` 与本机 `desktop-wsl` 桥接侧栏实测均通过。

## 0.2.18 · 2026-11-16

- `tuned` 增加压缩推理档位继承，覆盖手动、自动压力与上下文溢出恢复；同 provider/model 沿用有效档位，独立摘要模型保留自己的配置，支持显式覆盖。
- 继承值和显式值统一检查模型能力，不支持时透传官方摘要；单次调用包装避免并发会话串配置，保留官方摘要、取消、失败及持久化契约。
- 旧调优预设中的官方压缩配置自动映射到修复插件，保留配置和既有会话；修正预设一致性检查及宿主入口发现。
- 补齐配置回退说明：保留 tuned，关闭继承并清除显式及逐模型覆盖；更换为官方包名仍会被兼容映射，不作为退出方式。
- README 按用途、安装、效果、可选预设、已测版本和详细配置重新组织；集中列明实测版本与边界，增加公开压缩实验说明。


## 0.2.17 · 2026-11-14

- 审批正文改为用途与权限两行，保留黄色等待条、原生决定、CUA 会话/持久选项和重要风险告知；适配管理工具、根 PTC/嵌套调用与执行前策略审批。
- 修复格式校验造成的官方功能回归：长理由、换行、占位或 JSON 回退当前官方审批，不再因格式纠正次数耗尽而锁死操作；后续合格理由直接恢复简洁卡。凭据拦截和批准后参数检查保留。
- 修复审批切换时旧快照与新按钮错配、晚加载/重载插件绕过参数复核，以及未知工具权限误判；补齐插件持久授权对象与鼠标控制立即生效/失效条件的告知。
- 聊天表格适应实际消息列宽，使用紧凑单元格和表头；放不下时允许横向滚动，保留完整数字，仅作用于聊天 Markdown。
- 修复旧包名 link 安装更新后调优预设消失：内部模块按实际安装文件定位，保留预设 ID、启用状态、配置与旧会话绑定，无需重装或改包名。
- 增加 rc.2 / rc.3 官方执行对照及旧预设升级回归；rc.3 实际浏览器检查包含卡片、无害文件写入及根 PTC。本机 151 项测试，143 通过、8 跳过；完整范围见验证文档。
- README 增加真实审批预览与两组模拟归档任务的截图对照；原始会话与协作记录不随仓库分发。

## 0.2.14 · 2026-11-14

- 首次 npm 发布准备：包名 `@herenfor/dsh-tune`，保留内部插件 id 和日志目录。
- 调优预设改为引用 scoped 包子路径，补充实际打包安装检查、本地发布脚本及迁移说明。

## 0.2.13 · 2026-11-12

- wait-guard：修复误报兜底。任务完成通知落在同一个回合里时（没有新的 `turn/start`），`waiting` 声明会一直留到回合结束；任务已经结束，回合结束仍会挂 2 分钟兜底，到点再叫醒一次。现在 `job/settled` 后若本会话没有未结束的任务，立即作废 `waiting` 声明并撤掉计时器；回合结束时没有在跑的任务就不挂兜底；兜底到点时任务已结束则记 `backstop-skipped` 直接跳过。收尾清点（任务没认领）行为不变。
- 测试：新增「完成通知落在同一回合」「兜底到点前任务已结束」两条用例，并把三条计时用例补上任务登记；全量 122 项 121 过，未过的仍是 secret-files 的 L2 环境限制。
- 实测：真实后台进程（`sleep 3`）分别驱动旧版和新版：旧版任务结束后仍 `armed`，2 分钟后 `backstop-wake`；新版记 `declared-cleared`、不挂计时器、0 次唤醒；收尾清点照常 1 秒后唤醒。

## 0.2.12 · 2026-11-12

- 适配 DSH `0.2.2-rc.2`：官方聊天界面的 `client.js` 换成压缩写法（字符串用反引号、箭头函数去空格、省分号），chat-answer-fix 的三处锚点全部匹配不到，日志里记成 `unpatched`，回答折叠、显示设置、`todo-reminder` 收尾检查和 `wait-guard` 的 `concludeTurn` 一起失效。现在三处都按正则匹配，压缩前后（rc.1 未压缩写法）都能改，替换时沿用原文引号；找不到要改的那一行时仍原样使用官方文件。
- 调优预设按 rc.2 的 standard 更新：`tool-subagent-control` 加 `config.interrupt: false`，新增 `tool-office`。`skill-filesystem` 的 `customSkillDirs` 没有照抄：它用声明文件里的 `baseUrl` 解析 `@deepseek-ai/dsh-agent-preset/skills`，而调优预设声明在插件包里，照抄会让预设挂载失败；调优模式因此没有 dsh-doc 技能，漂移测试显式允许这一处差异。
- wait-guard 的 L2 契约测试显式挂上 `@deepseek-ai/dsh-tool-executor-native`：rc.2 的 `tools.execute` 需要执行器插件，真实组合里由 dsh-base 提供。
- 验证：全量自动测试 119/120，chat-answer-fix、调优预设、wait-guard 的 L2 都过；`secret-files` 的 L2 在只读 `$HOME` 的环境里建不了临时目录，属环境限制。重启后在 rc.2 的 `web` profile 实测：chat-answer-fix 记为 `patched`（settings/closing 都为 true），`wait-guard` 的 `concludeTurn` 和 `todo-reminder` 的 `closingCheck` 恢复 `true`，调优预设会话正常运行、`interrupt_agent` 不再出现，显示设置刷新后保留。

## 0.2.11 · 2026-11-11

- wait-guard 任务事实新增"转后台"：前台命令到点转入后台时，在结果后附一句，说明结果会自动通知，先做不依赖它的事，确实只剩等它时用一次 `job_output` 的 `wait: true`。A/B 实测里命令转后台后，模型有一半是立刻 `job_output` 看一眼，多花一整步。
- 新增 A/B 实测记录 [docs/ab/2026-11-10-folder-import.md](docs/ab/2026-11-10-folder-import.md)（对比官方原版：耗时持平，步数 -31%，费用 -10.6%，设计还原更好；n=1），统计脚本在 `scripts/ab/`。

## 0.2.10 · 2026-11-10

- 新增 progress-note：一轮进行中，距上一段给用户看的正文超过 3 分钟、其间至少 3 个工具步，就请模型在下一次调用工具时顺带写一两句进展，然后接着干活（参考 Claude Code）。DSH 的模型几乎只在最后写正文，长任务里最长 46 分钟没有一句话。提醒后的第一条回复记进日志，看模型是否照做；子代理不提醒；阈值可配。

## 0.2.9 · 2026-11-08

- todo-reminder 加收尾检查：模型给出最终答复、准备结束这一轮时（DSH 的 `agent/turn-stopping` 钩子），清单还有未完成项，就让模型再走一步、只调一次 `todo_write` 把清单对齐，写完直接结束本轮。每轮最多一次，只管顶层会话；`closingCheck` 默认 `auto`，chat-answer-fix 生效时才开。
- chat-answer-fix：已结束的一轮最后一步只是 `todo_write` 时，取前面最近一段正文当回答，总结不被收进折叠里。
- stream-stall：修复误报。DSH 读到 `message_stop` 就取消读取，插件没撤计时器，`stallSeconds` 后会对已经结束的请求记一次"卡住"（只多一条日志，不影响会话）。现在读到 `message_stop` 或读取被取消时停止计时。

## 0.2.8 · 2026-11-05

- 新增 todo-reminder：任务清单还有没做完的项、又 15 步没更新时，在工具结果后附一条提醒和清单当前内容，让模型对一下进度（参考 Claude Code），并请它和下一个工具调用放在同一步更新，不单独占一步。官方 `todo_write` 只记录不提醒，长任务里清单常常写一次就停在第一项。没写过清单或已全部完成时不提醒；阈值可配。

## 0.2.7 · 2026-11-04

- 调优预设改为默认关闭。用某个预设开始的对话会一直绑在这个预设上，预设没了或加载失败（比如 0.2.6 修的那次 DSH 升级），这些对话就打不开；而它省不省时还没有同任务的耗时数据，不该默认带上。**用过调优预设的请在自己的 `cordis.patch.yml` 里加 `- id: runtime-tuning-preset-tuned` 和 `disabled: false`，否则升级后那些对话会显示「会话不可用」。** 打开方法和注意事项见 docs/configuration.md。
- 新增测试：把调优预设和本机 DSH 的 standard 逐项比较，除了有意去掉和加上的几项，有差异就报出来，DSH 升级后先跑测试再手动更新预设。

## 0.2.6 · 2026-11-04

- 适配 DSH 0.2.2-rc.1，要求的 DSH 版本改为 `>=0.2.2-rc.1`；还在 0.2.1 上请继续用 0.2.5。
- 修复调优预设：0.2.2 去掉了 `dsh-tool-subagent-control/list-agents` 子路径（并进了 `dsh-tool-subagent-control`），旧预设引用它，用调优预设的会话打不开（显示「会话不可用」），新建也不行。预设按 0.2.2 的 standard 更新：去掉这个子路径，`tool-subagent` 的 `modelSelectionSettings` 换成 `modelSelection` / `modelDiscovery`，`tool-fs` 加 `applyPatch: false`，加上插件管理工具，委派组加 `workflowEngine` 隔离。
- chat-answer-fix：显示设置的字段按当前官方 Config 读（0.2.2 加了 `foldedReplies`）；DSH 刚启动时加载器还在重载事务里，搬设置报 `HMR transactions cannot be nested`，现在过一会儿重试。新版加载器（cordis-plugin-loader 1.1）给的条目是迭代器，原来在同一个迭代器上找两次，找不到我们这一行，每次启动都把设置重写一遍（还多写一行 `disabled: false`）；现在先转成数组。

## 0.2.5 · 2026-11-03

- 新增 stream-stall：模型回答开始输出后只剩心跳、连续 `stallSeconds`（默认 180）秒没有新内容时，断开这次请求，DSH 按传输失败自动重试。官方的流空闲超时被心跳重置，服务端降级时会一直停在"思考"。不限制思考时长和输出长度；第一个内容出来之前默认不管。
- 文档里的 dsh-task-notify 改成它的后继 dsh-sentinel。

## 0.2.4 · 2026-11-02

- 修复 chat-answer-fix（0.2.2 引入）：工具步骤的展示方式等显示设置每次重启都回到「详细」。浏览器端按 `ui-chat` 读写这些设置，可正在运行的是替身 `runtime-tuning-ui-chat`：读到的是空配置，改了也存不下。现在浏览器端读写替身这一行；以前存在 `ui-chat` 上的设置启动时搬过来一次，替身这一行已有的字段不覆盖。0.2.3 的配置转交只到了服务端，没有到浏览器，去掉。
- chat-answer-fix 找官方聊天界面时先按 Node 的模块解析从 dsh 入口找，不再只认 pnpm 的安装目录。以前 DSH 不是用 pnpm 装的（npm 全局安装、打包进应用）就找不到，而官方那行已经停用，聊天界面会整个出不来。

## 0.2.3 · 2026-11-01

- 修复 chat-answer-fix（0.2.2 引入）：profile 里官方 `ui-chat` 带着用户设置（比如在设置里改过对话显示方式，写入 `transcriptView`）时，替身把加载器已经解析过的配置又过了一遍 schema，报 `$.collapseTiming expected "completion" | "next-input"`，聊天界面加载不出来，只剩工作区文件夹。现在合并两行的原始配置只解析一次，失败时退回加载器给的配置。用 0.2.2 的请尽快升级。
- 新增 secret-files：凭据文件在沙箱里看不见（bwrap 下盖成一份说明为什么看不到的文件 / 只放说明的只读目录，Seatbelt 加 deny 规则），文件工具也拒绝读写。默认遮 DSH 的 API key、云服务和包仓库凭据；git 组（SSH 私钥、git 凭据、gh 登录）会影响推送，默认不开。Landlock 后端只有文件工具这一道。
- session-tmp：文件工具（read、write、edit、read_image、glob、grep、present）里的 `/tmp` 路径也换成对话目录，结果里再换回 `/tmp`。以前 bash 写进 `/tmp` 的文件，read_image 读不到。
- fs-view：read_image 按文件头认图片格式，扩展名不符（JPEG 存成 `.png`）时读一份扩展名正确的副本，不再拒绝。
- 新增 fs-view：edit 前文件没用 read 读过、或读后被 shell 改过时，按当前版本照常替换，不再报错让模型读一遍再重试（edit 本身按原文精确匹配，对不上照样失败；write 仍要求先读）。77 个会话里这类失败有 46 次。
- 新增调优预设（tuned）：自己写的一份固定预设，去掉定时任务、goal、计划模式、workflow 和 `subagent_fork`，加一段工具使用规则 `tool-use-prompt`（已经知道要什么就并行去拿、只读 shell 检查合并、多文件修改同一步完成），思考和验证都不限制。发行基线 23 步里多出来的步骤大多是"一步只查一样"，用它和 standard 对比把活干完的总耗时。
- 在 DSH `0.2.1-rc.5` web profile 中实测：调优预设出现在模式里并加载规则；`curl` 进 `/tmp` 的图片 read_image 一次读到；扩展名不符的 JPEG 按 JPEG 读出；grep 搜凭据目录被拒；沙箱里 `cat` 凭据文件读到说明（软链接、`cp`、`tar`、python、`env -i`、`dd` 同样，硬链接建不出来）。edit 未读即改只做了自动测试，真实会话里还没触发过。

## 0.2.2 · 2026-11-01

- 新增 chat-answer-fix：DSH 聊天界面只把不带工具调用的最后一步当作回答，wait-guard 用 `concludeTurn` 直接结束的一轮，答复被收进了折叠的步骤里。插件包停用自带的 `ui-chat` 这一行、插入替身：沿用官方包名、转交原来的配置，浏览器端每次启动时从当前版本的官方文件生成，只改这一个判定；找不到时原样使用官方文件。
- wait-guard：`concludeTurn` 默认改为 `'auto'`，只在 chat-answer-fix 生效时直接结束这一轮；否则提示模型把 `task_status` 放在更早的一步。
- 在 DSH `0.2.1-rc.5` web profile 中实测：聊天界面替身正常加载；`task_status` 和答复同条、直接结束的一轮，答复显示在折叠外面；`concludeTurn: 'auto'` 按 profile 里两行的启用情况解析为开启。

## 0.2.1 · 2026-10-31

- wait-guard：bash 命令里自带 `timeout N`（N 超过 30 秒）却没放后台、也没给 `timeoutMs` 时，把 `timeoutMs` 设为 30 秒，到点转后台（DSH 默认要等 60 秒）。真实任务里模型两次写了 `timeout 290` 却放在前台，对话被占住 60 秒，其中一次转后台后它没意识到任务还在跑，又起了一遍。
- wait-guard：被封顶的命令如果到点被杀（bash 的 `promoteOnTimeout` 关掉了），停用封顶并记 `clamp-disabled`，避免封顶把本来能跑完的命令杀掉。
- 新增 net-log：连不上模型服务时记下底层原因（走到哪一步、耗时、错误码）。最近 60 个会话里有 172 次 `transport failed`，106 次都是恰好 5 秒后报错，DSH 自己的日志看不出原因。
- 修复 ask-nonblocking 在 DSH 升级后失效：升级会在 pnpm 仓库里同时留下新旧两份 `dsh-tool-ask-user`，原来的查找要求只有一份，于是每次都退回阻塞版提问（从升级到 `0.2.1-rc.5` 起一直如此）。现在优先用正在运行的 dsh 自己链接的那一份。
- 在 DSH `0.2.1-rc.5` web profile 中实测：`timeout 120` 的前台命令在 30 秒时转后台（原来 60 秒），附带的说明正常送达；阻塞式 `job_output` 的静默改写第一次在真实环境触发；ask-nonblocking 重新生效；net-log 接上了发往 `api.deepseek.com` 的真实请求。60 项自动测试。

## 0.2.0 · 2026-10-30

- 新增 session-tmp（Linux）：同一个对话（包括子代理）的命令共用一个 `/tmp`，上一条命令写进 `/tmp` 的文件下一条还在；别的对话和宿主的 `/tmp` 仍然隔离。起因：日常使用的 90 个会话里有 54 次因为 `/tmp` 文件消失而报错，分布在 25 个会话。
- wait-guard：新增任务事实（`jobNotes`，默认开），在结果后附上 DSH 任务表里的事实：查进程时列出沙箱看不到的后台任务，重复启动同一个脚本时列出旧任务，没有新输出还在查、子代理还在跑时说明会自动通知。用同一次真实任务回放，22 次提醒都落在确实出问题的步骤上。
- wait-guard：新增收尾清点（`turnEndAudit`，默认开）。一轮结束时还有没认领的后台任务，立刻唤醒一次，列出 DSH 任务表里的事实（id、已运行时间、命令），要求模型逐个选择在等、是服务还是 `job_kill`。起因是一次真实任务里，模型在命令沙箱里用 `ps` 看不到后台任务，以为扫描已经退出，留下一个空转 40 分钟的进程。
- wait-guard：前台 `bash`/`pwsh` 超过 30 秒的 `timeoutMs` 在执行阶段静默改为 30 秒（到点转入后台），超过 15 秒的阻塞式 `job_output` 静默改为非阻塞，省掉"被拒绝再重试"的那一步（`silentClamp`，默认开）。
- 修复：附加给模型的上下文改为完整的 user 消息。之前传的是字符串，DSH 下一步读取 `source.kind` 时报错，整轮中断（静默封顶也受影响，只是还没触发过）。
- 在 DSH `0.2.1-rc.5` web profile 中实测：任务事实三种提醒都触发；收尾清点 1 秒后唤醒，模型简短表态；子代理能读到父对话的 `/tmp`。51 项自动测试，其中 session-tmp 用真实的 DSH 沙箱服务和 bwrap 测试。
- 已知限制：命令里的 `ps` 仍然看不到后台任务（需要改 DSH 核心）；模型只用文字表态、不调用 `task_status` 时，任务仍算未认领，30 分钟硬保底照常计时（到点时任务已结束就跳过）。
- 硬保底第一次在真实任务中触发：最后一轮结束 30 分钟后准时唤醒，模型用 `job_list` 和 `job_kill` 两步处理掉遗留任务。

## 0.1.1 · 2026-10-29

- DSH 兼容声明改为范围 `>=0.2.1-rc.4 <0.3.0-0`：之后的 `0.2.x` 版本不用等插件更新就能安装。

## 0.1.0 · 2026-10-29

首个公开版本。

- wait-guard：拒绝前台超过 5 秒的 sleep，以及顶层 agent 超过 15 秒的阻塞式 `job_output`。
- wait-guard：新增 `task_status` 工具（`waiting` / `asking` / `done`），声明 `waiting` 的一轮正常结束后，超过 2 倍预计时间没有新一轮就兜底唤醒模型，最多连续 2 次；按停止结束的一轮不计时。
- ask-nonblocking：在每个顶层 agent 里用官方 `dsh-tool-ask-user` 的 `timed` 模式遮蔽阻塞版提问，默认 1 秒后返回 `pending`；失败时退回阻塞版。
- 在 DSH `0.2.1-rc.4` web profile 中实测：后台任务完成通知唤醒、任务超时的兜底唤醒、提问 1 秒后放行，以及约 72 秒后的回答作为新一轮送进来。
- secret-guard：拒绝向用户索要凭据的提问、参数里带完整令牌的工具调用和 `gh auth token`；工具结果交给模型前把凭据打码。
- wait-guard：硬保底。没有声明 `waiting`、但一轮结束时后台还有任务在跑，默认 30 分钟后唤醒模型（`undeclaredMinutes`）；`task_status` 新增 `services`，列出的任务不计时。
- wait-guard：`task_status` 和最终答复写在同一条回复里、又是唯一的工具调用时，直接结束这一轮（`concludeTurn`）。新会话实测原来每轮都会多请求一次模型，把答复再写一遍。
- wait-guard：有硬保底时 `task_status` 改为可选，只在任务会跑超过 `undeclaredMinutes`、或要标记服务时调用；状态由 runtime 按事实判断。真实长会话里模型几乎从不声明，新会话里声明又常常单独占一步。
- wait-guard 提示词：不要刚启动后台任务就看日志；互不依赖的读取、检查、修改放进同一条回复并行调用。
- 34 项自动测试。
- 已知限制：硬保底“到点唤醒”目前只有单元测试覆盖，真实环境里只验证过开始计时（任务都在 30 分钟内结束了）。
