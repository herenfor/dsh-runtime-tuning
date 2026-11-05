# 安装与配置

## 使用环境

声明支持 DSH `0.2.2-rc.1` 及之后的 `0.2.x` 版本（`>=0.2.2-rc.1 <0.3.0-0`）；还在 `0.2.1` 上的请用插件 `0.2.5`。调优预设照官方 standard 写，官方改了 standard 里的插件（`0.2.2` 就去掉了一个子路径），预设要跟着更新，所以 DSH 升级后如果调优会话打不开，先看这里有没有新版。实际验证过的是 DSH `0.2.2-rc.1` 的 `web` profile，系统是 Windows 11 + WSL2，Node.js `22.23.4`。DSH 升到 `0.3` 时需要插件更新声明后才能安装。

`headless`、`sdk` 等 profile 暂不支持：wait-guard 会让模型结束一轮去等通知，没有人在看的运行环境不适合这样做。

ask-nonblocking 依赖 DSH 的内部接口（`agent/created` 事件、`agent.ctx`，以及在宿主的 pnpm 目录里找到官方模块），DSH 升级后可能失效。失效时只是退回阻塞版提问，不会影响任务。

## 安装

在 WSL 终端运行：

```bash
dsh plugin --profile web add github:herenfor/dsh-runtime-tuning
```

或者先克隆到本地，再用本地路径安装：

```bash
dsh plugin --profile web add link:/path/to/dsh-runtime-tuning
```

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
| `jobNotes` | `true` | 任务事实：不拦截、不多花一步，只在结果后附一句。命令里有 `ps`/`pgrep`/`pidof` 等时，说明沙箱看不到后台任务并列出本会话还在跑的任务；启动的脚本和一个还在跑的任务相同时，列出那个任务；`job_output` 没有新输出、`list_agents` 里有子代理在跑时，说明完成时会自动通知。只对顶层 agent 生效 |

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
- 文件工具：read、read_image、write、edit 的目标落在这些路径上时拒绝；grep 的搜索目录是它们的上级时也拒绝（DSH 的 grep 会搜隐藏文件）。glob 只列文件名，不拦。

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

插件包带一个叫"调优"的预设，**默认关闭**。打开后在界面上选模式时和"标准"并列，标准模式不受影响。它是自己写的一份固定预设，方向是把活干好、用好工具，不是让模型少想：思考强度不动，验证也不减。相比 standard 去掉日常编码用不到的定时任务、goal、计划模式、workflow 和 `subagent_fork`（工具从 32 个减到 23 个左右），加一段工具使用规则（`tool-use-prompt`）：已经知道下一步要什么时，互不依赖的读取和检查放在同一条回复里并行调用，几个只读的 shell 检查合成一条命令，知道几个文件各要怎么改就同一步改完，查命令用法一次查全，项目里写好的流程读一次就照着做。留下的子插件配置与 DSH `0.2.2-rc.1` 的 standard 相同。打开方法：在自己的 `cordis.patch.yml` 里加

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

官方的 `todo_write` 只把清单写进会话，之后没有任何提醒。长任务里模型常常写一次就忘了，界面上的清单一直停在第一项。这个插件参考 Claude Code 的做法：按会话数步数，清单还有没完成的项、距上次写清单已经 `stepsSinceWrite` 步、距上次提醒也过了 `stepsBetweenReminders` 步，就在这一步的工具结果后面附一条提醒（通过 `deferContext`，和 wait-guard 的附注一样），带上清单当前内容，语气是"进度变了就更新，还准就忽略"。

和 Claude Code 不同：没写过清单、清单为空或已全部完成时不提醒，不引导模型去用这个工具。子代理按自己的会话分开计数。DSH 重启后插件不知道之前的清单，下一次 `todo_write` 之前不会提醒。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 关闭 |
| `stepsSinceWrite` | `10` | 清单多少步没更新才提醒 |
| `stepsBetweenReminders` | `10` | 两次提醒之间至少隔多少步 |

## 配合 dsh-sentinel

[dsh-sentinel](https://github.com/herenfor/dsh-sentinel)（原 dsh-task-notify）按 DSH 的后台任务事件判断：本次请求启动的任务还在跑时，结束的这一轮不发"完成"通知，等任务结束、模型处理完结果后再通知。它也认 `task_status` 里的 `waiting` 和 `services`。两个插件各自独立，不装另一个也能用。

## 日志

子插件会写诊断日志到 `$DSH_HOME/logs/dsh-runtime-tuning/`（默认 `~/.dsh/logs/dsh-runtime-tuning/`），每个子插件一个 JSON lines 文件。日志只记录事件、规则、秒数、会话 id 和状态，不记录命令全文或对话内容。

## 卸载

```bash
dsh plugin --profile web remove dsh-runtime-tuning
```

卸载后重启 DSH。如果在 profile 补丁里写过配置覆盖，也一起删掉。
