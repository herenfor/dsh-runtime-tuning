import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const {
  MAX_SIDEBAR_URL_LENGTH,
  SIDEBAR_OPEN_TOOL,
  createSidebarOpenToolDefinition,
  executeOpenSidebar,
  formatOpenSidebarResult,
  parseSidebarUrl,
  toSidebarAddressPath,
  validateSidebarArgs,
} = await import('../plugins/sidebar-open.mjs')

const CLIENT_FILE = new URL('../ui-sidebar-open/client.js', import.meta.url)
const MANIFEST_FILE = new URL('../ui-sidebar-open/package.json', import.meta.url)

function findDshBin() {
  const candidates = [
    process.env.DSH_BIN,
    join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js'),
    join(homedir(), '.local/bin/dsh'),
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p))
}

function makeObservable(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    set: (next) => { value = next; for (const fn of [...listeners]) fn() },
  }
}

function loadClientModule({ requireMap = {}, storageMap = new Map(), nowStart = 1_000_000 } = {}) {
  let registered
  const sandbox = {
    window: {
      __ModuleLoader__: { load: (reg) => { registered = reg } },
      open: (u, t, f) => { sandbox._windowOpens.push([u, t, f]) },
    },
    _windowOpens: [],
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => { storageMap.set(k, String(v)) },
    },
    Date: Object.assign((...a) => new Date(...a), { now: () => nowStart }),
    setTimeout,
    clearTimeout,
    URL,
    Error,
    Map,
    Set,
    Array,
    Object,
    Number,
    String,
    Boolean,
    JSON,
    encodeURIComponent,
  }
  vm.runInNewContext(readFileSync(CLIENT_FILE, 'utf8'), sandbox, { filename: 'ui-sidebar-open/client.js' })
  assert.equal(registered.id, '@herenfor/dsh-tune-sidebar-open')
  const mod = registered.factory((id) => {
    if (Object.hasOwn(requireMap, id)) return requireMap[id]
    throw new Error(`missing test require: ${id}`)
  })
  return { mod, windowOpens: sandbox._windowOpens, storageMap }
}

test('L1: validateSidebarArgs and parseSidebarUrl reject invalid combinations cleanly', () => {
  assert.deepEqual(validateSidebarArgs({ path: 'docs/report.html', line: 12, destination: 'float' }), {
    kind: 'file', path: 'docs/report.html', line: 12, destination: 'float',
  })
  assert.deepEqual(validateSidebarArgs({ url: 'http://127.0.0.1:3000/app#ok' }), {
    kind: 'url', url: 'http://127.0.0.1:3000/app#ok',
  })
  for (const bad of [
    null, {}, { path: 'a', url: 'https://x.com' }, { path: '   ' },
    { path: 'a', line: 0 }, { path: 'a', line: 1.5 }, { path: 'a', destination: 'tab' },
    { url: 'localhost:3000' }, { url: 'file:///etc/passwd' }, { url: 'https://user:pw@example.com' },
    { url: 'https://example.com/' + 'a'.repeat(MAX_SIDEBAR_URL_LENGTH) },
    { url: 'https://example.com', line: 5 }, { url: 'https://example.com', destination: 'float' },
  ]) {
    assert.throws(() => validateSidebarArgs(bad), /Error|url|path|line|destination|arguments|open_sidebar/)
  }
  assert.equal(parseSidebarUrl('  https://example.com/test  '), 'https://example.com/test')
})

test('L1: toSidebarAddressPath & executeOpenSidebar resolve workspace-relative, sub-cwd, and external paths', async () => {
  assert.equal(toSidebarAddressPath('/home/u/repo/docs/index.html', '/home/u/repo'), 'docs/index.html')
  assert.equal(toSidebarAddressPath('C:\\repo\\sub\\a.md', 'C:\\repo'), 'sub/a.md')
  assert.equal(toSidebarAddressPath('/tmp/out.html', '/home/u/repo'), '/tmp/out.html')
  assert.equal(toSidebarAddressPath('/var/log/a.txt', '/'), '/var/log/a.txt')

  const files = new Map([
    ['/ws/docs/report.html', { type: 'file' }],
    ['/ws/docs', { type: 'dir' }],
    ['/outside/note.md', { type: 'file' }],
  ])
  const deps = {
    workingDirectory: { ensure: async () => '/ws/docs' },
    fs: {
      lstat: async (p, opts) => files.get(p.startsWith('/') ? p : `${opts.cwd}/${p}`),
      resolve: async (p, opts) => (p.startsWith('/') ? p : `${opts.cwd}/${p}`),
      stat: async (t) => files.get(t),
      processPath: (t) => t,
    },
    now: () => 12345,
  }
  const exec = { agent: { session: { header: { cwd: '/ws' } } } }

  const res1 = await executeOpenSidebar({ path: 'report.html', line: 7 }, exec, deps)
  assert.deepEqual(res1, {
    kind: 'file', path: 'docs/report.html', absolutePath: '/ws/docs/report.html', line: 7, openedAt: 12345,
  })
  assert.match(formatOpenSidebarResult(res1), /^Opened docs\/report\.html:7 in right sidebar preview/)

  const res2 = await executeOpenSidebar({ path: '/outside/note.md' }, exec, deps)
  assert.equal(res2.path, '/outside/note.md')

  await assert.rejects(() => executeOpenSidebar({ path: '/ws/docs' }, exec, deps), (e) => e.code === 'FS_NOT_REGULAR_FILE')
  await assert.rejects(() => executeOpenSidebar({ path: '/tmp/missing.html' }, exec, deps), /Sandbox \/tmp/)

  const def = createSidebarOpenToolDefinition(deps)
  assert.equal(def.name, SIDEBAR_OPEN_TOOL)
  assert.deepEqual(def.output.presentationMeta({}, res1), { tool: SIDEBAR_OPEN_TOOL, ...res1 })
})

test('L1: client.js opens on screen immediately, queues off-screen until mounted switch + seat adoption, and skips history', async () => {
  const storageMap = new Map()
  const { mod, windowOpens } = loadClientModule({ storageMap, nowStart: 5000 })
  assert.deepEqual([...mod.inject], ['sessions', 'sidebarRight'])

  const mounted = makeObservable('s1')
  const bindings = new Map()
  const list = makeObservable({ ids: ['s1', 's2', 's3'], byId: { s1: {}, s2: {}, s3: {} } })
  const makeBinding = (id, initialEntries = []) => {
    const src = makeObservable({ entries: initialEntries, hasMore: false, revision: 0, change: { kind: 'replace', entries: initialEntries } })
    return {
      sessionId: id,
      eventSource: src,
      push(kind, entries) {
        const prev = src.getSnapshot()
        const all = kind === 'append' ? [...prev.entries, ...entries] : kind === 'prepend' ? [...entries, ...prev.entries] : entries
        src.set({ entries: all, hasMore: false, revision: prev.revision + 1, change: { kind, entries } })
      },
    }
  }
  const ev = (callId, time, meta, type = 'tool/result') => ({
    type: 'event',
    event: type === 'tool/result'
      ? { type, seq: 1, time, data: { message: { isError: false, source: { callId } }, meta } }
      : { type, seq: 2, time, data: { subCallId: callId, name: SIDEBAR_OPEN_TOOL, isError: false, meta } },
  })
  const b1 = makeBinding('s1', [ev('old-call', 1000, { tool: SIDEBAR_OPEN_TOOL, kind: 'file', path: 'old.md', openedAt: 1000 })])
  const b2 = makeBinding('s2')
  bindings.set('s1', b1)
  bindings.set('s2', b2)

  let adoptedSession = 's1'
  let browserEnabled = true
  const openedResources = []
  const openedTabs = []
  const disposers = []
  const ctx = {
    sessions: { list, binding: (id) => bindings.get(id) },
    sidebarRight: {
      mounted,
      openResource: (addr, opts) => {
        if (adoptedSession !== mounted.getSnapshot()) throw new Error('sidebarRight: no session surface is mounted')
        openedResources.push([mounted.getSnapshot(), addr, opts])
      },
      openTab: (kind, opts) => {
        if (adoptedSession !== mounted.getSnapshot()) throw new Error('sidebarRight: no session surface is mounted')
        openedTabs.push([mounted.getSnapshot(), kind, opts])
      },
    },
    get: (k) => (k === 'sidebarRightTabs' ? { get: (id) => (id === 'browser' && browserEnabled ? {} : undefined) } : undefined),
    inject: () => {},
    effect: (fn) => { const d = fn(); if (typeof d === 'function') disposers.push(d) },
  }
  mod.apply(ctx)

  // Historical event in s1 (< bootTime) is NOT opened; prepend paging is NOT opened.
  assert.equal(openedResources.length, 0)
  b1.push('prepend', [ev('paged-old', 9999, { tool: SIDEBAR_OPEN_TOOL, kind: 'file', path: 'paged.md', openedAt: 9999 })])
  assert.equal(openedResources.length, 0)

  // Live file + PTC dispatch on active session s1 open immediately.
  b1.push('append', [ev('c1', 5100, { tool: SIDEBAR_OPEN_TOOL, kind: 'file', path: 'docs/a b.html', line: 3, destination: 'float', openedAt: 5100 })])
  b1.push('append', [ev('c2', 5200, { tool: SIDEBAR_OPEN_TOOL, kind: 'url', url: 'http://127.0.0.1:4173/', openedAt: 5200 }, 'tool/ptc-dispatch')])
  const plain = (v) => JSON.parse(JSON.stringify(v))
  assert.deepEqual(plain(openedResources), [['s1', 'dsh-resource://file/session/s1/docs/a%20b.html', { params: { line: 3 }, destination: 'float' }]])
  assert.deepEqual(plain(openedTabs), [['s1', 'browser', { params: { url: 'http://127.0.0.1:4173/' } }]])

  // Background session s2 finishes off-screen: must NOT open while s1 is mounted.
  b2.push('append', [ev('c3', 5300, { tool: SIDEBAR_OPEN_TOOL, kind: 'file', path: 'chart.svg', openedAt: 5300 })])
  assert.equal(openedResources.length, 1)

  // Switch mounted to s2 BEFORE seat adopts s2, then adopt asynchronously on next tick: retry opens once.
  mounted.set('s2')
  assert.equal(openedResources.length, 1)
  adoptedSession = 's2'
  await new Promise((r) => setTimeout(r, 35))
  assert.deepEqual(plain(openedResources[1]), ['s2', 'dsh-resource://file/session/s2/chart.svg', {}])

  // Unretained background session s3 executes while off-screen (>= bootTime) -> opens on switch, ignored on reload/second visit.
  const b3 = makeBinding('s3', [ev('c4', 6000, { tool: SIDEBAR_OPEN_TOOL, kind: 'file', path: 'out.pdf', openedAt: 6000 })])
  bindings.set('s3', b3)
  list.set({ ids: ['s1', 's2', 's3'], byId: { s1: {}, s2: {}, s3: {} } })
  adoptedSession = 's3'
  mounted.set('s3')
  assert.deepEqual(plain(openedResources[2]), ['s3', 'dsh-resource://file/session/s3/out.pdf', {}])

  // Re-opening s3 after reload with same handled storage must NOT duplicate-open even if nowStart === 5000.
  const second = loadClientModule({ storageMap, nowStart: 5000 })
  const reopened = []
  second.mod.apply({
    sessions: { list, binding: (id) => bindings.get(id) },
    sidebarRight: { mounted, openResource: (...a) => reopened.push(a), openTab: () => {} },
    get: () => undefined,
    inject: () => {},
    effect: () => {},
  })
  assert.equal(reopened.length, 0)
  for (const d of disposers) d()
  assert.equal(windowOpens.length, 0)
})

test('L1: client.js registers clickable tool.call.toolview row and falls back to window.open on manual click if browser tab is disabled', () => {
  const registeredSlots = []
  const opened = []
  const { mod, windowOpens } = loadClientModule({
    requireMap: {
      react: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), useState: (v) => [v, () => {}] },
      '@deepseek-ai/dsh-client-ui-primitives': { DisclosureRow: 'DisclosureRow', IconBrowseOutlineRegular: 'IconBrowse' },
    },
  })
  const mounted = makeObservable('s1')
  const list = makeObservable({ ids: [], byId: {} })
  const ctx = {
    sessions: { list, binding: () => undefined },
    sidebarRight: { mounted, openResource: (...a) => opened.push(['res', ...a]), openTab: (...a) => opened.push(['tab', ...a]) },
    get: () => undefined,
    inject: (_services, fn) => fn({
      locale: { register: () => () => {} },
      slots: { inject: (_s, fac) => fac(), register: (def, comp) => { registeredSlots.push([def, comp]); return () => {} } },
      effect: () => {},
    }),
    effect: () => {},
  }
  mod.apply(ctx)
  assert.equal(registeredSlots.length, 1)
  assert.equal(registeredSlots[0][0].key, SIDEBAR_OPEN_TOOL)
  const Row = registeredSlots[0][1]
  const tree = Row({ phase: 'result', block: { kind: 'tool-result', isError: false, content: [{ type: 'text', text: 'ok' }], meta: { kind: 'url', url: 'http://127.0.0.1:8080/' }, call: { argsRaw: '{}' } }, t: (k) => k })
  const findButtons = (n) => (!n || typeof n !== 'object' ? [] : [...(n.type === 'button' ? [n] : []), ...(Array.isArray(n.props?.children) ? n.props.children.flatMap(findButtons) : [])])
  const buttons = findButtons(tree)
  assert.equal(buttons.length, 1)
  buttons[0].props.onClick()
  assert.deepEqual(JSON.parse(JSON.stringify(windowOpens)), [['http://127.0.0.1:8080/', '_blank', 'noopener,noreferrer']])
  assert.equal(opened.length, 0)
})

test('L2: real DSH dsh-tools / dsh-util-workspace-path / dsh-client-modules / documentpreview contracts match', async (t) => {
  const bin = findDshBin()
  if (!bin) return t.skip('host DSH install absent')
  const { findHostPackage } = await import('../plugins/chat-answer-fix.mjs')
  const load = (pkg) => import(pathToFileURL(join(findHostPackage(bin, pkg), 'lib/index.js')).href)
  const loadClient = (pkg) => import(pathToFileURL(join(findHostPackage(bin, pkg), 'lib/client.js')).href)

  const [{ defineTool, ToolArgsError }, { FsError }, wsPath, clientModules, previewClient, browserUrl] = await Promise.all([
    load('dsh-tools'),
    load('dsh-fs'),
    load('dsh-util-workspace-path'),
    load('dsh-client-modules'),
    loadClient('dsh-client-ui-sidebar-documentpreview').catch(() => null),
    import(pathToFileURL(join(findHostPackage(bin, 'dsh-client-ui-sidebar-browser'), 'src/client/browser/url.ts')).href).catch(() => null),
  ])

  // 1. Validate tool definition passes real dsh-tools defineTool(), schema check, execute(), and presentationMeta()
  const def = createSidebarOpenToolDefinition({ defineTool, ToolArgsError, FsError, fs: {}, workingDirectory: {}, now: () => 42 })
  assert.equal(def.name, SIDEBAR_OPEN_TOOL)
  assert.equal(typeof def.output.render, 'function')
  assert.equal(typeof def.output.presentationMeta, 'function')
  assert.equal(def.isConcurrencySafe({ path: 'a.html' }), true)
  const urlVal = await def.execute({ url: 'https://example.com/demo' }, {})
  assert.deepEqual(urlVal, { kind: 'url', url: 'https://example.com/demo', openedAt: 42 })
  assert.deepEqual(def.output.presentationMeta({ url: 'https://example.com/demo' }, urlVal), { tool: SIDEBAR_OPEN_TOOL, ...urlVal })
  await assert.rejects(() => def.execute({ path: 123 }, {}), (e) => e instanceof ToolArgsError)

  // 2. Validate dsh.client manifest of ui-sidebar-open parses cleanly with real dsh-client-modules
  const pkgJson = JSON.parse(readFileSync(MANIFEST_FILE, 'utf8'))
  const decl = clientModules.parseDshClient?.(pkgJson.name, pkgJson.dsh?.client)
  if (decl) {
    assert.equal(decl.platform, 'web')
    assert.ok(Array.isArray(decl.inject) && decl.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'))
  }

  // 3. Validate constructed sessionFileAddress round-trips with real parseFileAddress (workspace-relative & /tmp POSIX)
  for (const [abs, root, expectedPath] of [
    ['/home/u/ws/docs/chart.html', '/home/u/ws', 'docs/chart.html'],
    ['/tmp/out.html', '/home/u/ws', '/tmp/out.html'],
  ]) {
    const relOrPosix = toSidebarAddressPath(abs, root)
    assert.equal(relOrPosix, expectedPath)
    const addr = wsPath.sessionFileAddress('wsl:s1', relOrPosix)
    assert.deepEqual(wsPath.parseFileAddress(addr), { scope: 'session', sessionId: 'wsl:s1', path: expectedPath })
    if (previewClient) assert.ok(addr.startsWith('dsh-resource://file/session/'))
  }

  // 4. Confirm parseBrowserAddress alignment when src helper is importable or URL rules hold
  if (browserUrl?.parseBrowserAddress) {
    assert.equal(browserUrl.parseBrowserAddress(parseSidebarUrl('http://127.0.0.1:4173/')).ok, true)
  }
})
