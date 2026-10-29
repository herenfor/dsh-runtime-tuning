// 子插件共用的诊断日志：每个子插件一个 JSON lines 文件，放在 $DSH_HOME/logs/dsh-runtime-tuning/。
// 只记录事实（事件、规则、秒数、会话 id、状态），不记录命令全文或对话内容。
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function logDir() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'logs', 'dsh-runtime-tuning')
}

export function createRecorder(file) {
  const dir = logDir()
  let ready
  return (entry) => {
    ready ??= mkdir(dir, { recursive: true, mode: 0o700 })
    void ready
      .then(() => appendFile(join(dir, file), JSON.stringify({ time: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 }))
      .catch(() => {})
  }
}
