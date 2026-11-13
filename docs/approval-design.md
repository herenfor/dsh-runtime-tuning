# 审批信息与原生审批卡接入设计

状态：0.2.15-dev.5 已实现第一阶段，并完成 rc.2 / rc.3 原生聊天截图和交互验收，详见 [验收范围](visual-verification.md)。实际接口为 Connection RPC `runtimeTuningApproval/read`，复用 Typert 的认证和 session 资源授权，不另开 HTTP 服务。当前只在具有提权参数 schema 的工具实际 dispatch 期间关联审批；前置审批或缺少可靠关联时保留原生详情。工作目录只显示显式工具参数，文件真实边界保持 unknown；没有实现任意脚本影响分析或文件内容读取。下文保留设计依据和后续验收要求。

界面采用所有者确认的「请求目的 → 本次权限 → 涉及对象 → 原始调用」布局。本设计不改变官方审批策略或授予权限。

## 界面约束

复用 rc.3 `ApprovalPanel.module.css`、主题 token 和官方 Button：正文最高 336px，标题 15px/24px，正文间距 6px、内边距 12px 16px 0，按钮高 36px，外框圆角 20px。宽度沿用聊天列的 680–920px 自适应规则并受可用空间约束。脚本默认只展示入口，不展示 import 等没有决策价值的片段；edit 展示替换片段，完整目录和参数放详情。

目的必须标为「请求目的」，表示模型的请求说明；机器事实从 runtime 提供。脚本中识别的文件始终标「脚本文本引用」，不能据此显示「已确认只修改该文件」或「工作区外」。完整访问权限必须说明不限于展示的文件，不能暗示是单文件授权。

## 已核对的宿主契约（DSH 0.2.2-rc.3）

- `dsh-tools/src/pipeline.ts`：`tools/pre-execute` 在执行/前置审批前运行；`tools/execute` 包装器之后进入工具本体。后者可以修改实际 arguments，不能用模型原始 argsRaw 代替最终参数。
- `dsh-user-approval/src/index.ts`：`approval.request()` 记录官方 asked/decided 审计，通过 `approval/request` waterfall 调用回答者。插件观察器必须原样委托 `next()`，不能自行返回允许，也不更改 never 策略。
- `dsh-sandbox/src/escalation.ts`：宿主已经校验提权参数配对及严格扩权。交给审批层的字段只有 toolName、callId、reason、displayReason、signal；没有独立的 requestedMode / effectiveMode / resolvedPaths。
- `dsh-client-ui-chat` 的详情槽位按 callId 从聊天投影中取 argsRaw，仅输出 command 或 terminal_send.text。
- `dsh-client-ui-approval` 的 ApprovalPanel 组装标题；ApprovalCard 管理答复状态、取消、键盘和按钮。

## 接入方案

新增独立的 `approval-info` 宿主模块及客户端展示模块，共用现有官方 client.js 副本生成机制，但不把所有逻辑塞入 chat-answer-fix。补丁分别报告成功状态，匹配零次/多次时该功能回退官方实现，不能撤销已生效的其他独立修复。

1. **执行前校验。** `tools/pre-execute` 校验已支持工具的提权请求说明，记录会话、agent、callId 与 execution 关联。拒绝缺失说明、只有占位词、超长或含明显凭据的请求；返回一次明确的模型可读错误，要求修正同一工具调用。合法请求继续官方 pipeline。
2. **审批时生成快照。** `approval/request` 的只读观察器关联当前 execution，在工具包装器改写后读取实际参数。生成不可变快照，再委托原审批回答者。只对已验证的官方工具适配；第三方工具或无法对应的请求显示原始信息，不假定权限语义。
3. **按需读取。** 提供经过官方连接认证、会话授权的只读元数据接口。拟定 `POST /runtime-tuning/approval-preview/read`，首次按 sessionId、callId 查询，只在唯一 pending 请求匹配时返回 snapshotId / pendingGeneration；后续读取须带 snapshotId。客户端同时校验原生请求 key 仍有效；不能用快照建立新的批准通道。最终注册 API 在接入实验中确定。禁止仅凭文件路径查询任意文件。
4. **客户端接入。** 在已有 client 副本中确定性替换 ApprovalCommand 的详情注册，保留 useChat 的调用关联。详情包含完整的新布局。原生卡片标题仅在新详情成功挂载并具有对应元数据时隐藏；无 callId、加载失败、契约不符、发生歧义时保留官方标题和原始详情。
5. **保留批准通道。** 继续使用官方 ApprovalCard、canAnswer、answered、onAllow/onReject、请求取消与输入法保护。展开/复制使用真正的 button。不得在整卡 click/普通 Enter 事件中新增批准动作，不新增「永久允许」或假单文件授权。
6. **发布前验证。** 先验证槽位覆盖顺序和生成补丁是否唯一匹配；若无法可靠隐藏原标题并保留官方交互，停止该接入方案，单独设计卡片 factory 适配器，不能先交付一个覆盖不确定的版本。

第一阶段不重写整个审批卡。不改官方 dist，不替换审批服务，不添加额外的模型总结请求。

## 信息来源与可信边界

| 字段 | 来源 | 展示语义 |
| --- | --- | --- |
| 请求目的 | 实际工具参数的 justification | 模型请求说明，语义真实性无法由 runtime 保证 |
| 工具、命令、文件参数 | 当前 execution 的实际参数 | 本次调用事实；不等同于执行后的实际影响 |
| 权限 | 已适配官方工具的 sandbox_permissions | 标为本次调用申请的权限；无结构化授权证据时不声称 effectiveMode 已核实 |
| 工作目录 | 对应工具实际 cwd；缺省按该工具的官方解析规则 | 不把会话根目录一概当作工具 cwd |
| edit/write 目标 | 文件工具 file_path + 实际执行端 FS backend 的解析结果 | 仅能核对真实目标时显示已确认的内/外判断 |
| bash/pwsh 涉及路径 | 有限文本识别 | 候选引用，可能不全；不能解析 shell/Python 的任意语义 |
| 修改预览 | edit 的替换片段；必要时受限的文件版本快照 | 片段不等于完整 diff；replace_all 要标明，不能把一次片段行数说成实际总改动 |
| 脚本规模 | 命令文本的行数与字节数 | 不是修改行数，不是风险等级 |

FS 的 `targetKey` 是不透明身份，不可直接把它当 realpath 显示。执行端确认为本地 FS 且有可用解析能力时，才能解析符号链接；新文件检查最近存在的父目录，权限不足/远端 backend/解析失败均保持 unknown。先比较真实工作区根与真实目标，不用简单字符串 startsWith。检测仅是审批时快照，不能替代执行期的沙箱与防竞态校验。

## 如何约束模型

系统提示要求：提权时说明具体动作和需要扩大权限的原因，说明不能冒充 runtime 检查结论；使用已有 sandbox_permissions + justification，不让模型额外伪造 verifiedPaths、outsideWorkspace 等字段。对支持的直接文件工具优先使用 edit/write，避免为了绕过清晰预览而把同一操作包进 shell；不强制把天然脚本任务拆成大量文件工具调用。

硬校验只处理可判定的问题：缺字段、模式不合法、说明空白/占位、长度超限及明显凭据。不能靠字数、某种语言或「包含因为」判断说明是否真实；不自动把完整访问降级成单文件授权，不替模型补造理由，不通过解析 displayReason 反推权限。一般性「需要更高权限」缺少具体动作时给模型明确纠正反馈；同一 turn+工具名+申请模式+去掉 justification 后的参数摘要最多一次自动纠正（不能按每次都会变化的 callId 重置），连续失败停止重试并说明原因，防止占住对话。

审批的正常运行不依赖模型主动调用额外的“记录审批信息”工具。即使模型忽略提示，用户看到的工具、参数、权限范围和来源标记仍来自 runtime。

## 快照关联、隔离及失效

快照包含 schemaVersion、sessionId、agentId、callId、pendingGeneration、toolName、capturePhase、参数摘要哈希、请求说明、申请权限、实际 cwd、目标及其来源、预览类型、可用状态。摘要不记录到普通诊断日志；脚本/原文只在既有授权客户端按需展示，不额外落盘。

不能只用全局 callId 或「最近一次请求」关联。缺少稳定 execution/request 关联、同一 callId 并发多次审批、参数版本不一致、当前请求取消/已回答时，丢弃元数据并回退，不展示另一请求的内容。接口只服务当前会话的 pending 请求，限大小、短生命周期并设置 no-store；响应迟到不得覆盖新请求。

展示失败回退官方卡片，但策略校验失败绝不能放行工具。元数据观察器异常仍委托官方审批；不读敏感文件来生成预览，权限不足就不读。日志只记状态、工具名、关联 ID、缺失原因，不记命令、理由、内容或凭据。

WSL 场景下元数据必须在实际执行 Host 生成并沿现有桥接路由读取；先证明会话前缀及自定义路由能正确分流。不得用 Windows FS 去解析 Linux 路径，也不得把已有官方批准决定复制成另一端的新授权。无法路由时退回官方展示。

## 验收与实施顺序

- L1：理由格式、未知工具、参数错误、权限来源、片段计数、replace_all、路径候选/realpath、凭据抑制、pending 失效。
- L2：真实 tools→approval 顺序；修改前后参数不同、缺 callId、连续两次提权、并发会话、晚到响应、加载失败、never 策略、取消和拒绝。证明原来拒绝/不可批准的请求仍不能执行。
- L3：rc.2 / rc.3，中英、深浅色、Windows / WSL；真实 shell 和 edit/write 审批；符号链接出工作区、新文件、未知脚本影响；展开/复制/滚动/输入法操作不得批准。检查 336px 正文上限及按钮可见。

按「契约实验 → runtime 校验与只读快照 → UI 接入 → 双端真实验收」推进；未验证的能力明确记录，不把预览稿当作已实现功能。
