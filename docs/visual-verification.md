# 审批卡与聊天表格的验收范围

当前候选：`@herenfor/dsh-tune@0.2.15-dev.7`，未发布 npm。本轮围绕 schema v2 两行纯文本审批卡与 6 条审批通道重构完成测试与验收，并保留 rc.2 / rc.3 旧版本升级回归（旧预设可用、旧会话继续、新调优会话运行，安装清单及预设启用配置保持不变）。

## 实际运行方式

将 `@herenfor/dsh-tune` 挂载到隔离的临时 `DSH_HOME` 与 `web` profile，启动真实 `DSH 0.2.2-rc.3` web server 及由插件生成的聊天客户端，通过真实 `tools → prepare → approval/request → dispatch` / `user-questions/request` 工具链与无头 Chromium CDP（含 `Fetch` 请求拦截模拟慢 RPC）进行截图、看图、DOM/样式量测与键鼠交互检查；其中 Host 侧在 Web 模式下挂载了 E2E 测试驱动与模拟 `CuaAccess` stub。说明：`rc.3` 官方 `@deepseek-ai/dsh-plugin-manager` 当前声明的 `inject` 缺少 `approval` 依赖（非免审模式下上游会直接报错），因此浏览器实机 E2E 中 `plugin_manager` 通道在 `minimal` 会话注册官方参数契约（8 个 action）并补充 `approval` 注入后调用真实 `approveEscalation` 链路验证，同时由纯合约单元测试覆盖全部参数与边界。独立静态 HTML 预览不计入验收。

| 环境 | 已验证范围 | 限制 |
| --- | --- | --- |
| Linux / WSL 内 DSH 0.2.2-rc.3 | 6 条审批通道、两行纯文本卡渲染与换行、key/focus/IME 守卫、异步快照防串卡、重载后防篡改、官方工具来源校验、根 `run_code`（`PtcExecutor`）格式回退与官方执行兼容对照、CUA warning 弹窗、`approvalDetails` / `tableLayout` 开关、深浅色与 `375×812` / `1280×900` 截图及升级回归 | E2E 工具由测试驱动触发、CUA 由 Web 侧模拟 stub 驱动、`plugin_manager` 因上游 `rc.3` 缺少 `approval` 注入而在 E2E 中以带 `approval` 注入的官方契约测试桩触发真实 `approveEscalation`；未接生产 LLM，也未实测 Windows/macOS 原生桌面 CUA |
| Linux / WSL 内 DSH 0.2.2-rc.2 | 原生旧预设升级回归；`Cordis`/`ToolsService`/`NativeToolExecutor`/`PtcExecutor` 宿主集成回归；两段相同普通归档任务的真实审批与产物核对 | 完整自动化实时浏览器 E2E 运行于 `0.2.2-rc.3`；真实任务样例不代表全部生命周期验收 |
| dsh-wsl 0.1.12，rc.3 桥接单元契约 | WSL 前缀会话的 schema v2 快照透传与契约检查 | 使用仓库单元模拟运输；未实测真实 Windows Electron ↔ WSL2 跨端 |
| Windows Desktop / 局域网使用端 | 尚未验收本次候选 | 未在真机 Desktop / 独立使用端实机验收 |

## 检查内容

- 两行审批卡与纯文本契约：`bash` 提权、`write`/`edit`/`apply_patch`、`plugin_manager` 适配器（含 `install_bundle` 的 `target`/`registry`/`approvedBuilds` 与 `set_version_exemption` 的 `runtimeVersion` 及跨会话持久化、宿主沙箱外运行、崩溃与数据丢失风险披露）、`run_code` 根调用与 PTC 嵌套 `:ptc:1` 调用均只渲染标题与权限说明两行纯文本（无 `<pre>`/`<code>`、无原始命令或 JSON），保留原生黄色顶条与边框。
- 来源校验与异步竞争防护（`verifyOfficialToolContract` / CDP `Fetch`）：未通过官方工具契约校验的自定义工具（如 `third_party_tool`）强制按原生审批卡呈现而非简化为两行卡片；同一会话连续切换 pending 审批且第二个 `runtimeTuningApproval/read` RPC 被 CDP 阻塞时，前端同步回退原生卡而不闪现上一张卡快照，跨会话切换时由 `AbortController` 与序列/引用校验拦截迟到或中止响应，不污染目标会话。
- 原生功能兼容及拒绝/取消：rc.2 / rc.3 对比“官方执行链”和“加审批增强”的结果与审批审计；180 字理由、占位词、换行、代码及 JSON 回退原生，连续格式失败后的合格理由正常恢复简洁卡，无需新用户消息；Bash 使用官方工具定义并执行无害 printf，PTC 使用官方 executor 与无副作用 runtime。允许、拒绝、取消、unavailable、never 及官方空白参数错误保持一致，回退不自动允许、不重放调用。明显凭据继续拦截。
- 键盘守卫：`<input>` 聚焦时按 `Escape` 与合成输入法 `isComposing` 期间按 `Enter` 均不触发审批提交；正常 `Escape` 拒绝不执行命令；点击 `Allow once` 后真实执行工作区命令且触发 `wait-guard` 合法超时钳制（`999999ms → 30000ms`）。
- 改写与防篡改（含晚加载/重载插件）：合法插件改写（`wait-guard`、`session-tmp`、`fs-view`）在审批通过后放行；未登记的参数篡改——包括先加载 `approval-info` 后再重载/挂载的新插件对参数篡改——均在执行前触发 fail-closed（`APPROVAL_POST_REWRITE_MISMATCH`），被篡改命令不执行。
- CUA 问题审批通道：`cua-app-access`（含 `Risks` 警告徽章、弹窗展开及 `Always allow`）与 `cua-mouse-control`（明确告知允许后立即移动指针及仅记住至关闭会话/重启 DSH）正常渲染两行卡片（不含大号 `subject` 块、不伪造 `callId` 或 `'allowed-once'`）。
- 开关回退、深浅色与换行：`approvalDetails: false` 在线切换后恢复官方 `ApprovalCard` + `ApprovalCommand` 原生命令详情；`tableLayout` 可在线切换；深色模式 `375×812`（`scrollScrollWidth: 304 <= 304`，`docOverflow: 0`）与 `1280×900` 下超长无空格路径在卡片内自动换行且无横向滚动条、无控制台或页面异常。
- 自动化测试覆盖：`node --test` 覆盖纯协议与适配单元测试（schema v2、6 条通道、`verifyOfficialToolContract`、Reason 校验、原生格式回退及后续合法请求恢复、改写与防篡改、UI 异步竞争隔离与降级、国际化文案、`dsh-wsl` 桥接等），以及基于真实 `0.2.2-rc.2` / `0.2.2-rc.3` `Cordis` + `ToolsService` + `NativeToolExecutor` + `PtcExecutor` 的宿主集成测试（注：当环境中无全局 `dsh-cli` 安装时，依赖外部 CLI 安装路径的历史遗留用例会按前置条件跳过，不计入通过数）。

自动化验收截图、候选包、验收脚本和原始量测保留在工作区外部临时/会话草稿目录，不进入 Git 或 npm 包。

经用户确认可公开的四张模拟任务截图作为展示资源保存在 `.github/assets/approval/`，不会进入 npm 包；示例条件及解读见 [真实审批展示](approval-examples.md)。原始会话、私人交接文档、候选包与测试日志仍留在仓库外。

本机真实任务核对：相同普通提示词、standard、同一模型与权限设置；六次审批均与实际参数对应并允许一次，相关执行成功。独立读取两组最终产物均为 60 份数据 CSV、6,000 条观测，清单分别 69/69、68/68 匹配。原生展示组仍有 wait-guard，不作为“纯官方 vs 整套插件”性能对比；缺失理由和取消等边界未在该组样例自然触发。

## 有意保留的边界

请求目的来自模型 `justification` 或工具 `tool-adapter` / 声明元数据；runtime 只能约束可判定的格式，不能保证其语义真实。支持的参数 schema、快照或 UI 锚点缺失时保留原生 `ApprovalCard` + `ApprovalCommand` 展示，不替换官方批准决定通道；快照仅保存在 pending 生命周期内的内存中，经由既有授权 RPC 只读读取。

这是候选版本：Windows Desktop 与独立使用端真机验收完成后，再决定正式 npm 发布。
