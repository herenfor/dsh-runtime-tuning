# DSH Runtime Tuning · 运行时优化插件

[![MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.4-blue)](#使用环境)

减少 DeepSeek Harness 在运行时白白等待的时间：模型不再用前台 sleep 或长时间阻塞把整轮对话卡住，后台任务的完成通知没来时有兜底唤醒，向你提问后也不再停下来干等。

这是一个社区插件，以 DSH bundle 的形式安装，里面包含两个子插件。

## 功能

### wait-guard：不让等待卡住对话

DSH 会在后台任务结束时通知模型（模型忙时插进下一步，空闲时开启新的一轮），系统提示词也要求"不要轮询、不要 sleep"，但模型常常不照做。wait-guard 在工具执行前强制执行这条规则：

- 拒绝前台超过 5 秒的 `sleep` / `Start-Sleep`，提示改用 `run_in_background: true`。
- 拒绝顶层 agent 超过 15 秒的阻塞式 `job_output`（`wait: true`），提示先做别的事或结束这一轮。子代理不受限制。
- 新增 `task_status` 工具，模型在一轮的最后声明状态：
  - `done`：做完了，或者只是回答 / 提问；
  - `waiting`：还有需要的后台任务在跑，同时给出 `waiting_for` 和 `expected_minutes`；
  - `asking`：在等你回答。
- **兜底唤醒**：声明 `waiting` 的一轮正常结束后开始计时。如果超过 2 × `expected_minutes` 还没有新一轮（比如任务卡死、完成通知没来），就唤醒模型去检查任务。
  - 连续最多唤醒 2 次，你发一条消息后重新计数。
  - 你按停止结束的一轮不计时：你叫停的事，插件不会再拉起来。

### ask-nonblocking：提问不阻塞

DSH 自带的 `ask_user_question` 已经实现了 `timed` 模式：超时后返回 `pending`，模型继续做不依赖这个回答的事；你之后的回答会作为插话送进来。但默认是阻塞的 `legacy` 模式，而且这个工具嵌在各个 agent preset 内部，profile 补丁改不到它的配置（见 [DSH 讨论 #8547](https://github.com/deepseek-ai/deepseek-harness/discussions/8547)）。

ask-nonblocking 在每个顶层 agent 创建时，用宿主里同一份官方 `dsh-tool-ask-user` 注册一个 `timed` 版本，遮蔽 preset 里的阻塞版：

- 默认 1 秒后返回 `pending`，模型继续工作，这一轮可以正常结束；
- 你晚些时候的回答会开启新的一轮；
- 必须等到回答才能继续的问题，模型可以在单次调用里传 `timeout: -1`。

任何一步失败都只写日志，agent 保持原来的阻塞版提问。

## 使用环境

只在 DSH `0.2.1-rc.4` 的 `web` profile 下验证过，系统是 Windows 11 + WSL2，Node.js `22.23.4`。

ask-nonblocking 依赖 DSH 的内部接口（`agent/created` 事件、`agent.ctx`，以及在宿主的 pnpm 目录里找到官方模块），DSH 升级后可能失效。失效时只是退回阻塞版提问，不会影响任务。

`headless`、`sdk` 等 profile 暂不支持：wait-guard 会让模型结束一轮去等通知，没有人在看的运行环境不适合这样做。

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

## 配合 dsh-task-notify

[dsh-task-notify](https://github.com/herenfor/dsh-task-notify) 的未发布版本能识别 `task_status`：声明 `waiting` 的一轮不发"完成"通知，等任务结束、模型声明 `done` 后再通知。两个插件各自独立，不装另一个也能用。

## 日志

两个子插件都会写诊断日志到 `$DSH_HOME/logs/dsh-runtime-tuning/`（默认 `~/.dsh/logs/dsh-runtime-tuning/`），每个子插件一个 JSON lines 文件。日志只记录事件、规则、秒数、会话 id 和状态，不记录命令全文或对话内容。

## 卸载

```bash
dsh plugin --profile web remove dsh-runtime-tuning
```

卸载后重启 DSH。如果在 profile 补丁里写过上面的配置覆盖，也一起删掉。

## 开发

```bash
npm test
```

测试只用 Node.js 自带的 `node:test`，不需要安装依赖。

## 许可证

[MIT](LICENSE)
