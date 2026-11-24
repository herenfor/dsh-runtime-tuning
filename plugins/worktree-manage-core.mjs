import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir as fsMkdir, realpath as fsRealpath, stat as fsStat } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import {
  MAX_DETAIL_CONCURRENCY,
  expandUserPath,
  mapWithConcurrency,
  matchLiveAgentsToWorktrees,
  matchWorkspacesByPath,
  normalizeExistingPath,
  parseStatusPorcelainV1B,
  parseWorktreePorcelain,
  resolveHostPath,
} from './worktree-core.mjs'

export const WORKTREE_MANAGE_RPC_CHANNEL = '/dsh-tune-worktree-manage'
export const DEFAULT_PATH_TEMPLATE = '../<repo>-wt/<slug>'
export const CREATE_WORKTREE_TOOL = 'create_worktree'

export const CREATE_WORKTREE_PROMPT = [
  'You can call `create_worktree` to create an isolated Git worktree for parallel or experimental work when the user asks to work in a separate worktree or branch without disturbing the current checkout.',
  'Only pass `branch` (plus optional `baseRef`, `slug`, or `sessionMode`: `"none" | "blank" | "fork"`). Never use bash `git worktree remove --force` to bypass safety checks.',
].join(' ')

const ALLOWED_READ_SUBCOMMANDS = new Set(['rev-parse', 'status', 'check-ref-format', 'show-ref', 'for-each-ref'])
const ALLOWED_WORKTREE_VERBS = new Set(['list', 'add', 'remove', 'prune'])

function validateManageGitArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error('worktree-manage: git args must be a non-empty array')
  }
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.includes('\0')) {
      throw new Error('worktree-manage: invalid git argument')
    }
  }
  const sub = args[0]
  if (ALLOWED_READ_SUBCOMMANDS.has(sub)) return
  if (sub !== 'worktree') {
    throw new Error(`worktree-manage: disallowed git subcommand "${sub}"`)
  }
  const verb = args[1]
  if (!ALLOWED_WORKTREE_VERBS.has(verb)) {
    throw new Error(`worktree-manage: disallowed git worktree subcommand "${verb}"`)
  }
  if (verb === 'remove' || verb === 'add') {
    for (const arg of args.slice(2)) {
      if (arg === '--force' || arg === '-f' || /^-[A-Za-z]*f/.test(arg)) {
        throw new Error(`worktree-manage: --force is forbidden on "git worktree ${verb}"`)
      }
    }
  }
}

/** Run an allowlisted read or controlled worktree write git subcommand via execFile without shell interpolation. */
export async function runManageGit(args, { cwd, signal, timeoutMs = 15000, includeStderr = false } = {}) {
  validateManageGitArgs(args)
  if (typeof cwd !== 'string' || cwd.length === 0 || cwd.includes('\0')) {
    throw new Error('worktree-manage: cwd must be a non-empty string')
  }
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      'git',
      args,
      {
        cwd,
        signal,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        encoding: 'utf8',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' },
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr
          error.stdout = stdout
          rejectPromise(error)
          return
        }
        resolvePromise(includeStderr ? [stdout, stderr].filter(Boolean).join('\n').trim() : stdout)
      },
    )
  })
}

/** Sanitize a branch name or task slug into a safe single directory segment. */
export function sanitizeSlug(input) {
  if (typeof input !== 'string') return ''
  let s = input.trim().replace(/[^A-Za-z0-9._-]+/g, '-')
  s = s.replace(/\.{2,}/g, '-')
  s = s.replace(/^[._-]+/, '').replace(/[.-]+$/, '')
  if (s.length > 80) s = s.slice(0, 80).replace(/[.-]+$/, '')
  if (s === '.' || s === '..') return ''
  return s
}

/** Validate a Git branch name strictly before passing to git. */
export function validateBranchName(branch) {
  if (typeof branch !== 'string') throw new Error('Branch name must be a string')
  const b = branch.trim()
  if (b.length === 0 || b.length > 200) throw new Error('Branch name must be 1-200 characters')
  if (/[\x00-\x1f\x7f\s~^:?*[\\]/.test(b)) throw new Error('Branch name contains invalid characters')
  if (b.startsWith('-') || b.startsWith('/') || b.endsWith('/') || b.endsWith('.') || b.endsWith('.lock')) {
    throw new Error('Branch name has invalid prefix or suffix')
  }
  if (b.includes('..') || b.includes('@{') || b.includes('//') || b.split('/').some((seg) => seg === '' || seg.startsWith('.') || seg.endsWith('.lock'))) {
    throw new Error('Branch name contains invalid path segments')
  }
  return b
}

/** Validate an optional base ref (branch, tag, or commit SHA). */
export function validateBaseRef(ref) {
  if (ref === undefined || ref === null || ref === '') return null
  if (typeof ref !== 'string') throw new Error('Base ref must be a string')
  const r = ref.trim()
  if (r.length === 0 || r.length > 200) throw new Error('Base ref must be non-empty')
  if (/[\x00-\x1f\x7f\s]/.test(r) || r.startsWith('-') || r.includes('..') || r.includes('@{')) {
    throw new Error('Base ref contains invalid characters')
  }
  return r
}

/** Resolve and safety-check the destination directory for a new worktree. */
export function resolveWorktreeTargetPath({
  repoRoot,
  repoName,
  commonDir,
  branch,
  slug,
  pathTemplate = DEFAULT_PATH_TEMPLATE,
  customPath,
}) {
  if (typeof repoRoot !== 'string' || repoRoot.length === 0) {
    throw new Error('Repository root is required')
  }
  const resolvedRoot = resolve(repoRoot)
  const resolvedCommon = commonDir ? resolve(commonDir) : null

  let candidate
  if (typeof customPath === 'string' && customPath.trim().length > 0) {
    if (customPath.includes('\0')) throw new Error('Custom path contains NUL byte')
    candidate = resolve(resolvedRoot, resolveHostPath(customPath.trim()))
  } else {
    const safeSlug = sanitizeSlug(slug || branch)
    if (!safeSlug) throw new Error('Cannot derive a valid worktree directory slug from branch/slug')
    const safeRepo = sanitizeSlug(repoName || basename(resolvedRoot)) || 'repo'
    const tmpl = typeof pathTemplate === 'string' && pathTemplate.trim() ? pathTemplate.trim() : DEFAULT_PATH_TEMPLATE
    if (tmpl.includes('\0')) throw new Error('Path template contains NUL byte')
    const expanded = tmpl.replaceAll('<repo>', safeRepo).replaceAll('<slug>', safeSlug)
    if (expanded.includes('<') || expanded.includes('>')) {
      throw new Error('Path template contains unsupported placeholders')
    }
    candidate = resolve(resolvedRoot, expanded)
  }

  if (candidate === resolvedRoot) {
    throw new Error('Worktree path cannot equal the main repository root')
  }
  if (resolvedCommon && (candidate === resolvedCommon || candidate.startsWith(`${resolvedCommon}/`))) {
    throw new Error('Worktree path cannot be inside the repository .git common directory')
  }
  return candidate
}

function makeGateError(code, message, details = {}) {
  return Object.assign(new Error(message), { code, details })
}

/** Derive a valid Git branch name (`wt/<slug>-<4hex>`) from the first user prompt or fallback id. */
export function deriveAutoBranchName(promptText = '', _sessionId = '') {
  const words = String(promptText || '').toLowerCase().match(/[a-z0-9]+/g) || []
  let slug = words.join('-').slice(0, 24).replace(/^-+|-+$/g, '')
  if (!slug) slug = 'task'
  const hex = randomBytes(2).toString('hex')
  const candidate = `wt/${slug}-${hex}`
  try {
    return validateBranchName(candidate)
  } catch {
    return `wt/task-${hex}`
  }
}

/** In-memory per-session worktree staging store supporting wait/retry/cancel during turn-1 creation. */
export function createSessionWorktreeStager() {
  const entries = new Map()
  const waiters = new Map()

  const normSid = (sid) => (typeof sid === 'string' ? sid.replace(/^wsl:/, '') : '')

  const resolveWaiter = (sid, decision) => {
    const w = waiters.get(sid)
    if (!w) return false
    waiters.delete(sid)
    w.cleanup?.()
    w.resolve(decision)
    return true
  }

  const snapshot = (entry) => (entry
    ? {
        sessionId: entry.sessionId,
        path: entry.path,
        baseRef: entry.baseRef,
        branch: entry.branch,
        status: entry.status,
        worktreePath: entry.worktreePath,
        resolvedBranch: entry.resolvedBranch,
        error: entry.error,
        waitingDecision: entry.waitingDecision,
      }
    : null)

  return {
    stage({ sessionId, path, baseRef = null, branch = null }) {
      const sid = normSid(sessionId)
      if (!isNonEmptyString(sid)) throw makeGateError('worktree/invalid-args', 'sessionId must be a non-empty string')
      if (!isNonEmptyString(path)) throw makeGateError('worktree/invalid-path', 'path must be a non-empty string without NUL bytes')
      const existing = entries.get(sid)
      if (existing?.status === 'creating') {
        throw makeGateError('worktree/creation-in-progress', 'Worktree creation is already in progress')
      }
      if (existing?.status === 'created') {
        throw makeGateError('worktree/already-created', 'Worktree was already created for this session')
      }
      const validBaseRef = validateBaseRef(baseRef)
      let validBranch = null
      if (typeof branch === 'string' && branch.trim().length > 0) {
        validBranch = validateBranchName(branch)
      }
      resolveWaiter(sid, 'cancel')
      const next = {
        sessionId: sid,
        path: path.trim(),
        baseRef: validBaseRef,
        branch: validBranch,
        status: 'staged',
        worktreePath: null,
        resolvedBranch: null,
        error: null,
        waitingDecision: false,
      }
      entries.set(sid, next)
      return snapshot(next)
    },

    clear(sessionId) {
      const sid = normSid(sessionId)
      if (!sid) return { sessionId: '', cleared: false }
      resolveWaiter(sid, 'cancel')
      const cleared = entries.delete(sid)
      return { sessionId: sid, cleared }
    },

    get(sessionId) {
      const sid = normSid(sessionId)
      if (!sid) return null
      return snapshot(entries.get(sid) ?? null)
    },

    setCreating(sessionId, resolvedBranch) {
      const sid = normSid(sessionId)
      const cur = entries.get(sid)
      if (!cur) return null
      cur.status = 'creating'
      cur.resolvedBranch = resolvedBranch ?? cur.resolvedBranch
      cur.error = null
      cur.waitingDecision = false
      return snapshot(cur)
    },

    setCreated(sessionId, { worktreePath, branch }) {
      const sid = normSid(sessionId)
      resolveWaiter(sid, 'cancel')
      const cur = entries.get(sid)
      if (!cur) return null
      cur.status = 'created'
      cur.worktreePath = worktreePath
      cur.resolvedBranch = branch ?? cur.resolvedBranch
      cur.error = null
      cur.waitingDecision = false
      return snapshot(cur)
    },

    setError(sessionId, errorMessage) {
      const sid = normSid(sessionId)
      const cur = entries.get(sid)
      if (!cur) return null
      cur.status = 'error'
      cur.error = String(errorMessage || 'Worktree creation failed')
      cur.waitingDecision = false
      return snapshot(cur)
    },

    waitDecision(sessionId, signal) {
      const sid = normSid(sessionId)
      if (signal?.aborted) return Promise.reject(signal.reason ?? new Error('Aborted'))
      const cur = entries.get(sid)
      if (!cur) return Promise.resolve('cancel')
      resolveWaiter(sid, 'cancel')
      cur.waitingDecision = true
      return new Promise((resolvePromise, rejectPromise) => {
        const onAbort = () => {
          waiters.delete(sid)
          if (entries.has(sid)) entries.get(sid).waitingDecision = false
          rejectPromise(signal.reason ?? new Error('Aborted'))
        }
        signal?.addEventListener?.('abort', onAbort, { once: true })
        const cleanup = () => signal?.removeEventListener?.('abort', onAbort)
        waiters.set(sid, {
          resolve: (decision) => {
            if (entries.has(sid)) entries.get(sid).waitingDecision = false
            resolvePromise(decision)
          },
          cleanup,
        })
      })
    },

    retry(sessionId) {
      const sid = normSid(sessionId)
      const cur = entries.get(sid)
      if (!cur || cur.status !== 'error' || !waiters.has(sid)) return false
      cur.status = 'creating'
      cur.error = null
      cur.waitingDecision = false
      return resolveWaiter(sid, 'retry')
    },

    dispose() {
      for (const sid of [...waiters.keys()]) resolveWaiter(sid, 'cancel')
      entries.clear()
    },
  }
}

async function probeManageRepo(rawPath, { runGitFn, statFn, realpathFn, signal }) {
  const targetPath = expandUserPath(rawPath)
  try {
    const st = await statFn(targetPath)
    if (!st.isDirectory()) throw makeGateError('worktree/missing-dir', `Directory does not exist: ${rawPath}`)
  } catch (err) {
    if (err?.code === 'worktree/missing-dir') throw err
    throw makeGateError('worktree/missing-dir', `Directory does not exist: ${rawPath}`)
  }

  let revOut
  try {
    revOut = await runGitFn(['rev-parse', '--git-common-dir', '--is-bare-repository'], { cwd: targetPath, signal })
  } catch {
    throw makeGateError('worktree/not-git', `Not a Git repository: ${rawPath}`)
  }

  const lines = revOut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const commonDirRaw = lines[0] || ''
  const isBare = lines[1] === 'true'
  const commonNorm = await normalizeExistingPath(resolve(targetPath, commonDirRaw), { realpathFn })
  const commonDir = commonNorm.realPath || resolve(targetPath, commonDirRaw)

  let toplevel = null
  if (!isBare) {
    try {
      toplevel = (await runGitFn(['rev-parse', '--show-toplevel'], { cwd: targetPath, signal })).trim() || null
    } catch {}
  }
  const topNorm = toplevel ? await normalizeExistingPath(toplevel, { realpathFn }) : { realPath: null }
  const targetNorm = await normalizeExistingPath(targetPath, { realpathFn })

  return {
    isBare,
    commonDir,
    toplevel: topNorm.realPath || toplevel || targetNorm.realPath || targetPath,
    targetRealPath: targetNorm.realPath || targetPath,
  }
}

async function listNormalizedWorktrees(repoCwd, { runGitFn, realpathFn, signal }) {
  const porcelain = await runGitFn(['worktree', 'list', '--porcelain'], { cwd: repoCwd, signal })
  const raw = parseWorktreePorcelain(porcelain)
  return mapWithConcurrency(raw, MAX_DETAIL_CONCURRENCY, async (wt) => {
    const norm = await normalizeExistingPath(wt.path, { realpathFn })
    return { ...wt, realPath: norm.realPath, exists: norm.exists }
  })
}

async function resolveTargetWorktree(worktrees, rawWorktreePath, { realpathFn }) {
  const resolved = resolveHostPath(rawWorktreePath)
  const normTarget = await normalizeExistingPath(resolved, { realpathFn })
  return (
    worktrees.find((wt) => wt.path === rawWorktreePath || wt.path === resolved) ||
    (normTarget.realPath
      ? worktrees.find((wt) => wt.realPath === normTarget.realPath || wt.path === normTarget.realPath)
      : undefined) ||
    null
  )
}

/**
 * Evaluate mandatory dual gates for removing a worktree:
 *  - Structural checks: target exists, not main, not bare, not locked, not prunable
 *  - Gate 1: Git working tree & staging area are completely clean
 *  - Gate 2: No active DSH sessions (`turn` / `subagent` / `job` / `schedule`) bound to the worktree
 */
export async function evaluateRemoveGates({
  repoCwd,
  worktreePath,
  workspaces = [],
  liveAgents = [],
  getSessionCwd,
  querySessionActivity,
  runGitFn = runManageGit,
  realpathFn = fsRealpath,
  signal,
}) {
  const worktrees = await listNormalizedWorktrees(repoCwd, { runGitFn, realpathFn, signal })
  const target = await resolveTargetWorktree(worktrees, worktreePath, { realpathFn })
  if (!target) {
    return {
      allowed: false,
      primaryCode: 'worktree/not-found',
      worktree: null,
      workspace: null,
      gates: { notMain: false, notBare: false, notLocked: false, exists: false, gitClean: false, noActiveSessions: false },
      gitStatus: null,
      activeSessions: [],
      reasons: ['worktree/not-found'],
    }
  }

  const notMain = !target.isMain
  const notBare = !target.bare
  const notLocked = !target.locked
  const exists = !target.prunable && target.exists !== false
  const reasons = []
  if (!notMain) reasons.push('worktree/is-main')
  if (!notBare) reasons.push('worktree/is-bare')
  if (!notLocked) reasons.push('worktree/locked')
  if (!exists) reasons.push('worktree/prunable-use-prune')

  let gitStatus = null
  let gitClean = false
  if (exists && notBare) {
    const wtCwd = target.realPath || target.path
    const stOut = await runGitFn(['status', '--porcelain=v1', '-b'], { cwd: wtCwd, signal })
    gitStatus = parseStatusPorcelainV1B(stOut)
    gitClean = gitStatus.clean
    if (!gitClean) reasons.push('worktree/dirty')
  }

  const wsMatches = await matchWorkspacesByPath([target], workspaces, { realpathFn })
  const matchedWs = wsMatches.get(target.path) ?? null
  const liveMatches = await matchLiveAgentsToWorktrees([target], liveAgents, {
    getSessionCwd,
    realpathFn,
    includeSubagents: true,
  })
  const activeSessions = []
  const sessionIds = [...new Set([...(matchedWs?.sessionIds || []), ...(liveMatches.byWorktree.get(target.path) || [])])]
  if (typeof querySessionActivity === 'function' && sessionIds.length > 0) {
    await mapWithConcurrency(sessionIds, MAX_DETAIL_CONCURRENCY, async (sid) => {
      try {
        const items = await querySessionActivity(sid)
        if (Array.isArray(items) && items.length > 0) {
          activeSessions.push({ sessionId: sid, activities: items })
        }
      } catch (err) {
        activeSessions.push({
          sessionId: sid,
          activities: [{ kind: 'activity-check-failed', items: [{ id: sid, label: String(err?.message || err) }] }],
        })
      }
    })
  }
  const noActiveSessions = activeSessions.length === 0
  if (!noActiveSessions) reasons.push('worktree/session-active')

  return {
    allowed: reasons.length === 0,
    primaryCode: reasons[0] ?? null,
    worktree: target,
    workspace: matchedWs,
    gates: { notMain, notBare, notLocked, exists, gitClean, noActiveSessions },
    gitStatus,
    activeSessions,
    reasons,
  }
}

/** Create controlled Phase-2 write management service for creating, dual-gated deleting, and pruning worktrees. */
export function createWorktreeManageService({
  defaultPathTemplate = DEFAULT_PATH_TEMPLATE,
  enableAgentTool = true,
  getWorkspaceRegistry,
  getLiveAgents,
  getSessionCwd,
  querySessionActivity,
  forkSessionToWorktree,
  runGitImpl = runManageGit,
  realpathImpl = fsRealpath,
  statImpl = fsStat,
  mkdirImpl = fsMkdir,
} = {}) {
  const safeRegistry = () => {
    try {
      return typeof getWorkspaceRegistry === 'function' ? getWorkspaceRegistry() : null
    } catch {
      return null
    }
  }
  const safeWorkspaces = () => {
    try {
      const reg = safeRegistry()
      return reg && typeof reg.list === 'function' ? reg.list() : []
    } catch {
      return []
    }
  }
  const safeLiveAgents = () => {
    try {
      const raw = typeof getLiveAgents === 'function' ? getLiveAgents() : []
      return Array.isArray(raw) ? raw : [...(raw || [])]
    } catch {
      return []
    }
  }

  return {
    config() {
      return {
        defaultPathTemplate,
        enableAgentTool: Boolean(enableAgentTool),
        wslDistro: process.env.WSL_DISTRO_NAME || null,
      }
    },

    async branches({ path }, signal) {
      let probe
      try {
        probe = await probeManageRepo(path, { runGitFn: runGitImpl, statFn: statImpl, realpathFn: realpathImpl, signal })
      } catch (err) {
        if (err?.code === 'worktree/missing-dir' || err?.code === 'worktree/not-git') {
          return {
            status: err.code === 'worktree/missing-dir' ? 'missing-dir' : 'not-git',
            isGitRepo: false,
            repoName: basename(expandUserPath(path)) || path,
            mainPath: null,
            currentBranch: null,
            shortHead: null,
            branches: [],
            defaultPathTemplate,
          }
        }
        throw err
      }
      const worktrees = await listNormalizedWorktrees(probe.toplevel, { runGitFn: runGitImpl, realpathFn: realpathImpl, signal }).catch(() => [])
      const mainWt = worktrees.find((w) => w.isMain) || worktrees[0]
      const mainPath = mainWt?.realPath || mainWt?.path || probe.toplevel
      const repoName = basename(mainPath) || 'repo'
      let shortHead = null
      try {
        shortHead = (await runGitImpl(['rev-parse', '--short', 'HEAD'], { cwd: probe.toplevel, signal })).trim() || null
      } catch {}
      const rawRefs = await runGitImpl(
        ['for-each-ref', '--format=%(refname:short)%09%(HEAD)', 'refs/heads'],
        { cwd: probe.toplevel, signal },
      ).catch(() => '')
      const seen = new Map()
      for (const line of rawRefs.split(/\r?\n/)) {
        if (!line) continue
        const [nameRaw, headMark] = line.split('\t')
        const name = (nameRaw || '').trim()
        if (!name) continue
        seen.set(name, (headMark || '').trim() === '*' || Boolean(seen.get(name)))
      }
      const branches = [...seen.entries()]
        .map(([name, isCurrent]) => ({ name, isCurrent }))
        .sort((a, b) => {
          if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
          return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
        })
      const currentBranch = branches.find((b) => b.isCurrent)?.name ?? null
      return {
        status: 'ok',
        isGitRepo: true,
        repoName,
        mainPath,
        currentBranch,
        shortHead,
        branches,
        defaultPathTemplate,
      }
    },

    async create({
      path,
      branch,
      baseRef,
      slug,
      pathTemplate,
      customPath,
      sessionMode = 'none',
      sourceSessionId,
    }, signal) {
      if (sessionMode !== 'none' && sessionMode !== 'blank' && sessionMode !== 'fork') {
        throw makeGateError('worktree/invalid-args', `Unsupported sessionMode "${sessionMode}"`)
      }
      const validBranch = validateBranchName(branch)
      const validBaseRef = validateBaseRef(baseRef)
      const probe = await probeManageRepo(path, { runGitFn: runGitImpl, statFn: statImpl, realpathFn: realpathImpl, signal })
      const worktrees = await listNormalizedWorktrees(probe.toplevel, { runGitFn: runGitImpl, realpathFn: realpathImpl, signal })
      const mainWt = worktrees.find((w) => w.isMain) || worktrees[0]
      const repoRoot = mainWt?.realPath || mainWt?.path || probe.toplevel
      const repoName = basename(repoRoot) || 'repo'

      try {
        await runGitImpl(['check-ref-format', '--branch', validBranch], { cwd: repoRoot, signal })
      } catch {
        throw makeGateError('worktree/invalid-branch', `Invalid Git branch name: ${validBranch}`)
      }

      let targetPath
      try {
        targetPath = resolveWorktreeTargetPath({
          repoRoot,
          repoName,
          commonDir: probe.commonDir,
          branch: validBranch,
          slug,
          pathTemplate: pathTemplate ?? defaultPathTemplate,
          customPath,
        })
      } catch (err) {
        throw makeGateError('worktree/invalid-path', err.message)
      }

      let branchExists = false
      try {
        await runGitImpl(['show-ref', '--verify', '--quiet', `refs/heads/${validBranch}`], { cwd: repoRoot, signal })
        branchExists = true
      } catch {}

      if (branchExists) {
        const checkedOut = worktrees.find((w) => w.branch === validBranch && !w.prunable)
        if (checkedOut) {
          throw makeGateError(
            'worktree/branch-in-use',
            `Branch "${validBranch}" is already checked out at ${checkedOut.path}`,
            { branch: validBranch, path: checkedOut.path },
          )
        }
        if (validBaseRef) {
          throw makeGateError(
            'worktree/branch-exists',
            `Branch "${validBranch}" already exists; omit baseRef to attach it or choose a new branch name`,
            { branch: validBranch },
          )
        }
      }

      let targetExists = false
      try {
        await statImpl(targetPath)
        targetExists = true
      } catch {}
      if (targetExists) {
        throw makeGateError('worktree/path-exists', `Target directory already exists: ${targetPath}`, { targetPath })
      }

      await mkdirImpl(dirname(targetPath), { recursive: true })
      const gitArgs = branchExists
        ? ['worktree', 'add', targetPath, validBranch]
        : ['worktree', 'add', '-b', validBranch, targetPath, ...(validBaseRef ? [validBaseRef] : [])]

      try {
        await runGitImpl(gitArgs, { cwd: repoRoot, signal })
      } catch (err) {
        throw makeGateError('worktree/git-create-failed', err?.stderr?.trim() || err?.message || String(err))
      }

      const norm = await normalizeExistingPath(targetPath, { realpathFn: realpathImpl })
      const finalPath = norm.realPath || targetPath

      let workspace = null
      let workspaceId = null
      let sessionId = null
      let forkWarning = null

      if (sessionMode === 'blank' || sessionMode === 'fork') {
        const reg = safeRegistry()
        if (reg && typeof reg.create === 'function') {
          workspace = await reg.create(finalPath)
          workspaceId = workspace?.id ?? workspace?.workspaceId ?? null
        }
      }

      if (sessionMode === 'fork') {
        if (!sourceSessionId) {
          forkWarning = 'sourceSessionId was not provided; created blank workspace instead'
        } else if (!workspace) {
          forkWarning = 'workspace registry is unavailable; created worktree without mounting forked session'
        } else if (typeof forkSessionToWorktree === 'function') {
          try {
            const forked = await forkSessionToWorktree({ sourceSessionId, workspace })
            if (forked?.sessionId) sessionId = forked.sessionId
            else if (forked?.warning) forkWarning = forked.warning
          } catch (err) {
            forkWarning = err?.message || String(err)
          }
        }
      }

      return {
        created: true,
        worktreePath: finalPath,
        branch: validBranch,
        baseRef: validBaseRef,
        sessionMode,
        workspaceId,
        sessionId,
        forkWarning,
      }
    },

    async preflightRemove({ path, worktreePath }, signal) {
      if (typeof worktreePath !== 'string' || worktreePath.length === 0 || worktreePath.includes('\0')) {
        throw makeGateError('worktree/invalid-path', 'worktreePath must be a non-empty string')
      }
      const probe = await probeManageRepo(path, { runGitFn: runGitImpl, statFn: statImpl, realpathFn: realpathImpl, signal })
      return evaluateRemoveGates({
        repoCwd: probe.toplevel,
        worktreePath,
        workspaces: safeWorkspaces(),
        liveAgents: safeLiveAgents(),
        getSessionCwd,
        querySessionActivity,
        runGitFn: runGitImpl,
        realpathFn: realpathImpl,
        signal,
      })
    },

    async remove({ path, worktreePath }, signal) {
      if (typeof worktreePath !== 'string' || worktreePath.length === 0 || worktreePath.includes('\0')) {
        throw makeGateError('worktree/invalid-path', 'worktreePath must be a non-empty string')
      }
      const probe = await probeManageRepo(path, { runGitFn: runGitImpl, statFn: statImpl, realpathFn: realpathImpl, signal })
      const gate = await evaluateRemoveGates({
        repoCwd: probe.toplevel,
        worktreePath,
        workspaces: safeWorkspaces(),
        liveAgents: safeLiveAgents(),
        getSessionCwd,
        querySessionActivity,
        runGitFn: runGitImpl,
        realpathFn: realpathImpl,
        signal,
      })
      if (!gate.allowed) {
        const reasonSummary = gate.reasons.join(', ')
        throw makeGateError(
          gate.primaryCode || 'worktree/remove-blocked',
          `Refused to remove worktree (${reasonSummary})`,
          { gates: gate.gates, gitStatus: gate.gitStatus, activeSessions: gate.activeSessions, reasons: gate.reasons },
        )
      }
      const removeTarget = gate.worktree.realPath || gate.worktree.path
      try {
        await runGitImpl(['worktree', 'remove', removeTarget], { cwd: probe.toplevel, signal })
      } catch (err) {
        throw makeGateError('worktree/git-remove-failed', err?.stderr?.trim() || err?.message || String(err))
      }
      return { removed: true, worktreePath: removeTarget, branch: gate.worktree.branch ?? null }
    },

    async prune({ path, dryRun = false }, signal) {
      const probe = await probeManageRepo(path, { runGitFn: runGitImpl, statFn: statImpl, realpathFn: realpathImpl, signal })
      const before = await listNormalizedWorktrees(probe.toplevel, { runGitFn: runGitImpl, realpathFn: realpathImpl, signal })
      const prunableEntries = before
        .filter((w) => w.prunable)
        .map((w) => ({ path: w.path, branch: w.branch, reason: w.prunableReason }))
      const args = dryRun ? ['worktree', 'prune', '--dry-run', '--verbose'] : ['worktree', 'prune', '--verbose']
      const output = await runGitImpl(args, { cwd: probe.toplevel, signal, includeStderr: true })
      return {
        pruned: !dryRun,
        dryRun: Boolean(dryRun),
        entries: prunableEntries,
        count: prunableEntries.length,
        output,
      }
    },
  }
}

function rpcOk(value) {
  return { ok: true, value }
}

function rpcError(code, message, details = {}) {
  return { ok: false, error: { code, message, details } }
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0 && !v.includes('\0')
}

/** Create Connection RPC endpoint handler for `/dsh-tune-worktree-manage`. */
export function createWorktreeManageRpcHandler(service, { stager } = {}) {
  return async (endpoint, payload, signal) => {
    try {
      if (endpoint === 'config') {
        return rpcOk(service.config())
      }
      if (endpoint === 'session-stage') {
        if (!stager) return rpcError('worktree/unknown-endpoint', 'Session staging is not available')
        if (!payload || typeof payload !== 'object' || !isNonEmptyString(payload.sessionId)) {
          return rpcError('worktree/invalid-args', 'sessionId must be a non-empty string')
        }
        return rpcOk(stager.get(payload.sessionId))
      }
      if (endpoint === 'stage-session') {
        if (!stager) return rpcError('worktree/unknown-endpoint', 'Session staging is not available')
        if (!payload || typeof payload !== 'object' || !isNonEmptyString(payload.sessionId) || typeof payload.enabled !== 'boolean') {
          return rpcError('worktree/invalid-args', 'sessionId and boolean enabled are required')
        }
        if (!payload.enabled) return rpcOk(stager.clear(payload.sessionId))
        if (!isNonEmptyString(payload.path)) {
          return rpcError('worktree/invalid-path', 'path must be a non-empty string without NUL bytes')
        }
        return rpcOk(stager.stage({
          sessionId: payload.sessionId,
          path: payload.path,
          baseRef: payload.baseRef ?? null,
          branch: payload.branch ?? null,
        }))
      }
      if (endpoint === 'retry-stage') {
        if (!stager) return rpcError('worktree/unknown-endpoint', 'Session staging is not available')
        if (!payload || typeof payload !== 'object' || !isNonEmptyString(payload.sessionId)) {
          return rpcError('worktree/invalid-args', 'sessionId must be a non-empty string')
        }
        return rpcOk({ retried: stager.retry(payload.sessionId), stage: stager.get(payload.sessionId) })
      }
      if (!payload || typeof payload !== 'object' || !isNonEmptyString(payload.path)) {
        return rpcError('worktree/invalid-path', 'path must be a non-empty string without NUL bytes')
      }
      if (endpoint === 'branches') {
        return rpcOk(await service.branches({ path: payload.path }, signal))
      }
      if (endpoint === 'create') {
        return rpcOk(await service.create(payload, signal))
      }
      if (endpoint === 'preflight-remove') {
        return rpcOk(await service.preflightRemove(payload, signal))
      }
      if (endpoint === 'remove') {
        return rpcOk(await service.remove(payload, signal))
      }
      if (endpoint === 'prune') {
        return rpcOk(await service.prune({ path: payload.path, dryRun: Boolean(payload.dryRun) }, signal))
      }
      return rpcError('worktree/unknown-endpoint', `Unknown worktree-manage RPC endpoint "${endpoint}"`)
    } catch (error) {
      if (error?.name === 'AbortError') return rpcError('worktree/aborted', 'Request aborted')
      return rpcError(error?.code || 'worktree/internal', error instanceof Error ? error.message : String(error), error?.details || {})
    }
  }
}

/** Build optional `create_worktree` Agent tool definition (strictly non-destructive create only). */
export function createWorktreeToolDefinition({ defineTool = (def) => def, ToolArgsError, service, workingDirectory }) {
  const argsErr = (msg) => (ToolArgsError ? new ToolArgsError([msg]) : new Error(msg))
  return defineTool({
    name: CREATE_WORKTREE_TOOL,
    description: 'Create an isolated Git worktree and branch for parallel/separate work without touching the current checkout. Optionally mount a blank or forked DSH session.',
    timeoutMs: 20000,
    parameters: {
      branch: {
        type: 'string',
        required: true,
        description: 'Branch name to create or check out in the new worktree.',
      },
      baseRef: {
        type: 'string',
        description: 'Optional base branch, tag, or commit SHA when creating a new branch.',
      },
      slug: {
        type: 'string',
        description: 'Optional directory slug overriding the sanitized branch name.',
      },
      sessionMode: {
        type: 'string',
        enum: ['none', 'blank', 'fork'],
        description: 'Whether to only create the git worktree ("none"), register a DSH workspace for a blank session ("blank"), or fork the current session ("fork"). Defaults to "blank".',
      },
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      if (!args || typeof args !== 'object' || Array.isArray(args)) throw argsErr('arguments must be an object')
      if (typeof args.branch !== 'string' || args.branch.trim().length === 0) {
        throw argsErr('branch must be a non-empty string')
      }
      const mode = args.sessionMode ?? 'blank'
      if (mode !== 'none' && mode !== 'blank' && mode !== 'fork') {
        throw argsErr('sessionMode must be "none", "blank", or "fork"')
      }
      const cwd = exec?.agent !== undefined && workingDirectory
        ? await workingDirectory.ensure(exec.agent, exec.signal)
        : exec?.agent?.session?.header?.cwd
      if (!cwd) throw argsErr('No working directory is bound to the current session')
      const sourceSessionId = exec?.agent?.session?.header?.id
      try {
        const raw = await service.create(
          {
            path: cwd,
            branch: args.branch,
            baseRef: args.baseRef,
            slug: args.slug,
            sessionMode: mode,
            sourceSessionId,
          },
          exec?.signal,
        )
        const result = {
          created: Boolean(raw.created),
          worktreePath: raw.worktreePath,
          branch: raw.branch,
          sessionMode: raw.sessionMode,
        }
        if (raw.baseRef != null) result.baseRef = raw.baseRef
        if (raw.workspaceId != null) result.workspaceId = raw.workspaceId
        if (raw.sessionId != null) result.sessionId = raw.sessionId
        if (raw.forkWarning != null) result.forkWarning = raw.forkWarning
        return result
      } catch (err) {
        throw argsErr(err?.message || String(err))
      }
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          created: { type: 'boolean', required: true },
          worktreePath: { type: 'string', required: true },
          branch: { type: 'string', required: true },
          baseRef: { type: 'string' },
          sessionMode: { type: 'string', enum: ['none', 'blank', 'fork'], required: true },
          workspaceId: { type: 'string' },
          sessionId: { type: 'string' },
          forkWarning: { type: 'string' },
        },
      },
      render(_args, val) {
        const extra = val.forkWarning ? ` (${val.forkWarning})` : ''
        return [{ type: 'text', text: `Created worktree at ${val.worktreePath} on branch ${val.branch}${extra}.` }]
      },
      presentationMeta(_args, val) {
        return { tool: CREATE_WORKTREE_TOOL, ...val }
      },
    },
  })
}
