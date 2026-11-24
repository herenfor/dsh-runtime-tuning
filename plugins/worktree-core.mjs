import { execFile } from 'node:child_process'
import { readdir as fsReaddir, realpath as fsRealpath, stat as fsStat } from 'node:fs/promises'
import { homedir as osHomedir } from 'node:os'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

export const WORKTREE_RPC_CHANNEL = '/dsh-tune-worktree'
export const DEFAULT_COMMIT_LIMIT = 20
export const MIN_COMMIT_LIMIT = 5
export const MAX_COMMIT_LIMIT = 50
export const MAX_DETAIL_CONCURRENCY = 4
export const MAX_WORKTREES_PAIRWISE = 24
export const MAX_DIR_ENTRIES = 200

const ZERO_OID = /^0{40,}$/
const ALLOWED_GIT_SUBCOMMANDS = new Set(['rev-parse', 'worktree', 'status', 'log', 'merge-base', 'rev-list'])

function validateGitArgs(args) {
  if (!Array.isArray(args) || args.length === 0) throw new Error('worktree: git args must be a non-empty array')
  for (const arg of args) {
    if (typeof arg !== 'string' || arg.includes('\0')) throw new Error('worktree: invalid git argument')
  }
  const sub = args[0]
  if (!ALLOWED_GIT_SUBCOMMANDS.has(sub)) throw new Error(`worktree: disallowed git subcommand "${sub}"`)
  if (sub === 'worktree' && args[1] !== 'list') throw new Error('worktree: only read-only "git worktree list" is allowed')
}

/** Run a strictly read-only git subcommand via execFile without shell interpolation. */
export function runGit(args, { cwd, signal, timeoutMs = 8000 } = {}) {
  validateGitArgs(args)
  if (typeof cwd !== 'string' || cwd.length === 0 || cwd.includes('\0')) {
    return Promise.reject(new Error('worktree: cwd must be a non-empty string'))
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
        resolvePromise(stdout)
      },
    )
  })
}

/** Parse `git worktree list --porcelain` output into normalized records. */
export function parseWorktreePorcelain(stdout) {
  if (typeof stdout !== 'string' || stdout.trim() === '') return []
  const records = []
  let current = null

  const flush = () => {
    if (!current || !current.path) return
    records.push({
      path: current.path,
      head: current.head,
      branch: current.branch,
      branchRef: current.branchRef,
      bare: current.bare,
      detached: current.detached,
      locked: current.locked,
      lockedReason: current.lockedReason,
      prunable: current.prunable,
      prunableReason: current.prunableReason,
      isMain: records.length === 0,
    })
    current = null
  }

  for (const rawLine of stdout.split(/\r?\n/)) {
    if (rawLine === '') {
      flush()
      continue
    }
    if (rawLine.startsWith('worktree ')) {
      flush()
      current = {
        path: rawLine.slice('worktree '.length),
        head: null,
        branch: null,
        branchRef: null,
        bare: false,
        detached: false,
        locked: false,
        lockedReason: null,
        prunable: false,
        prunableReason: null,
      }
      continue
    }
    if (!current) continue
    if (rawLine.startsWith('HEAD ')) {
      current.head = rawLine.slice('HEAD '.length).trim() || null
    } else if (rawLine.startsWith('branch ')) {
      const ref = rawLine.slice('branch '.length).trim()
      current.branchRef = ref || null
      current.branch = ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : (ref || null)
    } else if (rawLine === 'bare') {
      current.bare = true
    } else if (rawLine === 'detached') {
      current.detached = true
    } else if (rawLine === 'locked' || rawLine.startsWith('locked ')) {
      current.locked = true
      const reason = rawLine.slice('locked'.length).trim()
      current.lockedReason = reason || null
    } else if (rawLine === 'prunable' || rawLine.startsWith('prunable ')) {
      current.prunable = true
      const reason = rawLine.slice('prunable'.length).trim()
      current.prunableReason = reason || null
    }
  }
  flush()
  return records
}

function parseBranchHeader(headerLine) {
  const rest = headerLine.slice(3).trim()
  if (rest === 'HEAD (no branch)' || rest === 'HEAD (detached)') {
    return { branch: null, upstream: null, ahead: 0, behind: 0, detached: true, unborn: false }
  }
  const unbornMatch = /^(?:No commits yet on|Initial commit on)\s+(.+)$/.exec(rest)
  if (unbornMatch) {
    return { branch: unbornMatch[1].trim(), upstream: null, ahead: 0, behind: 0, detached: false, unborn: true }
  }
  let branchPart = rest
  let ahead = 0
  let behind = 0
  const trackMatch = /^(.*?)\s+\[([^\]]+)\]$/.exec(rest)
  if (trackMatch) {
    branchPart = trackMatch[1]
    const bracket = trackMatch[2]
    const aheadM = /\bahead\s+(\d+)\b/.exec(bracket)
    const behindM = /\bbehind\s+(\d+)\b/.exec(bracket)
    if (aheadM) ahead = Number(aheadM[1])
    if (behindM) behind = Number(behindM[1])
  }
  const dotsIdx = branchPart.indexOf('...')
  if (dotsIdx !== -1) {
    return {
      branch: branchPart.slice(0, dotsIdx) || null,
      upstream: branchPart.slice(dotsIdx + 3) || null,
      ahead,
      behind,
      detached: false,
      unborn: false,
    }
  }
  return { branch: branchPart || null, upstream: null, ahead, behind, detached: false, unborn: false }
}

const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

/** Parse `git status --porcelain=v1 -b` into branch tracking and working tree counts. */
export function parseStatusPorcelainV1B(stdout) {
  const result = {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    unborn: false,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    conflicted: 0,
    dirtyCount: 0,
    clean: true,
  }
  if (typeof stdout !== 'string' || stdout === '') return result
  for (const line of stdout.split(/\r?\n/)) {
    if (!line) continue
    if (line.startsWith('## ')) {
      Object.assign(result, parseBranchHeader(line))
      continue
    }
    if (line.length < 2) continue
    const xy = line.slice(0, 2)
    const x = xy[0]
    const y = xy[1]
    result.dirtyCount += 1
    if (xy === '??') {
      result.untracked += 1
    } else if (CONFLICT_CODES.has(xy)) {
      result.conflicted += 1
    } else {
      if (x !== ' ' && x !== '?') result.staged += 1
      if (y !== ' ' && y !== '?') result.unstaged += 1
    }
  }
  result.clean = result.dirtyCount === 0
  return result
}

/** Parse `\x1e`-delimited git log records with `\x1f`-delimited fields. */
export function parseCommitLog(stdout) {
  if (typeof stdout !== 'string' || stdout.trim() === '') return []
  const commits = []
  for (const rawRecord of stdout.split('\x1e')) {
    const trimmed = rawRecord.replace(/^[\r\n]+|[\r\n]+$/g, '')
    if (!trimmed) continue
    const parts = trimmed.split('\x1f')
    if (parts.length < 6) continue
    const [hash, shortHash, parentsRaw, subject, author, tsRaw] = parts
    if (!hash) continue
    commits.push({
      hash: hash.trim(),
      shortHash: (shortHash || hash.slice(0, 7)).trim(),
      parents: parentsRaw ? parentsRaw.trim().split(/\s+/).filter(Boolean) : [],
      subject: (subject ?? '').trim(),
      author: (author ?? '').trim(),
      timestamp: Number.parseInt(tsRaw, 10) || 0,
    })
  }
  return commits
}

/** Safely resolve realpath without throwing on missing or inaccessible paths. */
export async function normalizeExistingPath(rawPath, { realpathFn = fsRealpath } = {}) {
  if (typeof rawPath !== 'string' || rawPath.length === 0 || rawPath.includes('\0')) {
    return { path: String(rawPath ?? ''), realPath: null, exists: false }
  }
  try {
    const realPath = await realpathFn(rawPath)
    return { path: rawPath, realPath, exists: true }
  } catch {
    return { path: rawPath, realPath: null, exists: false }
  }
}

function stripTrailingSlashes(p) {
  const resolved = resolve(p)
  return resolved.length > 1 ? resolved.replace(/\/+$/, '') : resolved
}

/** Align worktrees against DSH Workspace records using realpath first, raw-path fallback second. */
export async function matchWorkspacesByPath(worktrees, workspaces, { realpathFn = fsRealpath } = {}) {
  const byReal = new Map()
  const byFallback = new Map()
  for (const ws of workspaces || []) {
    if (!ws || typeof ws.path !== 'string') continue
    const id = ws.id ?? ws.workspaceId
    if (!id) continue
    const entry = {
      workspaceId: String(id),
      workspaceTitle: ws.title || basename(ws.path) || ws.path,
      workspacePath: ws.path,
      sessionIds: Array.isArray(ws.sessionIds) ? ws.sessionIds.map(String) : [],
    }
    const norm = await normalizeExistingPath(ws.path, { realpathFn })
    if (norm.exists && norm.realPath && !byReal.has(norm.realPath)) byReal.set(norm.realPath, entry)
    const fb = stripTrailingSlashes(ws.path)
    if (!byFallback.has(fb)) byFallback.set(fb, entry)
  }

  const matches = new Map()
  for (const wt of worktrees || []) {
    let matched = null
    if (wt.realPath && byReal.has(wt.realPath)) matched = byReal.get(wt.realPath)
    else {
      const fb = stripTrailingSlashes(wt.realPath || wt.path)
      matched = byReal.get(fb) ?? byFallback.get(fb) ?? null
    }
    matches.set(wt.path, matched)
  }
  return matches
}

/** Compute concise relative path from main worktree root using forward slashes. */
export function computeRelativePath(targetPath, mainPath) {
  if (!mainPath || targetPath === mainPath) return '.'
  const rel = relative(mainPath, targetPath).replace(/\\/g, '/')
  return rel === '' ? '.' : rel
}

function lookupMap(store, keyA, keyB, symmetric = false) {
  if (!store) return undefined
  const k1 = `${keyA}\0${keyB}`
  const v1 = store instanceof Map ? store.get(k1) : store[k1]
  if (v1 !== undefined) return v1
  if (!symmetric) return undefined
  const k2 = `${keyB}\0${keyA}`
  return store instanceof Map ? store.get(k2) : store[k2]
}

function lookupValue(store, key) {
  if (!store || !key) return undefined
  return store instanceof Map ? store.get(key) : store[key]
}

function isValidHead(head) {
  return typeof head === 'string' && head.length > 0 && !ZERO_OID.test(head)
}

function compareNodeOrder(a, b, rootPath, commitTimestamps) {
  if (a.path === rootPath && b.path !== rootPath) return -1
  if (b.path === rootPath && a.path !== rootPath) return 1
  if (a.isMain !== b.isMain) return a.isMain ? -1 : 1
  const tsA = lookupValue(commitTimestamps, a.head) ?? Number.MAX_SAFE_INTEGER
  const tsB = lookupValue(commitTimestamps, b.head) ?? Number.MAX_SAFE_INTEGER
  if (tsA !== tsB) return tsA - tsB
  const brA = a.branch || a.path
  const brB = b.branch || b.path
  if (brA !== brB) return brA < brB ? -1 : 1
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0
}

/**
 * Infer parent-child derivation tree among worktrees using merge-base and ancestry checks.
 * Guarantees a cycle-free tree rooted at `mainPath`.
 */
export function inferWorktreeTree(worktrees, { mainPath, mergeBases, ancestorChecks, commitTimestamps } = {}) {
  const list = Array.isArray(worktrees) ? worktrees : []
  const parentByPath = {}
  const relativePathByPath = {}
  if (list.length === 0) return { rootPath: null, parentByPath, relativePathByPath, treeEdges: [] }

  const rootNode = list.find((w) => w.path === mainPath) || list.find((w) => w.isMain) || list[0]
  const rootPath = rootNode.path
  parentByPath[rootPath] = null
  for (const wt of list) {
    relativePathByPath[wt.path] = computeRelativePath(wt.realPath || wt.path, rootNode.realPath || rootPath)
  }

  const byPath = new Map(list.map((w) => [w.path, w]))
  const isAncestor = (aSha, bSha) => {
    if (!aSha || !bSha) return false
    if (aSha === bSha) return true
    return Boolean(lookupMap(ancestorChecks, aSha, bSha, false))
  }

  const ordered = [...list].sort((a, b) => compareNodeOrder(a, b, rootPath, commitTimestamps))
  const rankOf = new Map(ordered.map((w, idx) => [w.path, idx]))

  for (const node of list) {
    if (node.path === rootPath) continue
    if (!isValidHead(node.head) || node.bare || !isValidHead(rootNode.head)) {
      parentByPath[node.path] = rootPath
      continue
    }

    const mbRoot = lookupMap(mergeBases, rootPath, node.path, true)
    const candidates = [{ candidate: rootNode, anchor: mbRoot ?? rootNode.head, direct: isAncestor(rootNode.head, node.head), isRoot: true }]

    for (const cand of list) {
      if (cand.path === node.path || cand.path === rootPath) continue
      if (cand.bare || !isValidHead(cand.head)) continue
      const mb = lookupMap(mergeBases, cand.path, node.path, true)
      if (!mb || !mbRoot) continue
      // Must share progress past the root divergence point
      if (mb === mbRoot || !isAncestor(mbRoot, mb)) continue

      const candAncestorOfNode = isAncestor(cand.head, node.head)
      const nodeAncestorOfCand = isAncestor(node.head, cand.head)
      if (nodeAncestorOfCand && !candAncestorOfNode) continue // node is behind cand -> cand is child, not parent
      if (cand.head === node.head && rankOf.get(cand.path) > rankOf.get(node.path)) continue
      if (!candAncestorOfNode && !nodeAncestorOfCand && rankOf.get(cand.path) > rankOf.get(node.path)) continue

      candidates.push({
        candidate: cand,
        anchor: candAncestorOfNode ? cand.head : mb,
        direct: candAncestorOfNode,
        isRoot: false,
      })
    }

    candidates.sort((a, b) => {
      if (a.anchor !== b.anchor) {
        const aAncB = isAncestor(a.anchor, b.anchor)
        const bAncA = isAncestor(b.anchor, a.anchor)
        if (bAncA && !aAncB) return -1
        if (aAncB && !bAncA) return 1
      }
      if (a.direct !== b.direct) return a.direct ? -1 : 1
      if (a.isRoot !== b.isRoot) return a.isRoot ? 1 : -1
      const tsA = lookupValue(commitTimestamps, a.anchor) ?? 0
      const tsB = lookupValue(commitTimestamps, b.anchor) ?? 0
      if (tsA !== tsB) return tsB - tsA
      return rankOf.get(a.candidate.path) - rankOf.get(b.candidate.path)
    })

    parentByPath[node.path] = candidates[0]?.candidate.path ?? rootPath
  }

  // Defensive cycle guard: break any unexpected cycle back to rootPath
  for (const node of list) {
    if (node.path === rootPath) continue
    const seen = new Set([node.path])
    let cur = parentByPath[node.path]
    while (cur && cur !== rootPath) {
      if (seen.has(cur) || !byPath.has(cur)) {
        parentByPath[node.path] = rootPath
        break
      }
      seen.add(cur)
      cur = parentByPath[cur]
    }
  }

  const treeEdges = list
    .filter((w) => w.path !== rootPath && parentByPath[w.path])
    .map((w) => ({ from: parentByPath[w.path], to: w.path }))

  return { rootPath, parentByPath, relativePathByPath, treeEdges }
}

/** Build a lightweight swimlane DAG for on-demand commit fork visualization. */
export function buildCommitDag(commits, worktrees = [], mergeBaseShas = []) {
  const list = Array.isArray(commits) ? commits : []
  const commitSet = new Set(list.map((c) => c.hash))
  const mergeBaseSet = new Set(mergeBaseShas || [])
  const activeLanes = []
  const laneByHash = new Map()
  let maxLane = 0

  for (const commit of list) {
    const matching = []
    for (let i = 0; i < activeLanes.length; i += 1) {
      if (activeLanes[i] === commit.hash) matching.push(i)
    }
    let lane
    if (matching.length > 0) {
      lane = matching[0]
      for (let i = 1; i < matching.length; i += 1) activeLanes[matching[i]] = null
    } else {
      const empty = activeLanes.indexOf(null)
      lane = empty !== -1 ? empty : activeLanes.length
    }
    laneByHash.set(commit.hash, lane)
    if (lane > maxLane) maxLane = lane

    const parentsInGraph = (commit.parents || []).filter((p) => commitSet.has(p))
    if (parentsInGraph.length > 0) {
      activeLanes[lane] = parentsInGraph[0]
      for (let i = 1; i < parentsInGraph.length; i += 1) {
        const extra = parentsInGraph[i]
        if (!activeLanes.includes(extra)) {
          const empty = activeLanes.indexOf(null)
          const extraLane = empty !== -1 ? empty : activeLanes.length
          activeLanes[extraLane] = extra
          if (extraLane > maxLane) maxLane = extraLane
        }
      }
    } else {
      activeLanes[lane] = null
    }
  }

  const childCount = new Map()
  const edges = []
  for (const commit of list) {
    const fromLane = laneByHash.get(commit.hash) ?? 0
    for (const parentHash of commit.parents || []) {
      if (!commitSet.has(parentHash)) continue
      childCount.set(parentHash, (childCount.get(parentHash) ?? 0) + 1)
      edges.push({
        from: commit.hash,
        to: parentHash,
        fromLane,
        toLane: laneByHash.get(parentHash) ?? 0,
      })
    }
  }

  const refsByHash = new Map()
  for (const wt of worktrees || []) {
    if (!isValidHead(wt.head)) continue
    let bucket = refsByHash.get(wt.head)
    if (!bucket) {
      bucket = []
      refsByHash.set(wt.head, bucket)
    }
    bucket.push({
      path: wt.path,
      branch: wt.branch || (wt.detached ? 'detached' : wt.head.slice(0, 7)),
      isMain: Boolean(wt.isMain),
      isCurrent: Boolean(wt.isCurrent),
    })
  }

  const nodes = list.map((commit) => ({
    hash: commit.hash,
    shortHash: commit.shortHash,
    parents: commit.parents,
    subject: commit.subject,
    author: commit.author,
    timestamp: commit.timestamp,
    lane: laneByHash.get(commit.hash) ?? 0,
    isMergeCommit: (commit.parents?.length ?? 0) > 1,
    isForkPoint: (childCount.get(commit.hash) ?? 0) > 1 || mergeBaseSet.has(commit.hash),
    worktreeRefs: refsByHash.get(commit.hash) ?? [],
  }))

  return { nodes, edges, laneCount: list.length === 0 ? 0 : maxLane + 1 }
}

/** Map async workers over `items` with bounded concurrency. */
export async function mapWithConcurrency(items, limit, fn) {
  const list = Array.isArray(items) ? items : []
  const cap = Math.max(1, Math.min(limit || 1, list.length || 1))
  const results = new Array(list.length)
  let nextIdx = 0
  const worker = async () => {
    while (nextIdx < list.length) {
      const idx = nextIdx
      nextIdx += 1
      results[idx] = await fn(list[idx], idx)
    }
  }
  await Promise.all(Array.from({ length: cap }, worker))
  return results
}

function clampCommitLimit(raw) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return DEFAULT_COMMIT_LIMIT
  return Math.max(MIN_COMMIT_LIMIT, Math.min(MAX_COMMIT_LIMIT, Math.trunc(n)))
}

/**
 * Translate Windows/WSL UNC paths (`\\wsl.localhost\<distro>\...`, `X:\...`) to local POSIX
 * paths when running inside the matching WSL Linux host; otherwise return unchanged.
 */
export function resolveHostPath(
  inputPath,
  { platform = process.platform, wslDistro = process.env.WSL_DISTRO_NAME } = {},
) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) return inputPath
  if (platform !== 'linux') return inputPath
  const unc = /^[\\/]{2}(?:wsl\.localhost|wsl\$)[\\/]([^\\/]+)(?:[\\/](.*))?$/i.exec(inputPath)
  if (unc) {
    if (wslDistro && unc[1].toLowerCase() !== wslDistro.toLowerCase()) return inputPath
    const rest = (unc[2] ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
    return rest ? `/${rest}` : '/'
  }
  if (wslDistro) {
    const drive = /^([A-Za-z]):[\\/](.*)$/.exec(inputPath)
    if (drive) {
      const rest = (drive[2] ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
      return rest ? `/mnt/${drive[1].toLowerCase()}/${rest}` : `/mnt/${drive[1].toLowerCase()}`
    }
  }
  return inputPath
}

/** Expand leading `~` / `~/` and translate Windows/WSL UNC paths for local filesystem checks. */
export function expandUserPath(
  inputPath,
  { homeDir = osHomedir(), platform = process.platform, wslDistro = process.env.WSL_DISTRO_NAME } = {},
) {
  if (typeof inputPath !== 'string' || inputPath.length === 0) return inputPath
  let expanded = inputPath
  if (inputPath === '~') {
    expanded = homeDir
  } else if (inputPath.startsWith('~/') || inputPath.startsWith('~\\')) {
    const rest = inputPath.slice(2).replace(/\\/g, '/')
    expanded = rest ? join(homeDir, rest) : homeDir
  }
  return resolveHostPath(expanded, { platform, wslDistro })
}

/** Return true when `candidatePath` equals `rootPath` or lies beneath it. */
export function isPathWithin(rootPath, candidatePath) {
  if (!rootPath || !candidatePath) return false
  const rel = relative(rootPath, candidatePath)
  return rel === '' || (rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel))
}

/** Match live Host agents (using effective `workingDirectory` when available) to normalized worktrees. */
export async function matchLiveAgentsToWorktrees(
  worktrees,
  liveAgents,
  { getSessionCwd, realpathFn = fsRealpath, includeSubagents = false } = {},
) {
  const byWorktree = new Map()
  const assignedWorktreeBySid = new Map()
  const candidates = (worktrees || [])
    .filter((w) => w && !w.bare && w.exists !== false)
    .map((w) => ({ wt: w, root: w.realPath || resolve(w.path) }))
    .sort((a, b) => b.root.length - a.root.length)

  if (candidates.length === 0 || !liveAgents) {
    return { byWorktree, assignedWorktreeBySid }
  }

  for (const agent of liveAgents) {
    const session = agent?.session ?? agent
    if (!includeSubagents && (session?.header?.delegationDepth ?? 0) > 0) continue
    const sidRaw = session?.id ?? session?.header?.id
    if (!sidRaw) continue
    const sid = String(sidRaw)
    const rawCwd = typeof getSessionCwd === 'function' ? getSessionCwd(session) : session?.header?.cwd
    if (typeof rawCwd !== 'string' || rawCwd.length === 0) continue
    const hostCwd = expandUserPath(rawCwd)
    const norm = await normalizeExistingPath(hostCwd, { realpathFn })
    const effective = norm.realPath || resolve(hostCwd)
    const hit = candidates.find((c) => isPathWithin(c.root, effective))
    if (!hit) continue
    assignedWorktreeBySid.set(sid, hit.wt.path)
    let list = byWorktree.get(hit.wt.path)
    if (!list) {
      list = []
      byWorktree.set(hit.wt.path, list)
    }
    if (!list.includes(sid)) list.push(sid)
  }

  return { byWorktree, assignedWorktreeBySid }
}

async function probeGitRepo(rawTargetPath, { runGitFn, statFn, realpathFn, signal }) {
  const targetPath = expandUserPath(rawTargetPath)
  try {
    const st = await statFn(targetPath)
    if (!st.isDirectory()) return { status: 'missing-dir' }
  } catch {
    return { status: 'missing-dir' }
  }

  let revOut
  try {
    revOut = await runGitFn(['rev-parse', '--git-common-dir', '--is-bare-repository'], { cwd: targetPath, signal })
  } catch {
    return { status: 'not-git' }
  }

  const lines = revOut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const commonDirRaw = lines[0] || ''
  const isBareRepo = lines[1] === 'true'
  const resolvedCommon = await normalizeExistingPath(resolve(targetPath, commonDirRaw), { realpathFn })

  let toplevel = null
  let superprojectRoot = null
  if (!isBareRepo) {
    try {
      const topOut = await runGitFn(['rev-parse', '--show-toplevel'], { cwd: targetPath, signal })
      toplevel = topOut.trim() || null
    } catch {}
    try {
      const spOut = await runGitFn(['rev-parse', '--show-superproject-working-tree'], { cwd: targetPath, signal })
      superprojectRoot = spOut.trim() || null
    } catch {}
  }

  const targetNorm = await normalizeExistingPath(targetPath, { realpathFn })
  const topNorm = toplevel ? await normalizeExistingPath(toplevel, { realpathFn }) : { realPath: null }
  return {
    status: 'ok',
    isBareRepo,
    commonDir: resolvedCommon.realPath || resolve(targetPath, commonDirRaw),
    toplevel,
    toplevelRealPath: topNorm.realPath || toplevel,
    targetRealPath: targetNorm.realPath || targetPath,
    isSubmodule: Boolean(superprojectRoot),
    superprojectRoot,
  }
}

async function resolveWorktreesWithMeta(
  probe,
  { runGitFn, realpathFn, workspaces, liveAgents, getSessionCwd, querySessionActivity, signal },
) {
  const listCwd = probe.toplevel || probe.targetRealPath
  const porcelain = await runGitFn(['worktree', 'list', '--porcelain'], { cwd: listCwd, signal })
  const rawWorktrees = parseWorktreePorcelain(porcelain)

  const normList = await mapWithConcurrency(rawWorktrees, MAX_DETAIL_CONCURRENCY, async (wt) => {
    const norm = await normalizeExistingPath(wt.path, { realpathFn })
    return {
      ...wt,
      realPath: norm.realPath,
      exists: norm.exists,
      isCurrent: Boolean(
        probe.toplevelRealPath
          ? (norm.realPath && norm.realPath === probe.toplevelRealPath) || wt.path === probe.toplevel
          : (norm.realPath && norm.realPath === probe.targetRealPath) || wt.path === probe.targetRealPath,
      ),
    }
  })

  const wsMatches = await matchWorkspacesByPath(normList, workspaces, { realpathFn })
  const liveMatches = await matchLiveAgentsToWorktrees(normList, liveAgents, {
    getSessionCwd,
    realpathFn,
    includeSubagents: false,
  })
  const sessionIdsByWt = new Map()
  const allSessionIds = []
  for (const wt of normList) {
    const match = wsMatches.get(wt.path) ?? null
    const baseSids = (match?.sessionIds || []).filter((sid) => {
      const movedTo = liveMatches.assignedWorktreeBySid.get(sid)
      return !movedTo || movedTo === wt.path
    })
    const liveSids = liveMatches.byWorktree.get(wt.path) || []
    const merged = [...new Set([...baseSids, ...liveSids])]
    sessionIdsByWt.set(wt.path, merged)
    allSessionIds.push(...merged)
  }
  const uniqueSessionIds = [...new Set(allSessionIds)]
  const sessionActivities = {}
  if (typeof querySessionActivity === 'function' && uniqueSessionIds.length > 0) {
    await mapWithConcurrency(uniqueSessionIds, MAX_DETAIL_CONCURRENCY, async (sid) => {
      try {
        const items = await querySessionActivity(sid)
        if (Array.isArray(items) && items.length > 0) sessionActivities[sid] = items
      } catch {}
    })
  }

  const root = normList.find((w) => w.isMain) || normList[0]
  const rootRealOrRaw = root ? (root.realPath || root.path) : null
  const worktrees = normList.map((wt) => {
    const match = wsMatches.get(wt.path) ?? null
    return {
      ...wt,
      relativePath: rootRealOrRaw ? computeRelativePath(wt.realPath || wt.path, rootRealOrRaw) : '.',
      workspaceId: match?.workspaceId ?? null,
      workspaceTitle: match?.workspaceTitle ?? null,
      sessionIds: sessionIdsByWt.get(wt.path) ?? [],
    }
  })

  return { worktrees, sessionActivities }
}

/** Create read-only worktree inspection service backed by host git + DSH registries. */
export function createWorktreeService({
  getWorkspaceRegistry,
  getLiveAgents,
  getSessionCwd,
  querySessionActivity,
  defaultCommitLimit = DEFAULT_COMMIT_LIMIT,
  runGitImpl = runGit,
  realpathImpl = fsRealpath,
  statImpl = fsStat,
  readdirImpl = fsReaddir,
  homeDir = osHomedir(),
} = {}) {
  const safeWorkspaces = () => {
    try {
      const reg = typeof getWorkspaceRegistry === 'function' ? getWorkspaceRegistry() : null
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
    async listDirs({ path, showHidden = false } = {}, signal) {
      const requested = typeof path === 'string' && path.trim().length > 0 ? path.trim() : homeDir
      const resolvedTarget = expandUserPath(requested, { homeDir })
      const wslDistro = process.env.WSL_DISTRO_NAME || null
      let st
      try {
        st = await statImpl(resolvedTarget)
      } catch {
        st = null
      }
      if (!st || !st.isDirectory()) {
        const fallbackParent = dirname(resolvedTarget)
        return {
          status: 'missing-dir',
          queryPath: requested,
          path: resolvedTarget,
          parentPath: fallbackParent !== resolvedTarget ? fallbackParent : null,
          homePath: homeDir,
          isGitRepo: false,
          wslDistro,
          entries: [],
          truncated: false,
        }
      }

      const norm = await normalizeExistingPath(resolvedTarget, { realpathFn: realpathImpl })
      const currentPath = norm.realPath || resolve(resolvedTarget)
      const parent = dirname(currentPath)
      const parentPath = parent !== currentPath ? parent : null
      let isGitRepo = false
      try {
        await statImpl(join(currentPath, '.git'))
        isGitRepo = true
      } catch {}

      let dirents = []
      try {
        dirents = await readdirImpl(currentPath, { withFileTypes: true })
      } catch {
        dirents = []
      }

      const dirNames = []
      for (const entry of dirents) {
        const name = entry?.name
        if (!name || name === '.' || name === '..') continue
        if (!showHidden && name.startsWith('.')) continue
        if (entry.isDirectory?.()) {
          dirNames.push(name)
        } else if (entry.isSymbolicLink?.()) {
          try {
            const linkSt = await statImpl(join(currentPath, name))
            if (linkSt?.isDirectory?.()) dirNames.push(name)
          } catch {}
        }
      }

      dirNames.sort((a, b) => {
        const la = a.toLowerCase()
        const lb = b.toLowerCase()
        return la < lb ? -1 : la > lb ? 1 : a < b ? -1 : a > b ? 1 : 0
      })

      const truncated = dirNames.length > MAX_DIR_ENTRIES
      const sliced = dirNames.slice(0, MAX_DIR_ENTRIES)
      const entries = await mapWithConcurrency(sliced, MAX_DETAIL_CONCURRENCY, async (name) => {
        if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
        const fullPath = join(currentPath, name)
        let entryGit = false
        try {
          await statImpl(join(fullPath, '.git'))
          entryGit = true
        } catch {}
        return { name, path: fullPath, isGitRepo: entryGit }
      })

      return {
        status: 'ok',
        queryPath: requested,
        path: currentPath,
        parentPath,
        homePath: homeDir,
        isGitRepo,
        wslDistro,
        entries,
        truncated,
      }
    },

    async summary({ path }, signal) {
      const probe = await probeGitRepo(path, { runGitFn: runGitImpl, statFn: statImpl, realpathFn: realpathImpl, signal })
      if (probe.status !== 'ok') {
        return {
          status: probe.status,
          isGitRepo: false,
          isBare: false,
          isSubmodule: false,
          branch: null,
          shortHead: null,
          detached: false,
          dirtyCount: 0,
          ahead: 0,
          behind: 0,
          worktreeCount: 0,
          repoName: basename(path) || path,
          currentWorktreePath: null,
        }
      }
      const cwd = probe.toplevel || probe.targetRealPath
      const porcelain = await runGitImpl(['worktree', 'list', '--porcelain'], { cwd, signal }).catch(() => '')
      const worktrees = parseWorktreePorcelain(porcelain)
      const currentWt = worktrees.find((w) => w.path === probe.toplevel) || worktrees.find((w) => w.isMain) || worktrees[0]
      let statusInfo = { branch: currentWt?.branch ?? null, ahead: 0, behind: 0, detached: Boolean(currentWt?.detached), dirtyCount: 0 }
      if (!probe.isBareRepo && probe.toplevel) {
        try {
          const stOut = await runGitImpl(['status', '--porcelain=v1', '-b'], { cwd: probe.toplevel, signal })
          statusInfo = parseStatusPorcelainV1B(stOut)
        } catch {}
      }
      const allBare = worktrees.length > 0 && worktrees.every((w) => w.bare)
      return {
        status: allBare ? 'bare-only' : 'ok',
        isGitRepo: true,
        isBare: probe.isBareRepo || allBare,
        isSubmodule: probe.isSubmodule,
        wslDistro: process.env.WSL_DISTRO_NAME || null,
        branch: statusInfo.branch ?? currentWt?.branch ?? null,
        shortHead: currentWt?.head && !ZERO_OID.test(currentWt.head) ? currentWt.head.slice(0, 7) : null,
        detached: statusInfo.detached || Boolean(currentWt?.detached),
        dirtyCount: statusInfo.dirtyCount,
        ahead: statusInfo.ahead,
        behind: statusInfo.behind,
        worktreeCount: worktrees.length,
        repoName: basename(probe.toplevel || probe.targetRealPath) || path,
        currentWorktreePath: probe.toplevel || probe.targetRealPath,
      }
    },

    async skeleton({ path }, signal) {
      const probe = await probeGitRepo(path, { runGitFn: runGitImpl, statFn: statImpl, realpathFn: realpathImpl, signal })
      if (probe.status !== 'ok') {
        return {
          status: probe.status,
          queryPath: path,
          isGitRepo: false,
          isBare: false,
          isSubmodule: false,
          superprojectRoot: null,
          repoName: basename(path) || path,
          commonDir: null,
          mainPath: null,
          currentWorktreePath: null,
          worktrees: [],
          treeEdges: [],
          sessionActivities: {},
        }
      }

      const { worktrees, sessionActivities } = await resolveWorktreesWithMeta(probe, {
        runGitFn: runGitImpl,
        realpathFn: realpathImpl,
        workspaces: safeWorkspaces(),
        liveAgents: safeLiveAgents(),
        getSessionCwd,
        querySessionActivity,
        signal,
      })

      const mainWt = worktrees.find((w) => w.isMain) || worktrees[0] || null
      const allBare = worktrees.length > 0 && worktrees.every((w) => w.bare)
      const parentByPath = {}
      const treeEdges = []
      if (mainWt) {
        parentByPath[mainWt.path] = null
        for (const wt of worktrees) {
          if (wt.path !== mainWt.path) {
            parentByPath[wt.path] = mainWt.path
            treeEdges.push({ from: mainWt.path, to: wt.path })
          }
        }
      }

      return {
        status: allBare ? 'bare-only' : 'ok',
        queryPath: path,
        isGitRepo: true,
        isBare: probe.isBareRepo || allBare,
        isSubmodule: probe.isSubmodule,
        wslDistro: process.env.WSL_DISTRO_NAME || null,
        superprojectRoot: probe.superprojectRoot,
        repoName: basename(mainWt?.path || probe.toplevel || path) || path,
        commonDir: probe.commonDir,
        mainPath: mainWt?.path ?? null,
        currentWorktreePath: probe.toplevel || (probe.isBareRepo ? mainWt?.path ?? null : null),
        worktrees: worktrees.map((wt) => ({ ...wt, parentPath: parentByPath[wt.path] ?? null })),
        treeEdges,
        sessionActivities,
      }
    },

    async details({ path, worktreePaths }, signal) {
      const probe = await probeGitRepo(path, { runGitFn: runGitImpl, statFn: statImpl, realpathFn: realpathImpl, signal })
      if (probe.status !== 'ok') {
        return { status: probe.status, detailsByPath: {}, parentByPath: {}, treeEdges: [] }
      }
      const listCwd = probe.toplevel || probe.targetRealPath
      const porcelain = await runGitImpl(['worktree', 'list', '--porcelain'], { cwd: listCwd, signal })
      const rawWorktrees = parseWorktreePorcelain(porcelain)
      const normWorktrees = await mapWithConcurrency(rawWorktrees, MAX_DETAIL_CONCURRENCY, async (wt) => {
        const norm = await normalizeExistingPath(wt.path, { realpathFn: realpathImpl })
        return { ...wt, realPath: norm.realPath, exists: norm.exists }
      })
      const filterSet = Array.isArray(worktreePaths) && worktreePaths.length > 0
        ? new Set(worktreePaths.map((p) => resolveHostPath(p)))
        : null
      const targets = normWorktrees.filter((wt) => (!filterSet || filterSet.has(wt.path)) && wt.exists && !wt.bare && !wt.prunable)

      const detailsByPath = {}
      const commitTimestamps = new Map()
      await mapWithConcurrency(targets, MAX_DETAIL_CONCURRENCY, async (wt) => {
        const wtCwd = wt.realPath || wt.path
        let gitStatus = parseStatusPorcelainV1B('')
        let recentCommits = []
        try {
          const stOut = await runGitImpl(['status', '--porcelain=v1', '-b'], { cwd: wtCwd, signal })
          gitStatus = parseStatusPorcelainV1B(stOut)
        } catch {}
        if (isValidHead(wt.head)) {
          try {
            const logOut = await runGitImpl(
              ['log', '-n', '5', '--format=%x1e%H%x1f%h%x1f%P%x1f%s%x1f%an%x1f%at'],
              { cwd: wtCwd, signal },
            )
            recentCommits = parseCommitLog(logOut)
            for (const c of recentCommits) commitTimestamps.set(c.hash, c.timestamp)
          } catch {}
        }
        detailsByPath[wt.path] = { gitStatus, recentCommits }
      })

      const eligibleForTree = normWorktrees.filter((wt) => !wt.bare && wt.exists && isValidHead(wt.head)).slice(0, MAX_WORKTREES_PAIRWISE)
      const mergeBases = new Map()
      const ancestorChecks = new Map()
      const mbCwd = eligibleForTree[0]?.realPath || eligibleForTree[0]?.path || listCwd

      const pairs = []
      for (let i = 0; i < eligibleForTree.length; i += 1) {
        for (let j = i + 1; j < eligibleForTree.length; j += 1) pairs.push([eligibleForTree[i], eligibleForTree[j]])
      }
      await mapWithConcurrency(pairs, MAX_DETAIL_CONCURRENCY, async ([a, b]) => {
        if (a.head === b.head) {
          mergeBases.set(`${a.path}\0${b.path}`, a.head)
          ancestorChecks.set(`${a.head}\0${b.head}`, true)
          ancestorChecks.set(`${b.head}\0${a.head}`, true)
          return
        }
        try {
          const mb = (await runGitImpl(['merge-base', a.head, b.head], { cwd: mbCwd, signal })).trim()
          if (mb) {
            mergeBases.set(`${a.path}\0${b.path}`, mb)
            if (mb === a.head) ancestorChecks.set(`${a.head}\0${b.head}`, true)
            if (mb === b.head) ancestorChecks.set(`${b.head}\0${a.head}`, true)
          }
        } catch {}
      })

      // Check ancestry between distinct merge-base anchors and heads for multi-level tree inference
      const anchors = [...new Set([...mergeBases.values(), ...eligibleForTree.map((w) => w.head)])]
      const ancPairs = []
      for (const aSha of anchors) {
        for (const bSha of anchors) {
          if (aSha !== bSha && !ancestorChecks.has(`${aSha}\0${bSha}`)) ancPairs.push([aSha, bSha])
        }
      }
      await mapWithConcurrency(ancPairs, MAX_DETAIL_CONCURRENCY, async ([aSha, bSha]) => {
        try {
          await runGitImpl(['merge-base', '--is-ancestor', aSha, bSha], { cwd: mbCwd, signal })
          ancestorChecks.set(`${aSha}\0${bSha}`, true)
        } catch {
          ancestorChecks.set(`${aSha}\0${bSha}`, false)
        }
      })

      const mainWt = normWorktrees.find((w) => w.isMain) || normWorktrees[0]
      const inferred = inferWorktreeTree(normWorktrees, {
        mainPath: mainWt?.path,
        mergeBases,
        ancestorChecks,
        commitTimestamps,
      })

      return {
        status: 'ok',
        detailsByPath,
        parentByPath: inferred.parentByPath,
        treeEdges: inferred.treeEdges,
      }
    },

    async commits({ path, limit }, signal) {
      const clampedLimit = clampCommitLimit(limit === undefined ? defaultCommitLimit : limit)
      const probe = await probeGitRepo(path, { runGitFn: runGitImpl, statFn: statImpl, realpathFn: realpathImpl, signal })
      if (probe.status !== 'ok') {
        return { status: probe.status, limit: clampedLimit, nodes: [], edges: [], laneCount: 0 }
      }
      const cwd = probe.toplevel || probe.targetRealPath
      const porcelain = await runGitImpl(['worktree', 'list', '--porcelain'], { cwd, signal })
      const worktrees = parseWorktreePorcelain(porcelain)
      const heads = [...new Set(worktrees.map((w) => w.head).filter(isValidHead))]
      if (heads.length === 0) {
        return { status: 'ok', limit: clampedLimit, nodes: [], edges: [], laneCount: 0 }
      }

      const logOut = await runGitImpl(
        ['log', '--topo-order', '--parents', '-n', String(clampedLimit), '--format=%x1e%H%x1f%h%x1f%P%x1f%s%x1f%an%x1f%at', ...heads],
        { cwd, signal },
      )
      const commits = parseCommitLog(logOut)
      const seenHashes = new Set(commits.map((c) => c.hash))

      // Ensure pairwise merge-bases across active worktree heads are included as key fork points
      const mergeBaseShas = new Set()
      const boundedHeads = heads.slice(0, MAX_WORKTREES_PAIRWISE)
      const headPairs = []
      for (let i = 0; i < boundedHeads.length; i += 1) {
        for (let j = i + 1; j < boundedHeads.length; j += 1) headPairs.push([boundedHeads[i], boundedHeads[j]])
      }
      await mapWithConcurrency(headPairs, MAX_DETAIL_CONCURRENCY, async ([h1, h2]) => {
        try {
          const mb = (await runGitImpl(['merge-base', h1, h2], { cwd, signal })).trim()
          if (mb) mergeBaseShas.add(mb)
        } catch {}
      })

      const missingMb = [...mergeBaseShas].filter((sha) => !seenHashes.has(sha))
      if (missingMb.length > 0) {
        try {
          const extraOut = await runGitImpl(
            ['log', '--no-walk', '--parents', '--format=%x1e%H%x1f%h%x1f%P%x1f%s%x1f%an%x1f%at', ...missingMb],
            { cwd, signal },
          )
          for (const c of parseCommitLog(extraOut)) {
            if (!seenHashes.has(c.hash)) {
              seenHashes.add(c.hash)
              commits.push(c)
            }
          }
        } catch {}
      }

      const enrichedWorktrees = worktrees.map((wt) => ({
        ...wt,
        isCurrent: Boolean(probe.toplevel && wt.path === probe.toplevel),
      }))
      const dag = buildCommitDag(commits, enrichedWorktrees, [...mergeBaseShas])
      return { status: 'ok', limit: clampedLimit, ...dag }
    },
  }
}

function rpcOk(value) {
  return { ok: true, value }
}

function rpcError(code, message, details = {}) {
  return { ok: false, error: { code, message, details } }
}

function validatePathPayload(payload) {
  if (!payload || typeof payload !== 'object' || typeof payload.path !== 'string') {
    return 'path must be a string'
  }
  if (payload.path.length === 0 || payload.path.includes('\0')) {
    return 'path must be a non-empty string without NUL bytes'
  }
  return null
}

/** Create Connection RPC endpoint handler for `/dsh-tune-worktree`. */
export function createWorktreeRpcHandler(service) {
  return async (endpoint, payload, signal) => {
    try {
      if (endpoint === 'list-dirs') {
        if (typeof service?.listDirs !== 'function') {
          return rpcError('worktree/unknown-endpoint', `Unknown worktree RPC endpoint "${endpoint}"`)
        }
        if (payload !== undefined && payload !== null && (typeof payload !== 'object' || Array.isArray(payload))) {
          return rpcError('worktree/invalid-args', 'payload must be an object')
        }
        const rawPath = payload?.path
        if (rawPath !== undefined && rawPath !== null && (typeof rawPath !== 'string' || rawPath.includes('\0'))) {
          return rpcError('worktree/invalid-path', 'path must be a string without NUL bytes')
        }
        if (payload?.showHidden !== undefined && typeof payload.showHidden !== 'boolean') {
          return rpcError('worktree/invalid-args', 'showHidden must be a boolean')
        }
        return rpcOk(await service.listDirs({ path: rawPath || '', showHidden: Boolean(payload?.showHidden) }, signal))
      }
      if (endpoint !== 'summary' && endpoint !== 'skeleton' && endpoint !== 'details' && endpoint !== 'commits') {
        return rpcError('worktree/unknown-endpoint', `Unknown worktree RPC endpoint "${endpoint}"`)
      }
      const pathErr = validatePathPayload(payload)
      if (pathErr) return rpcError('worktree/invalid-path', pathErr)

      if (endpoint === 'summary') {
        return rpcOk(await service.summary({ path: payload.path }, signal))
      }
      if (endpoint === 'skeleton') {
        return rpcOk(await service.skeleton({ path: payload.path }, signal))
      }
      if (endpoint === 'details') {
        if (payload.worktreePaths !== undefined) {
          if (!Array.isArray(payload.worktreePaths) || payload.worktreePaths.length > 200 ||
              payload.worktreePaths.some((p) => typeof p !== 'string' || p.includes('\0'))) {
            return rpcError('worktree/invalid-args', 'worktreePaths must be a bounded array of valid strings')
          }
        }
        return rpcOk(await service.details({ path: payload.path, worktreePaths: payload.worktreePaths }, signal))
      }
      if (payload.limit !== undefined && (typeof payload.limit !== 'number' || !Number.isFinite(payload.limit))) {
        return rpcError('worktree/invalid-args', 'limit must be a finite number')
      }
      return rpcOk(await service.commits({ path: payload.path, limit: payload.limit }, signal))
    } catch (error) {
      if (error?.name === 'AbortError') {
        return rpcError('worktree/aborted', 'Request aborted')
      }
      return rpcError('worktree/internal', error instanceof Error ? error.message : String(error))
    }
  }
}

const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/

function extractChannelEndpoint(urlString, channel = WORKTREE_RPC_CHANNEL) {
  let pathname
  try {
    pathname = new URL(urlString || '/', 'http://dsh.internal').pathname
  } catch {
    return undefined
  }
  if (!pathname.startsWith(`${channel}/`)) return undefined
  const endpoint = pathname.slice(channel.length + 1)
  const segments = endpoint.split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..' || !ENDPOINT_SEGMENT_PATTERN.test(s))) {
    return undefined
  }
  return endpoint
}

function writeJsonRpcResponse(res, rpcId, result) {
  if (res.writableEnded || res.destroyed) return
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ type: 'server-response', rpcId, result }))
}

/**
 * Create a node:http handler compatible with `ctx.webServer.register({ kind: 'prefix', path })`
 * and `ctx.connection.admit(req)`, speaking the Connection RPC envelope directly so plugins do not
 * depend on `HostConnectionService.rpc.handle` (which fails in DSH 0.2.2-rc.5 due to uninjected `webServer`).
 */
export function createWorktreeHttpHandler({
  rpcHandler,
  admit,
  channel = WORKTREE_RPC_CHANNEL,
  maxBodyBytes = 1024 * 1024,
} = {}) {
  return async (req, res) => {
    const admission = typeof admit === 'function' ? admit(req) : { peer: null }
    if (admission && 'rejection' in admission) {
      res.writeHead(admission.rejection)
      res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
      return
    }

    const endpoint = extractChannelEndpoint(req.url, channel)
    if (req.method !== 'POST' || endpoint === undefined) {
      res.writeHead(404)
      res.end('not found')
      return
    }

    const mediaType = String(req.headers?.['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
    if (mediaType !== 'application/json') {
      res.writeHead(415)
      res.end('content type must be application/json')
      return
    }

    const declaredLength = req.headers?.['content-length']
    if (declaredLength !== undefined && Number(declaredLength) > maxBodyBytes) {
      res.writeHead(413, { connection: 'close' })
      res.end()
      req.destroy?.()
      return
    }

    const chunks = []
    let received = 0
    try {
      for await (const chunk of req) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        received += buf.byteLength
        if (received > maxBodyBytes) {
          res.writeHead(413, { connection: 'close' })
          res.end()
          req.destroy?.()
          return
        }
        chunks.push(buf)
      }
    } catch {
      if (!res.headersSent) {
        res.writeHead(400)
        res.end('failed to read request body')
      }
      return
    }

    let body
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      res.writeHead(400)
      res.end('body is not JSON')
      return
    }

    if (!body || typeof body !== 'object' || body.type !== 'client-request' || typeof body.rpcId !== 'string' || typeof body.method !== 'string') {
      const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : 'invalid-request'
      writeJsonRpcResponse(res, rpcId, {
        ok: false,
        error: { code: 'gateway/bad-request', message: 'invalid client-request message', details: { issues: [] } },
      })
      return
    }

    if (body.method !== endpoint) {
      writeJsonRpcResponse(res, body.rpcId, {
        ok: false,
        error: {
          code: 'gateway/bad-request',
          message: `method ${JSON.stringify(body.method)} does not match endpoint ${JSON.stringify(endpoint)}`,
          details: { issues: [] },
        },
      })
      return
    }

    const abort = new AbortController()
    const onClose = () => {
      if (!res.writableEnded) abort.abort()
    }
    res.on?.('close', onClose)
    try {
      const result = await rpcHandler(endpoint, body.payload, abort.signal)
      writeJsonRpcResponse(res, body.rpcId, result)
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500)
        res.end(`handler failure: ${String(error)}`)
      }
    } finally {
      res.off?.('close', onClose)
    }
  }
}
