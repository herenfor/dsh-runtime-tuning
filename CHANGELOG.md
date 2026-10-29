# 更新记录

## 未发布

首个公开版本。

- wait-guard：拒绝前台超过 5 秒的 sleep，以及顶层 agent 超过 15 秒的阻塞式 `job_output`。
- wait-guard：新增 `task_status` 工具（`waiting` / `asking` / `done`），声明 `waiting` 的一轮正常结束后，超过 2 倍预计时间没有新一轮就兜底唤醒模型，最多连续 2 次；按停止结束的一轮不计时。
- ask-nonblocking：在每个顶层 agent 里用官方 `dsh-tool-ask-user` 的 `timed` 模式遮蔽阻塞版提问，默认 1 秒后返回 `pending`；失败时退回阻塞版。
- 在 DSH `0.2.1-rc.4` web profile 中实测：后台任务完成通知唤醒、任务超时的兜底唤醒、提问 1 秒后放行，以及约 72 秒后的回答作为新一轮送进来。
- 16 项自动测试。
