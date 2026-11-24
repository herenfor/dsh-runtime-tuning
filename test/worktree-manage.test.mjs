import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANAGE_CORE = await import('../plugins/worktree-manage-core.mjs')
const WT_CLIENT_SRC = readFileSync(join(ROOT, 'ui-worktree/client.js'), 'utf8')
const MANAGE_CLIENT_SRC = readFileSync(join(ROOT, 'ui-worktree-manage/client.js'), 'utf8')
const MANAGE_MANIFEST = JSON.parse(readFileSync(join(ROOT, 'ui-worktree-manage/package.json'), 'utf8'))
const MANAGE_INDEX_PATH = join(ROOT, 'ui-worktree-manage/index.mjs')

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
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
  }
}

test('L1: sanitizeSlug, branch/ref validation, path resolution, and runManageGit force guard', async () => {
  assert.equal(MANAGE_CORE.sanitizeSlug('feat/my-task'), 'feat-my-task')
  assert.equal(MANAGE_CORE.sanitizeSlug('..hidden..name/'), 'hidden-name')
  assert.equal(MANAGE_CORE.sanitizeSlug('...'), '')

  assert.equal(MANAGE_CORE.validateBranchName('feat/abc_1'), 'feat/abc_1')
  assert.throws(() => MANAGE_CORE.validateBranchName('-bad'))
  assert.throws(() => MANAGE_CORE.validateBranchName('feat..bad'))
  assert.throws(() => MANAGE_CORE.validateBranchName('feat/@{0}'))
  assert.throws(() => MANAGE_CORE.validateBranchName('feat.lock'))

  assert.equal(MANAGE_CORE.validateBaseRef(''), null)
  assert.equal(MANAGE_CORE.validateBaseRef('origin/main'), 'origin/main')
  assert.throws(() => MANAGE_CORE.validateBaseRef('--force'))

  assert.equal(
    MANAGE_CORE.resolveWorktreeTargetPath({
      repoRoot: '/code/demo',
      repoName: 'demo',
      commonDir: '/code/demo/.git',
      branch: 'feat/x',
    }),
    '/code/demo-wt/feat-x',
  )
  assert.throws(() => MANAGE_CORE.resolveWorktreeTargetPath({
    repoRoot: '/code/demo',
    repoName: 'demo',
    commonDir: '/code/demo/.git',
    branch: 'feat/x',
    customPath: '.',
  }))
  assert.throws(() => MANAGE_CORE.resolveWorktreeTargetPath({
    repoRoot: '/code/demo',
    repoName: 'demo',
    commonDir: '/code/demo/.git',
    branch: 'feat/x',
    customPath: '.git/wt',
  }))

  await assert.rejects(() => MANAGE_CORE.runManageGit(['worktree', 'remove', '--force', '/tmp/x'], { cwd: ROOT }), /forbidden/)
  await assert.rejects(() => MANAGE_CORE.runManageGit(['worktree', 'remove', '-f', '/tmp/x'], { cwd: ROOT }), /forbidden/)
  await assert.rejects(() => MANAGE_CORE.runManageGit(['worktree', 'add', '-f', '/tmp/x'], { cwd: ROOT }), /forbidden/)
  await assert.rejects(() => MANAGE_CORE.runManageGit(['reset', '--hard'], { cwd: ROOT }), /disallowed/)
})

test('L1: real git create, branch-in-use guard, dual-gate preflight/remove, and prune', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wtm-real-'))
  try {
    const repo = join(tmp, 'demo')
    mkdirSync(repo)
    git(repo, ['init', '-b', 'main'])
    writeFileSync(join(repo, 'README.md'), 'init\n')
    git(repo, ['add', 'README.md'])
    git(repo, ['commit', '-m', 'init commit'])
    const baseSha = git(repo, ['rev-parse', 'HEAD'])

    const createdWs = []
    const activeMap = new Map()
    const forkedCalls = []
    const service = MANAGE_CORE.createWorktreeManageService({
      getWorkspaceRegistry: () => ({
        list: () => createdWs,
        create: async (p) => {
          const ws = { id: `ws-${createdWs.length + 1}`, path: p, title: 'wt', sessionIds: [`s-${createdWs.length + 1}`] }
          createdWs.push(ws)
          return ws
        },
      }),
      querySessionActivity: async (sid) => activeMap.get(sid) || [],
      forkSessionToWorktree: async ({ sourceSessionId, workspace }) => {
        forkedCalls.push([sourceSessionId, workspace.path])
        if (sourceSessionId === 's-unborn') return { warning: 'no completed turn' }
        return { sessionId: 's-forked-1' }
      },
    })

    // 1. Create blank worktree from main
    const c1 = await service.create({ path: repo, branch: 'feat/one', sessionMode: 'blank' })
    assert.equal(c1.created, true)
    assert.equal(c1.worktreePath, join(tmp, 'demo-wt', 'feat-one'))
    assert.equal(c1.workspaceId, 'ws-1')
    assert.ok(existsSync(join(c1.worktreePath, 'README.md')))

    // 2. Creating from inside linked worktree still places beside main repo root!
    const c2 = await service.create({
      path: c1.worktreePath,
      branch: 'feat/two',
      baseRef: baseSha,
      sessionMode: 'fork',
      sourceSessionId: 's-main',
    })
    assert.equal(c2.worktreePath, join(tmp, 'demo-wt', 'feat-two'))
    assert.equal(c2.sessionId, 's-forked-1')
    assert.deepEqual(forkedCalls[0], ['s-main', c2.worktreePath])

    // 3. Branch already checked out or target path existing fails cleanly
    await assert.rejects(() => service.create({ path: repo, branch: 'feat/one' }), (e) => e.code === 'worktree/branch-in-use')
    await assert.rejects(() => service.create({ path: repo, branch: 'feat/three', customPath: c1.worktreePath }), (e) => e.code === 'worktree/path-exists')

    // 4. Fork warning preserves created worktree gracefully
    const c3 = await service.create({ path: repo, branch: 'feat/warn', sessionMode: 'fork', sourceSessionId: 's-unborn' })
    assert.equal(c3.created, true)
    assert.equal(c3.sessionId, null)
    assert.match(c3.forkWarning, /no completed turn/)

    // 5. Dual-gate removal checks
    const mainGate = await service.preflightRemove({ path: repo, worktreePath: repo })
    assert.equal(mainGate.allowed, false)
    assert.equal(mainGate.primaryCode, 'worktree/is-main')

    // Gate 1 (dirty) + Gate 2 (active session) both fail on c1
    writeFileSync(join(c1.worktreePath, 'dirty.txt'), 'uncommitted\n')
    activeMap.set('s-1', [{ kind: 'turn' }])
    const dirtyAndActive = await service.preflightRemove({ path: repo, worktreePath: c1.worktreePath })
    assert.equal(dirtyAndActive.allowed, false)
    assert.equal(dirtyAndActive.gates.gitClean, false)
    assert.equal(dirtyAndActive.gates.noActiveSessions, false)
    assert.deepEqual(dirtyAndActive.reasons, ['worktree/dirty', 'worktree/session-active'])
    await assert.rejects(() => service.remove({ path: repo, worktreePath: c1.worktreePath }), (e) => e.code === 'worktree/dirty')

    // Clean git, keep Gate 2 active -> still refused
    rmSync(join(c1.worktreePath, 'dirty.txt'))
    const activeOnly = await service.preflightRemove({ path: repo, worktreePath: c1.worktreePath })
    assert.equal(activeOnly.gates.gitClean, true)
    assert.equal(activeOnly.gates.noActiveSessions, false)
    await assert.rejects(() => service.remove({ path: repo, worktreePath: c1.worktreePath }), (e) => e.code === 'worktree/session-active')

    // Clear active session -> both gates pass -> clean remove succeeds without --force
    activeMap.delete('s-1')
    const okGate = await service.preflightRemove({ path: repo, worktreePath: c1.worktreePath })
    assert.equal(okGate.allowed, true)
    const removed = await service.remove({ path: repo, worktreePath: c1.worktreePath })
    assert.equal(removed.removed, true)
    assert.equal(existsSync(c1.worktreePath), false)

    // 6. Prune dryRun vs real on missing directory
    rmSync(c2.worktreePath, { recursive: true, force: true })
    await assert.rejects(() => service.remove({ path: repo, worktreePath: c2.worktreePath }), (e) => e.code === 'worktree/prunable-use-prune')
    const dry = await service.prune({ path: repo, dryRun: true })
    assert.equal(dry.dryRun, true)
    assert.equal(dry.pruned, false)
    assert.equal(dry.entries.length, 1)
    assert.equal(dry.entries[0].path, c2.worktreePath)

    const pruned = await service.prune({ path: repo, dryRun: false })
    assert.equal(pruned.pruned, true)
    assert.equal(pruned.entries.length, 1)
    const afterPrune = await service.prune({ path: repo, dryRun: true })
    assert.equal(afterPrune.entries.length, 0)

    // 7. create_worktree agent tool definition
    const tool = MANAGE_CORE.createWorktreeToolDefinition({
      service,
      workingDirectory: { ensure: async () => repo },
    })
    assert.equal(tool.name, 'create_worktree')
    const toolRes = await tool.execute({ branch: 'feat/agent', sessionMode: 'none' }, { agent: { session: { header: { id: 's-main' } } } })
    assert.equal(toolRes.branch, 'feat/agent')
    assert.equal(tool.output.presentationMeta({}, toolRes).tool, 'create_worktree')
    const renderedTool = tool.output.render({}, toolRes)
    assert.equal(Array.isArray(renderedTool), true)
    assert.equal(renderedTool[0]?.type, 'text')
    assert.match(renderedTool[0]?.text || '', /feat\/agent/)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

function createStatefulReactStub() {
  const storesByComp = new Map()
  let activeStore = null
  let slot = 0
  const getStore = (key) => {
    let s = storesByComp.get(key)
    if (!s) { s = new Map(); storesByComp.set(key, s) }
    return s
  }
  const useState = (init) => {
    const targetStore = activeStore
    const k = `s:${slot++}`
    if (!targetStore.has(k)) targetStore.set(k, typeof init === 'function' ? init() : init)
    return [targetStore.get(k), (v) => targetStore.set(k, typeof v === 'function' ? v(targetStore.get(k)) : v)]
  }
  const useRef = (init) => {
    const k = `r:${slot++}`
    if (!activeStore.has(k)) activeStore.set(k, { current: init })
    return activeStore.get(k)
  }
  const useEffect = (fn, deps) => {
    const k = `e:${slot++}`
    const prev = activeStore.get(k)
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps?.[i]))
    if (changed) {
      try { prev?.cleanup?.() } catch {}
      const cleanup = fn()
      activeStore.set(k, { deps: deps || [], cleanup: typeof cleanup === 'function' ? cleanup : null })
    }
  }
  const useMemo = (fn, deps) => {
    const k = `m:${slot++}`
    const prev = activeStore.get(k)
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps?.[i]))
    if (changed) {
      const value = fn()
      activeStore.set(k, { deps: deps || [], value })
      return value
    }
    return prev.value
  }
  const useCallback = (fn, deps) => useMemo(() => fn, deps)
  const useSyncExternalStore = (_sub, getSnap) => getSnap()
  const createElement = (type, props, ...children) => ({
    type,
    props: {
      ...(props || {}),
      children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
    },
  })
  const renderNode = (node, path = 'root') => {
    if (!node || typeof node !== 'object') return node
    if (typeof node.type === 'function') {
      const prevStore = activeStore
      const prevSlot = slot
      activeStore = getStore(`${node.type.name || 'anon'}:${path}`)
      slot = 0
      let out
      try { out = node.type(node.props) } finally {
        activeStore = prevStore
        slot = prevSlot
      }
      return renderNode(out, `${path}>fn`)
    }
    if (Array.isArray(node.props?.children)) {
      return {
        ...node,
        props: {
          ...node.props,
          children: node.props.children.map((ch, idx) => renderNode(ch, `${path}.${idx}`)),
        },
      }
    }
    return node
  }
  const render = (Comp, props) => renderNode(createElement(Comp, props), 'root')
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
  }
}

function findInVdom(node, pred) {
  if (!node || typeof node !== 'object') return null
  if (pred(node)) return node
  for (const ch of node.props?.children || []) {
    const hit = findInVdom(ch, pred)
    if (hit) return hit
  }
  return null
}

function loadBothClients({ react } = {}) {
  const loaded = new Map()
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (def) => { loaded.set(def.id, def) } },
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    document: {
      head: { appendChild: () => {} },
      createElement: () => ({ dataset: {}, textContent: '' }),
      querySelector: () => null,
    },
    localStorage: { getItem: () => null, setItem: () => {} },
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
  vm.runInNewContext(WT_CLIENT_SRC, sandbox, { filename: 'ui-worktree/client.js' })
  vm.runInNewContext(MANAGE_CLIENT_SRC, sandbox, { filename: 'ui-worktree-manage/client.js' })
  const req = (id) => {
    if (id === 'react' && react) return react
    throw new Error(`missing require: ${id}`)
  }
  return {
    wtMod: loaded.get('@herenfor/dsh-tune-worktree').factory(req),
    manageMod: loaded.get('@herenfor/dsh-tune-worktree-manage').factory(req),
  }
}

test('L1: Phase 1 isolation, Phase 2 UI extension, dual-gate modals, menus, and tool row', async () => {
  const react = createStatefulReactStub()
  const { wtMod, manageMod } = loadBothClients({ react })
  const wtApi = wtMod.__internals

  const services = new Map()
  const slots = []
  const menus = []
  const openedTabs = []
  const openedSessions = []
  const openedWs = []
  const rpcCalls = []
  let gateClean = false
  let gateSessions = false

  const ctx = {
    locale: { register: () => () => {}, bind: () => (k) => k, current: makeObservable('zh') },
    provide: (name, svc) => { services.set(name, svc) },
    connection: {
      rpc: {
        call: async (ch, ep, payload) => {
          rpcCalls.push([ch, ep, payload])
          if (ch === '/dsh-tune-worktree') {
            if (ep === 'skeleton') {
              return {
                ok: true,
                value: {
                  status: 'ok',
                  queryPath: payload.path,
                  isGitRepo: true,
                  isBare: false,
                  isSubmodule: false,
                  wslDistro: 'Ubuntu',
                  repoName: 'demo',
                  mainPath: '/home/u/demo',
                  currentWorktreePath: '/home/u/demo',
                  worktrees: [
                    { path: '/home/u/demo', relativePath: '.', branch: 'main', isMain: true, isCurrent: true, workspaceId: 'wsl:ws-1', sessionIds: ['wsl:s1'], exists: true },
                    { path: '/home/u/demo-wt/f1', relativePath: '../demo-wt/f1', branch: 'feat/f1', isMain: false, isCurrent: false, workspaceId: 'wsl:ws-2', sessionIds: [], exists: true },
                    { path: '/home/u/demo-wt/gone', relativePath: '../demo-wt/gone', branch: 'feat/gone', isMain: false, isCurrent: false, prunable: true, exists: false, sessionIds: [] },
                  ],
                  treeEdges: [],
                  sessionActivities: {},
                },
              }
            }
            if (ep === 'details') {
              return { ok: true, value: { status: 'ok', detailsByPath: {}, parentByPath: { '/home/u/demo': null, '/home/u/demo-wt/f1': '/home/u/demo', '/home/u/demo-wt/gone': '/home/u/demo' }, treeEdges: [] } }
            }
          }
          if (ch === '/dsh-tune-worktree-manage') {
            if (ep === 'config') return { ok: true, value: { defaultPathTemplate: '../<repo>-wt/<slug>', enableAgentTool: true } }
            if (ep === 'create') {
              return {
                ok: true,
                value: {
                  created: true,
                  worktreePath: '/home/u/demo-wt/feat-new',
                  branch: payload.branch,
                  sessionMode: payload.sessionMode,
                  workspaceId: 'wsl:ws-new',
                  sessionId: payload.sessionMode === 'fork' ? 'wsl:s-forked' : null,
                },
              }
            }
            if (ep === 'preflight-remove') {
              return {
                ok: true,
                value: {
                  allowed: gateClean && !gateSessions,
                  gates: { notMain: true, notLocked: true, exists: true, gitClean: gateClean, noActiveSessions: !gateSessions },
                  gitStatus: { dirtyCount: gateClean ? 0 : 2, staged: 0, unstaged: gateClean ? 0 : 2, untracked: 0, conflicted: 0 },
                  activeSessions: gateSessions ? [{ sessionId: 'wsl:s2', activities: [{ kind: 'turn' }] }] : [],
                },
              }
            }
            if (ep === 'remove') return { ok: true, value: { removed: true, worktreePath: payload.worktreePath } }
            if (ep === 'prune') return { ok: true, value: { pruned: !payload.dryRun, dryRun: payload.dryRun, entries: [{ path: '/home/u/demo-wt/gone', branch: 'feat/gone', reason: 'missing' }] } }
          }
          return { ok: false, error: { code: 'unknown', message: 'unknown' } }
        },
      },
    },
    workspaces: {
      list: makeObservable({ items: [{ workspaceId: 'wsl:ws-1', path: '\\\\wsl.localhost\\Ubuntu\\home\\u\\demo', sessionIds: ['wsl:s1'] }], archivedSessionIds: [], pinnedSessionIds: [] }),
      create: async ({ path }) => ({ workspaceId: 'wsl:ws-created', path }),
    },
    uiWorkspace: {
      openWorkspace: async (id) => { openedWs.push(id) },
      openSession: (sid) => { openedSessions.push(sid) },
    },
    sessions: {
      list: makeObservable({
        ids: ['wsl:s1'],
        byId: { 'wsl:s1': { id: 'wsl:s1', displayTitle: 'Main Chat', cwd: '\\\\wsl.localhost\\Ubuntu\\home\\u\\demo', running: false, blank: false, updatedAt: 100, retainedBy: {} } },
      }),
    },
    sidebarRightTabs: { register: () => () => {} },
    sidebarRight: { mounted: makeObservable('wsl:s1'), openTab: (kind, opts) => { openedTabs.push([kind, opts]) } },
    slots: { inject: (_s, fn) => fn(), register: (def, comp) => { slots.push([def, comp]); return () => {} } },
    contextMenus: { register: (m) => { menus.push(m); return () => {} } },
    inject: (deps, fn) => {
      const sub = { ...ctx }
      for (const d of deps) {
        if (services.has(d)) sub[d] = services.get(d)
      }
      fn(sub)
    },
    effect: (fn) => fn(),
  }

  // Phase 1 alone -> zero write buttons
  wtMod.apply(ctx)
  const Body = slots.find(([d]) => d.name === 'sidebar.right.pane.tab')[1]
  const tabProps = {
    sessionId: 'wsl:s1',
    useTabInfo: () => ({ sidebar: { expanded: true, fullscreen: false }, panel: { id: 'p1', isFloating: false }, tab: { id: 't1', visible: true, navigation: { params: undefined }, actions: { bindCommands: () => () => {} } } }),
    useSessions: (sel) => sel(ctx.sessions.list.getSnapshot()),
    t: (k, v) => wtApi.formatLocaleText(wtApi.LOCALES.zh, k, v),
  }

  react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  let vdom = react._render(Body, tabProps)
  assert.equal(findInVdom(vdom, (n) => n.props?.['data-worktree-manage-create-btn'] === 'true'), null)

  // Apply Phase 2 -> mounts extension toolbar & detail buttons + menus + tool row
  manageMod.apply(ctx)
  vdom = react._render(Body, tabProps)
  assert.ok(findInVdom(vdom, (n) => n.props?.['data-worktree-manage-create-btn'] === 'true'))
  assert.ok(findInVdom(vdom, (n) => n.props?.['data-worktree-manage-prune-btn'] === 'true'))

  // Session context menu "分叉到新 Worktree" opens tab with fork intent -> Create modal opens in fork mode
  const forkMenu = menus.find((m) => m.id === 'worktree.manage.forkToWorktree')
  assert.ok(forkMenu)
  const forkItems = forkMenu.resolve({ sessionId: 'wsl:s1' })
  assert.equal(forkItems.length, 1)
  await forkItems[0].run()
  assert.equal(openedTabs.at(-1)[0], 'worktree')

  vdom = react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 10))
  vdom = react._render(Body, tabProps)
  const createModal = findInVdom(vdom, (n) => n.props?.['data-worktree-manage-modal'] === 'create')
  assert.ok(createModal)
  const forkModeBtn = findInVdom(createModal, (n) => n.props?.['data-manage-session-mode'] === 'fork')
  assert.equal(forkModeBtn.props['data-active'], 'true')

  // Fill branch & submit Create -> navigates to forked session wsl:s-forked
  const branchInput = findInVdom(createModal, (n) => n.props?.['data-manage-branch'] === 'true')
  branchInput.props.onChange({ target: { value: 'feat/new' } })
  vdom = react._render(Body, tabProps)
  const preview = findInVdom(vdom, (n) => n.props?.['data-manage-path-preview'] === 'true')
  const previewText = Array.isArray(preview.props.children) ? preview.props.children.flat().join('') : preview.props.children
  assert.equal(previewText, '/home/u/demo-wt/feat-new')
  const confirmCreate = findInVdom(vdom, (n) => n.props?.['data-manage-confirm-create'] === 'true')
  await confirmCreate.props.onClick()
  assert.deepEqual(openedSessions, ['wsl:s-forked'])

  // Select linked worktree f1 and test Safe Delete modal dual-gate disabling
  vdom = react._render(Body, tabProps)
  const f1Card = findInVdom(vdom, (n) => n.props?.['data-worktree-card'] === '/home/u/demo-wt/f1')
  f1Card.props.onClick()
  vdom = react._render(Body, tabProps)
  const delBtn = findInVdom(vdom, (n) => n.props?.['data-worktree-manage-remove-btn'] === '/home/u/demo-wt/f1')
  assert.ok(delBtn)
  delBtn.props.onClick()
  react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  vdom = react._render(Body, tabProps)
  let confirmRemove = findInVdom(vdom, (n) => n.props?.['data-manage-confirm-remove'] === 'true')
  assert.equal(confirmRemove.props.disabled, true)

  // Both gates pass -> retry check enables button & clicking removes worktree
  gateClean = true
  gateSessions = false
  const retryBtn = findInVdom(vdom, (n) => {
    if (n.type !== 'button') return false
    const txt = Array.isArray(n.props?.children) ? n.props.children.join('') : n.props?.children
    return txt === 'retryCheck' || txt === '重新校验'
  })
  retryBtn.props.onClick()
  react._render(Body, tabProps)
  await new Promise((r) => setTimeout(r, 15))
  vdom = react._render(Body, tabProps)
  confirmRemove = findInVdom(vdom, (n) => n.props?.['data-manage-confirm-remove'] === 'true')
  assert.equal(confirmRemove.props.disabled, false)
  await confirmRemove.props.onClick()
  assert.ok(rpcCalls.some(([ch, ep]) => ch === '/dsh-tune-worktree-manage' && ep === 'remove'))

  // Verify tool row opens target session/workspace
  const toolSlot = slots.find(([d]) => d.name === 'tool.call.toolview' && d.key === 'create_worktree')
  assert.ok(toolSlot)
  const toolVdom = react._render(toolSlot[1], {
    phase: 'result',
    block: { kind: 'tool-result', isError: false, content: [{ type: 'text', text: 'ok' }], meta: { tool: 'create_worktree', branch: 'feat/x', worktreePath: '/home/u/demo-wt/x', workspaceId: 'wsl:ws-x' } },
  })
  const toolOpenBtn = findInVdom(toolVdom, (n) => n.type === 'button')
  assert.ok(toolOpenBtn)
  await toolOpenBtn.props.onClick()
  assert.equal(openedWs.at(-1), 'wsl:ws-x')
})

test('L2: real DSH host Config, dsh-tools defineTool, dsh-session fork, and WebServer HTTP round-trip', async (t) => {
  if (!DSH_BIN) return t.skip('host DSH install absent')
  const { findHostPackage } = await import('../plugins/chat-answer-fix.mjs')
  const oldArgv1 = process.argv[1]
  process.argv[1] = DSH_BIN
  const tmp = mkdtempSync(join(tmpdir(), 'wtm-l2-'))
  try {
    const repo = join(tmp, 'repo')
    mkdirSync(repo)
    git(repo, ['init', '-b', 'main'])
    writeFileSync(join(repo, 'a.txt'), 'a\n')
    git(repo, ['add', 'a.txt'])
    git(repo, ['commit', '-m', 'init'])

    const mod = await import(pathToFileURL(MANAGE_INDEX_PATH).href)
    assert.equal(mod.name, 'dsh-runtime-tuning-worktree-manage')
    const cfg = mod.Config({})
    assert.equal(cfg.enabled, true)
    assert.equal(cfg.pathTemplate, '../<repo>-wt/<slug>')
    assert.equal(cfg.enableAgentTool, true)

    let skipped = 0
    mod.apply({ inject: () => { skipped += 1 } }, { enabled: false })
    assert.equal(skipped, 0)

    const cordisDir = findHostPackage(DSH_BIN, 'cordis')
    const connDir = findHostPackage(DSH_BIN, 'dsh-client-connection')
    const toolsDir = findHostPackage(DSH_BIN, 'dsh-tools')
    const { Context } = await import(pathToFileURL(join(cordisDir, 'lib/index.js')).href)
    const connMod = await import(pathToFileURL(join(connDir, 'lib/index.js')).href)
    const { defineTool, ToolArgsError } = await import(pathToFileURL(join(toolsDir, 'lib/index.js')).href)

    // Verify tool definition passes real dsh-tools defineTool
    const toolDef = MANAGE_CORE.createWorktreeToolDefinition({
      defineTool,
      ToolArgsError,
      service: MANAGE_CORE.createWorktreeManageService(),
      workingDirectory: { ensure: async () => repo },
    })
    assert.equal(toolDef.name, 'create_worktree')
    const sampleRender = toolDef.output.render({}, { created: true, worktreePath: join(tmp, 'repo-wt/agent'), branch: 'feat/agent', sessionMode: 'none' })
    assert.equal(Array.isArray(sampleRender), true)
    assert.equal(sampleRender[0]?.type, 'text')

    // Verify manifest parses cleanly with real dsh-client-modules
    const clientModules = await import(pathToFileURL(join(findHostPackage(DSH_BIN, 'dsh-client-modules'), 'lib/index.js')).href)
    const decl = clientModules.parseDshClient?.(MANAGE_MANIFEST.name, MANAGE_MANIFEST.dsh?.client)
    if (decl) {
      assert.equal(decl.platform, 'web')
      assert.ok(decl.inject.includes('@deepseek-ai/dsh-client-connection'))
    }

    // Real Cordis Context + HostConnectionService + webServer + real dsh-session buildForkSeed
    const routes = new Map()
    const createdAgents = []
    const attached = []
    const rootCtx = new Context()
    rootCtx.plugin({
      name: 'mock-host',
      apply(c) {
        c.provide('webServer', {
          register: (r) => { routes.set(`${r.kind}:${r.path}`, r.handler); return () => routes.delete(`${r.kind}:${r.path}`) },
        })
        new connMod.HostConnectionService(c, [], {
          isAuthenticated: () => true,
          authenticateApi: () => undefined,
          authorizeConnect: () => {},
          authorizeIndex: () => true,
          authenticatedUrl: (u) => u,
        })
        c.provide('workspaceRegistry', {
          list: () => [],
          create: async (p) => ({
            id: 'ws-l2-1',
            path: p,
            attachSession: async (sid) => { attached.push([p, sid]) },
          }),
        })
        c.provide('sessionQuery', {
          observeSession: async () => ({
            events: [
              { type: 'turn/start', seq: 0, time: 1000, data: {} },
              { type: 'turn/end', seq: 1, time: 1005, data: {} },
            ],
            projections: { values: {} },
            [Symbol.dispose]: () => {},
          }),
        })
        c.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' }) })
        c.provide('agents', { create: async (opts) => { createdAgents.push(opts) } })
      },
    })
    rootCtx.plugin(mod)
    await new Promise((r) => setTimeout(r, 25))

    const handler = routes.get(`prefix:${MANAGE_CORE.WORKTREE_MANAGE_RPC_CHANNEL}`)
    assert.equal(typeof handler, 'function')

    const callHttp = async (endpoint, payload) => {
      const body = JSON.stringify({ type: 'client-request', rpcId: `r-${endpoint}`, method: endpoint, payload })
      const req = Readable.from([Buffer.from(body, 'utf8')])
      req.url = `${MANAGE_CORE.WORKTREE_MANAGE_RPC_CHANNEL}/${endpoint}`
      req.method = 'POST'
      req.headers = { 'content-type': 'application/json', host: '127.0.0.1:8080', origin: 'http://127.0.0.1:8080' }
      const res = new EventEmitter()
      res.writableEnded = false
      res.destroyed = false
      const chunks = []
      res.writeHead = () => {}
      res.end = (b) => { if (b) chunks.push(Buffer.isBuffer(b) ? b : Buffer.from(String(b))); res.writableEnded = true }
      await handler(req, res)
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      assert.equal(connMod.serverResponseSchema.safeParse(parsed).success, true)
      return parsed.result
    }

    const cfgRes = await callHttp('config', {})
    assert.equal(cfgRes.ok, true)
    assert.equal(cfgRes.value.defaultPathTemplate, '../<repo>-wt/<slug>')

    const createRes = await callHttp('create', { path: repo, branch: 'feat/l2-fork', sessionMode: 'fork', sourceSessionId: 'session-src' })
    assert.equal(createRes.ok, true)
    assert.equal(createRes.value.created, true)
    assert.ok(createRes.value.sessionId)
    assert.equal(createdAgents.length, 1)
    assert.equal(createdAgents[0].meta.cwd, createRes.value.worktreePath)
    assert.equal(createdAgents[0].inheritedEventCount, 2)
    assert.equal(attached.length, 1)
  } finally {
    process.argv[1] = oldArgv1
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('L1: branches RPC, deriveAutoBranchName, stager lifecycle, and live-agent Gate 2 protection', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wtm-s4-'))
  try {
    const repo = join(tmp, 'repo')
    const wtA = join(tmp, 'repo-wt-a')
    mkdirSync(repo)
    git(repo, ['init', '-b', 'main'])
    writeFileSync(join(repo, 'README.md'), 'init\n')
    git(repo, ['add', 'README.md'])
    git(repo, ['commit', '-m', 'init'])
    git(repo, ['branch', 'dev'])
    git(repo, ['worktree', 'add', '-b', 'feat/gate2', wtA])

    const autoAscii = MANAGE_CORE.deriveAutoBranchName('Fix Auth Token Bug!', 's1')
    assert.match(autoAscii, /^wt\/fix-auth-token-bug-[0-9a-f]{4}$/)
    const autoNonAscii = MANAGE_CORE.deriveAutoBranchName('中文需求', 's2')
    assert.match(autoNonAscii, /^wt\/task-[0-9a-f]{4}$/)

    const stager = MANAGE_CORE.createSessionWorktreeStager()
    const svc = MANAGE_CORE.createWorktreeManageService({
      getWorkspaceRegistry: () => ({ list: () => [] }),
      getLiveAgents: () => [{ session: { id: 's-sub', header: { id: 's-sub', cwd: wtA, delegationDepth: 1 } } }],
      getSessionCwd: () => wtA,
      querySessionActivity: async (sid) => (sid === 's-sub' ? [{ kind: 'subagent' }] : []),
    })
    const handler = MANAGE_CORE.createWorktreeManageRpcHandler(svc, { stager })

    const br = await handler('branches', { path: repo })
    assert.equal(br.ok, true)
    assert.equal(br.value.isGitRepo, true)
    assert.equal(br.value.currentBranch, 'main')
    assert.equal(br.value.branches[0].name, 'main')
    assert.equal(br.value.branches[0].isCurrent, true)
    assert.ok(br.value.branches.some((b) => b.name === 'dev'))

    // Gate 2 blocks deleting wtA when a live subagent runs inside it despite empty workspace registry
    const rmRes = await handler('remove', { path: repo, worktreePath: wtA })
    assert.equal(rmRes.ok, false)
    assert.equal(rmRes.error.code, 'worktree/session-active')

    // Stager retry & cancel decision flow
    const staged = await handler('stage-session', { sessionId: 'wsl:s-hero', enabled: true, path: repo, baseRef: 'dev', branch: 'feat/custom' })
    assert.equal(staged.ok, true)
    assert.equal(staged.value.status, 'staged')
    stager.setError('wsl:s-hero', 'simulated error')
    const retryWait = stager.waitDecision('wsl:s-hero')
    const retryRpc = await handler('retry-stage', { sessionId: 'wsl:s-hero' })
    assert.equal(retryRpc.ok, true)
    assert.equal(retryRpc.value.retried, true)
    assert.equal(await retryWait, 'retry')

    stager.setError('wsl:s-hero', 'another error')
    const cancelWait = stager.waitDecision('wsl:s-hero')
    await handler('stage-session', { sessionId: 'wsl:s-hero', enabled: false })
    assert.equal(await cancelWait, 'cancel')
    assert.equal((await handler('session-stage', { sessionId: 'wsl:s-hero' })).value, null)
    stager.dispose()
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
})

test('L1/L2: Host staged turn-1 entry hooks, HeroWorktreeOption, and HeroWorktreeProgressDock', async () => {
  assert.ok(MANAGE_MANIFEST.dsh?.client?.inject?.includes('@deepseek-ai/dsh-client-ui-conversation'))

  // L1 Client HeroWorktreeOption + HeroWorktreeProgressDock
  const react = createStatefulReactStub()
  const { wtMod, manageMod } = loadBothClients({ react })
  const slots = []
  const rpcCalls = []
  const navigated = []
  let serverStage = null
  const sessionList = makeObservable({
    ids: ['wsl:s-blank'],
    byId: { 'wsl:s-blank': { id: 'wsl:s-blank', cwd: '/repo', blank: true, running: false } },
  })
  const ctx = {
    locale: { register: () => () => {}, bind: () => (k) => k, current: makeObservable('zh') },
    connection: {
      rpc: {
        call: async (_ch, ep, pl) => {
          rpcCalls.push([ep, pl])
          if (ep === 'branches') {
            return { ok: true, value: { isGitRepo: true, repoName: 'repo', mainPath: '/repo', currentBranch: 'main', branches: [{ name: 'main', isCurrent: true }, { name: 'dev', isCurrent: false }], defaultPathTemplate: '../<repo>-wt/<slug>' } }
          }
          if (ep === 'session-stage') return { ok: true, value: serverStage }
          if (ep === 'stage-session') {
            serverStage = pl.enabled
              ? { sessionId: 's-blank', path: pl.path, baseRef: pl.baseRef, branch: pl.branch, status: 'staged', worktreePath: null, resolvedBranch: null, error: null }
              : null
            return { ok: true, value: serverStage || { cleared: true } }
          }
          if (ep === 'retry-stage') {
            if (serverStage) serverStage = { ...serverStage, status: 'creating', error: null }
            return { ok: true, value: { retried: true, stage: serverStage } }
          }
          if (ep === 'create') return { ok: true, value: { created: true, worktreePath: '/repo-wt/now', branch: pl.branch, sessionMode: 'blank', workspaceId: 'wsl:ws-now' } }
          return { ok: false, error: { code: 'unknown', message: 'unknown' } }
        },
      },
    },
    workspaces: { list: makeObservable({ items: [], archivedSessionIds: [], pinnedSessionIds: [] }), create: async ({ path }) => ({ workspaceId: 'wsl:ws-c', path }) },
    uiWorkspace: { openWorkspace: async (id) => navigated.push(id), openSession: (id) => navigated.push(id) },
    sessions: { list: sessionList },
    sidebarRight: { openTab: () => {} },
    slots: { inject: (_s, fn) => fn(), register: (def, comp) => { slots.push([def, comp]); return () => {} } },
    contextMenus: { register: () => () => {} },
    effect: (fn) => fn(),
  }

  manageMod.apply(ctx)
  const HeroOpt = slots.find(([d]) => d.name === 'conversation.hero.options')[1]
  const DockComp = slots.find(([d]) => d.name === 'conversation.input.dock')[1]
  let blankFlag = true
  let runningFlag = false
  const heroProps = {
    sessionId: 'wsl:s-blank',
    useSessions: (sel) => sel(ctx.sessions.list.getSnapshot()),
    useSession: (sel) => sel({ blank: blankFlag, running: runningFlag, removed: false }),
    t: (k, v) => manageMod.__internals.formatText(manageMod.__internals.LOCALES.zh, k, v),
  }

  react._render(HeroOpt, heroProps)
  await new Promise((r) => setTimeout(r, 15))
  let hVdom = react._render(HeroOpt, heroProps)
  const trig = findInVdom(hVdom, (n) => n.props?.['data-worktree-hero-trigger'] === 'true')
  assert.ok(trig)
  assert.equal(trig.props['data-armed'], 'false')

  // Open popover and switch to New Worktree mode + pick base branch 'dev'
  trig.props.onClick()
  hVdom = react._render(HeroOpt, heroProps)
  const wtCard = findInVdom(hVdom, (n) => n.props?.['data-worktree-hero-mode'] === 'worktree')
  assert.ok(wtCard)
  await wtCard.props.onClick()
  hVdom = react._render(HeroOpt, heroProps)
  assert.equal(findInVdom(hVdom, (n) => n.props?.['data-worktree-hero-trigger'] === 'true')?.props?.['data-armed'], 'true')

  const baseSel = findInVdom(hVdom, (n) => n.props?.['data-worktree-hero-base'] === 'true')
  await baseSel.props.onChange({ target: { value: 'dev' } })
  assert.equal(serverStage?.baseRef, 'dev')

  // Simulate user submitting message -> creating dock appears; on error -> Retry & Cancel in Local work
  blankFlag = false
  runningFlag = true
  let dVdom = react._render(DockComp, heroProps)
  assert.equal(findInVdom(dVdom, (n) => n.props?.['data-worktree-progress-dock'] === 'creating')?.props?.['data-worktree-progress-dock'], 'creating')

  serverStage = { ...serverStage, status: 'error', error: 'branch conflict' }
  await new Promise((r) => setTimeout(r, 380))
  dVdom = react._render(DockComp, heroProps)
  assert.ok(findInVdom(dVdom, (n) => n.props?.['data-worktree-progress-dock'] === 'error'))
  const retryBtn = findInVdom(dVdom, (n) => n.props?.['data-worktree-dock-retry'] === 'true')
  await retryBtn.props.onClick()
  assert.ok(rpcCalls.some(([ep]) => ep === 'retry-stage'))
  const cancelBtn = findInVdom(dVdom, (n) => n.props?.['data-worktree-dock-cancel'] === 'true')
  await cancelBtn.props.onClick()
  dVdom = react._render(DockComp, heroProps)
  assert.equal(dVdom, null)
  assert.equal(serverStage, null)

  // L2 Host hooks (agent/inbox/inserted + workingDirectory.set + agent/pre-step) when DSH is installed
  if (DSH_BIN) {
    const { findHostPackage } = await import('../plugins/chat-answer-fix.mjs')
    const oldArgv1 = process.argv[1]
    process.argv[1] = DSH_BIN
    const tmp = mkdtempSync(join(tmpdir(), 'wtm-hooks-'))
    try {
      const repo = join(tmp, 'repo')
      mkdirSync(repo)
      git(repo, ['init', '-b', 'main'])
      writeFileSync(join(repo, 'a.txt'), 'a\n')
      git(repo, ['add', 'a.txt'])
      git(repo, ['commit', '-m', 'init'])

      const cordisDir = findHostPackage(DSH_BIN, 'cordis')
      const { Context } = await import(pathToFileURL(join(cordisDir, 'lib/index.js')).href)
      const mod = await import(pathToFileURL(MANAGE_INDEX_PATH).href)
      const routes = new Map()
      const wdSets = []
      const removedNotices = []
      let currentDir = repo
      const rootCtx = new Context()
      rootCtx.plugin({
        name: 'mock-host',
        apply(c) {
          c.provide('webServer', { register: (r) => { routes.set(`${r.kind}:${r.path}`, r.handler); return () => {} } })
          c.provide('connection', { admit: () => ({ peer: null }) })
          c.provide('agents', { list: () => [], get: () => undefined, create: async () => {} })
          c.provide('workingDirectory', {
            get: () => currentDir,
            set: async (_agent, nextPath) => { currentDir = nextPath; wdSets.push(nextPath); return nextPath },
          })
        },
      })
      rootCtx.plugin(mod)
      await new Promise((r) => setTimeout(r, 25))
      const handler = routes.get(`prefix:${MANAGE_CORE.WORKTREE_MANAGE_RPC_CHANNEL}`)
      const rpcPost = async (method, payload) => {
        const req = Readable.from([Buffer.from(JSON.stringify({ type: 'client-request', rpcId: method, method, payload }), 'utf8')])
        req.url = `${MANAGE_CORE.WORKTREE_MANAGE_RPC_CHANNEL}/${method}`
        req.method = 'POST'
        req.headers = { 'content-type': 'application/json' }
        const res = new EventEmitter()
        const chunks = []
        res.writeHead = () => {}
        res.end = (b) => { if (b) chunks.push(Buffer.isBuffer(b) ? b : Buffer.from(String(b))); res.writableEnded = true }
        await handler(req, res)
        return JSON.parse(Buffer.concat(chunks).toString('utf8')).result
      }

      assert.equal((await rpcPost('stage-session', { sessionId: 's-hook-1', enabled: true, path: repo, baseRef: 'main' })).ok, true)
      const maintenancePromises = []
      const fakeAgent = {
        session: { id: 's-hook-1', header: { id: 's-hook-1', cwd: repo, delegationDepth: 0 } },
        inbox: {
          nextStep: [{ id: 'wd-notice-1', source: { kind: 'working-directory' }, content: 'changed' }],
          remove: (id) => { removedNotices.push(id) },
        },
        runMaintenance: (fn) => {
          const ac = new AbortController()
          const p = Promise.resolve().then(() => fn(ac.signal))
          maintenancePromises.push(p)
          return p
        },
      }
      rootCtx.emit('agent/inbox/inserted', { agent: fakeAgent, message: { content: 'Implement auth guard' } })
      await Promise.all(maintenancePromises)
      assert.equal(wdSets.length, 1)
      assert.ok(wdSets[0].includes('repo-wt'))
      assert.equal((await rpcPost('session-stage', { sessionId: 's-hook-1' })).value.status, 'created')

      const userMsg = { id: 'u1', source: { kind: 'user' }, content: 'Implement auth guard' }
      const preStepDecision = await rootCtx.waterfall('agent/pre-step', {
        agent: fakeAgent,
        messages: [userMsg],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
      }, async () => ({ kind: 'enter', messages: [userMsg] }))
      assert.equal(preStepDecision.kind, 'enter')
      assert.equal(preStepDecision.messages.length, 2)
      assert.deepEqual(removedNotices, ['wd-notice-1'])

      // Error hold rejects turn & unblocks when user cancels worktree mode
      await rpcPost('stage-session', { sessionId: 's-hook-2', enabled: true, path: repo, baseRef: 'main', branch: 'main' })
      const errMaint = []
      const errAgent = {
        session: { id: 's-hook-2', header: { id: 's-hook-2', cwd: repo, delegationDepth: 0 } },
        inbox: { nextStep: [], remove: () => {} },
        runMaintenance: (fn) => {
          const p = Promise.resolve().then(() => fn(new AbortController().signal))
          errMaint.push(p)
          return p
        },
      }
      rootCtx.emit('agent/inbox/inserted', { agent: errAgent, message: { content: 'bad' } })
      await new Promise((r) => setTimeout(r, 80))
      const errStage = (await rpcPost('session-stage', { sessionId: 's-hook-2' })).value
      assert.equal(errStage.status, 'error')
      const rejectDec = await rootCtx.waterfall('agent/pre-step', {
        agent: errAgent,
        messages: [userMsg],
        turn: 1,
        step: 1,
        signal: new AbortController().signal,
      }, async () => ({ kind: 'enter', messages: [userMsg] }))
      assert.equal(rejectDec.kind, 'reject')
      await rpcPost('stage-session', { sessionId: 's-hook-2', enabled: false })
      await Promise.all(errMaint)
    } finally {
      process.argv[1] = oldArgv1
      rmSync(tmp, { recursive: true, force: true })
    }
  }
  void wtMod
})
