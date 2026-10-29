# 安装与配置

## 使用环境

只在 DSH `0.2.1-rc.4` 的 `web` profile 下验证过，系统是 Windows 11 + WSL2，Node.js `22.23.4`。

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
| `maxBlockingWaitMs` | `15000` | 阻塞式 `job_output` 超过这个毫秒数就拒绝 |
| `jobsDefaultWaitMs` | `30000` | `job_output` 没写 `timeout_ms` 时按这个值判断（DSH 的默认值） |
| `topLevelOnly` | `true` | 只限制顶层 agent 的 `job_output` |
| `wakeup` | `true` | 设为 `false` 时整个插件不生效。没有唤醒，单独拦截等待只会让任务停住 |
| `backstopFactor` | `2` | 兜底唤醒在 `expected_minutes` 的几倍之后触发 |
| `maxBackstopWakes` | `2` | 你没有发消息时，最多连续唤醒几次 |
| `maxExpectedMinutes` | `240` | `expected_minutes` 的上限 |

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

## 配合 dsh-task-notify

[dsh-task-notify](https://github.com/herenfor/dsh-task-notify) 的未发布版本能识别 `task_status`：声明 `waiting` 的一轮不发"完成"通知，等任务结束、模型声明 `done` 后再通知。两个插件各自独立，不装另一个也能用。

## 日志

子插件会写诊断日志到 `$DSH_HOME/logs/dsh-runtime-tuning/`（默认 `~/.dsh/logs/dsh-runtime-tuning/`），每个子插件一个 JSON lines 文件。日志只记录事件、规则、秒数、会话 id 和状态，不记录命令全文或对话内容。

## 卸载

```bash
dsh plugin --profile web remove dsh-runtime-tuning
```

卸载后重启 DSH。如果在 profile 补丁里写过配置覆盖，也一起删掉。
