// secret-files：沙箱里的命令和文件工具都读不到凭据文件。
// DSH 的沙箱把整个文件系统只读挂进去（bwrap 的 --ro-bind / /），只限制写、不限制读，沙箱里还能联网；
// 换句话说用户能读的凭据（云服务密钥、DSH 自己的 API key、git 凭据）命令都能读到。secret-guard 只能在结果里按格式打码。
// 两道：
// - 命令：在 sandbox.confine 的结果里追加遮挡。bwrap 用空文件 / 只读空目录盖住；Seatbelt（macOS）在规则末尾追加 deny file-read*。
//   Landlock 等只能列允许路径的后端没法排除子路径，原样放行并记 unsupported，只剩文件工具这一道。
// - 文件工具：read / read_image / write / edit 的目标、grep 的搜索目录落在遮挡的路径上（或是它的上级）时拒绝。glob 只列文件名，不拦。
// 默认只遮 dsh / cloud / registry 三组：这些凭据日常编码用不到。git 组（SSH 私钥、git 凭据、gh 登录）会让 push 失败，默认不开。
import { realpathSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-secret-files'

const DEFAULTS = { enabled: true, groups: ['dsh', 'cloud', 'registry'], extraPaths: [], allowPaths: [] }
const record = createRecorder('secret-files.log')
const CACHE_MS = 60_000

// 相对用户目录的路径；Windows 一侧（WSL 下的 /mnt/c/Users/*）用 windows 里的写法
export const GROUPS = {
  dsh: { home: ['.dsh/.credentials.yaml'], windows: ['.dsh/.credentials.yaml'] },
  cloud: {
    home: ['.aws/credentials', '.config/gcloud', '.azure', '.kube/config', '.docker/config.json'],
    windows: ['.aws/credentials', 'AppData/Roaming/gcloud', '.azure', '.kube/config', '.docker/config.json'],
  },
  registry: { home: ['.cargo/credentials.toml', '.cargo/credentials', '.pypirc'], windows: ['.cargo/credentials.toml', '.cargo/credentials', '.pypirc'] },
  git: {
    home: ['.ssh', '.git-credentials', '.netrc', '.config/gh/hosts.yml'],
    windows: ['.ssh', '.git-credentials', '_netrc', 'AppData/Roaming/GitHub CLI/hosts.yml'],
  },
  npm: { home: ['.npmrc'], windows: ['.npmrc'] },
}
const NOT_USERS = new Set(['All Users', 'Default', 'Default User', 'Public', 'desktop.ini'])

export const isWsl = (env = process.env, read = readFileSync) => {
  if (env.WSL_DISTRO_NAME) return true
  try { return /microsoft/i.test(read('/proc/sys/kernel/osrelease', 'utf8')) } catch { return false }
}

/** 按配置列出候选路径（还没检查是否存在）。DSH_HOME 改过时 dsh 组用它。 */
export function candidatePaths(c, { home = homedir(), dshHome = process.env.DSH_HOME, wsl = isWsl(), windowsUsers } = {}) {
  const out = []
  for (const group of c.groups) {
    const g = GROUPS[group]
    if (g === undefined) continue
    for (const p of g.home) out.push(group === 'dsh' && dshHome ? join(dshHome, '.credentials.yaml') : join(home, p))
    if (!wsl) continue
    const users = windowsUsers ?? (() => { try { return readdirSync('/mnt/c/Users').filter((u) => !NOT_USERS.has(u)) } catch { return [] } })()
    for (const user of users) for (const p of g.windows) out.push(join('/mnt/c/Users', user, p))
  }
  for (const p of c.extraPaths) if (typeof p === 'string' && isAbsolute(p)) out.push(p)
  return out
}

/** 存在的路径解析成真实路径并标出是不是目录；allowPaths 里的（或在其下的）去掉。 */
export function existingTargets(paths, allowPaths = [], fs = { realpathSync, statSync }) {
  const allow = allowPaths.filter((p) => typeof p === 'string').map((p) => { try { return fs.realpathSync(p) } catch { return resolve(p) } })
  const seen = new Map()
  for (const p of paths) {
    let real, info
    try { real = fs.realpathSync(p); info = fs.statSync(real) } catch { continue }
    if (allow.some((a) => within(real, a))) continue
    if (!seen.has(real)) seen.set(real, { path: real, dir: info.isDirectory() })
  }
  return [...seen.values()]
}

export const within = (path, root) => { const rel = relative(root, path); return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)) }

const sbpl = (path) => `"${path.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

/** 在沙箱参数里追加遮挡；认不出后端时返回 undefined。 */
export function maskArgv(argv, targets) {
  const sepAt = argv.indexOf('--')
  if (sepAt < 0 || targets.length === 0) return undefined
  const head = argv.slice(0, sepAt)
  const isBwrap = head.some((a, i) => a === '--ro-bind' && head[i + 1] === '/' && head[i + 2] === '/')
  if (isBwrap) {
    const extra = targets.flatMap((t) => (t.dir ? ['--tmpfs', t.path, '--remount-ro', t.path] : ['--ro-bind', '/dev/null', t.path]))
    return [...head, ...extra, ...argv.slice(sepAt)]
  }
  const p = head.indexOf('-p')
  if (p >= 0 && /sandbox-exec$/.test(head[0] ?? '') && typeof head[p + 1] === 'string' && head[p + 1].includes('(version 1)')) {
    const rule = `(deny file-read* ${targets.map((t) => (t.dir ? `(subpath ${sbpl(t.path)})` : `(literal ${sbpl(t.path)})`)).join(' ')})`
    return [...head.slice(0, p + 1), `${head[p + 1]} ${rule}`, ...head.slice(p + 2), ...argv.slice(sepAt)]
  }
  return undefined
}

const FILE_ARGS = { read: 'file_path', read_image: 'file_path', write: 'file_path', edit: 'file_path' }

/** 文件工具要碰的路径落在遮挡范围里时返回命中的那一项。grep 的搜索目录是遮挡路径的上级也算（DSH 的 grep 会搜隐藏文件）。 */
export function blockedTarget(exec, targets, real = (p) => { try { return realpathSync(p) } catch { return p } }) {
  const args = exec.arguments ?? {}
  const cwd = exec.agent?.session?.header?.cwd ?? process.cwd()
  const key = FILE_ARGS[exec.name]
  if (key !== undefined && typeof args[key] === 'string') {
    const full = resolve(cwd, args[key])
    // 写一个还不存在的文件时按它的目录判断
    let path = real(full)
    if (path === full) path = join(real(dirname(full)), full.slice(dirname(full).length + 1))
    return targets.find((t) => within(path, t.path))
  }
  if (exec.name === 'grep') {
    const path = real(resolve(cwd, typeof args.path === 'string' ? args.path : '.'))
    return targets.find((t) => within(path, t.path) || within(t.path, path))
  }
  return undefined
}

export function apply(ctx, config) {
  const c = { ...DEFAULTS, ...config }
  record({ event: 'loaded', config: { groups: c.groups, extraPaths: c.extraPaths.length, allowPaths: c.allowPaths.length } })
  if (!c.enabled) return
  let cached, cachedAt = 0
  const targets = () => {
    if (cached === undefined || Date.now() - cachedAt > CACHE_MS) {
      cached = existingTargets(candidatePaths(c), c.allowPaths)
      cachedAt = Date.now()
    }
    return cached
  }
  const notedBackends = new Set()

  ctx.on('tools/pre-execute', (exec, next) => {
    let hit
    try { hit = blockedTarget(exec, targets()) } catch (error) { record({ event: 'check-failed', error: String(error) }) }
    if (hit === undefined) return next()
    record({ event: 'denied', tool: exec.name, session: exec.agent?.session?.id })
    return Promise.resolve({ kind: 'deny', reason: 'dsh-runtime-tuning secret-files: this path holds credentials and is hidden from the agent. If the task really needs it, ask the user to run that step themselves.' })
  })

  ctx.inject(['sandbox'], (sctx) => {
    const sandbox = sctx.sandbox
    const original = sandbox?.confine
    if (typeof original !== 'function') return record({ event: 'unavailable', reason: 'sandbox.confine missing' })
    record({ event: 'armed', targets: targets().length })
    const wrapped = async function (argv, policy, signal) {
      const result = await original.call(this, argv, policy, signal)
      try {
        if (!Array.isArray(result?.argv)) return result
        const list = targets()
        if (list.length === 0) return result
        const next = maskArgv(result.argv, list)
        if (next === undefined) {
          const backend = String(result.argv[0] ?? '').split(/[\\/]/).pop()
          if (!notedBackends.has(backend)) { notedBackends.add(backend); record({ event: 'unsupported', backend, reason: 'only file tools are guarded on this sandbox backend' }) }
          return result
        }
        return { ...result, argv: next }
      } catch (error) {
        record({ event: 'mask-failed', error: String(error) })
        return result
      }
    }
    sandbox.confine = wrapped
    sctx.effect(() => () => { if (sandbox.confine === wrapped) sandbox.confine = original }, 'secret-files confine wrapper')
  })
}
