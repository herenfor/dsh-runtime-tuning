import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CORE = await import('../plugins/worktree-core.mjs')
const CLIENT_SRC = readFileSync(join(ROOT, 'ui-worktree/client.js'), 'utf8')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'ui-worktree/package.json'), 'utf8'))
const INDEX_PATH = join(ROOT, 'ui-worktree/index.mjs')

const DSH_BIN = [
  process.env.DSH_BIN,
  join(homedir(), '.local/bin/dsh'),
  join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js'),
].find((p) => p && existsSync(p))

function git(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test User',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test User',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  }).trim()
}

function makeObservable(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    set: (next) => { value = next; for (const fn of [...listeners]) fn() },
    listeners,
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) },
  }
}

test('L1: parseWorktreePorcelain handles spaces, bare, detached, locked, and prunable reasons', () => {
  const sample = [
    'worktree /tmp/my repo/main',
    'HEAD 1111111111111111111111111111111111111111',
    'branch refs/heads/main',
    '',
    'worktree /tmp/my repo/wt locked',
    'HEAD 2222222222222222222222222222222222222222',
    'branch refs/heads/feat/alpha',
    'locked manually locked on drive',
    '',
    'worktree /tmp/my repo/wt detached',
    'HEAD 3333333333333333333333333333333333333333',
    'detached',
    'prunable gitdir file points to non-existent location',
    '',
    'worktree /tmp/my repo/bare.git',
    'bare',
    '',
  ].join('\n')

  const parsed = CORE.parseWorktreePorcelain(sample)
  assert.equal(parsed.length, 4)
  assert.deepEqual(parsed[0], {
    path: '/tmp/my repo/main',
    head: '1111111111111111111111111111111111111111',
    branch: 'main',
    branchRef: 'refs/heads/main',
    bare: false,
    detached: false,
    locked: false,
    lockedReason: null,
    prunable: false,
    prunableReason: null,
    isMain: true,
  })
  assert.equal(parsed[1].isMain, false)
  assert.equal(parsed[1].branch, 'feat/alpha')
  assert.equal(parsed[1].locked, true)
  assert.equal(parsed[1].lockedReason, 'manually locked on drive')
  assert.equal(parsed[2].detached, true)
  assert.equal(parsed[2].prunable, true)
  assert.equal(parsed[2].prunableReason, 'gitdir file points to non-existent location')
  assert.equal(parsed[3].bare, true)
})

test('L1: parseStatusPorcelainV1B parses ahead/behind, unborn, detached, and dirty counts', () => {
  const s1 = CORE.parseStatusPorcelainV1B([
    '## feat/x...origin/feat/x [ahead 3, behind 2]',
    'M  staged.txt',
    'MM both.txt',
    'UU conflict.txt',
    '?? untracked.txt',
  ].join('\n'))
  assert.equal(s1.branch, 'feat/x')
  assert.equal(s1.upstream, 'origin/feat/x')
  assert.equal(s1.ahead, 3)
  assert.equal(s1.behind, 2)
  assert.equal(s1.staged, 2)
  assert.equal(s1.unstaged, 1)
  assert.equal(s1.conflicted, 1)
  assert.equal(s1.untracked, 1)
  assert.equal(s1.dirtyCount, 4)
  assert.equal(s1.clean, false)

  const unborn = CORE.parseStatusPorcelainV1B('## No commits yet on main\n')
  assert.equal(unborn.unborn, true)
  assert.equal(unborn.branch, 'main')
  assert.equal(unborn.clean, true)

  const detached = CORE.parseStatusPorcelainV1B('## HEAD (no branch)\n M a.js\n')
  assert.equal(detached.detached, true)
  assert.equal(detached.branch, null)
  assert.equal(detached.dirtyCount, 1)
})

test('L1: parseCommitLog parses delimited records including multi-parent merges', () => {
  const raw = '\x1eaaaa111\x1faaaa11\x1fbbbb222 cccc333\x1fMerge feat\x1fAlice\x1f1700000100\n' +
    '\x1ebbbb222\x1fbbbb22\x1f\x1fInitial commit\x1fBob\x1f1700000000\n'
  const list = CORE.parseCommitLog(raw)
  assert.equal(list.length, 2)
  assert.deepEqual(list[0].parents, ['bbbb222', 'cccc333'])
  assert.equal(list[0].subject, 'Merge feat')
  assert.equal(list[0].timestamp, 1700000100)
  assert.deepEqual(list[1].parents, [])
})

test('L1: inferWorktreeTree handles multi-level chains, earlier-commit forks, and cycle guards', () => {
  const worktrees = [
    { path: '/repo', head: 'C5', branch: 'main', isMain: true, bare: false },
    { path: '/repo-a', head: 'C3', branch: 'feat/a', isMain: false, bare: false },
    { path: '/repo-b', head: 'C4', branch: 'feat/b', isMain: false, bare: false },
    { path: '/repo-a-sub', head: 'C6', branch: 'feat/a-sub', isMain: false, bare: false },
  ]
  // Graph: C1 -> C2 -> C3 (feat/a), C2 -> C4 (feat/b), C3 -> C6 (feat/a-sub), C1 -> C5 (main)
  const mergeBases = new Map([
    ['/repo\0/repo-a', 'C1'],
    ['/repo\0/repo-b', 'C1'],
    ['/repo\0/repo-a-sub', 'C1'],
    ['/repo-a\0/repo-b', 'C2'],
    ['/repo-a\0/repo-a-sub', 'C3'],
    ['/repo-b\0/repo-a-sub', 'C2'],
  ])
  const ancestors = new Set([
    'C1\0C2', 'C1\0C3', 'C1\0C4', 'C1\0C5', 'C1\0C6',
    'C2\0C3', 'C2\0C4', 'C2\0C6',
    'C3\0C6',
  ])
  const ancestorChecks = new Map([...ancestors].map((k) => [k, true]))
  const commitTimestamps = new Map([['C1', 10], ['C2', 20], ['C3', 30], ['C4', 40], ['C5', 50], ['C6', 60]])

  const tree = CORE.inferWorktreeTree(worktrees, { mainPath: '/repo', mergeBases, ancestorChecks, commitTimestamps })
  assert.equal(tree.parentByPath['/repo'], null)
  assert.equal(tree.parentByPath['/repo-a'], '/repo')
  assert.equal(tree.parentByPath['/repo-b'], '/repo-a')
  assert.equal(tree.parentByPath['/repo-a-sub'], '/repo-a')
  assert.equal(tree.relativePathByPath['/repo'], '.')
  assert.equal(tree.relativePathByPath['/repo-a'], '../repo-a')

  // Cycle guard: even if bogus symmetric ancestors are injected, parent map stays acyclic
  const badAnc = new Map([
    ['C1\0C3', true], ['C1\0C4', true],
    ['C3\0C4', true], ['C4\0C3', true],
  ])
  const safeTree = CORE.inferWorktreeTree(worktrees.slice(0, 3), {
    mainPath: '/repo',
    mergeBases: new Map([['/repo\0/repo-a', 'C1'], ['/repo\0/repo-b', 'C1'], ['/repo-a\0/repo-b', 'C2']]),
    ancestorChecks: badAnc,
  })
  assert.equal(safeTree.parentByPath['/repo'], null)
  assert.ok(safeTree.parentByPath['/repo-a'])
  assert.ok(safeTree.parentByPath['/repo-b'])
})

test('L1: buildCommitDag assigns swimlanes, fork points, merges, and worktree refs', () => {
  const commits = [
    { hash: 'H4', shortHash: 'H4', parents: ['H3', 'H2'], subject: 'Merge branch', author: 'A', timestamp: 40 },
    { hash: 'H3', shortHash: 'H3', parents: ['H1'], subject: 'Main commit', author: 'A', timestamp: 30 },
    { hash: 'H2', shortHash: 'H2', parents: ['H1'], subject: 'Feat commit', author: 'A', timestamp: 20 },
    { hash: 'H1', shortHash: 'H1', parents: [], subject: 'Root', author: 'A', timestamp: 10 },
  ]
  const dag = CORE.buildCommitDag(
    commits,
    [{ path: '/repo', head: 'H4', branch: 'main', isMain: true, isCurrent: true }],
    ['H1'],
  )
  assert.ok(dag.laneCount >= 2)
  assert.equal(dag.nodes[0].isMergeCommit, true)
  assert.equal(dag.nodes[0].worktreeRefs[0].branch, 'main')
  assert.equal(dag.nodes[3].isForkPoint, true)
  assert.equal(dag.edges.length, 4)
})

test('L1: createWorktreeRpcHandler validates endpoints and malformed inputs', async () => {
  const handler = CORE.createWorktreeRpcHandler({
    summary: async () => ({ ok: 1 }),
    skeleton: async () => ({ ok: 2 }),
    details: async () => ({ ok: 3 }),
    commits: async () => ({ ok: 4 }),
  })
  assert.equal((await handler('bad', { path: '/x' })).error.code, 'worktree/unknown-endpoint')
  assert.equal((await handler('summary', {})).error.code, 'worktree/invalid-path')
  assert.equal((await handler('summary', { path: '/tmp\0bad' })).error.code, 'worktree/invalid-path')
  assert.equal((await handler('details', { path: '/tmp', worktreePaths: 'bad' })).error.code, 'worktree/invalid-args')
  assert.equal((await handler('commits', { path: '/tmp', limit: Number.NaN })).error.code, 'worktree/invalid-args')
  assert.deepEqual(await handler('summary', { path: '/tmp' }), { ok: true, value: { ok: 1 } })
})

test('L1: real git repository with multi-level worktrees, symlinks, locked, detached, prunable, and two-phase RPC', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wt-real-'))
  try {
    const repo = join(tmp, 'repo')
    const wtA = join(tmp, 'wt-a')
    const wtASub = join(tmp, 'wt-a-sub')
    const wtDetached = join(tmp, 'wt-detached')
    const wtMissing = join(tmp, 'wt-missing')
    const symlinkToWtA = join(tmp, 'link-to-a')

    mkdirSync(repo)
    git(repo, ['init', '-b', 'main'])
    writeFileSync(join(repo, 'README.md'), 'root\n')
    git(repo, ['add', 'README.md'])
    git(repo, ['commit', '-m', 'init main'])

    git(repo, ['worktree', 'add', '-b', 'feat/a', wtA])
    writeFileSync(join(wtA, 'a.txt'), 'a1\n')
    git(wtA, ['add', 'a.txt'])
    git(wtA, ['commit', '-m', 'feat a commit'])

    git(wtA, ['worktree', 'add', '-b', 'feat/a-sub', wtASub])
    writeFileSync(join(wtASub, 'sub.txt'), 'sub1\n')
    git(wtASub, ['add', 'sub.txt'])
    git(wtASub, ['commit', '-m', 'feat a-sub commit'])

    // Advance main independently so main != feat/a merge-base
    writeFileSync(join(repo, 'main2.txt'), 'm2\n')
    git(repo, ['add', 'main2.txt'])
    git(repo, ['commit', '-m', 'main advance'])

    // Locked detached worktree & dirty file in wtA
    git(repo, ['worktree', 'add', '--detach', wtDetached, 'HEAD'])
    git(repo, ['worktree', 'lock', '--reason', 'hold work', wtDetached])
    writeFileSync(join(wtA, 'dirty.txt'), 'untracked\n')

    // Prunable worktree (create then remove directory)
    git(repo, ['worktree', 'add', '-b', 'feat/gone', wtMissing])
    rmSync(wtMissing, { recursive: true, force: true })

    // Symlink path registered as Workspace in DSH
    symlinkSync(wtA, symlinkToWtA)

    const service = CORE.createWorktreeService({
      getWorkspaceRegistry: () => ({
        list: () => [
          { id: 'ws-main', path: repo, title: 'MainRepo', sessionIds: ['s-main'] },
          { id: 'ws-a', path: symlinkToWtA, title: 'FeatA', sessionIds: ['s-a1', 's-a2'] },
        ],
      }),
      querySessionActivity: async (sid) => (sid === 's-a1' ? [{ kind: 'turn' }, { kind: 'job', items: [{ id: 'j1' }] }] : []),
    })

    const sum = await service.summary({ path: wtA })
    assert.equal(sum.status, 'ok')
    assert.equal(sum.isGitRepo, true)
    assert.equal(sum.branch, 'feat/a')
    assert.equal(sum.dirtyCount, 1)
    assert.equal(sum.worktreeCount, 5)

    const skel = await service.skeleton({ path: wtA })
    assert.equal(skel.status, 'ok')
    assert.equal(skel.worktrees.length, 5)
    assert.deepEqual(skel.sessionActivities['s-a1'].map((a) => a.kind), ['turn', 'job'])

    const nodeMain = skel.worktrees.find((w) => w.branch === 'main')
    const nodeA = skel.worktrees.find((w) => w.branch === 'feat/a')
    const nodeASub = skel.worktrees.find((w) => w.branch === 'feat/a-sub')
    const nodeDet = skel.worktrees.find((w) => w.detached)
    const nodeGone = skel.worktrees.find((w) => w.branch === 'feat/gone')

    assert.equal(nodeMain.workspaceId, 'ws-main')
    assert.equal(nodeA.workspaceId, 'ws-a')
    assert.equal(nodeA.isCurrent, true)
    assert.equal(nodeDet.locked, true)
    assert.equal(nodeDet.lockedReason, 'hold work')
    assert.equal(nodeGone.prunable, true)
    assert.equal(nodeGone.exists, false)

    const details = await service.details({ path: wtA, worktreePaths: skel.worktrees.map((w) => w.path) })
    assert.equal(details.status, 'ok')
    assert.equal(details.detailsByPath[nodeA.path].gitStatus.untracked, 1)
    assert.equal(details.detailsByPath[nodeGone.path], undefined)
    assert.ok(details.detailsByPath[nodeASub.path].recentCommits.length >= 2)
    assert.equal(details.parentByPath[nodeMain.path], null)
    assert.equal(details.parentByPath[nodeA.path], nodeMain.path)
    assert.equal(details.parentByPath[nodeASub.path], nodeA.path)

    const dag = await service.commits({ path: wtA, limit: 2 }) // clamped to MIN_COMMIT_LIMIT=5
    assert.equal(dag.limit, 5)
    assert.ok(dag.nodes.length >= 4)
    assert.ok(dag.nodes.some((n) => n.isForkPoint))
    assert.ok(dag.nodes.some((n) => n.worktreeRefs.some((r) => r.branch === 'feat/a' && r.isCurrent)))
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('L1: real git degraded states (missing dir, non-git, bare-only, submodule)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wt-deg-'))
  try {
    const plain = join(tmp, 'plain')
    const bare = join(tmp, 'bare.git')
    const parentRepo = join(tmp, 'super')
    const childSrc = join(tmp, 'child-src')
    mkdirSync(plain)
    mkdirSync(bare)
    mkdirSync(parentRepo)
    mkdirSync(childSrc)

    git(bare, ['init', '--bare'])
    git(childSrc, ['init', '-b', 'main'])
    writeFileSync(join(childSrc, 'lib.txt'), 'lib\n')
    git(childSrc, ['add', 'lib.txt'])
    git(childSrc, ['commit', '-m', 'child init'])

    git(parentRepo, ['init', '-b', 'main'])
    writeFileSync(join(parentRepo, 'root.txt'), 'root\n')
    git(parentRepo, ['add', 'root.txt'])
    git(parentRepo, ['commit', '-m', 'super init'])
    git(parentRepo, ['-c', 'protocol.file.allow=always', 'submodule', 'add', childSrc, 'sub'])
    git(parentRepo, ['commit', '-m', 'add submodule'])

    const service = CORE.createWorktreeService()

    const missing = await service.skeleton({ path: join(tmp, 'nope') })
    assert.equal(missing.status, 'missing-dir')
    assert.equal(missing.isGitRepo, false)

    const notGit = await service.skeleton({ path: plain })
    assert.equal(notGit.status, 'not-git')
    assert.equal(notGit.isGitRepo, false)

    const bareSkel = await service.skeleton({ path: bare })
    assert.equal(bareSkel.status, 'bare-only')
    assert.equal(bareSkel.isBare, true)
    assert.equal(bareSkel.worktrees.length, 1)
    assert.equal(bareSkel.worktrees[0].bare, true)

    const subPath = join(parentRepo, 'sub')
    const subSkel = await service.skeleton({ path: subPath })
    assert.equal(subSkel.status, 'ok')
    assert.equal(subSkel.isSubmodule, true)
    assert.ok(subSkel.superprojectRoot)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

function createReactStub() {
  let slot = 0
  let hookStore = new Map()
  const useState = (init) => {
    const k = `s:${slot++}`
    if (!hookStore.has(k)) hookStore.set(k, typeof init === 'function' ? init() : init)
    return [hookStore.get(k), (v) => hookStore.set(k, typeof v === 'function' ? v(hookStore.get(k)) : v)]
  }
  const useRef = (init) => {
    const k = `r:${slot++}`
    if (!hookStore.has(k)) hookStore.set(k, { current: init })
    return hookStore.get(k)
  }
  const useEffect = (fn, deps) => {
    const k = `e:${slot++}`
    const prev = hookStore.get(k)
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps?.[i]))
    if (changed) {
      try { prev?.cleanup?.() } catch {}
      const cleanup = fn()
      hookStore.set(k, { deps: deps || [], cleanup: typeof cleanup === 'function' ? cleanup : null })
    }
  }
  const useMemo = (fn, deps) => {
    const k = `m:${slot++}`
    const prev = hookStore.get(k)
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps?.[i]))
    if (changed) {
      const value = fn()
      hookStore.set(k, { deps: deps || [], value })
      return value
    }
    return prev.value
  }
  const useCallback = (fn, deps) => useMemo(() => fn, deps)
  const useSyncExternalStore = (subscribe, getSnapshot) => {
    const unsubscribe = subscribe(() => {})
    unsubscribe()
    return getSnapshot()
  }
  const createElement = (type, props, ...children) => ({
    type,
    props: {
      ...(props || {}),
      children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
    },
  })
  const render = (Comp, props) => { slot = 0; return Comp(props) }
  const reset = () => { hookStore = new Map(); slot = 0 }
  return {
    Fragment: Symbol.for('react.fragment'),
    createElement,
    useState,
    useRef,
    useEffect,
    useMemo,
    useCallback,
    useSyncExternalStore,
    _render: render,
    _reset: reset,
  }
}

function expandVdomNode(node) {
  if (!node || typeof node !== 'object') return node
  if (typeof node.type === 'function') {
    try { return expandVdomNode(node.type(node.props)) } catch { return node }
  }
  return node
}

function findInVdom(node, pred) {
  const cur = expandVdomNode(node)
  if (!cur || typeof cur !== 'object') return null
  if (pred(cur)) return cur
  for (const ch of cur.props?.children || []) {
    const hit = findInVdom(ch, pred)
    if (hit) return hit
  }
  return null
}

function findAllInVdom(node, pred, acc = []) {
  const cur = expandVdomNode(node)
  if (!cur || typeof cur !== 'object') return acc
  if (pred(cur)) acc.push(cur)
  for (const ch of cur.props?.children || []) findAllInVdom(ch, pred, acc)
  return acc
}

function loadClient({ react, storageMap = new Map() } = {}) {
  let registered = null
  const appendedStyles = []
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (def) => { registered = def } },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    document: {
      head: { appendChild: (el) => appendedStyles.push(el) },
      createElement: () => ({ dataset: {}, textContent: '' }),
      querySelector: () => null,
    },
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
    },
    AbortController,
    ResizeObserver: undefined,
    setTimeout,
    clearTimeout,
    Map,
    Set,
    Array,
    Object,
    Number,
    String,
    Boolean,
    JSON,
    Math,
    Error,
    Promise,
  }
  vm.runInNewContext(CLIENT_SRC, sandbox, { filename: 'ui-worktree/client.js' })
  assert.equal(registered.id, '@herenfor/dsh-tune-worktree')
  const mod = registered.factory((id) => {
    if (id === 'react' && react) return react
    throw new Error(`missing require: ${id}`)
  })
  return { mod, storageMap, appendedStyles }
}

test('L1: client layout math, session merging, viewMode persistence, and workspace switching', async () => {
  const { mod, storageMap } = loadClient()
  const api = mod.__internals

  assert.equal(api.readSavedViewMode(), 'tree')
  api.writeSavedViewMode('commits')
  assert.equal(storageMap.get(api.VIEW_MODE_STORAGE_KEY), 'commits')
  assert.equal(api.readSavedViewMode(), 'commits')
  api.writeSavedViewMode('invalid')
  assert.equal(api.readSavedViewMode(), 'tree')

  const worktrees = [
    { path: '/repo', relativePath: '.', branch: 'main', isMain: true, isCurrent: true, workspaceId: 'ws-main', sessionIds: ['s1'] },
    { path: '/repo-a', relativePath: '../repo-a', branch: 'feat/a', isMain: false, isCurrent: false, workspaceId: null, sessionIds: [] },
    { path: '/repo-a-sub', relativePath: '../repo-a-sub', branch: 'feat/a-sub', isMain: false, isCurrent: false, workspaceId: null, sessionIds: [] },
  ]
  const parents = { '/repo': null, '/repo-a': '/repo', '/repo-a-sub': '/repo-a' }

  const plain = (v) => JSON.parse(JSON.stringify(v))
  const compact = api.computeCompactTreeLayout(worktrees, parents)
  assert.deepEqual(plain(compact.map((r) => [r.wt.path, r.depth])), [['/repo', 0], ['/repo-a', 1], ['/repo-a-sub', 2]])

  const canvas = api.computeCanvas2DLayout(worktrees, parents)
  assert.equal(canvas.nodes.length, 3)
  assert.equal(canvas.edges.length, 2)
  assert.ok(canvas.edges[0].pathD.startsWith('M '))
  assert.ok(canvas.edges[0].pathD.includes(' C '))
  assert.ok(canvas.nodes[1].x > canvas.nodes[0].x)
  assert.ok(canvas.nodes[2].x > canvas.nodes[1].x)

  const dagLayout = api.computeCommitDagLayout({
    laneCount: 2,
    nodes: [
      { hash: 'H2', shortHash: 'H2', parents: ['H1'], subject: 'tip', lane: 1, isForkPoint: false, isMergeCommit: false, worktreeRefs: [] },
      { hash: 'H1', shortHash: 'H1', parents: [], subject: 'root', lane: 0, isForkPoint: true, isMergeCommit: false, worktreeRefs: [] },
    ],
    edges: [{ from: 'H2', to: 'H1', fromLane: 1, toLane: 0 }],
  })
  assert.equal(dagLayout.edges.length, 1)
  assert.ok(dagLayout.edges[0].pathD.includes(' C '))

  const merged = api.mergeWorktreeSessions(
    worktrees[0],
    {
      items: [{ workspaceId: 'ws-main', path: '/repo', sessionIds: ['s1', 's-arch', 's-blank'] }],
      archivedSessionIds: ['s-arch'],
      pinnedSessionIds: ['s2'],
    },
    {
      byId: {
        s1: { id: 's1', displayTitle: 'Main Chat', running: false, blank: false, updatedAt: 100, retainedBy: { mainView: 1 } },
        s2: { id: 's2', displayTitle: 'Cwd Match Chat', cwd: '/repo', running: true, blank: false, updatedAt: 50, retainedBy: {} },
        's-arch': { id: 's-arch', displayTitle: 'Archived', running: false, blank: false, updatedAt: 200, retainedBy: {} },
        's-blank': { id: 's-blank', displayTitle: 'Blank', running: false, blank: true, updatedAt: 300, retainedBy: {} },
      },
    },
    { s2: [{ kind: 'turn' }, { kind: 'job' }] },
  )
  assert.deepEqual(plain(merged.sessions.map((s) => s.id)), ['s2', 's1'])
  assert.equal(merged.runningCount, 1)
  assert.equal(merged.activityCounts.job, 1)

  const createdPaths = []
  const openedWs = []
  const wsService = {
    list: makeObservable({ items: [{ workspaceId: 'ws-main', path: '/repo' }] }),
    create: async ({ path }) => { createdPaths.push(path); return { workspaceId: 'ws-new', path } },
  }
  const uiWs = { openWorkspace: async (id) => { openedWs.push(id) } }

  assert.equal((await api.openWorktreeTarget({ wt: { path: '/gone', prunable: true, exists: false }, workspaces: wsService, uiWorkspace: uiWs })).reason, 'prunable')
  assert.equal((await api.openWorktreeTarget({ wt: { path: '/bare.git', bare: true, exists: true }, workspaces: wsService, uiWorkspace: uiWs })).reason, 'bare')
  assert.deepEqual(plain(await api.openWorktreeTarget({ wt: { path: '/repo', workspaceId: 'ws-main', exists: true }, workspaces: wsService, uiWorkspace: uiWs })), { ok: true, workspaceId: 'ws-main', created: false })
  assert.deepEqual(plain(await api.openWorktreeTarget({ wt: { path: '/repo-a', exists: true }, workspaces: wsService, uiWorkspace: uiWs })), { ok: true, workspaceId: 'ws-new', created: true })
  assert.deepEqual(createdPaths, ['/repo-a'])
  assert.deepEqual(openedWs, ['ws-main', 'ws-new'])
})

test('L1: client wires the Guide, badge, and workspace menu, adaptive UI, on-demand commits, and session switching', async () => {
  const react = createReactStub()
  const { mod } = loadClient({ react })
  const api = mod.__internals

  const tabDefs = []
  const slots = []
  const menus = []
  const openedTabs = []
  const openedSessions = []
  const openedWs = []
  const rpcCalls = []

  const ctx = {
    locale: { register: () => () => {}, bind: () => (k) => k, current: makeObservable('zh') },
    connection: {
      rpc: {
        call: async (_ch, endpoint, payload) => {
          rpcCalls.push([endpoint, payload])
          if (endpoint === 'summary') return { ok: true, value: { status: 'ok', isGitRepo: true, branch: 'main', dirtyCount: 2, worktreeCount: 2 } }
          if (endpoint === 'skeleton') {
            return {
              ok: true,
              value: {
                status: 'ok',
                queryPath: payload.path,
                isGitRepo: true,
                isBare: false,
                isSubmodule: false,
                repoName: 'demo',
                mainPath: '/repo',
                currentWorktreePath: '/repo',
                worktrees: [
                  { path: '/repo', relativePath: '.', branch: 'main', isMain: true, isCurrent: true, workspaceId: 'ws-1', sessionIds: ['s1'], exists: true },
                  { path: '/repo-wt', relativePath: '../repo-wt', branch: 'feat/wt', isMain: false, isCurrent: false, workspaceId: null, sessionIds: [], exists: true },
                ],
                treeEdges: [{ from: '/repo', to: '/repo-wt' }],
                sessionActivities: { s1: [{ kind: 'turn' }] },
              },
            }
          }
          if (endpoint === 'details') {
            return {
              ok: true,
              value: {
                status: 'ok',
                detailsByPath: {
                  '/repo': { gitStatus: { clean: false, dirtyCount: 1, staged: 1, unstaged: 0, untracked: 0, conflicted: 0, ahead: 1, behind: 0 }, recentCommits: [{ hash: '111', shortHash: '111', subject: 'init' }] },
                  '/repo-wt': { gitStatus: { clean: true, dirtyCount: 0, staged: 0, unstaged: 0, untracked: 0, conflicted: 0, ahead: 0, behind: 0 }, recentCommits: [] },
                },
                parentByPath: { '/repo': null, '/repo-wt': '/repo' },
                treeEdges: [{ from: '/repo', to: '/repo-wt' }],
              },
            }
          }
          if (endpoint === 'commits') {
            return {
              ok: true,
              value: {
                status: 'ok',
                limit: payload.limit || 20,
                laneCount: 2,
                nodes: [{ hash: '111', shortHash: '111', parents: [], subject: 'init', lane: 0, isForkPoint: true, isMergeCommit: false, worktreeRefs: [{ path: '/repo', branch: 'main', isMain: true, isCurrent: true }] }],
                edges: [],
              },
            }
          }
          return { ok: false, error: { code: 'unknown', message: 'unknown' } }
        },
      },
    },
    workspaces: {
      list: makeObservable({ items: [{ workspaceId: 'ws-1', path: '/repo', sessionIds: ['s1'] }], archivedSessionIds: [], pinnedSessionIds: [] }),
      create: async ({ path }) => ({ workspaceId: 'ws-created', path }),
    },
    uiWorkspace: {
      openWorkspace: async (id) => { openedWs.push(id) },
      openSession: (sid) => { openedSessions.push(sid) },
    },
    sessions: {
      list: makeObservable({
        ids: ['s1'],
        byId: { s1: { id: 's1', displayTitle: 'Main Session', cwd: '/repo', running: true, blank: false, updatedAt: 100, retainedBy: { mainView: 1 } } },
      }),
    },
    sidebarRightTabs: { register: (def) => { tabDefs.push(def); return () => {} } },
    sidebarRight: {
      mounted: makeObservable('s1'),
      openTab: (kind, opts) => { openedTabs.push([kind, opts]) },
    },
    slots: {
      inject: (_name, fn) => fn(),
      register: (def, comp) => { slots.push([def, comp]); return () => {} },
    },
    contextMenus: { register: (m) => { menus.push(m); return () => {} } },
    effect: (fn) => fn(),
  }

  mod.apply(ctx)

  // Verify the Guide, Workspace menu, and header badge use the same tab type.
  assert.ok(mod.inject.includes('contextMenus'))
  assert.equal(tabDefs.length, 1)
  assert.equal(tabDefs[0].id, api.WORKTREE_ID)
  assert.equal(tabDefs[0].kind, api.WORKTREE_KIND)
  assert.equal(tabDefs[0].guide[0].commandId, undefined)

  const bodySlot = slots.find(([d]) => d.name === 'sidebar.right.pane.tab')
  const titleSlot = slots.find(([d]) => d.name === 'sidebar.right.pane.tab.title')
  const badgeSlot = slots.find(([d]) => d.name === 'conversation.session.header.actions')
  assert.equal(bodySlot[0].key, api.WORKTREE_ID)
  assert.equal(titleSlot[0].key, api.WORKTREE_ID)
  assert.ok(badgeSlot)

  const plain = (v) => JSON.parse(JSON.stringify(v))
  assert.equal(menus.length, 1)
  assert.equal(menus[0].target, 'workspace')
  const [workspaceAction] = menus[0].resolve({ workspaceId: 'ws-1', path: '/repo' })
  assert.equal(workspaceAction.commandId, undefined)
  await workspaceAction.run()
  assert.deepEqual(plain(openedTabs[0]), [api.WORKTREE_KIND, { params: { path: '/repo', workspaceId: 'ws-1' } }])

  // Render WorktreeTabBody in default 'tree' mode -> verify NO commits RPC call
  const Body = bodySlot[1]
  const tabProps = {
    sessionId: 's1',
    useTabInfo: () => ({ sidebar: { expanded: true, fullscreen: false }, panel: { id: 'p1', isFloating: false }, tab: { id: 't1', visible: true, navigation: { params: undefined }, actions: { bindCommands: () => () => {} } } }),
    useSessions: (sel) => sel(ctx.sessions.list.getSnapshot()),
    t: (k, v) => api.formatLocaleText(api.LOCALES.en, k, v),
  }

  react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  let vdom = react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  vdom = react._render(Body, tabProps)

  assert.ok(rpcCalls.some(([ep]) => ep === 'skeleton'))
  assert.ok(rpcCalls.some(([ep]) => ep === 'details'))
  assert.equal(rpcCalls.some(([ep]) => ep === 'commits'), false)
  assert.ok(findInVdom(vdom, (n) => n.props?.['data-worktree-layout'] === 'compact'))

  // Fullscreen / wide viewport automatically switches to 2D canvas with SVG Bezier edges
  const wideProps = {
    ...tabProps,
    useTabInfo: () => ({ sidebar: { expanded: true, fullscreen: true }, panel: { id: 'p1', isFloating: true }, tab: { id: 't1', visible: true, navigation: { params: undefined }, actions: { bindCommands: () => () => {} } } }),
  }
  const wideVdom = react._render(Body, wideProps)
  const canvas2d = findInVdom(wideVdom, (n) => n.props?.['data-worktree-layout'] === '2d')
  assert.ok(canvas2d)
  assert.ok(findInVdom(canvas2d, (n) => n.type === 'path' && String(n.props?.d || '').includes(' C ')))

  // Verify session button click opens session & Enter Worktree opens unregistered worktree
  const sessBtn = findInVdom(vdom, (n) => n.props?.['data-worktree-session'] === 's1')
  assert.ok(sessBtn)
  sessBtn.props.onClick()
  assert.deepEqual(openedSessions, ['s1'])

  const wt2Card = findInVdom(vdom, (n) => n.props?.['data-worktree-card'] === '/repo-wt')
  assert.ok(wt2Card)
  wt2Card.props.onClick()
  vdom = react._render(Body, tabProps)
  const enterBtn = findInVdom(vdom, (n) => n.props?.['data-worktree-enter'] === '/repo-wt')
  assert.ok(enterBtn)
  await enterBtn.props.onClick()
  assert.deepEqual(openedWs, ['ws-created'])

  // Switch to Commit Fork Graph mode -> triggers on-demand commits RPC
  const commitsBtn = findInVdom(vdom, (n) => n.props?.['data-worktree-mode'] === 'commits')
  assert.ok(commitsBtn)
  commitsBtn.props.onClick()
  react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  vdom = react._render(Body, tabProps)
  assert.ok(rpcCalls.some(([ep]) => ep === 'commits'))
  assert.ok(findInVdom(vdom, (n) => n.props?.['data-worktree-commits'] === 'true'))

  // Render WorktreeHeaderBadge -> fetches summary and opens worktree tab on click
  react._reset()
  const Badge = badgeSlot[1]
  const badgeProps = {
    sessionId: 's1',
    useSessions: (sel) => sel(ctx.sessions.list.getSnapshot()),
    useSession: (sel) => sel({ removed: false, blank: false }),
    t: (k, v) => api.formatLocaleText(api.LOCALES.en, k, v),
  }
  react._render(Badge, badgeProps)
  await new Promise((r) => setTimeout(r, 15))
  const badgeVdom = react._render(Badge, badgeProps)
  const badgeBtn = findInVdom(badgeVdom, (n) => n.props?.['data-tune-worktree-badge'] === 'true')
  assert.ok(badgeBtn)
  badgeBtn.props.onClick()
  assert.deepEqual(plain(openedTabs.at(-1)), [api.WORKTREE_KIND, { params: { path: '/repo', workspaceId: 'ws-1' } }])

  // openWorktreeTab retries after mounting workspace when session surface is not yet mounted
  let mounted = false
  const retryOpens = []
  const retryResult = await api.openWorktreeTab(
    {
      sidebarRight: {
        openTab: (kind, opts) => {
          if (!mounted) throw new Error('sidebarRight: no session surface is mounted')
          retryOpens.push([kind, opts])
        },
      },
      uiWorkspace: { openWorkspace: async () => { mounted = true } },
    },
    { path: '/repo', workspaceId: 'ws-1' },
  )
  assert.equal(retryResult, true)
  assert.equal(retryOpens.length, 1)
})

test('L2: real DSH host Config, connection RPC channel registration, and manifest contract', async (t) => {
  if (!DSH_BIN) return t.skip('host DSH install absent')
  const { findHostPackage } = await import('../plugins/chat-answer-fix.mjs')
  const oldArgv1 = process.argv[1]
  process.argv[1] = DSH_BIN
  try {
    const wtMod = await import(pathToFileURL(INDEX_PATH).href)
    assert.equal(wtMod.name, 'dsh-runtime-tuning-worktree')
    const cfg = wtMod.Config({})
    assert.equal(cfg.enabled, true)
    assert.equal(cfg.defaultCommitLimit, 20)
    assert.throws(() => wtMod.Config({ defaultCommitLimit: 99 }))

    // Disabled config should not request connection/webServer
    let injectedCalls = 0
    wtMod.apply({ inject: () => { injectedCalls += 1 } }, { enabled: false })
    assert.equal(injectedCalls, 0)

    // Verify real Cordis Context + HostConnectionService + webServer prefix route registration
    const cordisDir = findHostPackage(DSH_BIN, 'cordis')
    const connDir = findHostPackage(DSH_BIN, 'dsh-client-connection')
    const { Context } = await import(pathToFileURL(join(cordisDir, 'lib/index.js')).href)
    const connMod = await import(pathToFileURL(join(connDir, 'lib/index.js')).href)
    const connClient = await import(pathToFileURL(join(connDir, 'lib/client.node.js')).href)

    const routes = new Map()
    const rootCtx = new Context()
    rootCtx.plugin({
      name: 'mock-ws',
      apply(c) {
        c.provide('webServer', {
          register: (r) => {
            routes.set(`${r.kind}:${r.path}`, r.handler)
            return () => routes.delete(`${r.kind}:${r.path}`)
          },
        })
      },
    })
    rootCtx.plugin({
      name: 'mock-conn',
      apply(c) {
        new connMod.HostConnectionService(c, [], {
          isAuthenticated: () => true,
          authenticateApi: () => undefined,
          authorizeConnect: () => {},
          authorizeIndex: () => true,
          authenticatedUrl: (u) => u,
        })
      },
    })
    rootCtx.plugin(wtMod)
    await new Promise((r) => setTimeout(r, 20))

    const registeredHandler = routes.get(`prefix:${CORE.WORKTREE_RPC_CHANNEL}`)
    assert.equal(typeof registeredHandler, 'function')

    // Verify client manifest parses cleanly with real dsh-client-modules
    const clientModules = await import(pathToFileURL(join(findHostPackage(DSH_BIN, 'dsh-client-modules'), 'lib/index.js')).href)
    const decl = clientModules.parseDshClient?.(MANIFEST.name, MANIFEST.dsh?.client)
    if (decl) {
      assert.equal(decl.platform, 'web')
      assert.ok(decl.inject.includes('@deepseek-ai/dsh-client-connection'))
      assert.ok(decl.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'))
      assert.ok(decl.inject.includes('@deepseek-ai/dsh-client-ui-context-menu'))
      assert.ok(!decl.inject.includes('@deepseek-ai/dsh-client-shortcuts'))
    }

    // Round-trip via the real Client Connection service and server response schema.
    const { Readable } = await import('node:stream')
    const { EventEmitter } = await import('node:events')
    const fetchRoute = async (route, init) => {
      const req = Readable.from([Buffer.from(init.body, 'utf8')])
      req.url = `/${route}`
      req.method = init.method
      req.headers = { ...init.headers, host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' }
      const res = new EventEmitter()
      res.writableEnded = false
      res.destroyed = false
      let status = 200
      let resHeaders = {}
      const chunks = []
      res.writeHead = (s, h = {}) => { status = s; resHeaders = h }
      res.end = (b) => {
        if (b !== undefined) chunks.push(Buffer.isBuffer(b) ? b : Buffer.from(String(b)))
        res.writableEnded = true
      }
      await registeredHandler(req, res)
      const bodyText = Buffer.concat(chunks).toString('utf8')
      const parsed = JSON.parse(bodyText)
      assert.equal(connMod.serverResponseSchema.safeParse(parsed).success, true)
      return new Response(bodyText, { status, headers: resHeaders })
    }
    let connection
    connClient.installConnection({
      provide(name, service) {
        assert.equal(name, 'connection')
        connection = service
      },
    }, { transport: { fetch: fetchRoute } })
    const rpcClient = connection.rpc
    const rpcResult = await rpcClient.call(CORE.WORKTREE_RPC_CHANNEL, 'skeleton', { path: ROOT })
    assert.equal(rpcResult.ok, true)
    assert.equal(rpcResult.value.isGitRepo, true)
  } finally {
    process.argv[1] = oldArgv1
  }
})

test('L1: dsh-wsl UNC and Windows drive path interop on host and client', async () => {
  assert.equal(
    CORE.resolveHostPath('\\\\wsl.localhost\\Ubuntu\\home\\u\\repo\\', { platform: 'linux', wslDistro: 'Ubuntu' }),
    '/home/u/repo',
  )
  assert.equal(
    CORE.resolveHostPath('\\\\wsl$\\Debian\\home\\u\\repo', { platform: 'linux', wslDistro: 'Ubuntu' }),
    '\\\\wsl$\\Debian\\home\\u\\repo',
  )
  assert.equal(
    CORE.resolveHostPath('D:\\code\\proj\\', { platform: 'linux', wslDistro: 'Ubuntu' }),
    '/mnt/d/code/proj',
  )
  assert.equal(CORE.resolveHostPath('/home/u/repo', { platform: 'linux', wslDistro: 'Ubuntu' }), '/home/u/repo')

  const { mod } = loadClient()
  const api = mod.__internals
  assert.equal(api.canonicalComparePath('\\\\wsl.localhost\\Ubuntu\\home\\u\\repo\\'), '/home/u/repo')
  assert.equal(api.canonicalComparePath('D:\\code\\proj\\'), '/mnt/d/code/proj')
  assert.equal(
    api.formatPathForWorkspaceCreate('/home/u/repo-wt', { referencePath: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo' }),
    '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo-wt',
  )
  assert.equal(
    api.formatPathForWorkspaceCreate('/mnt/d/code/proj-wt', { referencePath: 'D:\\code\\proj' }),
    'D:\\code\\proj-wt',
  )
  assert.equal(
    api.formatPathForWorkspaceCreate('/home/u/repo-wt', { referencePath: '/home/u/repo' }),
    '/home/u/repo-wt',
  )

  const merged = api.mergeWorktreeSessions(
    { path: '/home/u/repo', realPath: '/home/u/repo', workspaceId: null, sessionIds: [] },
    { items: [{ workspaceId: 'wsl:ws-1', path: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo', sessionIds: ['wsl:s1'] }], archivedSessionIds: [], pinnedSessionIds: [] },
    { byId: { 'wsl:s1': { id: 'wsl:s1', displayTitle: 'WSL Chat', cwd: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo', running: false, blank: false, updatedAt: 10, retainedBy: {} } } },
  )
  assert.equal(merged.workspaceId, 'wsl:ws-1')
  assert.equal(merged.sessions.length, 1)
  assert.equal(merged.sessions[0].id, 'wsl:s1')

  const created = []
  const opened = []
  const res = await api.openWorktreeTarget({
    wt: { path: '/home/u/repo-wt', exists: true },
    workspaces: {
      list: makeObservable({ items: [] }),
      create: async ({ path }) => { created.push(path); return { workspaceId: 'wsl:ws-2', path } },
    },
    uiWorkspace: { openWorkspace: async (id) => opened.push(id) },
    referencePath: '\\\\wsl.localhost\\Ubuntu\\home\\u\\repo',
    wslDistro: 'Ubuntu',
  })
  assert.equal(res.ok, true)
  assert.deepEqual(created, ['\\\\wsl.localhost\\Ubuntu\\home\\u\\repo-wt'])
  assert.deepEqual(opened, ['wsl:ws-2'])
})

test('L1: listDirs browses subdirectories, flags git repos, honors showHidden, and handles ~ / missing-dir', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wt-dirs-'))
  try {
    const gitSub = join(tmp, 'alpha-git')
    const plainSub = join(tmp, 'beta-plain')
    const hiddenSub = join(tmp, '.hidden-sub')
    mkdirSync(gitSub)
    mkdirSync(plainSub)
    mkdirSync(hiddenSub)
    git(gitSub, ['init', '-b', 'main'])
    writeFileSync(join(tmp, 'plain-file.txt'), 'hello\n')

    assert.equal(CORE.expandUserPath('~', { homeDir: tmp }), tmp)
    assert.equal(CORE.expandUserPath('~/alpha-git', { homeDir: tmp }), gitSub)

    const service = CORE.createWorktreeService({ homeDir: tmp })
    const handler = CORE.createWorktreeRpcHandler(service)

    const homeRes = await handler('list-dirs', {})
    assert.equal(homeRes.ok, true)
    assert.equal(homeRes.value.status, 'ok')
    assert.equal(homeRes.value.isGitRepo, false)
    assert.deepEqual(
      homeRes.value.entries.map((e) => [e.name, e.isGitRepo]),
      [['alpha-git', true], ['beta-plain', false]],
    )

    const hiddenRes = await handler('list-dirs', { path: tmp, showHidden: true })
    assert.equal(hiddenRes.ok, true)
    assert.ok(hiddenRes.value.entries.some((e) => e.name === '.hidden-sub'))

    const missingRes = await handler('list-dirs', { path: join(tmp, 'does-not-exist') })
    assert.equal(missingRes.ok, true)
    assert.equal(missingRes.value.status, 'missing-dir')
    assert.deepEqual(missingRes.value.entries, [])
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('L1: live workingDirectory agent mapping, directory switcher, folder browser, and projection priority', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wt-live-'))
  try {
    const repo = join(tmp, 'repo')
    const wt1 = join(tmp, 'repo-wt-1')
    mkdirSync(repo)
    git(repo, ['init', '-b', 'main'])
    writeFileSync(join(repo, 'README.md'), 'hi\n')
    git(repo, ['add', 'README.md'])
    git(repo, ['commit', '-m', 'init'])
    git(repo, ['worktree', 'add', '-b', 'feat/live', wt1])

    const service = CORE.createWorktreeService({
      getWorkspaceRegistry: () => ({ list: () => [{ workspaceId: 'ws-main', path: repo, sessionIds: ['s-top'] }] }),
      getLiveAgents: () => [
        { session: { id: 's-top', header: { id: 's-top', cwd: repo, delegationDepth: 0 } } },
        { session: { id: 's-sub', header: { id: 's-sub', cwd: wt1, delegationDepth: 1 } } },
      ],
      getSessionCwd: () => wt1,
      querySessionActivity: async (sid) => (sid === 's-top' ? [{ kind: 'turn' }] : []),
    })

    const skel = await service.skeleton({ path: repo })
    assert.equal(skel.status, 'ok')
    const mainWt = skel.worktrees.find((w) => w.isMain)
    const childWt = skel.worktrees.find((w) => !w.isMain)
    assert.equal(mainWt.sessionIds.includes('s-top'), false)
    assert.equal(childWt.sessionIds.includes('s-top'), true)
    assert.equal(childWt.sessionIds.includes('s-sub'), false)
    assert.equal(skel.sessionActivities['s-top']?.[0]?.kind, 'turn')
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  const react = createReactStub()
  const storageMap = new Map()
  const { mod } = loadClient({ react, storageMap })
  const api = mod.__internals
  const slots = []
  const rpcCalls = []
  let activeSessCwd = '/repo'
  const ctx = {
    locale: { register: () => () => {}, bind: () => (k) => k, current: makeObservable('zh') },
    connection: {
      rpc: {
        call: async (_ch, ep, payload) => {
          rpcCalls.push([ep, payload])
          if (ep === 'summary') {
            return { ok: true, value: { status: 'ok', isGitRepo: true, branch: payload.path === '/repo-wt' ? 'feat/live' : 'main', dirtyCount: 0 } }
          }
          if (ep === 'skeleton') {
            return {
              ok: true,
              value: {
                status: 'ok',
                queryPath: payload.path,
                isGitRepo: true,
                repoName: payload.path.split('/').pop(),
                mainPath: payload.path,
                currentWorktreePath: payload.path,
                worktrees: [{ path: payload.path, relativePath: '.', branch: payload.path === '/other' ? 'dev' : 'main', isMain: true, isCurrent: true, sessionIds: [], exists: true }],
              },
            }
          }
          if (ep === 'details') return { ok: true, value: { status: 'ok', detailsByPath: {}, parentByPath: {}, treeEdges: [] } }
          if (ep === 'list-dirs') {
            return {
              ok: true,
              value: { status: 'ok', path: payload.path || '/home/u', parentPath: '/home', homePath: '/home/u', isGitRepo: true, entries: [{ name: 'browsed', path: '/home/u/browsed', isGitRepo: true }], truncated: false },
            }
          }
          return { ok: false, error: { code: 'unknown', message: 'unknown' } }
        },
      },
    },
    workspaces: { list: makeObservable({ items: [{ workspaceId: 'ws-1', title: 'Repo', path: '/repo', sessionIds: ['s1'] }] }) },
    uiWorkspace: { openWorkspace: async () => {}, openSession: () => {} },
    sessions: { list: makeObservable({ ids: ['s1'], byId: { s1: { id: 's1', cwd: '/repo', updatedAt: 1 } } }) },
    sidebarRightTabs: { register: () => () => {} },
    sidebarRight: { openTab: () => {} },
    slots: { inject: (_s, fn) => fn(), register: (def, comp) => { slots.push([def, comp]); return () => {} } },
    contextMenus: { register: () => () => {} },
    effect: (fn) => fn(),
  }

  mod.apply(ctx)
  const Badge = slots.find(([d]) => d.name === 'conversation.session.header.actions')[1]
  const badgeProps = {
    sessionId: 's1',
    useProjection: (k) => (k === 'workingDirectory' ? '/repo-wt' : undefined),
    useSessions: (sel) => sel({ byId: { s1: { cwd: '/repo' } } }),
    useSession: (sel) => sel({ removed: false, blank: false }),
    t: (k, v) => api.formatLocaleText(api.LOCALES.en, k, v),
  }
  react._render(Badge, badgeProps)
  await new Promise((r) => setTimeout(r, 15))
  const badgeVdom = react._render(Badge, badgeProps)
  const branchSpan = findInVdom(badgeVdom, (n) => n.props?.className === 'TWT_hdrBranch')
  assert.equal(branchSpan?.props?.children?.[0], 'feat/live')

  react._reset()
  const Body = slots.find(([d]) => d.name === 'sidebar.right.pane.tab')[1]
  const tabProps = {
    sessionId: 's1',
    useProjection: (k) => (k === 'workingDirectory' ? activeSessCwd : undefined),
    useTabInfo: () => ({ sidebar: { fullscreen: false }, tab: { visible: true, navigation: { params: {} }, actions: { bindCommands: () => () => {} } } }),
    useSessions: (sel) => sel(ctx.sessions.list.getSnapshot()),
    t: (k, v) => api.formatLocaleText(api.LOCALES.zh, k, v),
  }
  react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  let vdom = react._render(Body, tabProps)

  // Open directory popover and submit a manual path
  const trigger = findInVdom(vdom, (n) => n.props?.['data-worktree-dir-trigger'] === 'true')
  assert.ok(trigger)
  trigger.props.onClick()
  vdom = react._render(Body, tabProps)
  const input = findInVdom(vdom, (n) => n.props?.['data-worktree-dir-input'] === 'true')
  assert.ok(input)
  input.props.onChange({ target: { value: '/other' } })
  vdom = react._render(Body, tabProps)
  const form = findInVdom(vdom, (n) => n.type === 'form' && n.props?.className === 'TWT_popForm')
  form.props.onSubmit({ preventDefault: () => {} })
  await new Promise((r) => setTimeout(r, 15))
  vdom = react._render(Body, tabProps)
  assert.ok(rpcCalls.some(([ep, pl]) => ep === 'skeleton' && pl.path === '/other'))
  assert.equal(findInVdom(vdom, (n) => n.props?.['data-worktree-dir-trigger'] === 'true')?.props?.['data-pinned'], 'true')

  // Open FolderBrowserModal -> navigate into child dir -> pick directory
  findInVdom(vdom, (n) => n.props?.['data-worktree-dir-trigger'] === 'true').props.onClick()
  vdom = react._render(Body, tabProps)
  findInVdom(vdom, (n) => n.props?.['data-worktree-dir-browse'] === 'true').props.onClick()
  react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  vdom = react._render(Body, tabProps)
  const dirEntryBtn = findInVdom(vdom, (n) => n.props?.className === 'TWT_dirEntryBtn')
  assert.ok(dirEntryBtn)
  dirEntryBtn.props.onClick()
  react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  vdom = react._render(Body, tabProps)
  const selectBtn = findInVdom(vdom, (n) => n.props?.['data-worktree-browser-select'] === 'true')
  assert.ok(selectBtn)
  selectBtn.props.onClick()
  await new Promise((r) => setTimeout(r, 15))
  vdom = react._render(Body, tabProps)
  assert.ok(rpcCalls.some(([ep, pl]) => ep === 'skeleton' && pl.path === '/home/u/browsed'))

  // Follow current session clears manual pin
  activeSessCwd = '/repo-wt'
  findInVdom(vdom, (n) => n.props?.['data-worktree-dir-trigger'] === 'true').props.onClick()
  vdom = react._render(Body, tabProps)
  const followBtn = findInVdom(vdom, (n) => n.props?.['data-worktree-dir-follow'] === 'true')
  assert.ok(followBtn)
  followBtn.props.onClick()
  react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  vdom = react._render(Body, tabProps)
  assert.equal(rpcCalls.some(([ep, pl]) => ep === 'skeleton' && pl.path === '/repo-wt'), true)
})
