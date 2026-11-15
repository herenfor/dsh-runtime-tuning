<div align="center">

# DSH Tune

**看清审批，减少等待，让长任务有进展、有收尾。**

DeepSeek Harness 运行调优插件 · `@herenfor/dsh-tune`

[![npm](https://img.shields.io/npm/v/%40herenfor%2Fdsh-tune)](https://www.npmjs.com/package/@herenfor/dsh-tune)
[![Tests](https://github.com/herenfor/dsh-runtime-tuning/actions/workflows/test.yml/badge.svg)](https://github.com/herenfor/dsh-runtime-tuning/actions/workflows/test.yml)
[![MIT](https://img.shields.io/badge/license-MIT-25845b)](https://github.com/herenfor/dsh-runtime-tuning/blob/main/LICENSE)

[安装](#安装) · [实际效果](#实际效果) · [本次更新](#本次更新) · [已测版本](#已测版本) · [配置文档](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md)

</div>

慢命令放到后台，提问后继续处理其他工作，长时间沉默时提醒汇报，结束前核对任务清单。审批卡和聊天表格也更容易阅读。

**常规功能安装即用；`tuned` 调优预设按需开启。** 本次新增的压缩缓存修复在 `tuned` 中生效。

<a id="快速开始"></a>

## 安装

在对应运行端的 **插件页 → 添加第三方插件** 中填写：

```text
@herenfor/dsh-tune
```

WSL / Linux 的 CLI `web` profile 也可使用：

```bash
dsh plugin --profile web add @herenfor/dsh-tune
```

安装或更新后，等当前任务结束，再重启 DSH 并刷新页面。Desktop 和 WSL 桥接端请在各自的插件页操作。[源码安装、旧包迁移 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#安装)

<a id="功能一览"></a>

## 能帮你做什么

| 能力 | 主要变化 |
| --- | --- |
| 审批更清楚 | 用途与权限两行呈现，保留黄色等待条、原生决定和重要风险告知 |
| 等待可继续 | 慢命令转后台，补充任务状态，完成后核对收尾 |
| 长任务有反馈 | 非阻塞提问、进展提醒、清单核对及等待兜底 |
| 回答更易读 | 表格随消息列宽排版，修复部分答复被折叠的问题 |
| 凭据多一道保护 | 检查凭据相关调用，隐藏敏感文件，给工具结果打码 |
| `tuned` 压缩缓存 | 沿用同模型主对话的有效推理档位，减少可避免的非缓存输入 |

所有模块均可独立配置。[配置项、默认值和开关 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#配置)

<a id="审批预览"></a>

## 实际效果

### 审批先看懂，再决定

![真实审批示例：申请原因、仅本次调用的完整访问权限，以及拒绝和允许一次按钮](https://raw.githubusercontent.com/herenfor/dsh-runtime-tuning/main/.github/assets/approval/create-tuned.png)

上图来自真实会话：**414 字符、11 行命令**对应 **38 字符的申请原因**。模型自行填写原因，用户通过原生按钮决定是否允许。简洁展示不改变授权范围；格式不合格时回退官方展示。

[更多真实截图与兼容验证 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/approval-examples.md)

### 压缩时复用已有缓存

直接挂载本插件的受控手动压缩对照：

| 指标 | 官方默认摘要 | 开启修复 |
| --- | ---: | ---: |
| 缓存命中率 | 0% | **98.85%** |
| 非缓存输入 tokens | 34,055 | **391** |
| 摘要费用，包含实际输出 | 基准 | **减少 70.7%** |

这组实验采用同一份合成上下文，分别运行官方摘要器与修复插件。服务端原始用量与适配器统计逐项核对，表中费用由实际输入、输出按公开 API 费率折算。两组总输入均为 34,055 tokens。

[实验环境、方法与数据 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/compaction-cache.md)

历史前端任务采用同一模型、同一输入和两个新会话做一对 A/B：官方原版对比「整包 + `tuned`」。调优组步数减少约 31%、累计输入含缓存减少约 21%，耗时基本持平。[完整 A/B 记录 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/ab/2026-11-10-folder-import.md)

## 本次更新

- **压缩缓存修复**：手动、自动压力与溢出恢复共用修复；同模型沿用有效推理档位，独立摘要模型保留自己的配置。
- **兼容原有会话**：旧 `tuned` 预设中的官方摘要器会自动映射到修复实现，保留已有配置和会话绑定。
- **能力不支持时回退**：继承值与显式覆盖都经过模型能力检查；并发会话分别解析，不修改共享 LLM 服务。

当前源码目标版本、实测环境集中见下表。[完整更新记录 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/CHANGELOG.md)

## 可选：开启调优预设

在当前 profile 的 `cordis.patch.yml` 中启用：

```yaml
- id: runtime-tuning-preset-tuned
  disabled: false
```

然后在会话中选择「调优」。常规插件安装后即可使用；现有会话继续沿用各自记录的预设，`tuned` 会话也保持原有绑定。

如只想关闭压缩档位继承，请**保留 `tuned`**，在其 `compaction-basic` 配置中设 `inheritReasoningEffort: false`，清除显式 `summarizationReasoningEffort` 和逐模型继承覆盖。直接禁用整个预设或卸载插件前，应先迁移仍绑定它的会话。[详细配置与回退 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#上下文压缩推理档位修复compaction-effort)

## 已测版本

**源码目标包：`@herenfor/dsh-tune@0.2.18`。** npm 徽章显示 registry 当前已发布版本；安装前可在 [npm 版本页](https://www.npmjs.com/package/@herenfor/dsh-tune?activeTab=versions)核对。

| 验证项目 | DSH 版本 | 环境与已验证范围 |
| --- | --- | --- |
| 本次压缩修复与升级 | **0.2.2-rc.3** | Linux / WSL，Node.js **24.22.2**；压缩、能力回退、并发与旧会话升级，另有真实服务端手动对照 |
| 既有审批执行兼容 | **0.2.2-rc.2、0.2.2-rc.3** | 官方执行契约、原生决定、格式回退与批准后参数检查 |
| 既有审批与表格页面 | **0.2.2-rc.3** | Web + Chromium；实际卡片、深浅色、窄窗及键鼠交互；CUA 为测试桩 |
| 历史真实 Web 会话 | **0.2.2-rc.1、0.2.2-rc.2** | Windows / WSL；Node.js **22.23.4**；历史 Web 功能、调优预设和显示设置验证 |


**本次自动检查：160 项，154 通过、6 跳过、0 失败。** 同时完成打包离线安装和旧预设升级检查。

安装版本范围：**`>=0.2.2-rc.1 <0.3.0-0`**。测试使用交互式 Web profile，浏览器为 Chromium；审批中的 CUA 由测试桩提供，压缩实验通过官方模块与真实模型服务运行。

[审批与表格详细范围](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/visual-verification.md) · [压缩实验详细范围](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/compaction-cache.md)

## 配置、排错与卸载

| 你想做什么 | 去哪里看 |
| --- | --- |
| 调整等待、提醒、凭据保护或压缩选项 | [配置项与默认值](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#配置) |
| 从旧 GitHub / link 安装迁移 | [安装与迁移](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#安装)；旧包名链接可继续使用，避免同时启用两份 |
| 查运行日志 | `$DSH_HOME/logs/dsh-runtime-tuning/`，默认 `~/.dsh/logs/dsh-runtime-tuning/` |
| 卸载或退出调优预设 | [卸载步骤](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/configuration.md#卸载)；先处理仍绑定 `tuned` 的会话 |
| 查看设计依据 | [设计记录](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/design-notes.md) |

凭据保护作用于工具调用、工具结果和配置的敏感文件；审批保留原生权限检查与用户决定。各模块的运行方式和适配细节见配置文档。

审批提醒、托盘启动和崩溃防护是另一个插件：[DSH Sentinel](https://github.com/herenfor/dsh-sentinel)。

## 开发与发布

```bash
npm test
npm run check:package
npm run check:preset-upgrade -- /path/to/dsh
```

仓库名保留为 `dsh-runtime-tuning`，npm 包名为 `@herenfor/dsh-tune`。[发布命令与版本管理 →](https://github.com/herenfor/dsh-runtime-tuning/blob/main/docs/publishing.md)

[MIT License](https://github.com/herenfor/dsh-runtime-tuning/blob/main/LICENSE)
