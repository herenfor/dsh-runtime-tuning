# 审批 runtime 与两行面板实现方案

状态：`0.2.15-dev.7` 已实现本页的 schema v2、两行界面及官方审批类别适配，完成 rc.2/rc.3 执行对照与 rc.3 隔离浏览器检查；真实会话的基础审批已核对。系统原生 CUA、全部 Desktop/WSL 生命周期及远端环境尚未完成验收，范围见 [visual-verification.md](visual-verification.md)。本页保留设计依据与验收条件，替代旧的“目的、对象、原始调用、展开详情”设计。

## 目标与边界

面板保留原生黄色“等待审批”条、黄色边框和允许/拒绝通道。正文只显示申请原因与申请权限，完整访问使用文字，不画标签盒子，不加展开、复制、脚本或参数区。窄窗自然换行，不能为了物理上的两行而省略权限或持续影响。

审批是工具执行中的 runtime 能力。保留原有工具名称、操作参数、`sandbox_permissions` 和 `justification`，不新增独立的 `request_approval` 工具，不要求每次普通调用填写理由，不增加一次模型总结请求。

策略、审计、取消和一次批准仍由官方 `ApprovalService` / `PendingApproval` 管理。插件增加说明规范、受支持工具的结构化适配及参数关联，不通过展示代码直接授权。不改变会话权限默认值，不自动批准只读查询，不给未知工具推定权限。

## 现有代码给出的约束

| 已有模块 | 可复用的做法 | 本次必须注意 |
| --- | --- | --- |
| `approval-info` | live execution 关联、会话授权 RPC、pending 生命周期、原因格式回退 | 适配已核对的官方类型；决定与执行授权仍由官方通道负责 |
| `wait-guard` | 给模型明确纠正路径；基于稳定操作控制重试 | 会在 `tools/execute` 调整 timeout，不能把最初参数等同于最终参数 |
| `session-tmp` | 在执行端映射路径、保持会话隔离 | `/tmp/x` 可能对应会话私有路径；显示名、实际目标、授权范围不能混为一谈 |
| `secret-guard` / `secret-files` | 工具前阻断、结果脱敏、日志不写正文 | 用户批准不能绕过这些拒绝；理由及新元数据不能复制凭据 |
| `fs-view` | 文件后端适配、图像类型兼容 | 当前 stat/version 同步不等于模型读过文件，也不能作为“用户批准了此版本”的证明 |
| `chat-answer-fix` | 按运行宿主生成客户端副本，锚点唯一匹配，独立功能独立回退 | 继续复用，不能改官方安装文件或损坏已生效的表格修复 |
| `ask-nonblocking` | 尝试保留官方工具并在作用域内调整配置 | 不能直接照搬其包定位逻辑；实际本机日志存在 host-not-pnpm 加载失败 |

已检查 rc.2 / rc.3 的宿主包定位、现有聊天补丁锚点及原生审批卡契约，并加入对应集成测试。相同版本要从实际运行的 Host 定位，复用 `findHostPackage`，不要扫描包缓存后猜选一个版本；契约检查与实际系统权限验收分别记录。

## 真实会话带来的实施取舍

本机只读采样及脱敏统计保存在仓库外，不把原始业务会话放进仓库。经用户确认的模拟任务展示截图单独列在 [approval-examples.md](approval-examples.md)，与原始会话资料分开。

采样表明，实际问题同时包括模型理由、原生前端主动显示命令、以及工具自行拼接 JSON。首版必须把 `plugin_manager` 纳入，而不能只收紧四种工具的字数限制。

已观察到直接申请扩权、没有在此前使用完全相同参数失败的真实调用。因此本次不新增“必须先失败一次”的硬条件，也不自动执行一次失败的命令作为探测。维持官方执行许可条件；参数 schema 的最小权限和拒绝恢复提示继续保留。

历史里没有出现的拒绝、并发、过期和 PTC 分支，必须在隔离 Host 构造验证，不用历史的全允许样本代替它们。

## 同一版本的接入方式

### 1. 保留原生决定生命周期，适配两条前端通道

统一外观为黄色条、原因与权限正文。原生 `PendingApproval` / `PendingQuestion`、`canAnswer`、重复提交保护、请求切换、取消和 answer 回调继续作为决定通道。

工具审批沿用聊天 detail 接缝。CUA 不带 tool callId，不能伪造 callId 来复用这个接缝：为官方 `ApplicationApproval` 增加来源适配，从真实 question.id、intent、subject 和选项生成展示数据，通过同一原生卡片呈现。

因此本版需要在插件生成的官方客户端副本中，为共享卡片增加受控的正文渲染接缝；保留官方 `ApprovalFlow` 的决定逻辑。这个改动也供 CUA 使用，不另造一个决定通道。CUA 生产者提供结构化 view，工具通道通过会话授权 RPC 读取 view；两者复用两行正文组件。所有副本从当前 Host 生成，匹配必须唯一，不修改官方安装文件。

应用访问可能包含 provider 自带的风险说明、应用身份和额外授权选项。应用名进入权限行；关键风险以完整可读文字保留，不用两行外观掩盖它。主批准动作显示实际会话时长，存在“始终允许”时保留对应独立选项及其明确文案，不把它伪装为“仅本次”。正文两项可以自然换行。

`approvalDetails` 原有设置 ID 保留。开关只控制呈现，不关闭校验。表格补丁独立。未知第三方、协议不匹配或运行时失败安全回退原生；已列入本版范围的官方类型，回退只能作为异常保护，不能算适配验收通过。

正文普通 Enter 的处理限定于当前卡片；原生按钮键盘激活、Esc 和输入法保护单独验收。不使用全页面快捷键拦截器。

### 2. 独立的工具适配层

新增 `plugins/approval-contract.mjs`，容纳纯函数形式的原因校验、参数摘要及官方契约适配；`approval-info.mjs` 继续负责 Host 服务、钩子和内存生命周期。不要把所有规则塞进聊天 UI 或增加一套调度器。

| 同版必交付适配器 | 原因来源 | 权限依据 | 本次不改变的行为 |
| --- | --- | --- | --- |
| bash / pwsh | 实际调用的 justification，标记 model | 最终参数、原生严格扩权判断及已核对的审批契约 | 命令、cwd、后台/超时参数由原工具执行 |
| write / edit | 实际调用的 justification，标记 model | 同上，使用实际文件后端 | 不把完整访问说成单文件授权，不把版本同步当授权 |
| plugin_manager | action/target 的确定性说明，标记 tool-adapter | 已核对的官方调用前完整访问检查 | 查询仍按官方要求审批；不自动安装/启用/允许构建脚本 |
| run_code / PTC | transport 最终 justification，标记 model | 官方 PTC transport 的同次扩权请求；子调用独立判断 | 不重放程序，不把外层批准当成内层工具批准 |
| 执行前策略 ask（含 Auto review） | 策略拥有的原因，标记 policy，结合已知工具结构化动作 | 该调用原有权限；不凭 ask 推定权限扩大 | 不新增模型必填参数，不把用户拒绝当成格式纠正 |
| CUA 应用访问 | 官方 question/intent/应用身份，标记 tool-adapter | userQuestions 原有选项与 application-access 权限存储 | 会话授权与持久授权保持区别，不绕过撤销或风险告知 |
| CUA 系统鼠标控制 | 官方 cua-mouse-control intent，标记 tool-adapter | 当前会话的系统指针授权 | 不授予应用访问权限，不绕过 delegated task 禁止操作 |

`plugin_manager` 示例：`list_plugins` → “读取当前配置的插件列表”；安装/启用/删除等 → 说明具体对象和配置的持续影响。目标来自结构化参数，不能靠解析 JSON 审计字符串猜出动作。未知 action 不进入简化展示。

现有管理工具的审计原因仍保留官方内容。本版提供单独的展示元数据，不冒充已经修改了官方审计记录，也不在事件观察器中改写已记录的 reason。

不能只凭工具同名就适配任意第三方实现。核对运行 Host 版本、可见定义和已支持 schema/契约；不识别的定义保留原生。需要修改模型可见 schema 时，先验证当前作用域的官方注册契约，不盲目重名注册。本版可沿用已有字段描述并注入精确提示，无须为了改文案重装所有工具。

### 3. 原因格式与原生兼容

- 自然语言说明具体动作及申请原因，使用用户当前语言。提示词建议约 20–50 个汉字、单段且不超过 160 个 Unicode 字符，不把建议字数当最低或固定长度。
- 160 字、单段和非占位/非 JSON 是启用简洁展示的条件，不是执行权限。格式不符合时不生成简化快照，显示当前请求的官方审批卡，保留原理由、权限和决定通道；不抛格式错误、不自动重试或自动批准。
- 已处于所请求模式、不需要审批的调用，不应被本插件额外要求理由；空白、字段配对等基础合法性由原生工具检查，不能以回退绕过。
- 明显凭据仍返回 `APPROVAL_REASON_INVALID`，错误不回显凭据。凭据检查优先于换行、代码块及长度判断，不能借格式回退展示密钥；已有 `secret-guard` / `secret-files` 继续生效。
- 不维护按轮次锁死操作的格式纠正预算。连续不合格说明仍必须经过原生审批，后续合格说明无需用户另发消息即可恢复简洁展示。用户拒绝、取消、通道不可用继续按原生结果处理，不能诱导再次申请。
- 不截断、不补写理由、不静默换命令；旧会话历史只读呈现，不重新校验或迁移历史工具参数。

格式校验不等于语义真实性检测。权威权限由实际执行端和原生审批决定，不依赖模型理由是否诚实。

### 4. 展示协议与执行绑定

沿用经过 Connection/Typert 认证、session 资源授权的 `runtimeTuningApproval/read`。不增加独立 HTTP 服务。schema 升到 2，客户端只在匹配版本与请求实例时启用简化界面。

```ts
type ApprovalView = {
  schemaVersion: 2;
  channel: 'tool-approval' | 'cua-question';
  snapshotId: string;
  generation: number;
  sessionId: string;
  requestKey: string;
  callId?: string;             // CUA 没有调用 ID，不伪造
  reason: string;
  reasonSource: 'model' | 'tool-adapter' | 'policy';
  permission: {
    kind: 'sandbox-escalation' | 'tool-confirmation'
      | 'application-access' | 'mouse-control';
    requestedMode?: 'workspace-write' | 'danger-full-access';
    subjectName?: string;
    lifetime: 'call' | 'session'; // 当前主动作，持久动作是独立 choice
  };
  choices: readonly {
    id: string;
    lifetime: 'none' | 'call' | 'session' | 'persistent';
    label: string;
  }[];
};
```

DTO 只描述当前原生通道已有的选项，不创建可直接授权的新 RPC。CUA 的持久选项仅在原 provider 确实提供时存在；选择仍由原 PendingQuestion 按原始标识回答。工具通道仍由 PendingApproval 回答。不能将 CUA 的 question 伪装为工具 allowed-once。


本版公开 DTO 去掉 UI 不再使用的完整 command/raw/edit 内容。内部仍持有受控的执行关联和参数摘要，原始调用继续由官方工具记录负责。摘要不作为长期授权令牌，不写入普通日志。

在 `tools/execute` 保持 live execution 关联。只有官方工具真正进入 `approval/request` 后，才从当前执行参数和已核对适配器生成快照，避免使用最初 `argsRaw` 代替经过 timeout/path 适配后的参数。实际沙箱范围由执行端原生校验；不能从 displayReason 文案或脚本内容反推。

快照内部绑定实际 agent、会话、callId、工具定义、请求代次、原生 signal 与参数摘要。等待原生决定后，若拟返回允许，先复核同一实例仍有效、参数未变，再将原生结果返回原调用；不自行制造 allowed-once。变化时终止本次操作，模型必须按新参数重新申请。若当前 Host 的边界不能保证该复核位于执行前，停止启用这项保证，保留原生而不能声称绑定已实现。

不把现在的 `ApprovalSnapshots` 只读关联说成已经实现了执行授权校验。接入时需用有意在等待期间改参的集成测试验证复核是否有效。

增加“已审批参数不可被后续插件改变”的约束前，需要明确兼容的改写阶段。已知 wait-guard/session-tmp 的合法改写先完成再取摘要，不能把它们当成攻击，也不能笼统忽略 timeout 或路径差异。未知的后续变更不得悄悄套用旧批准。

### 5. 不跨越已有安全与停止边界

- `secret-guard`、`secret-files`、官方 guards 的 deny 优先，不因用户同意而解除。
- 官方 never 策略、审计 asked/decided、取消、缺失回答者的拒绝保持原样。
- 审批等待不套用普通用户提问的 timed/pending 处理；超时只能取消/不可用，不能自动允许。
- 审批不是后台任务完成；wait-guard 的唤醒逻辑不能重放已取消/已拒绝的调用。
- 文件目标、策略与快照在实际执行 Host 产生。WSL 沿现有桥接路由读取，同一事件不能在另一端变成一次新的授权。
- “仅本次调用”只限制本次授权，不能掩盖安装插件、修改配置等操作的持续影响。

## 全类型接入细节

### PTC：使用同一 pipeline，单独识别 transport

rc.3 的 `PtcExecutor` 把根 `run_code` 和内层 SDK 调用送入 `ToolExecutionPipeline`；根 transport 由 executor 自己的 resolver 返回，不出现在 `ctx.tools.get()` 中。因此不重名注册 run_code，也不以普通 tools.get 缺失就判定不支持。

在已有 pre-execute / execute / approval 生命周期关联中识别 pipeline 发出的 token、rootCallId、parent、实际参数及已核对 PTC 契约。根审批显示“本次程序执行”的实际模式；子调用用各自 token/callId 生成独立审批。相同父调用不能共用一个 pending grant。rc.2 与 rc.3 分别定位当前宿主的 transport，不硬编码同一目录布局。

### 策略 ask：准备态与执行态分开

pre-execute 入口登记 prepared execution，并保留到结果/取消/turn 清理；不能在 middleware 返回后立即删除，因为原 pipeline 随后才调用 serviceAsk。execute 入口将同一 token 更新为 dispatched execution。

approval/request 到达时，根据实际阶段选择适配器：prepare 阶段确认的是该调用在现有权限下执行；工具本体的请求可能是另一次扩大权限。两次审批使用不同 request generation，不能因为 callId 相同就复用批准。

prepare 批准后到工具本体之间仍会有 timeout 和临时路径规范化。为现有 wait-guard、session-tmp 及涉及批准对象的 fs-view 改写增加内存中的前后参数/规则来源记录，逐项核对它们是否保持同一被批准操作；不忽略整个字段，也不允许任意路径替换。无法证明保持同一操作的改变终止本次调用，按新操作重新申请。

实施前必须通过实验验证“最后改写之后、真正工具副作用之前”的复核位置。不得通过自动返回允许来延后原生审批，不能只在工具已经执行完以后检查摘要。若公共接缝不足，使用插件持有的执行适配器提供该检查位置；不修改官方安装文件。这个分支未解决则本版不具备发布条件。

### CUA：适配问题通道，不接管权限存储

识别官方 `cua-app-access` / `cua-mouse-control` 与 `intent.kind === approval`，从结构化 intent 和原选项生成 view。继续使用官方 application-access/mouse-control 的会话权限存储、撤销版本检查、delegated caller 限制和客户端关闭检查。

CUA 不经 tools 的 ApprovalService，不能指望只修改 approval/request observer 就覆盖它。通过生成的 CUA 客户端生产者适配和共享卡片正文接缝实现，不改 provider 的决定内容，不把普通 ask_user_question 当成审批，不套用 ask-nonblocking 的 timed 模式。系统原生权限弹窗继续由系统与原 provider 管理，不冒充已适配的两行工具审批。

## 进行方法与单版完成条件

开发可以按依赖顺序推进，但只有一个完整候选版本，不发布“只适配了已有 9 个样本”的半成品。

1. **先做契约实验。** rc.2/rc.3 分别验证 prepare ask、根 PTC、PTC 子调用、CUA 问题通道、参数最终复核位置，以及客户端正文接缝。实验失败先解决接缝，不以长期原生回退标记完成。
2. **实现统一协议及来源适配。** 所有上述官方类型一起纳入 DTO、理由来源、真实权限、授权时长与原生选择绑定。简洁格式校验只应用于模型可控制的理由；provider / policy 的关键说明不为长度限制而截断。
3. **接入界面。** 工具与 CUA 共享正文组件，保留黄色条、原生决策状态和各自真实授权选项；未知第三方安全回退。
4. **跑完整行为矩阵。** 每类都有允许、拒绝、取消、失效和并发测试，检查真实副作用；不能仅证明能弹框。
5. **进行实机与升级验收。** 原生截图、真实 Desktop/WSL 路由、已有调用重放、旧 link 安装和预设/旧会话回归，全部通过后才形成可发布候选。

预期代码拆分：`approval-contract.mjs`（纯协议与适配）、`approval-info.mjs`（Host 生命周期与执行复核）、现有参数改写模块的小型来源记录、共享正文组件及官方客户端副本生成器、CUA 生产者适配。保持现有插件 ID 和用户设置，不把业务会话样本加入源码包。

不包含新造一套单文件授权执行器或按域网络防火墙；它们是新能力，不属于适配官方已有审批类别。本版仍必须准确显示现有实际权限，不能用“仅某文件”的文案伪装完整访问。

## 验收门槛

1. **兼容已有调用：** 已有真实参数在内存中离线重放，记录能否生成 DTO；历史调用只用于读取和校验，不执行其中命令。
2. **拒绝能力不下降：** 同一官方策略、参数、用户决定下，原来 deny 的不能变 allow；never、凭据与敏感文件防护各自做执行结果检查。
3. **参数改写：** 覆盖 timeout clamp、会话 tmp 映射、等待期间换参；批准不能用在新参数上，合法规范化不误伤。
4. **生命周期：** 两个 session、同 callId 歧义、多个 pending、旧 snapshot、迟到响应、取消、连接断开、重复点击均不产生越权执行。
5. **模型恢复：** 合法中英说明保留；格式不合格回退原生，连续失败不锁死后续合法请求；用户拒绝不诱导再次申请。检查工具名、schema 与旧会话绑定未破坏。
6. **管理工具：** 查询、安装/移除、启停、版本豁免和持久构建授权分别验证。不能通过两行改造省掉官方要求的额外明确同意。
7. **PTC 与策略：** 根程序批准不覆盖嵌套调用；相同 callId 顺序两次审批不能串用；prepare 期间批准后，合法规范化和非法改参分别验证；重试不会重放已有程序副作用。
8. **CUA：** 应用访问/鼠标控制分别测会话允许、拒绝、取消、持久选项、撤销期间版本变化、delegated caller 与客户端关闭；两种权限不能互相替代。纯 provider fixture 和实际系统授权验收分别标注，不能冒充同一测试。
9. **界面：** 实际 rc.2/rc.3 原生 Host 的深浅色/窄窗截图，黄色条保留，无权限盒子或详情按钮；警告、未知请求回退可见。截图检查后再做允许/拒绝的实际文件或进程结果检查。
10. **桥接和升级：** 真实 Desktop/WSL 路由、元数据认证与授权、旧 link 安装升级、预设启用状态与旧会话继续均通过。隔离 Linux fakewsl 不能替代 Windows Desktop 验收。

发布仍按仓库既有流程由所有者执行；实现、集成测试与实机验收必须分别记录，不能把 HTML 或会话重放计作已经上线。

单版验收矩阵必须逐项记录 rc.2/rc.3 的支持/无此官方能力/未通过状态；只有宿主确实没有该能力时可以标 N/A，不能把“插件尚未实现”写成 N/A。
