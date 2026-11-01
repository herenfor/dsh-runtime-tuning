// dsh-session-tmp：同一个对话（包括它的子代理）的命令共用一个 /tmp。
// DSH 在 Linux 上每条命令起一个 bwrap 沙箱，工作区可写模式下挂的是 --tmpfs /tmp，命令一结束文件就没了。
// 模型常常在一条命令里写 /tmp/x、下一条再读，然后报 No such file：3080 的 90 个会话里有 54 次，分布在 25 个会话。
// DSH 的 Windows 那一支已经给每个会话一个私有临时目录；这里在 Linux 上补齐：包一层 sandbox.confine，
// 把 --tmpfs /tmp 换成 --bind <对话目录> /tmp。子代理按 parentSession 归到根会话，和父会话共用一个目录。
// 隔离不变：别的对话和宿主的 /tmp 仍然看不到。找不到预期参数（DSH 改了实现、不是 bwrap、只读模式）就原样放行。
// 文件工具（read / write / edit / read_image / glob / grep / present）不进沙箱，看到的是宿主的 /tmp：
// bash 里 curl -o /tmp/x.png 之后 read_image /tmp/x.png 必然找不到。工作区可写时把这些工具参数里的 /tmp
// 换成同一个对话目录，结果里的对话目录再换回 /tmp，模型只看到一个 /tmp。只在确认换过 bwrap 的 /tmp 之后才映射。
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-session-tmp'

const DEFAULTS = { enabled: true, staleHours: 24, fileTools: true }
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

export const FILE_TOOLS = { read: ['file_path'], write: ['file_path'], edit: ['file_path'], read_image: ['file_path'], glob: ['path'], grep: ['path'], present: ['files'] }

/** /tmp 或 /tmp/... 换成 dir 下的同名路径；已经在 dir 里的、别的路径原样返回。 */
export const toSessionPath = (path, dir) =>
  typeof path !== 'string' || path === dir || path.startsWith(`${dir}/`) ? path
    : path === '/tmp' ? dir : path.startsWith('/tmp/') ? join(dir, path.slice(5)) : path

/** 把文件工具参数里的 /tmp 路径换成对话目录；没有要换的返回 undefined。 */
export function mapToolArgs(name, args, dir) {
  const keys = FILE_TOOLS[name]
  if (keys === undefined || args === null || typeof args !== 'object') return undefined
  let changed = false
  const next = { ...args }
  for (const key of keys) {
    const value = args[key]
    const mapped = Array.isArray(value) ? value.map((v) => toSessionPath(v, dir)) : toSessionPath(value, dir)
    if (Array.isArray(value) ? mapped.some((v, i) => v !== value[i]) : mapped !== value) { next[key] = mapped; changed = true }
  }
  return changed ? next : undefined
}

/**
 * 把值里所有字符串中的 from 换成 to。只进普通对象和数组（图片字节、类实例原样保留），没有变化的部分不复制。
 */
export function replaceInStrings(value, from, to) {
  if (typeof value === 'string') return value.includes(from) ? value.split(from).join(to) : value
  if (Array.isArray(value)) {
    const next = value.map((v) => replaceInStrings(v, from, to))
    return next.some((v, i) => v !== value[i]) ? next : value
  }
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return value
  let changed = false
  const next = {}
  for (const [k, v] of Object.entries(value)) { next[k] = replaceInStrings(v, from, to); if (next[k] !== v) changed = true }
  return changed ? next : value
}

/** 结果里的对话目录换回 /tmp，模型不会拿到一个 bash 里不存在的路径。 */
export const unmapResult = (value, dir) => replaceInStrings(value, dir, '/tmp')

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
  // 只有真的换过 bwrap 的 /tmp，bash 和文件工具才会看到不同的 /tmp；Landlock、别的沙箱或 DSH 改了参数时 bash 用的就是宿主 /tmp，不能映射
  let rebound = false

  const dirFor = (sessionId) => {
    const dir = join(base, safeName(roots.rootOf(sessionId)))
    if (!created.has(dir)) {
      mkdirSync(base, { recursive: true, mode: 0o700 })
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      created.add(dir)
    }
    return dir
  }

  const modes = new Map()
  const modeOf = (sessionId) => modes.get(sessionId) ?? modes.get(roots.rootOf(sessionId))
  ctx.on('session/event', (session, event) => {
    try {
      roots.note(session)
      if (event?.type === 'sandbox/mode' && typeof event.data?.mode === 'string') modes.set(session.id, event.data.mode)
    } catch {}
  })

  ctx.on('tools/execute', async (exec, next) => {
    let dir
    try {
      const sessionId = exec.agent?.session?.id
      if (c.fileTools && rebound && !missed && typeof sessionId === 'string' && modeOf(sessionId) === 'workspace-write') {
        dir = dirFor(sessionId)
        const mapped = mapToolArgs(exec.name, exec.arguments, dir)
        if (mapped === undefined) dir = undefined
        else { exec.arguments = mapped; record({ event: 'mapped', tool: exec.name, session: sessionId }) }
      }
    } catch (error) {
      dir = undefined
      record({ event: 'map-failed', tool: exec?.name, error: String(error) })
    }
    let result
    try {
      result = await next()
    } catch (error) {
      if (dir !== undefined && typeof error?.message === 'string' && error.message.includes(dir)) {
        try { error.message = unmapResult(error.message, dir) } catch {}
      }
      throw error
    }
    if (dir === undefined) return result
    try { return unmapResult(result, dir) } catch { return result }
  })

  ctx.inject(['sandbox'], (sctx) => {
    const sandbox = sctx.sandbox
    const original = sandbox?.confine
    if (typeof original !== 'function') return record({ event: 'unavailable', reason: 'sandbox.confine missing' })
    record({ event: 'loaded', base, swept: sweepStale(base, c.staleHours) })
    const wrapped = async function (argv, policy, signal) {
      const result = await original.call(this, argv, policy, signal)
      try {
        if (typeof policy?.sessionId === 'string' && typeof policy.mode === 'string') modes.set(policy.sessionId, policy.mode)
        if (policy?.mode !== 'workspace-write' || typeof policy.sessionId !== 'string' || !Array.isArray(result?.argv)) return result
        const next = rebindTmp(result.argv, dirFor(policy.sessionId))
        if (next === undefined) {
          if (!missed) { missed = true; record({ event: 'passthrough', reason: 'no --tmpfs /tmp in sandbox argv' }) }
          return result
        }
        rebound = true
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
