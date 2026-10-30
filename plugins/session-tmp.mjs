// dsh-session-tmp：同一个对话（包括它的子代理）的命令共用一个 /tmp。
// DSH 在 Linux 上每条命令起一个 bwrap 沙箱，工作区可写模式下挂的是 --tmpfs /tmp，命令一结束文件就没了。
// 模型常常在一条命令里写 /tmp/x、下一条再读，然后报 No such file：3080 的 90 个会话里有 54 次，分布在 25 个会话。
// DSH 的 Windows 那一支已经给每个会话一个私有临时目录；这里在 Linux 上补齐：包一层 sandbox.confine，
// 把 --tmpfs /tmp 换成 --bind <对话目录> /tmp。子代理按 parentSession 归到根会话，和父会话共用一个目录。
// 隔离不变：别的对话和宿主的 /tmp 仍然看不到。找不到预期参数（DSH 改了实现、不是 bwrap、只读模式）就原样放行。
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-session-tmp'

const DEFAULTS = { enabled: true, staleHours: 24 }
const record = createRecorder('session-tmp.log')

export const baseDir = () => join(tmpdir(), `dsh-session-tmp-${process.getuid?.() ?? 'user'}`)
const safeName = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120)

/** 把 bwrap 参数里（'--' 之前）的 --tmpfs /tmp 换成 --bind dir /tmp；没有这一对时返回 undefined。 */
export function rebindTmp(argv, dir) {
  const end = argv.indexOf('--')
  const limit = end === -1 ? argv.length : end
  for (let i = 0; i < limit - 1; i++) {
    if (argv[i] === '--tmpfs' && argv[i + 1] === '/tmp') return [...argv.slice(0, i), '--bind', dir, '/tmp', ...argv.slice(i + 2)]
  }
  return undefined
}

/** 子会话 → 父会话的映射，沿着找到根会话。 */
export function createRoots() {
  const parents = new Map()
  return {
    note(session) {
      const parent = session?.header?.parentSession
      if (typeof parent === 'string' && parent !== session.id) parents.set(session.id, parent)
    },
    rootOf(id) {
      const seen = new Set()
      while (parents.has(id) && !seen.has(id)) { seen.add(id); id = parents.get(id) }
      return id
    },
  }
}

/** 清掉上次异常退出留下的、超过 staleHours 没动过的目录。只碰 base 下面的直接子目录。 */
export function sweepStale(base, staleHours, now = Date.now()) {
  let removed = 0
  for (const entry of (() => { try { return readdirSync(base, { withFileTypes: true }) } catch { return [] } })()) {
    if (!entry.isDirectory()) continue
    const dir = join(base, entry.name)
    try {
      if (now - statSync(dir).mtimeMs > staleHours * 3_600_000) { rmSync(dir, { recursive: true, force: true }); removed += 1 }
    } catch {}
  }
  return removed
}

export function apply(ctx, config = {}) {
  const c = { ...DEFAULTS, ...config }
  if (!c.enabled || process.platform !== 'linux') return
  const base = c.baseDir ?? baseDir()
  const roots = createRoots()
  const created = new Set()
  let missed = false

  const dirFor = (sessionId) => {
    const dir = join(base, safeName(roots.rootOf(sessionId)))
    if (!created.has(dir)) {
      mkdirSync(base, { recursive: true, mode: 0o700 })
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      created.add(dir)
    }
    return dir
  }

  ctx.on('session/event', (session) => { try { roots.note(session) } catch {} })

  ctx.inject(['sandbox'], (sctx) => {
    const sandbox = sctx.sandbox
    const original = sandbox?.confine
    if (typeof original !== 'function') return record({ event: 'unavailable', reason: 'sandbox.confine missing' })
    record({ event: 'loaded', base, swept: sweepStale(base, c.staleHours) })
    const wrapped = async function (argv, policy, signal) {
      const result = await original.call(this, argv, policy, signal)
      try {
        if (policy?.mode !== 'workspace-write' || typeof policy.sessionId !== 'string' || !Array.isArray(result?.argv)) return result
        const next = rebindTmp(result.argv, dirFor(policy.sessionId))
        if (next === undefined) {
          if (!missed) { missed = true; record({ event: 'passthrough', reason: 'no --tmpfs /tmp in sandbox argv' }) }
          return result
        }
        return { ...result, argv: next }
      } catch (error) {
        record({ event: 'rebind-failed', error: String(error) })
        return result
      }
    }
    sandbox.confine = wrapped
    sctx.effect(() => () => {
      if (sandbox.confine === wrapped) sandbox.confine = original
      for (const dir of created) rmSync(dir, { recursive: true, force: true })
      created.clear()
    }, 'session-tmp confine wrapper')
  })
}
