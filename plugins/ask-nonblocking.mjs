// ask-nonblocking：让 ask_user_question 问完不干等。
// DSH 自带的 dsh-tool-ask-user 有 mode: timed（超时后返回 pending，模型继续做别的；用户之后的回答
// 作为 user-question-reply 插进来），但它嵌在每个 agent preset 的 config.plugins 里，profile 补丁够不到。
// 这里在每个顶层 agent 自己的作用域里，用宿主里同一份官方模块注册 timed 版本；作用域内的注册会遮蔽 preset 里的阻塞版。
// 任何一步失败都只记日志，agent 保持原来的阻塞版。
import { readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-ask-nonblocking'

const DEFAULTS = { timeout: 1 }
const record = createRecorder('ask-nonblocking.log')
const PACKAGE_DIR = '@deepseek-ai+dsh-tool-ask-user@'

/** 在宿主的 pnpm 仓库里找官方 dsh-tool-ask-user 的入口（和 preset 加载的是同一份）。 */
export async function findOfficialAskUser(entryScript, read = readdir, resolve = realpath) {
  const bin = await resolve(entryScript)
  const at = bin.indexOf('/.pnpm/')
  if (at < 0) throw new Error('host is not a pnpm install; cannot locate dsh-tool-ask-user')
  const store = bin.slice(0, at + '/.pnpm'.length)
  const dirs = (await read(store)).filter((n) => n.startsWith(PACKAGE_DIR))
  if (dirs.length !== 1) throw new Error(`expected one dsh-tool-ask-user in the host store, found ${dirs.length}`)
  return join(store, dirs[0], 'node_modules/@deepseek-ai/dsh-tool-ask-user/lib/index.js')
}

/** 只处理顶层 agent：子代理不直接面对用户。 */
export function isTopLevelAgent(agent) {
  return (agent?.session?.header?.delegationDepth ?? 0) === 0 && agent?.ctx !== undefined
}

export function apply(ctx, config = {}) {
  const c = { ...DEFAULTS, ...config }
  record({ event: 'loaded', config: c })
  let official
  const load = () => (official ??= findOfficialAskUser(process.argv[1]).then((file) => import(pathToFileURL(file).href)))
  ctx.on('agent/created', async ({ agent }) => {
    if (!isTopLevelAgent(agent)) return
    try {
      agent.ctx.plugin(await load(), { mode: 'timed', timeout: c.timeout })
      record({ event: 'shadowed', session: agent.id, timeout: c.timeout })
    } catch (error) {
      official = undefined
      record({ event: 'failed', session: agent.id, error: String(error).slice(0, 300) })
    }
  })
}
