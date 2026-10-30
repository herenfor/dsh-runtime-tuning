# 更新记录

## 0.1.1 · 2026-10-29

- DSH 兼容声明改为范围 `>=0.2.1-rc.4 <0.3.0-0`：之后的 `0.2.x` 版本不用等插件更新就能安装。

## 0.1.0 · 2026-10-29

首个公开版本。

- wait-guard：拒绝前台超过 5 秒的 sleep，以及顶层 agent 超过 15 秒的阻塞式 `job_output`。
- wait-guard：新增 `task_status` 工具（`waiting` / `asking` / `done`），声明 `waiting` 的一轮正常结束后，超过 2 倍预计时间没有新一轮就兜底唤醒模型，最多连续 2 次；按停止结束的一轮不计时。
- ask-nonblocking：在每个顶层 agent 里用官方 `dsh-tool-ask-user` 的 `timed` 模式遮蔽阻塞版提问，默认 1 秒后返回 `pending`；失败时退回阻塞版。
- 在 DSH `0.2.1-rc.4` web profile 中实测：后台任务完成通知唤醒、任务超时的兜底唤醒、提问 1 秒后放行，以及约 72 秒后的回答作为新一轮送进来。
- secret-guard：拒绝向用户索要凭据的提问、参数里带完整令牌的工具调用和 `gh auth token`；工具结果交给模型前把凭据打码。
- wait-guard：硬保底。没有声明 `waiting`、但一轮结束时后台还有任务在跑，默认 30 分钟后唤醒模型（`undeclaredMinutes`）；`task_status` 新增 `services`，列出的任务不计时。
- wait-guard：`task_status` 和最终答复写在同一条回复里、又是唯一的工具调用时，直接结束这一轮（`concludeTurn`）。新会话实测原来每轮都会多请求一次模型，把答复再写一遍。
- wait-guard：有硬保底时 `task_status` 改为可选，只在任务会跑超过 `undeclaredMinutes`、或要标记服务时调用；状态由 runtime 按事实判断。真实长会话里模型几乎从不声明，新会话里声明又常常单独占一步。
- wait-guard 提示词：不要刚启动后台任务就看日志；互不依赖的读取、检查、修改放进同一条回复并行调用。
- 34 项自动测试。
- 已知限制：硬保底“到点唤醒”目前只有单元测试覆盖，真实环境里只验证过开始计时（任务都在 30 分钟内结束了）。
