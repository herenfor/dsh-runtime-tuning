# 安装与配置

新增的 `collaborative` 协作预设、工具发现与 grep 增强，见[协作预设配置](collaborative-preset.md)。它保留完整 standard 组合；原 `tuned` 配置继续独立使用。

## 使用环境

面向有人使用的交互式 Web / Desktop（包括 WSL 桥接端）。声明安装范围由 `package.json` 的 `engines.dsh` 给出；**已测版本、环境及未覆盖范围统一见 [README 的版本表](../README.md#已测版本)**。升级宿主后，依赖内部接口的能力需要重新检查。

`headless`、`sdk` 等 profile 暂不支持：等待与提醒功能按交互式会话设计。部分模块适配失败时会退回官方行为；旧宿主的配套版本可查 [更新记录](../CHANGELOG.md)。

## 安装

在插件页添加第三方插件，填写 `@herenfor/dsh-tune`；或在 WSL 终端安装稳定版：

```bash
dsh plugin --profile web add @herenfor/dsh-tune
```

正式发布使用 npm `latest` 标签；目标版本与实测范围见 [README](../README.md#已测版本)。测试版发布到 npm `beta` 标签后，可指定 `@herenfor/dsh-tune@beta`。也可使用下面的本地源码安装方式。

或者先克隆到本地，再用本地路径安装：

```bash
dsh plugin --profile web add link:/path/to/dsh-runtime-tuning
```

从旧的 GitHub/link 安装迁移时，先备份 profile 配置，等任务结束，再移除旧包 `dsh-runtime-tuning` 后安装新包；不要同时启用两份。内部插件 id、日志目录和原有配置覆盖保持不变。命令里的 `web` 是 CLI profile；Desktop 或 WSL 桥接端请在相应插件页操作，避免装错运行位置。

安装后，等当前任务结束，再重启 DSH 并刷新浏览器页面。作者本机用的是 `link:` 方式。

## 配置

在 profile 的 `cordis.patch.yml`（比如 `~/.dsh/profiles/web/cordis.patch.yml`）里按 id 覆盖：

```yaml
- id: runtime-tuning-wait-guard
  config:
    backstopFactor: 3
- id: runtime-tuning-ask-nonblocking
  config:
    timeout: 30
```

`config` 是整块替换的，没写的项使用默认值。可以用 `dsh --profile web --dump-config` 确认结果。

**wait-guard**

| 配置 | 默认值 | 说明 |
|---|---|---|
| `maxSleepSeconds` | `5` | 前台 sleep 超过这个秒数就拒绝 |
| `maxForegroundTimeoutMs` | `30000` | 前台 `bash`/`pwsh` 的 `timeoutMs` 超过这个毫秒数时静默封顶，让慢命令到点自动转入后台；没给 `timeoutMs`、但 bash 命令里自带的 `timeout N` 超过它时，也设成这个值（DSH 默认要 60 秒才转后台）；`0` 表示不限制。封顶依赖 DSH 的超时转后台，如果关掉了 bash 的 `promoteOnTimeout`、被封顶的命令到点被杀，插件会停用封顶并记一条 `clamp-disabled` |
| `maxBlockingWaitMs` | `15000` | 阻塞式 `job_output` 超过这个毫秒数时静默改为非阻塞读取（`silentClamp: false` 时改为拒绝） |
| `silentClamp` | `true` | 在 `tools/execute` 阶段静默钳制超长前台超时与阻塞式 `job_output`，省掉拒绝重试的那一步 |
| `jobsDefaultWaitMs` | `30000` | `job_output` 没写 `timeout_ms` 时按这个值判断（DSH 的默认值） |
| `topLevelOnly` | `true` | 只限制顶层 agent 的 `job_output` |
| `wakeup` | `true` | 设为 `false` 时整个插件不生效。没有唤醒，单独拦截等待只会让任务停住 |
| `backstopFactor` | `2` | 兜底唤醒在 `expected_minutes` 的几倍之后触发 |
| `maxBackstopWakes` | `2` | 你没有发消息时，最多连续唤醒几次 |
| `maxExpectedMinutes` | `240` | `expected_minutes` 的上限 |
| `concludeTurn` | `'auto'` | 模型把最终答复和 `task_status` 写在同一条回复里、且 `task_status` 是这条回复唯一的工具调用时，执行完直接结束这一轮，省一次模型请求。`'auto'`：只在 chat-answer-fix 生效时这样做（DSH 原版聊天界面会把这样结束的一轮的答复收进折叠里）；`true` / `false` 强制开关 |
| `undeclaredMinutes` | `30` | 硬保底：没有声明 `waiting`、但一轮结束时后台还有任务在跑，过这么多分钟唤醒模型；`0` 表示关闭。模型在 `task_status` 的 `services` 里列出的任务不计时 |
| `turnEndAudit` | `true` | 收尾清点：一轮正常结束时还有没认领的后台任务（没声明 `waiting`、不在 `services` 里），1 秒后唤醒一次，列出任务 id、已运行时间和命令，要求模型逐个选择：在等、是服务、`job_kill`。每个任务只问一次，不表态就退回 `undeclaredMinutes` 硬保底；子代理、按停止结束的一轮不问 |
| `jobNotes` | `true` | 任务事实：不拦截、不多花一步，只在结果后附一句。命令里有 `ps`/`pgrep`/`pidof` 等时，说明沙箱看不到后台任务并列出本会话还在跑的任务；启动的脚本和一个还在跑的任务相同时，列出那个任务；`job_output` 没有新输出、`list_agents` 里有子代理在跑时，说明完成时会自动通知；前台命令到点转入后台时，说明结果会自动通知，先做不依赖它的事，确实只剩等它时用一次 `job_output` 的 `wait: true`。只对顶层 agent 生效 |

**ask-nonblocking**

| 配置 | 默认值 | 说明 |
|---|---|---|
| `timeout` | `1` | 提问后几秒返回 `pending`；`-1` 表示一直等，相当于原来的阻塞行为 |

**secret-guard**

| 配置 | 默认值 | 说明 |
|---|---|---|
| `askGuard` | `true` | 拒绝向用户索要令牌、密码、API key 的 `ask_user_question` |
| `callGuard` | `true` | 拒绝参数里带完整令牌的工具调用，以及 `gh auth token` |
| `redact` | `true` | 把工具结果里的凭据替换成 `[REDACTED:…]` 再交给模型 |

目前识别的凭据格式：GitHub 令牌（`github_pat_`、`ghp_`、`gho_`、`ghu_`、`ghs_`、`ghr_`）和 `sk-` 开头的 API key。用户直接在聊天框里粘贴的内容不经过工具，secret-guard 管不到。

**secret-files**

DSH 的沙箱只限制写、不限制读：整个文件系统只读挂进去，沙箱里还能联网，用户能读的凭据文件命令都能读到。secret-guard 只能在结果里按格式打码，模型换个编码输出就认不出了。这个插件让凭据文件在沙箱里直接看不见，文件工具也读不到：

- 命令：bwrap（Linux）下文件盖成一份两行的说明（这里是凭据、对 agent 隐藏、需要时请用户自己做），目录盖成只读的空目录、里面只放这份说明 `HIDDEN-BY-DSH.txt`。读到的人一眼知道原因，不会误以为是工作区沙箱不让读工作区外的文件；Seatbelt（macOS）在规则末尾加 `deny file-read*`（macOS 上还没有实测）。Landlock 这类只能列"允许读哪里"的沙箱没法排除子路径，原样放行，日志里记一条 `unsupported`，只剩文件工具这一道。
- 文件工具：`read`、`read_image`、`write`、`edit`、`open_sidebar` 的目标落在这些路径上时拒绝；`grep` 的搜索目录是它们的上级时也拒绝（DSH 的 `grep` 会搜隐藏文件）。`glob` 只列文件名，不拦。

按组列路径，只遮实际存在的，WSL 下还会遮 `/mnt/c/Users/*` 里 Windows 那一份：

| 组 | 路径（相对用户目录） | 默认 |
|---|---|---|
| `dsh` | `.dsh/.credentials.yaml`（`DSH_HOME` 改过时跟着走） | 开 |
| `cloud` | `.aws/credentials`、`.config/gcloud`、`.azure`、`.kube/config`、`.docker/config.json` | 开 |
| `registry` | `.cargo/credentials.toml`、`.cargo/credentials`、`.pypirc` | 开 |
| `git` | `.ssh`、`.git-credentials`、`.netrc`、`.config/gh/hosts.yml` | 关：打开后沙箱里的 `git push`、`gh` 会失败 |
| `npm` | `.npmrc` | 关：私有源的令牌常在这里，装包时要用 |

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 关闭 |
| `groups` | `['dsh', 'cloud', 'registry']` | 遮哪几组 |
| `extraPaths` | `[]` | 另外要遮的绝对路径（文件或目录） |
| `allowPaths` | `[]` | 放行的路径，在它下面的都不遮 |

遮挡是挂载层面的，不按路径字符串匹配：在沙箱里通过软链接、`cp`、`tar`、python `open()`、`env -i` 的子进程去读，读到的都是说明；沙箱里建不了指向它的硬链接；`stat` 看到的是说明文件的大小和权限。文件工具那一道先解析软链接再比对。

已知的缺口：

- git 组默认不开，gh 的登录信息仍然读得到（命令要用它推送）；
- 环境变量里的凭据（比如 `GH_TOKEN`）、凭据的副本和备份、放在名单以外位置的凭据，都不在管辖范围内；
- 沙箱外事先建好的硬链接是另一个路径，两道都挡不住；
- 能看出"这里有一个被遮住的凭据文件"（单个文件在 bwrap 里没法做成不存在，只能换成别的内容）；
- 不用沙箱的运行模式、只有 Landlock 的机器，只剩文件工具这一道。

**session-tmp**（只在 Linux 上生效）

DSH 在 Linux 上给每条命令一个新的沙箱，工作区可写模式下 `/tmp` 是一块用完就丢的内存盘，上一条命令写进 `/tmp` 的文件，下一条就找不到了。这个插件让同一个对话（包括它的子代理）的命令共用一个 `/tmp`：每个对话一个权限为 700 的目录，挂到沙箱的 `/tmp` 上。别的对话和宿主的 `/tmp` 仍然看不到。DSH 退出时删除这些目录，启动时清理上次异常退出留下的旧目录。

它包装的是 DSH 内部的 `sandbox.confine`。如果 DSH 改了实现、沙箱参数里找不到 `--tmpfs /tmp`，就原样放行并在日志里记一条 `passthrough`。只读模式、不用沙箱的命令不受影响。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 关闭 |
| `staleHours` | `24` | 启动时删除超过这么多小时没动过的旧目录 |
| `baseDir` | 系统临时目录下的 `dsh-session-tmp-<uid>` | 对话目录放在哪里 |
| `fileTools` | `true` | 文件工具里的 `/tmp` 路径也换成对话目录（见下） |

文件工具（read、write、edit、read_image、glob、grep、present）不进沙箱，看到的是宿主的 `/tmp`：bash 里 `curl -o /tmp/x.png` 之后 `read_image /tmp/x.png` 必然找不到。工作区可写的对话里，插件把这些工具参数里的 `/tmp` 路径换成同一个对话目录，结果和报错里的对话目录再换回 `/tmp`，模型只看到一个 `/tmp`。每次替换在 `session-tmp.log` 里记一条 `mapped`。

**fs-view**

DSH 的 edit 要求文件先用 read 工具读过、且读后没变，否则报"file has not been read"或"file changed since it was read"，模型要先读一遍再重试。日常 77 个会话里这样失败了 46 次，大多是模型先用 bash 的 `sed` / `grep` 看过文件（不算读过），或用 python、`sed -i` 改过文件（版本变了）。

edit 按 `old_string` 精确替换，还要求它在文件里唯一，原文对不上照样失败，所以这层"先读"对 edit 来说是重复的校验。插件在 edit 前把期望的文件版本换成当前版本，失败的那一步省掉。write 是整个文件覆盖，没有这层校验，仍然要求先读。每次替换在 `fs-view.log` 里记一条 `edit-synced`（`unread` 或 `stale`）。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 关闭 |
| `editSync` | `true` | 设为 `false` 时 edit 照旧要求先读 |
| `imageSniff` | `true` | read_image 按文件头认格式（见下） |

read_image 先按扩展名定格式，字节对不上就拒绝，比如 curl 下来的 JPEG 存成了 `.png`，模型得改名再读。插件按文件头认出真实格式（PNG、JPEG、GIF、WebP），和扩展名不一致时复制一份扩展名正确的副本给它读，读完删掉，结果里的路径仍是原文件。每次在 `fs-view.log` 里记一条 `image-retyped`。

**chat-answer-fix**（聊天界面）

DSH 的聊天界面只把"不带工具调用的最后一步"当作回答显示。一轮如果是带着工具调用结束的（比如 wait-guard 的 `concludeTurn`），答复会被收进折叠的步骤里，要点开才看得到。插件包停用 profile 里自带的 `ui-chat` 这一行，插入 `runtime-tuning-ui-chat`（`ui-chat/index.mjs`）：它沿用官方包名，服务端原样转出官方实现；浏览器端是每次启动时从当前版本的官方文件生成的副本，改两处：已经结束的一轮，最后一步带工具调用也算回答；显示设置（工具步骤的展示方式 `transcriptView`、折叠时机、用量明细、链接打开方式）读写 `runtime-tuning-ui-chat` 这一行，因为正在运行的是它。以前存在 `ui-chat` 上的显示设置，启动时把这一行还没有的字段搬过来一次（日志记 `settings-carried`），之后以这一行为准。找不到回答判定那一行时原样使用官方判定，日志记 `unpatched`。

和其他插件的关系：依赖聊天界面的界面插件按包名找它，替身沿用官方包名，不受影响；桌面版首次引导写的显示设置仍按官方写到 `ui-chat`（只影响桌面版）。只有另一个插件也替换聊天界面时会冲突（两份同名的聊天界面），这时关掉其中一个。wait-guard 的 `concludeTurn: 'auto'` 按 profile 里这两行的实际启用情况判断，关掉替换后它会自动回到"答复单独一步"。

不想要这个替换，在自己的 `cordis.patch.yml` 里写：

```yaml
- id: ui-chat
  disabled: false
- id: runtime-tuning-ui-chat
  disabled: true
```

**调优预设（tuned）**

插件包带一个叫"调优"的预设，**默认关闭**。打开后在界面上选模式时和"标准"并列，标准模式不受影响。它是自己写的一份固定预设，方向是把活干好、用好工具，不是让模型少想：思考强度不动，验证也不减。相比 standard 去掉日常编码用不到的定时任务、goal、计划模式、workflow 和 `subagent_fork`（工具从 32 个减到 23 个左右），加一段工具使用规则（`tool-use-prompt`）：已经知道下一步要什么时，互不依赖的读取和检查放在同一条回复里并行调用，几个只读的 shell 检查合成一条命令，知道几个文件各要怎么改就同一步改完，查命令用法一次查全，项目里写好的流程读一次就照着做。留下的子插件配置与 DSH `0.2.2-rc.2` 的 standard 相同；唯一的例外是 `skill-filesystem` 的 `customSkillDirs`（standard 用声明文件里的 `baseUrl` 解析 `@deepseek-ai/dsh-agent-preset/skills`，调优预设声明在插件包里解析不到，照抄会让预设挂载失败），所以调优模式没有 dsh-doc 技能。打开方法：在自己的 `cordis.patch.yml` 里加

```yaml
- id: runtime-tuning-preset-tuned
  disabled: false
```

打开前要知道：**用某个预设开始的对话会一直绑在这个预设上**，聊过之后不能换成别的预设；DSH 恢复对话时找不到这个预设（关掉了、卸载了插件包，或者 DSH 升级后预设里的某个官方插件对不上）就打不开，显示"会话不可用"，历史还能看，但不能继续。所以用过调优预设之后，卸载插件包或关掉预设前，先把要继续的对话结束掉；DSH 升级后调优对话打不开，先看插件包有没有新版。这份预设是手写的，不会跟着官方的 standard 自动变；插件包的测试会把它和本机 DSH 的 standard 逐项比，官方一改就报出来，再手动更新。

**net-log**

DSH 的会话日志里，连不上模型服务时只写一句 `DeepSeek Messages transport failed`，底层原因丢掉了。这个插件订阅 Node 的 undici 诊断频道，请求失败时记下目标主机、路径（不含查询串）、请求走到了哪一步（`sent` 已发出 / `body-sent` 请求体发完 / `headers` 收到响应头）、耗时和错误码。它只观察、不改请求，不记请求头和内容。第一次看到目标主机的请求时记一条 `watching`，说明已经接上。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 关闭 |
| `hosts` | `['deepseek.com']` | 只记录这些主机（含子域名）的请求 |

**stream-stall**

服务端降级时，模型的回答可能输出一点后就不再出内容，但连接不断、每隔几秒发一次心跳。官方的流空闲超时（`streamIdleTimeoutMs`，默认 5 分钟）每收到一次心跳就重新计时，所以永远不会触发，官方的自动重试也就不会启动，界面一直停在"思考"。

这个插件包一层全局 `fetch`，只管 POST 到 `…/messages`、接受 `text/event-stream` 的请求（DeepSeek 的 Messages 接口，以及同协议的其他服务）。响应原样转交给 DSH，同时数一下事件：心跳和 `message_start` 不算进展。回答开始出内容以后，连续 `stallSeconds` 秒没有新内容，就断开这次请求。DSH 把它当作传输失败，`llm-retry` 按默认策略自动重试，会话里会记一条 `llm/retry`。它只看两次内容之间的间隔，不限制思考多久、输出多长；你按停止时照常停下。停用后还原 `fetch`。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 关闭 |
| `stallSeconds` | `180` | 开始出内容后，连续多少秒没有新内容算卡住 |
| `firstContentSeconds` | `0` | 第一个内容出来之前（可能在排队）最多等多少秒；`0` 表示不管，仍按官方的空闲超时 |

**todo-reminder**

官方的 `todo_write` 只把清单写进会话，之后没有任何提醒。长任务里模型常常写一次就忘了，界面上的清单一直停在第一项。这个插件参考 Claude Code 的做法：按会话数步数，清单还有没完成的项、距上次写清单已经 `stepsSinceWrite` 步、距上次提醒也过了 `stepsBetweenReminders` 步，就在这一步的工具结果后面附一条提醒（通过 `deferContext`，和 wait-guard 的附注一样），带上清单当前内容，语气是"进度变了就更新，还准就忽略"，并请模型把更新和下一个工具调用放在同一步，不单独占一步。

和 Claude Code 不同：没写过清单、清单为空或已全部完成时不提醒，不引导模型去用这个工具。子代理按自己的会话分开计数。DSH 重启后插件不知道之前的清单，下一次 `todo_write` 之前不会提醒。

收尾检查：中途提醒之后，模型仍可能在最后一次提醒和交付之间做完剩下的事，结束时清单差几项没打勾。DSH 在模型给出最终答复、准备结束这一轮时会调用 `agent/turn-stopping` 钩子；这时清单还有没完成的项，插件就往下一步排一条消息，让模型只调一次 `todo_write` 把清单对齐（真没做完的项保持原状），不再写第二段话。这一步只有 `todo_write` 时直接结束本轮；模型若又开始干活（同一步还有别的工具），照常继续。每轮最多检查一次，只管顶层会话（子代理的最后一步要交回父会话）。

DSH 的聊天界面只把一轮的最后一步当作回答，最后一步只有 `todo_write` 时整轮就没有回答、总结被收进折叠里。chat-answer-fix 为此多改一处：已结束的一轮最后一步只是 `todo_write` 时，取前面最近一段正文当回答。所以 `closingCheck` 默认 `auto`：chat-answer-fix 的这处修改生效时才开。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 关闭 |
| `stepsSinceWrite` | `15` | 清单多少步没更新才提醒 |
| `stepsBetweenReminders` | `15` | 两次提醒之间至少隔多少步 |
| `closingCheck` | `'auto'` | 结束一轮时清单还有未完成项就让模型补一次；`auto` 表示 chat-answer-fix 生效时才开，也可写 `true` / `false` |

**progress-note**

DSH 的模型几乎只在最后才写正文，干活时不说话：近期 17 个长会话里，带工具调用的步骤写了正文的比例大多是 0%，最长一段连续 208 步、46 分钟没有一句给用户看的话。界面并不隐藏中途的回复，缺的只是模型开口。这个插件参考 Claude Code：顶层会话一轮进行中，距上一段可见正文（或用户发话）超过 `minutes` 分钟、其间至少 `minSteps` 个工具步，就在这一步的工具结果后附一条提醒，请模型在下一次调用工具时顺带写一两句进展（用用户的语言），然后接着干活。提醒里说明"不带工具调用的回复会结束这一轮"，免得模型停下来汇报。

每次提醒后的第一条回复记进 `progress-note.log`（`text-with-tools` 照做、`tools-only` 没写、`text-only` 停下来了），用来看模型怎么回应。子代理不提醒（它的话不直接给用户看）。按近期会话回放，1 小时左右的任务大约提醒 15 次。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 关闭 |
| `minutes` | `3` | 多少分钟没有可见正文才提醒，也是两次提醒的最短间隔 |
| `minSteps` | `3` | 其间至少多少个工具步 |

**sidebar-open（`open_sidebar`）**

让模型在生成或排查期间可主动调用 `open_sidebar`，把工作区/本地文件（`path`，支持 `line` 行号与 `destination: 'sidebar' | 'float'`）或网页（`url`，`http://` / `https://`）直接打开到用户当前在屏会话的右侧栏预览。后台会话触发时先排队，等用户切回该会话后补开一次；刷新页面或翻看历史消息不会重复弹出；对话内渲染可展开的重开操作行。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 在 `runtime-tuning-sidebar-open` 下设为 `false` 可关闭该工具与侧栏自动打开 |

如要彻底停用前端侧栏模块加载，也可在 profile 的 `cordis.patch.yml` 中写 `- id: runtime-tuning-sidebar-open` + `disabled: true`。

**conversation-find（对话内全历史查找）**

为 DSH Desktop 与 Web 提供独立插件模块（`runtime-tuning-conversation-find` / `@herenfor/dsh-tune-conversation-find`），支持在当前主对话的全部历史（含尚未加载到窗口中的更早分页）中进行字面量查找：

- **打开与浮窗交互**：
  - 主对话右上标题栏固定放大镜按钮（Web 与 Desktop 通用）；
  - Desktop 默认快捷键：`Ctrl+F`（Windows / Linux）或 `Cmd+F`（macOS）；
  - Web 默认快捷键：`Ctrl+Alt+F`（Windows）或 `Cmd+Alt+F`（macOS，可在 DSH 快捷键设置内改键，Web 浏览器默认不接管 `Ctrl+F`）；
  - 查找浮窗可通过左侧拖拽把手或浮窗空白处拖动位置（记忆到浏览器 `localStorage` 并做视口边界钳制），双击拖拽把手复位回右上角；
  - 支持区分大小写（`Aa`，激活保持蓝底白字）、回车跳转下一处 / `Shift+Enter` 上一处（兼容 IME 组合输入）、`Esc` 依次关闭范围菜单与查找栏并归还焦点（阻断 `Esc Esc` 误触发）。
- **查找范围与二次菜单**：
  - **默认仅搜对话正文**：只匹配用户提问与助手回复正文（`user` 与 `response`），排除思考过程、工具调用/Bash 输出、斜杠命令、注入上下文、压缩摘要、待办列表与轮次错误，避免高亮与结果被执行细节淹没；
  - **二级范围 / 右键菜单**：点击工具条中的范围筛选按钮，或在查找浮窗非输入/摘录区域**右键**打开范围菜单，可单独勾选思考过程、工具调用/输出、斜杠命令、注入上下文、压缩摘要、待办列表、轮次错误，或一键切换「仅搜正文 / 全部范围」；非默认范围激活时按钮亮蓝色圆点提示。
- **增量分页与 DOM 定位**：打开时先对已加载事件窗口（含瞬时流式 delta）做字面量匹配；若存在更早未加载历史，提供独立「搜索全部历史 / 暂停 / 继续」控件按分页向后扫描至 `seq 0`（单会话保留最近 8 MiB 解析文本缓存与紧凑命中定位；超出淘汰后可按区间按需重读摘录）。跳转到命中项时自动按需翻页加载目标轮次、按激活范围过滤并触发 `hidden="until-found"` 的 `beforematch` 与收起态展开，使用 `TreeWalker` 与 `CSS.highlights` 高亮并滚入视口；若目标在视图中不可见，弹出摘录预览卡片并附带「重新定位」。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `interceptCtrlFOnWeb` | `false` | 易失设置（不持久化覆写用户自定义）；仅在 Web 端且主对话激活、无弹窗/全屏侧栏遮挡、焦点不在第三方输入控件内时接管 `Ctrl+F` / `Cmd+F` 打开对话查找，其余场景放行浏览器原生查找 |

如需停用前端对话查找模块，可在 profile 的 `cordis.patch.yml` 中添加 `- id: runtime-tuning-conversation-find` 与 `disabled: true`。

### 上下文压缩推理档位修复（`compaction-effort`）

- **挂载位置**：在 `cordis.patch.yml` 的 `调优（tuned）` 预设（`runtime-tuning-preset-tuned`）的隔离 `compaction` 组内，将 `compaction-basic` 指向 `@herenfor/dsh-tune/plugins/compaction-effort.mjs`（同时在 `plugins/tool-use-prompt.mjs` 的预设解析中把该行以及既有定制的 `@deepseek-ai/dsh-compaction-basic` 自动映射到同一实现；第三方的自定义压缩插件名保留不变）。
- **默认行为**：
  - 主对话与摘要目标同属同一 `(provider, model)` 且模型元数据包含该档位时，单次 `summarize` 调用作用域内继承主对话最新 `request/header` 的有效 `reasoningEffort`（例如主对话为 `max` 时摘要请求也发 `max`，以保持复用已有前缀缓存的配置条件；主对话为 `high` 或仅依赖 adapter/模型默认档位时同理保留对应有效值）。
  - 若配置了独立的 `summarizationProvider` / `summarizationModel`（与主对话不同），保留摘要目标模型自身的配置与默认值，不强塞主对话的 `reasoningEffort`。
- **可选配置项**（写在 `compaction-basic` 的 `config` 或 `modelPolicies[]` 条目内）：
  - `inheritReasoningEffort`（布尔，默认 `true`）：设为 `false` 可关闭隐式继承，回退官方默认行为。
  - `summarizationReasoningEffort`（字符串，可选）：显式指定摘要请求使用的 `reasoningEffort`，优先级高于隐式继承（对同模型和独立模型均生效；若目标模型不支持则会按模型能力校验丢弃并透传官方行为）。
- **其他预设 / 独立挂载**：官方 `standard` / `ptc` / `cordis` / `minimal` 默认保持未修改；若自定义预设或非预设单实例部署也需要该修复，可在其配置中将 `compaction-basic` 指向 `@herenfor/dsh-tune/plugins/compaction-effort.mjs`。
- **升级、兼容与禁用回退**：通过 `findHostPackage` 动态定位运行中 DSH 的 `@deepseek-ai/dsh-compaction-basic` 并派生其 `BasicCompactionEngine`；若上游接口变更导致 `summarize` 不匹配，插件会记录降级事件并回退到原始实现。实测版本与范围集中记录在 [README](../README.md#已测版本)。由于既有 `tuned` 会话会持久化 `agent-preset/selected: "tuned"`，直接禁用 `runtime-tuning-preset-tuned` 或卸载插件包会使尚未切换预设的既有会话触发 `Unknown agent preset: tuned`。若要在保持既有 `tuned` 会话可恢复的前提下恢复官方压缩行为，请保留 `tuned` 并设置 `inheritReasoningEffort: false`（并移除顶层及逐模型的显式 `summarizationReasoningEffort` 和 `inheritReasoningEffort: true` 覆盖）；如需彻底禁用 `tuned` 预设或卸载插件包，须先迁移既有 `tuned` 会话的预设绑定。

## 配合 dsh-sentinel

[dsh-sentinel](https://github.com/herenfor/dsh-sentinel)（原 dsh-task-notify）按 DSH 的后台任务事件判断：本次请求启动的任务还在跑时，结束的这一轮不发"完成"通知，等任务结束、模型处理完结果后再通知。它也认 `task_status` 里的 `waiting` 和 `services`。两个插件各自独立，不装另一个也能用。

## 日志

子插件会写诊断日志到 `$DSH_HOME/logs/dsh-runtime-tuning/`（默认 `~/.dsh/logs/dsh-runtime-tuning/`），每个子插件一个 JSON lines 文件。日志只记录事件、规则、秒数、会话 id 和状态，不记录命令全文或对话内容。

## 卸载

先将仍在使用 `tuned` 或 `collaborative` 的任务交接到标准预设的新会话。DSH 已开始的会话不能直接切换预设；如果还需要继续原会话，请保留对应预设和插件。卸载会同时移除这些预设。

```bash
dsh plugin --profile web remove @herenfor/dsh-tune
```

卸载后重启 DSH。如果在 profile 补丁里写过配置覆盖，也一起删掉。


### 审批详情与聊天表格（0.2.17）

审批卡默认收敛为两行纯文本展示（第一行显示请求用途与可选风险徽章，第二行显示申请权限范围与生效期限；不展示原始命令或 JSON），同时保留官方黄色等待条、边框与原生批准/拒绝按钮及快捷键守卫；CUA `cua-app-access` 与 `cua-mouse-control` 经由 `user-questions/request` 通道同步适配。宿主侧 `approval-info` 提供基于 schema v2 的 `runtimeTuningApproval/read` 临时只读快照、模型 `justification` 的简洁格式检查（不合格回退原生审批，不阻断原生合法调用；明显凭据仍拦截），以及 `prepare()` → `dispatch()` 审批后参数完整性校验（合法 `wait-guard`、`session-tmp`、`fs-view` 改写放行，未授权篡改 fail-closed）。

两项显示功能可分别关闭。写入当前运行端 profile 的 `cordis.patch.yml`，待任务空闲后重启并刷新（亦可在设置面板直接切换并实时生效）：

```yaml
- id: runtime-tuning-ui-chat
  config:
    tableLayout: false       # 关闭表格布局覆盖
    approvalDetails: false   # 关闭两行纯文本审批展示，恢复官方 ApprovalCard 与原生命令详情
```

默认两项都是 true。关闭详情展示不会关闭凭据安全检查、快照或篡改检查。要关闭整套 `approval-info` 后端拦截、格式校验与只读快照服务：

```yaml
- id: runtime-tuning-approval-info
  disabled: true
```

运行在 WSL 的任务，需要在 WSL 端安装和配置；插件不会从 Windows 文件系统推断其他宿主路径。请求目的仍来自模型 `justification` 或工具适配元数据，不能由 runtime 保证语义真实；支持的 schema、快照或 UI 锚点缺失/不匹配时自动回退官方展示，不替换批准决定通道。完整验收范围见 [本次验收](visual-verification.md)。
