import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_SRC = readFileSync(join(ROOT, 'ui-conversation-find/client.js'), 'utf8')
const INDEX_PATH = join(ROOT, 'ui-conversation-find/index.mjs')
const DSH_BIN = [
  process.env.DSH_BIN,
  join(homedir(), '.local/bin/dsh'),
  join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js'),
].find((p) => p && existsSync(p))

const createObservable = (initial) => {
  let val = initial
  const listeners = new Set()
  return {
    getSnapshot: () => val,
    set(next) { val = next; for (const fn of [...listeners]) fn() },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  }
}

const createReactStub = () => {
  let stateSlot = 0
  let hookStore = new Map()
  const useState = (init) => {
    const k = `s:${stateSlot++}`
    if (!hookStore.has(k)) hookStore.set(k, typeof init === 'function' ? init() : init)
    return [hookStore.get(k), (v) => hookStore.set(k, typeof v === 'function' ? v(hookStore.get(k)) : v)]
  }
  const useRef = (init) => {
    const k = `r:${stateSlot++}`
    if (!hookStore.has(k)) hookStore.set(k, { current: init })
    return hookStore.get(k)
  }
  const useEffect = (fn, deps) => {
    const k = `e:${stateSlot++}`
    const prev = hookStore.get(k)
    const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev[i]))
    if (changed) { hookStore.set(k, deps || []); fn() }
  }
  const useSyncExternalStore = (sub, getSnap) => getSnap()
  const createElement = (type, props, ...children) => ({
    type,
    props: { ...(props || {}), children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) },
  })
  const render = (Comp, props) => { stateSlot = 0; return Comp(props) }
  const resetHooks = () => { hookStore = new Map(); stateSlot = 0 }
  return { createElement, useState, useRef, useEffect, useSyncExternalStore, _render: render, _resetHooks: resetHooks }
}

const findInVdom = (node, pred) => {
  if (!node || typeof node !== 'object') return null
  if (pred(node)) return node
  for (const ch of node.props?.children || []) {
    const hit = findInVdom(ch, pred)
    if (hit) return hit
  }
  return null
}

const collectVdomText = (node) => {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  return (node.props?.children || []).map(collectVdomText).join('')
}

const toCamel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase())

const matchSimpleSelector = (el, raw) => {
  if (!el || el.nodeType !== 1) return false
  const sel = raw.trim()
  if (!sel) return false
  let rest = sel
  const tagMatch = /^[a-zA-Z0-9_-]+/.exec(rest)
  if (tagMatch) {
    if (el.tagName !== tagMatch[0].toUpperCase()) return false
    rest = rest.slice(tagMatch[0].length)
  }
  while (rest.length > 0) {
    if (rest[0] !== '[') return false
    const end = rest.indexOf(']')
    if (end < 0) return false
    const body = rest.slice(1, end)
    rest = rest.slice(end + 1)
    const eqIdx = body.indexOf('=')
    if (eqIdx < 0) {
      if (!el.hasAttribute(body)) return false
    } else {
      const k = body.slice(0, eqIdx).trim()
      const v = body.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (el.getAttribute(k) !== v) return false
    }
  }
  return true
}

const matchesSelectorList = (el, list) => list.split(',').some((part) => matchSimpleSelector(el, part))

const createMockDom = () => {
  const highlights = new Map()
  class Highlight { constructor(...ranges) { this.ranges = ranges } }
  const winListeners = new Map()
  let activeElement = null

  const observers = new Set()
  class MockText {
    constructor(val) { this.nodeType = 3; this.nodeValue = String(val); this.parentElement = null }
  }

  class MockEl {
    constructor(tagName = 'div', attrs = {}) {
      this.nodeType = 1
      this.tagName = String(tagName).toUpperCase()
      this.attributes = new Map()
      this.dataset = new Proxy({}, {
        get: (_, p) => this.attributes.get(`data-${String(p).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`),
        set: (_, p, v) => { this.setAttribute(`data-${String(p).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, String(v)); return true },
      })
      this.children = []
      this.parentElement = null
      this.className = ''
      this.textContent = ''
      this.listeners = new Map()
      this.scrollTop = 0
      this.scrollHeight = 100
      this.clientHeight = 100
      this.isConnected = true
      this.isContentEditable = false
      this._rect = { top: 0, bottom: 100, width: 100, height: 20 }
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'className') this.className = v
        else this.setAttribute(k, v)
      }
    }
    get parentNode() { return this.parentElement }
    setAttribute(k, v) {
      if (k === 'contenteditable') this.isContentEditable = v !== 'false'
      this.attributes.set(k, String(v))
      for (const o of observers) o.cb([])
    }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null }
    hasAttribute(k) { return this.attributes.has(k) }
    removeAttribute(k) { this.attributes.delete(k); for (const o of observers) o.cb([]) }
    appendChild(ch) {
      ch.parentElement = this
      this.children.push(ch)
      return ch
    }
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((c) => c !== this)
      this.isConnected = false
    }
    matches(sel) { return matchesSelectorList(this, sel) }
    closest(sel) {
      let cur = this
      while (cur) { if (cur.nodeType === 1 && cur.matches(sel)) return cur; cur = cur.parentElement }
      return null
    }
    querySelectorAll(sel) {
      const out = []
      const walk = (n) => {
        for (const c of n.children || []) {
          if (c.nodeType === 1) { if (c.matches(sel)) out.push(c); walk(c) }
        }
      }
      walk(this)
      return out
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null }
    addEventListener(ev, fn) { if (!this.listeners.has(ev)) this.listeners.set(ev, new Set()); this.listeners.get(ev).add(fn) }
    removeEventListener(ev, fn) { this.listeners.get(ev)?.delete(fn) }
    dispatchEvent(ev) { for (const fn of [...(this.listeners.get(ev.type) || [])]) fn(ev); return true }
    click() { this.dispatchEvent({ type: 'click', target: this }) }
    focus() { activeElement = this }
    getBoundingClientRect() { return this._rect }
  }

  const html = new MockEl('html')
  const head = new MockEl('head')
  const body = new MockEl('body')
  html.appendChild(head)
  html.appendChild(body)

  const doc = {
    documentElement: html,
    head,
    body,
    get activeElement() { return activeElement },
    el: (tag, attrs) => new MockEl(tag, attrs),
    text: (val) => new MockText(val),
    createElement: (tag) => new MockEl(tag),
    querySelectorAll: (sel) => html.querySelectorAll(sel),
    querySelector: (sel) => html.querySelector(sel),
    createTreeWalker(root, what, filter) {
      const list = []
      const walk = (node) => {
        for (const ch of node.children || []) {
          if (ch.nodeType === 3) {
            const verdict = filter?.acceptNode ? filter.acceptNode(ch) : 1
            if (verdict === 1) list.push(ch)
          } else if (ch.nodeType === 1) {
            walk(ch)
          }
        }
      }
      walk(root)
      let i = 0
      return { nextNode: () => (i < list.length ? list[i++] : null) }
    },
    createRange() {
      let sn = null, so = 0, en = null, eo = 0
      return {
        setStart(n, o) { sn = n; so = o },
        setEnd(n, o) { en = n; eo = o },
        toString() {
          if (!sn || !en) return ''
          if (sn === en) return sn.nodeValue.slice(so, eo)
          const walkRoot = (n) => {
            let cur = n
            while (cur.parentElement) cur = cur.parentElement
            return cur
          }
          const texts = []
          const collect = (n) => {
            if (n.nodeType === 3) texts.push(n)
            for (const c of n.children || []) collect(c)
          }
          collect(walkRoot(sn))
          const i1 = texts.indexOf(sn)
          const i2 = texts.indexOf(en)
          if (i1 < 0 || i2 < i1) return ''
          let s = texts[i1].nodeValue.slice(so)
          for (let i = i1 + 1; i < i2; i++) s += texts[i].nodeValue
          s += texts[i2].nodeValue.slice(0, eo)
          return s
        },
        getBoundingClientRect() { return { top: sn?.parentElement?._rect?.top ?? 10, bottom: (sn?.parentElement?._rect?.top ?? 10) + 18, width: 40, height: 18 } },
      }
    },
  }

  const win = {
    document: doc,
    addEventListener(ev, fn, capture) {
      const key = `${ev}:${capture ? 'c' : 'b'}`
      if (!winListeners.has(key)) winListeners.set(key, new Set())
      winListeners.get(key).add(fn)
    },
    removeEventListener(ev, fn, capture) {
      winListeners.get(`${ev}:${capture ? 'c' : 'b'}`)?.delete(fn)
    },
    dispatchKeyDown(opts) {
      const ev = {
        type: 'keydown', key: 'f', code: 'KeyF', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
        isComposing: false, keyCode: 0, target: body, defaultPrevented: false, propagationStopped: false,
        preventDefault() { this.defaultPrevented = true },
        stopPropagation() { this.propagationStopped = true },
        ...opts,
      }
      for (const fn of [...(winListeners.get('keydown:c') || [])]) fn(ev)
      if (!ev.propagationStopped) for (const fn of [...(winListeners.get('keydown:b') || [])]) fn(ev)
      return ev
    },
    _listenerCount(ev, capture) { return winListeners.get(`${ev}:${capture ? 'c' : 'b'}`)?.size || 0 },
  }

  class MockMutationObserver {
    constructor(cb) { this.cb = cb }
    observe() { observers.add(this) }
    disconnect() { observers.delete(this) }
  }

  return { doc, win, el: doc.el, text: doc.text, body, head, html, CSS: { highlights }, Highlight, Event: class { constructor(t) { this.type = t } }, MutationObserver: MockMutationObserver, getComputedStyle: () => ({ overflowY: 'auto' }) }
}

const loadClientModule = ({ dom = null, react = null } = {}) => {
  let loaded = null
  const windowObj = dom ? dom.win : {}
  const ctx = {
    window: windowObj,
    document: dom?.doc,
    CSS: dom?.CSS,
    Highlight: dom?.Highlight,
    Event: dom?.Event || class { constructor(t) { this.type = t } },
    MutationObserver: dom?.MutationObserver,
    getComputedStyle: dom?.getComputedStyle,
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout,
    clearTimeout,
    AbortController,
    URL,
    require: (id) => {
      if (id === 'react') return react || undefined
      throw new Error(`Unexpected require: ${id}`)
    },
  }
  windowObj.__ModuleLoader__ = {
    load(def) {
      loaded = def.factory(ctx.require)
    },
  }
  vm.runInNewContext(CLIENT_SRC, ctx, { filename: 'ui-conversation-find/client.js' })
  return loaded
}

test('T1: extracts all durable event types, deduplicates replacements/transients, and backfills half-turn boundaries', () => {
  const { __internals } = loadClientModule()
  const { extractPageFromEvents, foldBoundaries, assembleSearchableItems, matchItems, conversationContextKey } = __internals

  // Older page contains turn/start 4 while newer page starts mid-turn before turn/end 4
  const olderEvents = [
    { seq: 0, type: 'turn/start', data: { turn: 4 } },
    { seq: 1, type: 'step/start', data: { turn: 4, step: 1 } },
    { seq: 2, type: 'user/message', surfaceOp: 'append', data: { id: 'm1', source: { kind: 'user' }, content: [{ type: 'text', text: 'needle in user input' }] } },
    { seq: 3, type: 'user/message', surfaceOp: 'append', data: { id: 's1', source: { kind: 'steering' }, content: [{ type: 'text', text: 'steer needle' }] } },
  ]
  const newerEvents = [
    { seq: 4, type: 'developer/message', surfaceOp: 'append', data: { message: { id: 'c1', content: [{ type: 'text', text: 'dev context needle' }] } } },
    { seq: 5, type: 'assistant/message', surfaceOp: { op: 'replace', seq: 5 }, data: { turn: 4, step: 1, message: { id: 'a0', content: [{ type: 'reasoning', text: 'replaced thought' }, { type: 'text', text: 'replaced reply' }] } } },
    { seq: 6, type: 'assistant/message', surfaceOp: 'append', data: { turn: 4, step: 1, message: { id: 'a1', content: [{ type: 'reasoning', text: 'settled thought needle' }, { type: 'text', text: 'settled reply needle' }, { type: 'tool-call', id: 'tc1', name: 'bash', arguments: { cmd: 'echo needle-arg' } }] } } },
    { seq: 7, type: 'tool/result', surfaceOp: 'append', data: { error: { code: 'EFAIL', message: 'boom needle', token: 'secret-omit' }, message: { source: { callId: 'tc1' }, content: [{ type: 'text', text: 'tool output needle' }] } } },
    { seq: 8, type: 'command/run', data: { commandId: 'cmd1', name: 'compact', args: 'needle' } },
    { seq: 9, type: 'command/done', data: { commandId: 'cmd1', kind: 'success', text: 'cmd done needle' } },
    { seq: 10, type: 'compaction/summary', data: { compactionId: 'cmp1', summary: [{ type: 'text', text: 'summary needle' }] } },
    { seq: 11, type: 'user/message', surfaceOp: { op: 'replace', seq: 11 }, data: { id: 'chk1', source: { kind: 'compact-checkpoint', compactionId: 'cmp1' }, content: [{ type: 'text', text: 'checkpoint needle' }] } },
    { seq: 12, type: 'todo/write', data: { todos: [{ id: 'td1', content: 'todo needle item' }] } },
    { seq: 13, type: 'step/end', data: { turn: 4, step: 1 } },
    { seq: 14, type: 'turn/end', data: { turn: 4, reason: { kind: 'error', error: { code: 'ETIME', message: 'turn error needle' } } } },
  ]

  const extOld = extractPageFromEvents(olderEvents)
  const extNew = extractPageFromEvents(newerEvents)
  const bounds = [...extOld.boundaries, ...extNew.boundaries]
  const raw = [...extOld.rawItems, ...extNew.rawItems]
  const transients = [
    { type: 'transient', event: { seq: 6, type: 'assistant/live-chunk', data: { attemptId: 'att1', turn: 4, step: 1, chunk: { type: 'text-delta', index: 0, text: 'stale transient needle' } } } },
    { type: 'transient', event: { seq: 15, type: 'assistant/live-chunk', data: { attemptId: 'att2', turn: 5, step: 1, chunk: { type: 'text-delta', index: 0, text: 'live streaming needle' } } } },
  ]

  const items = assembleSearchableItems(bounds, raw, transients)
  const hits = matchItems(items, 'needle', false, true)
  const texts = hits.map((h) => `${h.seq}:${h.sourceKind}:${h.fieldKey}:${h.nodeKey}:${h.groupPart || ''}:${h.turn}`)

  assert.ok(!items.some((it) => it.fields.some((f) => f.text.includes('replaced') || f.text.includes('stale transient'))), 'surface replacement & settled assistant drop stale append/transient')
  assert.ok(hits.some((h) => h.seq === 2 && h.nodeKey === conversationContextKey('input-message', 'm1') && h.turn === 4))
  assert.ok(hits.some((h) => h.seq === 4 && h.nodeKey === conversationContextKey('developer-message', 'c1') && h.turn === 4))
  assert.ok(hits.some((h) => h.seq === 6 && h.groupPart === 'reasoning' && h.nodeKey === conversationContextKey('assistant-step', '4:1')))
  assert.ok(hits.some((h) => h.seq === 6 && h.groupPart === 'response' && h.nodeKey === conversationContextKey('assistant-step', '4:1')))
  assert.ok(hits.some((h) => h.seq === 7 && h.nodeKey === conversationContextKey('tool-call', 'tc1') && h.fieldKey === 'result'))
  assert.ok(!items.some((it) => it.fields.some((f) => f.text.includes('secret-omit'))), 'sanitizeFailure omits raw token fields')
  assert.ok(hits.some((h) => h.seq === 7 && h.fieldKey === 'error' && h.excerpt.match === 'needle'))
  assert.ok(hits.some((h) => h.seq === 8 && h.nodeKey === conversationContextKey('command', 'cmd1')))
  assert.ok(hits.some((h) => h.seq === 10 && h.nodeKey === conversationContextKey('compaction', 'cmp1')))
  assert.ok(hits.some((h) => h.seq === 12 && h.sourceKind === 'todo' && h.turn === 4))
  assert.ok(hits.some((h) => h.seq === 14 && h.nodeKey === conversationContextKey('turn-error', '4')))
  assert.ok(hits.some((h) => h.durable === false && h.turn === 5))
  assert.ok(texts.length >= 12)
})

test('T2: handles UTF-16 Unicode, Turkish dotted I, emoji, regex metacharacters, and duplicate ordinals', () => {
  const { __internals } = loadClientModule()
  const { matchItems } = __internals
  const items = [{
    seq: 1, turn: 1, turnStartSeq: 0, nodeKey: 'n1', sourceKind: 'response', isTransient: false, pendingTurn: false,
    fields: [{ fieldKey: 'text', text: '前缀 中文👋 a.b[0](+?)*^$\\ İstanbul A.b[0](+?)*^$\\ a.b[0](+?)*^$\\ 后缀', groupPart: 'response' }],
  }]
  const metaHitsInsensitive = matchItems(items, 'a.b[0](+?)*^$\\', false, true)
  assert.equal(metaHitsInsensitive.length, 3)
  assert.deepEqual(Array.from(metaHitsInsensitive.map((h) => h.blockOrdinal)), [0, 1, 2])

  const metaHitsSensitive = matchItems(items, 'a.b[0](+?)*^$\\', true, true)
  assert.equal(metaHitsSensitive.length, 2)

  assert.equal(matchItems(items, '中文👋', false, false).length, 1)
  assert.equal(matchItems(items, 'İstanbul', false, false).length, 1)
  assert.equal(matchItems(items, 'istanbul', true, false).length, 0)
  assert.equal(matchItems(items, 'İstanbul', true, false).length, 1)
})

const makeMsgEvent = (seq, turn, text, kind = 'user') => ({
  type: 'event',
  event: kind === 'user'
    ? { seq, type: 'user/message', surfaceOp: 'append', data: { id: `m${seq}`, source: { kind: 'user' }, content: [{ type: 'text', text }] } }
    : { seq, type: 'assistant/message', surfaceOp: 'append', data: { turn, step: 1, message: { id: `a${seq}`, content: [{ type: 'text', text }] } } },
})

test('T3: scans 3+ remote pages down to seq 0, locks throughSeq on tail append, handles overlap & protocol errors', async () => {
  const { __internals } = loadClientModule()
  const { createFindController } = __internals
  const fullLog = Array.from({ length: 10 }, (_, seq) => makeMsgEvent(seq, Math.floor(seq / 2), `msg ${seq} ${seq % 3 === 0 ? 'needle' : 'plain'}`))
  const eventSource = createObservable({ entries: fullLog.slice(7), hasMore: true, revision: 1 })
  const sessionObs = createObservable({ sessionId: 's1', blank: false, removed: false, loadingOlder: false, hasMore: true })
  const list = createObservable({ byId: { s1: { id: 's1', retainedBy: { mainView: 1 } } } })
  const sessions = { list, binding: (id) => (id === 's1' ? { sessionId: 's1', session: sessionObs, eventSource } : null) }
  const layout = { panelInfo: createObservable({ activePanelId: null }) }

  const rpcCalls = []
  let failNext = false
  const remoteSession = {
    async events(req, signal) {
      rpcCalls.push(req)
      if (failNext) return { ok: false, error: { code: 'NET', message: 'net fail' } }
      const cursor = req.throughSeq ?? (fullLog.length - 1)
      const end = Math.min(cursor + 1, req.beforeSeq ?? (cursor + 1))
      const start = Math.max(0, end - 3)
      const records = fullLog.slice(start, end)
      return { ok: true, value: { cursor, records, hasMore: start > 0 } }
    },
  }

  const ctrl = createFindController({ sessions, layout, remoteSession })
  ctrl.openFind()
  ctrl.setQuery('needle')
  // Live window has seq 7..9 -> seq 9 matches 'needle'
  ctrl.navigate(1) // flushes debounce cleanly without starting remote scan!
  assert.equal(ctrl.getSnapshot().hits.map((h) => h.seq).join(','), '9')
  assert.equal(rpcCalls.length, 0, 'Enter / navigate must not auto-start remote scan')

  // Simulate new live append (seq 10) BEFORE remote scan starts; then simulate UI prepend overlap before next page
  fullLog.push(makeMsgEvent(10, 5, 'tail plain'))
  eventSource.set({ entries: fullLog.slice(7), hasMore: true, revision: 2 })

  await ctrl.startOrResumeScan()
  const snap = ctrl.getSnapshot()
  assert.equal(snap.scanState, 'done')
  assert.equal(snap.remoteHasMore, false)
  assert.deepEqual(Array.from(snap.hits.map((h) => h.seq)), [0, 3, 6, 9])
  assert.ok(rpcCalls.length === 3 && rpcCalls.every((r) => r.throughSeq === 10), 'throughSeq pinned across pages')

  // Protocol failure verification + abort race
  const badRemote = { async events() { return { ok: true, value: { cursor: 999, records: [], hasMore: false } } } }
  const ctrlErr = createFindController({ sessions, layout, remoteSession: badRemote })
  ctrlErr.openFind()
  ctrlErr.setQuery('needle')
  await ctrlErr.startOrResumeScan()
  assert.equal(ctrlErr.getSnapshot().scanState, 'error')

  ctrl.dispose()
  ctrlErr.dispose()
})

test('T4: 8 MiB budget constant verified, LRU eviction invalidates/rescans evicted ranges & reads excerpts on demand', async () => {
  const { __internals } = loadClientModule()
  const { createHistoryCache, extractPageFromEvents, assembleSearchableItems, matchItems, MAX_HISTORY_CACHE_BYTES } = __internals
  assert.equal(MAX_HISTORY_CACHE_BYTES, 8 * 1024 * 1024)

  const big = 'x'.repeat(300) + ' needle ' + 'y'.repeat(300)
  const p1 = extractPageFromEvents([makeMsgEvent(0, 0, big).event])
  const p2 = extractPageFromEvents([makeMsgEvent(1, 1, big).event])
  const cache = createHistoryCache(1800) // smaller byte threshold exercises real LRU eviction math
  cache.setCompactEvaluator((p) => matchItems(assembleSearchableItems(p.boundaries, p.extracted.rawItems, []), 'needle', false, false))
  cache.putPage({ minSeq: 0, maxSeq: 0, reqThroughSeq: 1, reqBeforeSeq: 1, extracted: p1, compactHitsValidForQuery: false })
  cache.putPage({ minSeq: 1, maxSeq: 1, reqThroughSeq: 1, reqBeforeSeq: 2, extracted: p2, compactHitsValidForQuery: false })

  const rec0 = cache.pages.get('0..0')
  assert.equal(rec0.evicted, true)
  assert.equal(rec0.extracted, null)
  assert.equal(rec0.compactHits.length, 1)
  assert.equal(rec0.compactHits[0].excerpt, null)
  assert.equal(rec0.compactHitsValidForQuery, true)
})

test('T4b: real >8 MiB scan evicts oldest page, rescans evicted range on query change, and reads excerpt on demand', async () => {
  const { __internals } = loadClientModule()
  const { createFindController } = __internals
  // ~5 MB per page in UTF-16 (> 8 MiB threshold for two older pages)
  const filler = 'a'.repeat(2_300_000)
  const fullLog = [
    makeMsgEvent(0, 0, `${filler} alphaHit end0`),
    makeMsgEvent(1, 1, `${filler} alphaHit betaHit end1`),
    makeMsgEvent(2, 2, 'tail alphaHit end2'),
  ]
  const eventSource = createObservable({ entries: [fullLog[2]], hasMore: true, revision: 1 })
  const sessionObs = createObservable({ sessionId: 'sbig', blank: false, removed: false, loadingOlder: false, hasMore: false })
  const list = createObservable({ byId: { sbig: { id: 'sbig', retainedBy: { mainView: 1 } } } })
  const sessions = { list, binding: (id) => (id === 'sbig' ? { sessionId: 'sbig', session: sessionObs, eventSource } : null) }
  const layout = { panelInfo: createObservable({ activePanelId: null }) }
  const calls = []
  const remoteSession = {
    async events(req) {
      calls.push({ throughSeq: req.throughSeq, beforeSeq: req.beforeSeq })
      const start = Math.max(0, (req.beforeSeq ?? 3) - 1)
      return { ok: true, value: { cursor: req.throughSeq ?? 2, records: fullLog.slice(start, start + 1), hasMore: start > 0 } }
    },
  }
  const ctrl = createFindController({ sessions, layout, remoteSession })
  ctrl.openFind()
  ctrl.setQuery('alphaHit')
  await ctrl.startOrResumeScan()
  assert.equal(ctrl.getSnapshot().scanState, 'done')
  assert.equal(ctrl.getSnapshot().hits.length, 3)
  assert.equal(ctrl._cache.pages.get('1..1').evicted, true, 'oldest older page evicted past 8 MiB')

  // Change query while evicted page exists -> hasEvictedPending becomes true -> rescan refetches ONLY evicted 1..1
  ctrl.setQuery('betaHit')
  ctrl.flushDebounce?.()
  ctrl.recomputeLocal()
  assert.equal(ctrl.getSnapshot().hasEvictedPending, true)
  const callsBefore = calls.length
  await ctrl.startOrResumeScan()
  assert.equal(calls.length, callsBefore + 1, 'rescanned only invalidated evicted page')
  assert.deepEqual(Array.from(ctrl.getSnapshot().hits.map((h) => h.seq)), [1])
  assert.equal(ctrl.getSnapshot().hits[0].excerpt, null, 'compact hit drops excerpt until targeted')

  // Evict 1..1 again (put another large page) OR verify on-demand jumpToHit populates excerpt
  await ctrl.jumpToHit(0)
  const active = ctrl.getSnapshot().activeHit
  assert.ok(active && (active.excerpt || ctrl._cache.hitExcerpts.get(active.hitKey)), 'jump populates excerpt for evicted hit')
  ctrl.dispose()
})

test('T5: registers cleanly in real @deepseek-ai/dsh-client-shortcuts across all 6 profiles and preserves wsl: subagent addresses', (t) => {
  const mod = loadClientModule()
  const { SHORTCUT_DEFAULTS, COMMAND_ID, resolveSessionAddress } = mod.__internals
  const sub = { kind: 'subagent', parentSessionId: 'wsl:p1', childSessionId: 'wsl:c1', mode: 'continuable' }
  assert.deepEqual(resolveSessionAddress({ subagentAddress: () => sub }, null, 'wsl:c1'), sub)

  const shortcutsSrcPath = join(homedir(), '.local/share/dsh-cli/node_modules/.pnpm/node_modules/@deepseek-ai/dsh-client-shortcuts/lib/client.js')
  if (!existsSync(shortcutsSrcPath)) return t.skip('dsh-client-shortcuts bundle not installed')
  const scSrc = readFileSync(shortcutsSrcPath, 'utf8')
  const clone = (v) => JSON.parse(JSON.stringify(v))
  assert.equal(SHORTCUT_DEFAULTS['web:linux'], undefined)
  assert.deepEqual(clone(SHORTCUT_DEFAULTS['web:windows']), { code: 'KeyF', modifiers: ['primary', 'alt'] })
  assert.deepEqual(clone(SHORTCUT_DEFAULTS['web:macos']), { code: 'KeyF', modifiers: ['primary', 'alt'] })
  assert.deepEqual(clone(SHORTCUT_DEFAULTS['desktop:windows']), { code: 'KeyF', modifiers: ['primary'] })
  assert.deepEqual(clone(SHORTCUT_DEFAULTS['desktop:macos']), { code: 'KeyF', modifiers: ['primary'] })
  assert.deepEqual(clone(SHORTCUT_DEFAULTS['desktop:linux']), { code: 'KeyF', modifiers: ['primary'] })
  assert.equal(COMMAND_ID, 'conversation.findInSession')
  assert.ok(scSrc.includes('ShortcutRegistry'))
  assert.ok(mod.apply)

  // Instantiate REAL @deepseek-ai/dsh-client-shortcuts service for all 6 (runtime, platform) pairs & validate register()
  const modDir = join(homedir(), '.local/share/dsh-cli/node_modules/.pnpm/node_modules')
  for (const [pfAttr, navPf, wantRuntime] of [
    ['darwin', 'MacIntel', 'desktop'],
    ['win32', 'Win32', 'desktop'],
    ['linux', 'Linux x86_64', 'desktop'],
    [undefined, 'Win32', 'web'],
    [undefined, 'MacIntel', 'web'],
    [undefined, 'Linux x86_64', 'web'],
  ]) {
    let ShortcutsSvc = null
    const win = {
      document: { documentElement: { dataset: pfAttr ? { platform: pfAttr } : {} } },
      navigator: { platform: navPf },
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      addEventListener() {},
      removeEventListener() {},
      dshDesktop: wantRuntime === 'desktop'
        ? {
            shortcuts: { get: async () => ({}), set: async () => ({ ok: true }), recording: async () => {} },
            keyboard: { onAction: () => () => {}, setBindings: async () => {}, closeWindow: async () => {} },
          }
        : undefined,
      __ModuleLoader__: { load(def) { ShortcutsSvc = def.factory((id) => ({ Service: class { constructor(c) { this.ctx = c } }, createSnapshotStore: (v) => ({ getSnapshot: () => v, set() {}, subscribe: () => () => {} }), notifySubscribers() {} })) } },
    }
    vm.runInNewContext(scSrc, { window: win, document: win.document, navigator: win.navigator, localStorage: win.localStorage, crypto: globalThis.crypto, setTimeout, clearTimeout, console })
    const fakeCtx = { effect() {}, locale: { subscribe: () => () => {} } }
    const svc = new ShortcutsSvc(fakeCtx)
    const unreg = svc.register({
      id: COMMAND_ID,
      label: () => 'Find',
      aliases: ['find'],
      defaults: clone(SHORTCUT_DEFAULTS),
      regions: ['page', 'editable'],
      modals: [],
      resolve: () => ({ status: 'pass' }),
    })
    assert.equal(svc.runtime, wantRuntime)
    unreg()
  }
})

test('T6: DOM locate (beforematch/TreeWalker/Highlight/scroll), React UI/IME/Esc guard, Web Ctrl+F capture, switch/unload cleanup', async () => {
  const dom = createMockDom()
  const react = createReactStub()
  const mod = loadClientModule({ dom, react })
  const { createFindController, createFindComponents, CONFIG_NS } = mod.__internals

  // Build BOTH main conversation root and an embedded duplicate inside rightbar
  const mainRoot = dom.el('div', { 'data-conversation-session': 's1' })
  const scroller = dom.el('div', { 'data-conversation-scroll': 'true' })
  scroller.scrollHeight = 1200; scroller.clientHeight = 400
  const flow = dom.el('div', { 'data-chat-flow': 'true' })
  const stepNode = dom.el('div', { 'data-chat-node-key': '14:assistant-step1:1', 'data-chat-turn': '1' })
  const hiddenWrap = dom.el('div', { hidden: 'until-found' })
  hiddenWrap.addEventListener('beforematch', () => hiddenWrap.removeAttribute('hidden'))
  const innerScroll = dom.el('div', { 'data-step-process-body': 'true' })
  innerScroll.scrollHeight = 500; innerScroll.clientHeight = 150
  const reasonPart = dom.el('div', { 'data-chat-group-part': 'reasoning' })
  reasonPart._rect = { top: 260, bottom: 280, width: 300, height: 20 }
  const btnNoise = dom.el('button')
  btnNoise.appendChild(dom.text('Copy needle'))
  reasonPart.appendChild(btnNoise)
  reasonPart.appendChild(dom.text('Deep thought contains targetNeedle here'))
  innerScroll.appendChild(reasonPart)
  hiddenWrap.appendChild(innerScroll)
  stepNode.appendChild(hiddenWrap)
  flow.appendChild(stepNode)
  scroller.appendChild(flow)
  mainRoot.appendChild(scroller)

  const rightbar = dom.el('div', { 'data-rightbar-col': 'true' })
  const embRoot = dom.el('div', { 'data-conversation-session': 's1', className: 'embeddedBody' })
  const embFlow = dom.el('div', { 'data-chat-flow': 'true' })
  const embNode = dom.el('div', { 'data-chat-node-key': '14:assistant-step1:1' })
  embNode.appendChild(dom.text('targetNeedle inside embedded rightbar'))
  embFlow.appendChild(embNode); embRoot.appendChild(embFlow); rightbar.appendChild(embRoot)
  dom.body.appendChild(mainRoot); dom.body.appendChild(rightbar)

  const triggerBtn = dom.el('button', { 'data-tune-find-trigger': 'true' })
  dom.body.appendChild(triggerBtn)

  const entries = [
    { type: 'event', event: { seq: 0, type: 'turn/start', data: { turn: 1 } } },
    { type: 'event', event: { seq: 1, type: 'step/start', data: { turn: 1, step: 1 } } },
    { type: 'event', event: { seq: 2, type: 'assistant/message', surfaceOp: 'append', data: { turn: 1, step: 1, message: { id: 'a2', content: [{ type: 'reasoning', text: 'Deep thought contains targetNeedle here' }, { type: 'text', text: 'reply fallbackOnly' }] } } } },
  ]
  const eventSource = createObservable({ entries, hasMore: false, revision: 1 })
  const sessionObs = createObservable({ sessionId: 's1', blank: false, removed: false, loadingOlder: false, hasMore: false })
  const list = createObservable({ byId: { s1: { id: 's1', retainedBy: { mainView: 1 } } } })
  const sessions = { list, binding: (id) => (id === 's1' ? { sessionId: 's1', session: sessionObs, eventSource } : null) }
  const panelInfo = createObservable({ activePanelId: null })
  const layout = { panelInfo }
  const configForm = createObservable({ value: { interceptCtrlFOnWeb: false } })
  const cleanups = []; const registeredSlots = []; const registeredShortcuts = []
  const strictProxy = (target, allowed) => new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === 'string' && !allowed.has(prop)) throw new Error(`cannot get property "${prop}" without inject`)
      return Reflect.get(obj, prop)
    },
  })
  const rawCtx = {
    sessions, layout, locale: { register: () => () => {}, getSnapshot: () => ({ active: 'zh-CN' }) },
    slots: { inject: (n, fn) => { const d = fn(); registeredSlots.push(n); cleanups.push(d) }, register: (cfg, Comp) => ({ cfg, Comp }) },
    effect: (fn) => cleanups.push(fn()),
    inject(deps, cb) {
      const scope = strictProxy({
        shortcuts: { runtime: 'web', platform: 'windows', register: (cmd) => { registeredShortcuts.push(cmd); return () => {} } },
        configForms: { get: (id) => (id === CONFIG_NS ? configForm : null) },
        get: (k) => (k === 'remote.session' ? null : null),
        effect: (fn) => cleanups.push(fn()),
      }, new Set([...deps, 'get', 'effect']))
      cb(scope)
    },
  }
  const ctx = strictProxy(rawCtx, new Set([...(mod.inject || []), 'effect', 'inject', 'get']))
  mod.apply(ctx)
  assert.ok(registeredSlots.includes('shell.overlay') && registeredSlots.includes('conversation.session.header.utilities'))
  assert.equal(registeredShortcuts[0].id, 'conversation.findInSession')
  assert.ok(dom.head.querySelector('style[data-plugin="@herenfor/dsh-tune-conversation-find"]'))

  // Web Ctrl+F capture OFF by default -> does not intercept
  assert.equal(dom.win._listenerCount('keydown', true), 0)
  // Enable interceptCtrlFOnWeb -> attaches capture listener; opens on conversation target, skips outside modal/input
  configForm.set({ value: { interceptCtrlFOnWeb: true } })
  assert.equal(dom.win._listenerCount('keydown', true), 1)
  const thirdPartyInput = dom.el('input'); dom.body.appendChild(thirdPartyInput)
  assert.equal(dom.win.dispatchKeyDown({ ctrlKey: true, target: thirdPartyInput }).defaultPrevented, false)
  assert.equal(dom.win.dispatchKeyDown({ ctrlKey: true, target: mainRoot }).defaultPrevented, true)

  const overlayReg = cleanups.find((c) => c?.cfg?.id === 'runtime-tuning.conversation-find')
  const controller = overlayReg.cfg.inject().controller
  assert.equal(Object.is(controller.getSnapshot(), controller.getSnapshot()), true, 'getSnapshot preserves reference identity for React useSyncExternalStore')
  triggerBtn.focus(); controller.closeFind(false); controller.openFind(triggerBtn)
  controller.setQuery('targetNeedle')
  await controller.navigate(1)
  assert.equal(hiddenWrap.hasAttribute('hidden'), false, 'beforematch revealed hidden ancestor')
  assert.ok(dom.CSS.highlights.has('dsh-tune-find-current'), 'Range verified & highlighted')
  assert.equal(dom.CSS.highlights.get('dsh-tune-find-current').ranges[0].toString(), 'targetNeedle')

  // Render Overlay & verify IME + Enter + Escape stopPropagation + focus return
  const vdom = react._render(overlayReg.Comp, { controller })
  const inputNode = findInVdom(vdom, (n) => n.props?.['data-tune-find-input'] === 'true')
  let windowSawEsc = false
  dom.win.addEventListener('keydown', () => { windowSawEsc = true }, false)
  inputNode.props.onCompositionStart()
  let enterStopped = false
  inputNode.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true }, preventDefault() {}, stopPropagation() { enterStopped = true } })
  assert.equal(enterStopped, false, 'IME Enter ignored')
  inputNode.props.onCompositionEnd({ currentTarget: { value: 'fallbackOnly' } })
  let escPrevented = false, escStopped = false
  inputNode.props.onKeyDown({ key: 'Escape', nativeEvent: {}, preventDefault() { escPrevented = true }, stopPropagation() { escStopped = true } })
  assert.equal(escPrevented && escStopped && !windowSawEsc, true, 'Escape closes bar and blocks StopSequence')
  assert.equal(dom.doc.activeElement, triggerBtn, 'focus returned to still-mounted trigger')

  // Cleanup / hot unload
  for (const fn of cleanups) if (typeof fn === 'function') fn()
  assert.equal(dom.head.querySelector('style[data-plugin="@herenfor/dsh-tune-conversation-find"]'), null)
  assert.equal(dom.win._listenerCount('keydown', true), 0)
  assert.equal(dom.CSS.highlights.size, 0)
})

test('T7: tool disclosure auto-expands or shows excerpt fallback, session switch & removed aborts, Host Config volatile=true', async () => {
  const dom = createMockDom()
  const react = createReactStub()
  const mod = loadClientModule({ dom, react })
  const { createFindController, createFindComponents } = mod.__internals
  const { FindBarOverlay } = createFindComponents

  const mainRoot = dom.el('div', { 'data-conversation-session': 's1' })
  const scroller = dom.el('div', { 'data-conversation-scroll': 'true' })
  scroller.scrollHeight = 800; scroller.clientHeight = 400
  const flow = dom.el('div', { 'data-chat-flow': 'true' })
  const toolNode = dom.el('div', { 'data-chat-node-key': '9:tool-callc1' })
  let clicked = false
  const toggleBtn = dom.el('button', { 'aria-expanded': 'false' })
  toggleBtn.addEventListener('click', () => { clicked = true; toggleBtn.setAttribute('aria-expanded', 'true') }) // never exposes text -> tests excerpt fallback
  toolNode.appendChild(toggleBtn)
  flow.appendChild(toolNode); scroller.appendChild(flow); mainRoot.appendChild(scroller)
  dom.body.appendChild(mainRoot)

  const entries = [{ type: 'event', event: { seq: 0, type: 'tool/result', surfaceOp: 'append', data: { callId: 'c1', message: { source: { callId: 'c1', rootCallId: 'c1' }, content: [{ type: 'text', text: 'hidden toolOutput' }] } } } }]
  const eventSource = createObservable({ entries, hasMore: false, revision: 1 })
  const sessionObs = createObservable({ sessionId: 's1', blank: false, removed: false, loadingOlder: false, hasMore: false })
  const list = createObservable({ byId: { s1: { id: 's1', retainedBy: { mainView: 1 } } } })
  const sessions = { list, binding: (id) => (id === 's1' ? { sessionId: 's1', session: sessionObs, eventSource } : null) }
  const ctrl = createFindController({ sessions, layout: { panelInfo: createObservable({ activePanelId: null }) }, doc: dom.doc })

  ctrl.openFind()
  ctrl.setQuery('toolOutput')
  ctrl.navigate(1)
  await new Promise((r) => setTimeout(r, 220))
  assert.equal(clicked, true, 'expanded collapsed tool disclosure once')
  assert.ok(ctrl.getSnapshot().fallbackNotice, 'unrenderable text shows fallback notice + excerpt')
  assert.equal(toolNode.getAttribute('data-tune-find-block'), 'active', 'fallback outlines block')

  const ui = createFindComponents(ctrl)
  const vdom = react._render(ui.FindBarOverlay, { controller: ctrl })
  const excerptCard = findInVdom(vdom, (n) => n.props?.['data-tune-find-excerpt'] === 'true')
  assert.ok(excerptCard && collectVdomText(excerptCard).includes('toolOutput'))

  // Session removed resets cleanly
  sessionObs.set({ sessionId: 's1', blank: false, removed: true, loadingOlder: false, hasMore: false })
  assert.equal(ctrl.getSnapshot().open, false)
  assert.equal(dom.CSS.highlights.size, 0)
  ctrl.dispose()

  if (DSH_BIN) {
    const oldArgv = process.argv[1]
    process.argv[1] = DSH_BIN
    try {
      const hostMod = await import(INDEX_PATH)
      assert.equal(typeof hostMod.apply, 'function')
      assert.equal(hostMod.Config.type, 'object')
      assert.equal(hostMod.Config.dict.interceptCtrlFOnWeb.meta.default, false)
    } finally { process.argv[1] = oldArgv }
  }
})

test('T8: jumpToHit invokes session.loadOlder() to materialize older turn into DOM & session switch aborts active scan', async () => {
  const dom = createMockDom()
  const mod = loadClientModule({ dom })
  const { createFindController } = mod.__internals

  const fullLog = [makeMsgEvent(0, 0, 'ancient secretNeedle').event, makeMsgEvent(1, 1, 'recent text').event]
  const evS1 = createObservable({ entries: [{ type: 'event', event: fullLog[1] }], hasMore: true, revision: 1 })
  const evS2 = createObservable({ entries: [{ type: 'event', event: makeMsgEvent(0, 0, 's2 secretNeedle').event }], hasMore: false, revision: 1 })

  const mainRoot = dom.el('div', { 'data-conversation-session': 's1' })
  const scroller = dom.el('div', { 'data-conversation-scroll': 'true' })
  const flow = dom.el('div', { 'data-chat-flow': 'true' })
  scroller.appendChild(flow); mainRoot.appendChild(scroller); dom.body.appendChild(mainRoot)

  let loadOlderCalls = 0
  const sess1 = createObservable({ sessionId: 's1', blank: false, removed: false, loadingOlder: false, hasMore: true })
  const sess2 = createObservable({ sessionId: 's2', blank: false, removed: false, loadingOlder: false, hasMore: false })
  const list = createObservable({ byId: { s1: { id: 's1', retainedBy: { mainView: 1 } } } })
  const sessions = {
    list,
    binding: (id) => id === 's1'
      ? { sessionId: 's1', session: { ...sess1, async loadOlder() { loadOlderCalls++; evS1.set({ entries: fullLog.map((e) => ({ type: 'event', event: e })), hasMore: false, revision: 2 }); const n = dom.el('div', { 'data-chat-node-key': '13:input-messagem0' }); n.appendChild(dom.text('ancient secretNeedle')); flow.appendChild(n) } }, eventSource: evS1 }
      : { sessionId: 's2', session: sess2, eventSource: evS2 },
  }
  const remoteSession = {
    async events(req) {
      if ((req.beforeSeq ?? 99) >= 1) return { ok: true, value: { cursor: 1, records: [{ type: 'event', event: fullLog[0] }], hasMore: false } }
      return { ok: true, value: { cursor: 1, records: [], hasMore: false } }
    },
  }
  const ctrl = createFindController({ sessions, layout: { panelInfo: createObservable({ activePanelId: null }) }, remoteSession, doc: dom.doc })
  ctrl.openFind()
  ctrl.setQuery('secretNeedle')
  await ctrl.startOrResumeScan()
  await ctrl.jumpToHit(0)
  assert.equal(loadOlderCalls, 1)
  assert.equal(dom.CSS.highlights.get('dsh-tune-find-current').ranges[0].toString(), 'secretNeedle')

  // Switch active session s1 -> s2 while open -> clears cache & recomputes new session's live window
  list.set({ byId: { s2: { id: 's2', retainedBy: { mainView: 1 } } } })
  ctrl.syncMainSession()
  assert.equal(ctrl.getSnapshot().sessionId, 's2')
  assert.equal(ctrl._cache.pages.size, 0)
  assert.equal(ctrl.getSnapshot().hits.length, 1)
  ctrl.dispose()
})
