# 协作预设

**选择「协作」后，模型围绕你的目标组织讨论、提出方案并推进已授权工作。** 预设 ID 为 `collaborative`，与原有「标准」「调优」分别保留。

本功能自 `0.2.19` 起随 `@herenfor/dsh-tune` 主包提供。发布版本、测试环境与覆盖范围统一见 [README](../README.md#已测版本)。

## 怎样使用

安装或更新优化插件，等当前任务结束后重启 DSH。在新会话的预设选择器中选择 **协作**，正常说明任务即可：

- 「先帮我分析这个需求，给一个推荐方案，暂时不改代码。」
- 「沿用刚才决定的方式，开始实现并验证。」
- 「我说的是按会话切换，不是整个应用切换。」

提示词要求模型承接已有决定和最新纠正，先解决用户关心的问题，再给必要的理由与证据。能检查的事实先检查；影响目标、范围、用户偏好或授权的关键歧义再询问。

## 保留哪些能力

协作预设从当前宿主自带的完整 standard 构建，保留官方工具组合、计划模式、goal、定时任务、工作流、子代理和内置技能。另加入协作规则、已有工具批处理规则、压缩 effort 修复、工具发现与 grep 增强。

原有全局优化继续作用于会话，包括审批、等待保护、进展与清单提醒。默认预设与已有会话绑定由原配置决定。

## 工具发现

read、grep、glob、编辑、shell、必要的任务控制和用户沟通入口直接可用。对定时任务、工作流及 MCP 能力，`tool_search` 可以按用途或精确名称查询并加载。

加载在**下一步**生效。同一步先发现再偷调尚未提供的工具会被拒绝。发现不会安装插件，也不增加权限；实际调用仍走原有校验、审批和执行管线。

工具激活状态存于官方会话日志，恢复后与当前可用工具重新核对。不同会话各自管理，子代理保留自己的 native 工具组合。

默认 `auto` 会比较候选定义与发现目录的体积。小工具集直接提供；需要时才延迟低频定义。当前模型路线不支持工具追加协议时，完整工具直接提供。

## grep 的新能力

| 需求 | 参数 |
| --- | --- |
| 匹配行，默认行为 | `output_mode: content` |
| 只找包含匹配的文件 | `output_mode: files_with_matches` |
| 每个文件的正则匹配次数 | `output_mode: count` |
| 前后文 | `context`，或 `before_context` / `after_context` |
| 仅匹配片段 | `only_matching` |
| 排除文件 | `exclude` glob 数组 |
| 跨行、dotall | `multiline` |
| 控制展示条数 | `head_limit` |

上下文与仅匹配片段互斥；文件名、计数模式不接受正文上下文。长行预览保留真实命中附近的 UTF-8 内容，注明原始字节范围；扫描完成与预览截断分别说明，必要时提供完整结果记录的引用。

原有 `pattern`、`path`、`include` 继续使用；glob 沿用官方实现。每次 grep 调用直接启动一个宿主打包的 rg，不经过 shell，也不另建搜索索引。

## 配置与关闭

在当前 profile 的 `cordis.patch.yml` 中调整：

```yaml
- id: runtime-tuning-preset-collaborative
  config:
    id: collaborative
    name: 协作
    toolDiscovery: auto
    enhancedGrep: true
```

| 配置 | 含义 |
| --- | --- |
| `toolDiscovery: auto` | 按定义体积与模型能力选择，默认值 |
| `toolDiscovery: on` | 在支持工具追加的路线启用延迟发现 |
| `toolDiscovery: off` | 完整工具直接提供，仍可查询工具目录 |
| `enhancedGrep: false` | 回到官方搜索组合 |

以上配置在重启后的新 agent 中使用。关闭发现或 grep 增强时，`collaborative` 身份继续保留，因此已有协作会话仍能继续。不要通过删除整个预设来关闭某项功能。

彻底卸载优化插件会移除该预设；仍绑定它的会话需要先安排迁移。DSH 已开始的会话不能直接切换预设，请保留原记录，并在标准预设的新会话中交接任务后再卸载。

## 验证与维护

```bash
npm test
npm run check:package
npm run check:collaborative -- /path/to/dsh /outside/repository/results
```

最后一项在独立 HOME/profile 中运行真实 Host 和模拟模型，验证完整能力、内置技能、发现后调用、提前调用拒绝、grep 模式、重启恢复与会话隔离；不调用付费模型。浏览器检查与真实模型任务使用仓库外的独立验收环境。PTC 作为后续独立实验研究。
