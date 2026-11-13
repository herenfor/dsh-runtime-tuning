<div align="center">

# DSH Tune

**少一些阻塞等待，多一些进展反馈，把任务收好尾。**

DeepSeek Harness 的运行调优插件 · npm 包名 `@herenfor/dsh-tune`

[![DSH 0.2.x](https://img.shields.io/badge/DSH-0.2.x-5267df)](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#使用环境)
[![Tests](https://github.com/herenfor/dsh-runtime-tuning/actions/workflows/test.yml/badge.svg)](https://github.com/herenfor/dsh-runtime-tuning/actions/workflows/test.yml)
[![MIT](https://img.shields.io/badge/license-MIT-25845b)](https://github.com/herenfor/dsh-runtime-tuning/blob/main/LICENSE)

[快速开始](#快速开始) · [功能一览](#功能一览) · [配置说明](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md) · [更新记录](https://github.com/herenfor/dsh-runtime-tuning/blob/main/CHANGELOG.md)

</div>

---

让 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 在长任务中更容易协作：慢命令转到后台，提问后继续处理其他工作，长时间沉默时汇报进展，结束前核对任务清单。同时补充凭据保护、会话临时目录、可读的审批卡和跟随聊天列宽的表格。

这些能力通过插件接入；各项配置可以独立调整。安装默认启用常规插件，**额外的 `tuned` 调优预设默认关闭**，无需切换预设即可使用常规功能。

## 快速开始

适用于 DSH `0.2.2-rc.1` 及之后的 `0.2.x` 版本；Node.js 版本需满足所用 DSH 的要求。当前面向有人使用的交互界面，`headless`、`sdk` profile 暂不支持。

**在插件页安装**

打开对应运行端的插件页 → 添加第三方插件 → 填入：

```text
@herenfor/dsh-tune
```

**或在 WSL / Linux 终端安装**

```bash
dsh plugin --profile web add @herenfor/dsh-tune
```

`web` 是 CLI profile；Desktop 和 WSL 桥接端请在各自的插件页操作。npm 安装入口在首次发布后可用；本地路径安装见[安装说明](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#安装)。

安装后等当前任务结束，重启 DSH 并刷新页面。

> **已装过旧版？** 从 GitHub / `link:` 安装迁移时，先备份配置，移除旧包 `dsh-runtime-tuning`，再安装新包，避免重复加载。内部插件 ID、日志目录和原有配置覆盖保持不变。[迁移与安装说明 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#安装)

## 功能一览

| 你遇到的情况 | 插件会做什么 |
| --- | --- |
| 审批框只有一长串命令，不容易判断要允许什么 | 显示请求目的、申请权限、文件参数与替换片段；脚本默认折叠，沿用原生批准与拒绝 |
| 聊天表格过宽、数字被拆开，末列看不到 | 适应实际消息列宽，恢复紧凑单元格与表头；放不下时默认允许横向滚动 |
| 一条慢命令占住对话，反复查后台输出 | 限制长时间前台等待；补充任务运行状态，结束时核对后台任务，必要时兜底唤醒 |
| 模型问了问题就停住，其他工作也不做了 | 让提问短暂等待后返回，用户的回答随后作为插话送达 |
| 干活很久没有一句解释，清单做完也没更新 | 提醒模型顺带汇报进展；定期核对清单，并在结束时补一次收尾 |
| 令牌被索要或出现在工具参数、输出中 | 拦截明显的凭据索取与泄露行为，隐藏已配置的凭据文件 |
| 不同命令的 `/tmp` 不相通，文件修改反复重读 | 为 Linux 会话共享临时目录；减少部分文件操作的重复步骤 |
| 最后答复被收进折叠步骤，或模型只剩心跳不出字 | 修复聊天界面回答判定；无新内容时断开停滞请求，交给官方重试 |

需要看具体模块时：

| 模块 | 职责 |
| --- | --- |
| `wait-guard` · `ask-nonblocking` | 等待、后台任务清点与兜底唤醒；提问不长期阻塞 |
| `todo-reminder` · `progress-note` | 清单更新与收尾；长任务中的进展反馈 |
| `secret-guard` · `secret-files` | 凭据相关工具调用检查、输出打码与文件保护 |
| `session-tmp` · `fs-view` | Linux 会话临时目录；文件编辑与图片格式识别 |
| `approval-info` · `chat-presentation` | 审批说明格式检查、临时只读快照、审批详情与聊天表格样式 |
| `chat-answer-fix` · `stream-stall` · `net-log` | 回答展示修复、内容停滞检测、网络故障诊断 |
| `tuned` 预设（可选） | 去掉部分日常编码用不到的工具，补充工具使用规则；默认关闭，不限制思考 |

所有配置项、默认值和开关见[配置文档](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#配置)。

## 使用边界

- **不会保证任务更快。** 主要改善阻塞等待、进展可见性和收尾；实际耗时仍取决于模型、任务和工具。
- **凭据保护有边界。** 不要把密钥直接粘贴进聊天框；工具输出打码无法移除已经进入对话的内容。
- **审批信息有来源边界。** 目的来自模型的 justification，权限来自本次工具参数；文件真实边界未核实就明确显示未知。不会把脚本当成完整影响清单，也不新增批准通道。
- **部分功能依赖 DSH 内部接口。** 升级 DSH 后需要验证兼容性；非阻塞提问适配失败时会退回官方行为。
- **Linux 沙箱隔离仍然存在。** 会话共享 `/tmp` 不会让 `ps` 看到其他命令的进程。
- **通知与托盘是另一个插件。** 审批提醒、任务通知、托盘启动和崩溃防护见 [DSH Sentinel](https://github.com/herenfor/dsh-sentinel)。

## 效果与验证

插件来自真实会话中的问题分析。已有 rc.1 / rc.2 的真实会话记录。当前候选 **0.2.15-dev.5** 的审批卡与表格，已安装到真实 DSH `0.2.2-rc.2` / `rc.3` 隔离环境，在原生聊天界面检查截图和交互：中英、深浅色、实际 390px 消息列、批准/拒绝/取消及输入法保护。测试使用本地固定回复适配器，工具和审批链真实运行，**不等于生产模型质量或 Windows Desktop 的完整验收**。[本次验收范围与限制 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/visual-verification.md)

一次前端任务的 A/B 对比，使用同一个模型和输入，在新会话中分别运行官方原版与「插件包 + `tuned` 预设」：

| 指标 | 官方原版 | 插件包 + `tuned` |
| --- | --- | --- |
| 耗时 | 42.6 分钟 | 41.9 分钟，基本持平 |
| 步数 | 275 | 189，减少 31% |
| 输入 token（含缓存读） | 6432 万 | 5085 万，减少 21% |
| 当时官方闲时价估算费用 | $0.327 | $0.292，减少 10.6% |

**只有一对样本（n=1），且包含额外预设，不能当成默认安装后的普遍收益。** [查看条件、数据和截图 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/ab/2026-11-10-folder-import.md)

想了解为什么这样设计，以及尝试过哪些方法，见[设计依据与历史验证记录](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/design-notes.md)。

## 配置、排错与卸载

| 你想做什么 | 去哪里看 |
| --- | --- |
| 调整等待时间、进展提醒、清单提醒等 | [配置项与默认值](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#配置) |
| 启用额外的 `tuned` 预设 | [调优预设](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md) |
| 查日志 | `$DSH_HOME/logs/dsh-runtime-tuning/`，默认 `~/.dsh/logs/dsh-runtime-tuning/` |
| 看最近改了什么 | [更新记录](https://github.com/herenfor/dsh-runtime-tuning/blob/main/CHANGELOG.md) |
| 卸载插件 | [卸载步骤](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#卸载) |

## 开发与发布

```bash
npm test                 # Node.js 内置测试，无需安装依赖
npm run check:package    # 实际打包、离线安装并检查预设模块解析
```

仓库名保留为 `dsh-runtime-tuning`，npm 包名为 `@herenfor/dsh-tune`。发布流程、版本管理及所有者操作见[发布说明](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/publishing.md)。

---

[MIT License](https://github.com/herenfor/dsh-runtime-tuning/blob/main/LICENSE)
