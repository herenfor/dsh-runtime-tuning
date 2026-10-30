# 安装与配置

## 使用环境

声明支持 DSH `0.2.1-rc.4` 及之后的 `0.2.x` 版本（`>=0.2.1-rc.4 <0.3.0-0`），小版本更新不用等插件发新版。实际验证过的是 DSH `0.2.1-rc.4` 的 `web` profile，系统是 Windows 11 + WSL2，Node.js `22.23.4`。DSH 升到 `0.3` 时需要插件更新声明后才能安装。

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
| `maxForegroundTimeoutMs` | `30000` | 前台 `bash`/`pwsh` 的 `timeoutMs` 超过这个毫秒数时静默封顶，让慢命令到点自动转入后台；`0` 表示不限制 |
| `maxBlockingWaitMs` | `15000` | 阻塞式 `job_output` 超过这个毫秒数时静默改为非阻塞读取（`silentClamp: false` 时改为拒绝） |
| `silentClamp` | `true` | 在 `tools/execute` 阶段静默钳制超长前台超时与阻塞式 `job_output`，省掉拒绝重试的那一步 |
| `jobsDefaultWaitMs` | `30000` | `job_output` 没写 `timeout_ms` 时按这个值判断（DSH 的默认值） |
| `topLevelOnly` | `true` | 只限制顶层 agent 的 `job_output` |
| `wakeup` | `true` | 设为 `false` 时整个插件不生效。没有唤醒，单独拦截等待只会让任务停住 |
| `backstopFactor` | `2` | 兜底唤醒在 `expected_minutes` 的几倍之后触发 |
| `maxBackstopWakes` | `2` | 你没有发消息时，最多连续唤醒几次 |
| `maxExpectedMinutes` | `240` | `expected_minutes` 的上限 |
| `concludeTurn` | `true` | 模型把最终答复和 `task_status` 写在同一条回复里、且 `task_status` 是这条回复唯一的工具调用时，执行完直接结束这一轮，不再多请求一次模型 |
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

**session-tmp**（只在 Linux 上生效）

DSH 在 Linux 上给每条命令一个新的沙箱，工作区可写模式下 `/tmp` 是一块用完就丢的内存盘，上一条命令写进 `/tmp` 的文件，下一条就找不到了。这个插件让同一个对话（包括它的子代理）的命令共用一个 `/tmp`：每个对话一个权限为 700 的目录，挂到沙箱的 `/tmp` 上。别的对话和宿主的 `/tmp` 仍然看不到。DSH 退出时删除这些目录，启动时清理上次异常退出留下的旧目录。

它包装的是 DSH 内部的 `sandbox.confine`。如果 DSH 改了实现、沙箱参数里找不到 `--tmpfs /tmp`，就原样放行并在日志里记一条 `passthrough`。只读模式、不用沙箱的命令不受影响。

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 关闭 |
| `staleHours` | `24` | 启动时删除超过这么多小时没动过的旧目录 |
| `baseDir` | 系统临时目录下的 `dsh-session-tmp-<uid>` | 对话目录放在哪里 |

## 配合 dsh-task-notify

[dsh-task-notify](https://github.com/herenfor/dsh-task-notify) 按 DSH 的后台任务事件判断：本次请求启动的任务还在跑时，结束的这一轮不发"完成"通知，等任务结束、模型处理完结果后再通知。它也认 `task_status` 里的 `waiting` 和 `services`。两个插件各自独立，不装另一个也能用。

## 日志

子插件会写诊断日志到 `$DSH_HOME/logs/dsh-runtime-tuning/`（默认 `~/.dsh/logs/dsh-runtime-tuning/`），每个子插件一个 JSON lines 文件。日志只记录事件、规则、秒数、会话 id 和状态，不记录命令全文或对话内容。

## 卸载

```bash
dsh plugin --profile web remove dsh-runtime-tuning
```

卸载后重启 DSH。如果在 profile 补丁里写过配置覆盖，也一起删掉。
