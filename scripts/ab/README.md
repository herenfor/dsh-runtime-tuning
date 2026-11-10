# A/B 统计脚本

从 DSH 会话日志（`~/.dsh/sessions/*/session-<id>/session.v4.jsonl.zstd`）算两边第一轮的指标。需要 Node 22.15+（`zlib.zstdDecompressSync`）。

```bash
node scripts/ab/compare.cjs <会话A的id前缀> <会话B的id前缀>     # 耗时拆分、步数、并行、token、插件注入
node scripts/ab/health.cjs  <会话A的id前缀> <会话B的id前缀> [轮次]  # 参数解析、报错、重复调用、审批结构
node scripts/ab/events.cjs  <session.v4.jsonl.zstd>               # 解出 JSONL
```

时长已扣除审批等待（`approval/asked` 到 `approval/decided`）。设计要求见实测记录末尾。
