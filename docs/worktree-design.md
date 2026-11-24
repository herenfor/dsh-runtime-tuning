# Worktree 可视化与管理设计方案

状态：一期（`ui-worktree`，只读可视化与跳转）与二期（`ui-worktree-manage`，受控新建 / 双重门禁删除 / 剪枝与可选 `create_worktree` 工具）均已实现，并通过自动化单测与包校验。定位为 `dsh-runtime-tuning` 新增 UI 模块，采用**可视化与变更操作拆分为两个独立功能**的策略：先交付只读的侧边栏 Worktree 树可视化与跳转（一期），再独立交付从会话/面板新建、删除与剪枝 Worktree（二期）。

## 1. 功能拆分与边界

| 阶段 | 模块建议 | 职责 | 风险等级 |
| --- | --- | --- | --- |
| 一期（MVP） | `ui-worktree`（可配 `Config` 开关） | 右侧栏树状可视化、可选 Commit 分叉图、DSH Workspace/会话状态关联与一键切换 | 只读，零破坏性操作 |
| 二期（独立） | `ui-worktree-manage`（或独立插件挂载） | UI 与会话内创建派生 Worktree、挂载新/Fork 会话、门禁校验后删除与 `prune` | 写盘与 Git 变更，独立门禁与配置开关 |

一期完全不暴露修改本地仓库状态的写接口，用户可在 `cordis.patch.yml` 中分别启停两个能力。

## 2. 入口与侧边栏双姿态 UI

主界面放在 **右侧栏自定义 Tab**（通过 DSH `sidebarRightTabs.register` + keyed `sidebar.right.pane.tab` / `sidebar.right.pane.tab.title` 注册 `worktree` 页签），天然继承官方右栏的**停靠（Docked）、拖拽浮窗（Floating）和全屏展开（Fullscreen）**能力，不侵入左侧原生栏内部结构。

- **触发入口**：
  1. 聊天顶栏 `conversation.session.header.actions` 轻量分支徽章（显示当前分支 + 脏状态圆点，点击打开/聚焦右栏 `worktree` 页签）；
  2. 左侧 Workspace 行右键菜单（`ctx.contextMenus`，`target: 'workspace'`）增加「查看 Worktree 树」；
  3. 右侧栏 Guide 页签入口。
- **宽度自适应布局（纯 SVG 连线 + HTML 卡片，无重型第三方图库依赖）**：
  - **窄侧栏（停靠态，宽度不足）**：自动切换为**紧凑垂直分层树**，保留树形缩进与 SVG 拐角连线；
  - **宽视图（浮窗拉宽 / 全屏展开）**：自动切换为 **2D 树状图画布**（左→右或上→下卡片 + SVG 三次贝塞尔连线，支持拖拽平移、滚轮/按钮缩放与一键居中）。

## 3. “树”的颗粒度可选（工具栏一键切换）

画布顶部提供视图模式开关（记忆在 `localStorage`），按需切换，避免默认加载拖慢大仓库：

1. **Worktree 派生树（默认）**：
   - 节点 = Git Worktree；父子连线依据 `merge-base` 与分支派生关系推断（非扁平列表）；
   - 卡片直接聚合显示：分支名、当前命中标记、相对路径、`↑ahead ↓behind`、脏文件数、`detached / locked / prunable` 状态、以及关联的 DSH 会话数与运行中状态（`turn` / `subagent` / `job`）；
   - 选中节点在底部/侧边详情区列出最近 3~5 条 commit 摘要与该 Worktree 下的 DSH 会话，点击会话直达 `ctx.uiWorkspace.openSession(sessionId)`；双击卡片或点「进入 Worktree」时，若尚未注册为 Workspace 则先调 `ctx.workspaces.create({ path })`，再调用 `ctx.uiWorkspace.openWorkspace(workspaceId)`。
2. **Worktree + Commit 分叉图（可选开关）**：
   - 仅当用户切换到此模式时触发单独的按需 RPC（默认态零额外开销）；
   - 仅拉取各 Worktree 活跃分支近期 `N` 条提交（如最近 20 条）及关键共同祖先分叉节点，以轻量泳道/DAG 轨展示分叉与合流点，不扫描全仓库历史。

## 4. 技术架构与 DSH 0.2.2 接入约束

参照 `ui-conversation-find/` 与 `ui-sidebar-open/` 组织为 `ui-worktree/`（`index.mjs` Host + `client.js` Client，React 无 JSX 写法并复用 `--dsw-*` 主题 token）：

- **Host ↔ Client 通信通道**：
  - Host 端注入 `connection` 和 `webServer`，通过 `ctx.webServer.register` 注册 `/dsh-tune-worktree` 前缀路由，由 `ctx.connection.admit(req)` 校验 Origin/Host 和浏览器认证；
  - 注意：**不要使用 `ctx.connection.rpc.intercept('/api', ...)`**，`/api` 单拦截器槽位已被 `dsh-api-gateway` 占用；
  - Client 端注入 `['connection', 'workspaces', 'uiWorkspace', 'sessions', 'sidebarRightTabs', 'sidebarRight', 'slots', 'locale', 'contextMenus']`，通过 `ctx.connection.rpc.call('/dsh-tune-worktree', endpoint, payload, signal)` 发起调用。
- **Git 查询与性能优化**：
  - 全程使用 `execFile('git', args)`，严禁 shell 字符串拼接；通过 `git rev-parse --git-common-dir` 归属主仓库与各 linked worktree；
  - **两阶段加载**：第一阶段秒回 `git worktree list --porcelain` 骨架 + DSH Workspace/会话映射，先渲染树；第二阶段限流并发补充 `status --porcelain=v1 -b` 与 `merge-base`；
  - 不做后台高频 `setInterval` 轮询，仅在打开页签、切换会话或手动点击刷新时拉取。
- **路径归一化与边缘状态**：
  - Host 端对每个真实存在的 worktree 路径执行 `fs.realpath`，再与 `ctx.workspaceRegistry.list()` 的 `Workspace.path` 对齐，避免软链/WSL 路径不一致导致重复创建 Workspace；
  - 对非 Git 目录、bare 仓库、detached HEAD、submodule 与目录已消失的 `prunable` 记录显式呈现降级状态，不抛未捕获异常。

## 5. 二期规划简述（新建与删除功能）

二期作为独立功能/插件扩展挂接到一期的卡片菜单、详情栏及对话流程中（不把破坏性操作塞进一期）：

- **UI 新建 & 从会话新建**：基于当前会话或选中 Worktree 分叉出新目录（可配置路径模板如 `../<repo>-wt/<slug>`），支持同时新建空白会话或 Fork 当前上下文到新 Worktree；
- **Agent 会话内新建工具（可选）**：提供隔离 worktree 创建工具或快捷操作，让用户可在对话中让 Agent 在独立 worktree 启动任务；
- **安全删除 / 清理**：Host 端强制双重门禁——(1) Git 工作区与暂存区 clean 校验；(2) DSH 无活跃运行中的会话活动；禁止默认 `--force`，对已缺失目录仅提供 `git worktree prune`。
