window.__ModuleLoader__.load({
  id: '@herenfor/dsh-tune-sidebar-open',
  factory: (require) => {
    const exports = {}
    const TOOL_NAME = 'open_sidebar'
    const STORAGE_KEY = 'dsh.tune.sidebar-open.handled.v1'
    const MAX_HANDLED = 500
    const NOT_MOUNTED = 'sidebarRight: no session surface is mounted'
    const NO_TYPE = 'sidebarRight: no registered tab type'
    const RETRY_DELAYS = [0, 16, 40, 100, 200, 400, 800, 1500]
    const LOCALE_NS = 'tuneSidebarOpen'

    const encodeSeg = (s) => encodeURIComponent(s).replace(/%3A/gi, ':')
    const sessionFileAddress = (sessionId, path) => {
      const norm = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      return `dsh-resource://file/session/${encodeSeg(sessionId)}/${norm.split('/').map(encodeSeg).join('/')}`
    }

    const loadHandled = () => {
      try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string').slice(-MAX_HANDLED) : []
      } catch { return [] }
    }
    const saveHandled = (list) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-MAX_HANDLED)))
      } catch {}
    }

    const isPayload = (meta) => Boolean(meta && typeof meta === 'object' && (meta.kind === 'file' || meta.kind === 'url'))

    const extractOpenTarget = (event) => {
      if (!event || typeof event !== 'object') return null
      if (event.type === 'tool/result') {
        const msg = event.data?.message
        if (!msg || msg.isError === true) return null
        const meta = event.data?.meta
        if (!isPayload(meta) || meta.tool !== TOOL_NAME) return null
        const callId = msg.source?.callId ?? event.seq
        const eventTime = typeof meta.openedAt === 'number' ? meta.openedAt : (typeof event.time === 'number' ? event.time : 0)
        return callId == null ? null : { callId: String(callId), eventTime, payload: meta }
      }
      if (event.type === 'tool/ptc-dispatch') {
        if (event.data?.isError === true || event.data?.name !== TOOL_NAME) return null
        const meta = event.data?.meta
        if (!isPayload(meta)) return null
        const callId = event.data?.subCallId ?? event.seq
        const eventTime = typeof meta.openedAt === 'number' ? meta.openedAt : (typeof event.time === 'number' ? event.time : 0)
        return callId == null ? null : { callId: String(callId), eventTime, payload: meta }
      }
      return null
    }

    const openPayload = (ctx, sessionId, payload, manual) => {
      if (payload.kind === 'file' && typeof payload.path === 'string' && payload.path.length > 0 && sessionId) {
        const opts = {}
        if (Number.isSafeInteger(payload.line) && payload.line >= 1) opts.params = { line: payload.line }
        if (payload.destination === 'sidebar' || payload.destination === 'float') opts.destination = payload.destination
        ctx.sidebarRight.openResource(sessionFileAddress(sessionId, payload.path), opts)
        return true
      }
      if (payload.kind === 'url' && typeof payload.url === 'string' && payload.url.length > 0) {
        const tabs = typeof ctx.get === 'function' ? ctx.get('sidebarRightTabs') : ctx.sidebarRightTabs
        if (tabs?.get?.('browser') !== undefined) {
          ctx.sidebarRight.openTab('browser', { params: { url: payload.url } })
          return true
        }
        if (manual && typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open(payload.url, '_blank', 'noopener,noreferrer')
          return true
        }
        return false
      }
      return false
    }

    const TARGET_LABEL = (rawArgs, meta) => {
      if (isPayload(meta)) return meta.kind === 'url' ? meta.url : `${meta.path}${meta.line ? `:${meta.line}` : ''}`
      try {
        const args = JSON.parse(rawArgs || '{}')
        if (typeof args.url === 'string' && args.url) return args.url
        if (typeof args.path === 'string' && args.path) return `${args.path}${args.line ? `:${args.line}` : ''}`
      } catch {}
      return rawArgs || ''
    }

    const injectStyle = () => {
      const id = '@herenfor/dsh-tune-sidebar-open/row.css'
      if (typeof document === 'undefined' || document.querySelector(`style[data-plugin-css=${JSON.stringify(id)}]`) !== null) return
      const tag = document.createElement('style')
      tag.dataset.plugin = '@herenfor/dsh-tune-sidebar-open'
      tag.dataset.pluginCss = id
      tag.textContent = `.TSO_sum{min-width:0;color:inherit;align-items:center;gap:8px;margin-left:8px;font-size:12px;display:flex}.TSO_sum>:first-child{flex-shrink:0}.TSO_tgt{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.TSO_out{border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0;padding:12px;font-size:12px}.TSO_act{display:flex;gap:12px;align-items:center}.TSO_btn{color:var(--dsw-alias-link);font:inherit;cursor:pointer;background:0 0;border:0;padding:4px 0;font-size:12px}`
      document.head.appendChild(tag)
    }

    const registerToolRow = (ctx) => {
      ctx.inject(['slots', 'locale'], (uiCtx) => {
        let react, prim
        try { react = require('react'); prim = require('@deepseek-ai/dsh-client-ui-primitives') } catch { return }
        if (!react?.createElement || !prim?.DisclosureRow) return
        injectStyle()
        const zh = { title: '侧边栏预览', preparing: '正在准备打开侧边栏…', running: '正在打开', ok: '已打开', error: '失败', stopped: '已停止', reopen: '在侧栏中打开', inspect: '查看详情' }
        const en = { title: 'Sidebar Preview', preparing: 'Preparing sidebar preview…', running: 'Opening', ok: 'Opened', error: 'Failed', stopped: 'Stopped', reopen: 'Open in sidebar', inspect: 'Inspect details' }
        uiCtx.effect(() => uiCtx.locale.register(LOCALE_NS, { zh, en }), 'tune-sidebar-open: locale')
        const h = react.createElement
        const Icon = prim.IconBrowseOutlineRegular || prim.IconDeliverDocRegular
        const iconEl = Icon ? h(Icon, { size: 14 }) : null
        const OpenSidebarRow = (props) => {
          const { block, inspect, openFile, t } = props
          const label = (k) => (typeof t === 'function' ? t(k) : en[k] || k)
          if (props.phase === 'preparing') {
            return h('div', { 'data-tool': TOOL_NAME, 'data-state': 'preparing', 'aria-label': label('preparing') },
              h(prim.DisclosureRow, { title: label('title'), icon: iconEl, open: false, expandable: false, onToggle: () => {}, running: true }))
          }
          const settled = block && 'kind' in block
          const state = !settled ? 'running' : block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok'
          const rawArgs = (settled ? block.call?.argsRaw : block.argsRaw) ?? ''
          const meta = block?.meta
          const output = settled ? (block.content || []).map((c) => (c.type === 'text' ? c.text : JSON.stringify(c))).join('\n') : ''
          const details = output || (settled && block.error ? `${block.error.name}: ${block.error.code}` : '')
          const [expanded, setExpanded] = react.useState(false)
          const onReopen = () => {
            const mounted = ctx.sidebarRight.mounted.getSnapshot()
            if (isPayload(meta) && openPayload(ctx, mounted, meta, true)) return
            let parsed
            try { parsed = JSON.parse(rawArgs || '{}') } catch {}
            if (parsed?.url) openPayload(ctx, mounted, { kind: 'url', url: parsed.url }, true)
            else if (parsed?.path && typeof openFile === 'function') void openFile(parsed.path, Number.isSafeInteger(parsed.line) ? { line: parsed.line } : undefined)
          }
          return h('div', { 'data-tool': TOOL_NAME, 'data-state': state },
            h(prim.DisclosureRow, {
              title: label('title'), icon: iconEl, open: expanded && details !== '', expandable: details !== '',
              expandOnRowClick: true, keepContentWhenOpen: true, onToggle: () => setExpanded((v) => !v),
              collapsedContent: h('span', { className: 'TSO_sum' }, h('span', null, label(state)), h('span', { className: 'TSO_tgt' }, TARGET_LABEL(rawArgs, meta))),
            }, details && h('pre', { className: 'TSO_out' }, details), h('div', { className: 'TSO_act' },
              settled && state === 'ok' && h('button', { type: 'button', className: 'TSO_btn', onClick: onReopen }, label('reopen')),
              inspect && h('button', { type: 'button', className: 'TSO_btn', onClick: inspect }, label('inspect')),
            )))
        }
        uiCtx.slots.inject('tool.call.toolview', () => uiCtx.slots.register({ name: 'tool.call.toolview', key: TOOL_NAME, locale: LOCALE_NS }, OpenSidebarRow))
      })
    }

    exports.inject = ['sessions', 'sidebarRight']
    exports.apply = (ctx) => {
      const bootTime = Date.now()
      const handledOrder = loadHandled()
      const handled = new Set(handledOrder)
      const pendingBySession = new Map()
      const attached = new Map()
      const retryTimers = new Map()
      let disposed = false

      const markHandled = (key) => {
        if (handled.has(key)) return
        handled.add(key)
        handledOrder.push(key)
        while (handledOrder.length > MAX_HANDLED) handled.delete(handledOrder.shift())
        saveHandled(handledOrder)
      }
      const clearTimer = (sessionId) => {
        const t = retryTimers.get(sessionId)
        if (!t) return
        retryTimers.delete(sessionId)
        if (t.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(t.id)
        else clearTimeout(t.id)
      }
      const detachSession = (sessionId) => {
        clearTimer(sessionId)
        const rec = attached.get(sessionId)
        if (!rec) return
        attached.delete(sessionId)
        try { rec.stop() } catch {}
      }
      const scheduleFlush = (sessionId, retryIndex) => {
        if (disposed || retryIndex >= RETRY_DELAYS.length) return
        clearTimer(sessionId)
        const run = () => { retryTimers.delete(sessionId); flush(sessionId, retryIndex + 1) }
        if (retryIndex === 0 && typeof requestAnimationFrame === 'function') {
          retryTimers.set(sessionId, { raf: true, id: requestAnimationFrame(run) })
        } else {
          retryTimers.set(sessionId, { raf: false, id: setTimeout(run, RETRY_DELAYS[retryIndex]) })
        }
      }
      const flush = (sessionId, attempt = 0) => {
        if (disposed || ctx.sidebarRight.mounted.getSnapshot() !== sessionId) return
        const queue = pendingBySession.get(sessionId)
        if (!queue || queue.size === 0) return
        clearTimer(sessionId)
        for (const [key, item] of [...queue.entries()]) {
          if (handled.has(key)) { queue.delete(key); continue }
          try {
            openPayload(ctx, sessionId, item.payload, false)
            markHandled(key)
            queue.delete(key)
          } catch (err) {
            const msg = String(err?.message || err)
            if (msg.includes(NOT_MOUNTED) || msg.includes(NO_TYPE)) {
              scheduleFlush(sessionId, attempt)
              return
            }
            markHandled(key)
            queue.delete(key)
          }
        }
        if (queue.size === 0) pendingBySession.delete(sessionId)
      }
      const scan = (sessionId, entries, isAppend) => {
        let added = false
        for (const entry of entries || []) {
          if (entry?.type !== 'event') continue
          const found = extractOpenTarget(entry.event)
          if (!found) continue
          const key = `${sessionId}:${found.callId}`
          if (handled.has(key) || (!isAppend && found.eventTime < bootTime)) continue
          let queue = pendingBySession.get(sessionId)
          if (!queue) { queue = new Map(); pendingBySession.set(sessionId, queue) }
          queue.set(key, found)
          added = true
        }
        if (added && ctx.sidebarRight.mounted.getSnapshot() === sessionId) flush(sessionId, 0)
      }
      const syncSessions = () => {
        if (disposed) return
        const snap = ctx.sessions.list.getSnapshot() || {}
        const ids = new Set([...(snap.ids || []), ...Object.keys(snap.byId || {})])
        const mounted = ctx.sidebarRight.mounted.getSnapshot()
        if (mounted) ids.add(mounted)
        for (const [id, rec] of [...attached.entries()]) {
          if (ctx.sessions.binding(id) !== rec.binding) detachSession(id)
        }
        for (const id of ids) {
          const binding = ctx.sessions.binding(id)
          if (!binding || attached.get(id)?.binding === binding) continue
          detachSession(id)
          const rec = { binding, revision: -1, stop: () => {} }
          const onEvent = () => {
            const win = binding.eventSource.getSnapshot()
            if (!win || win.revision === rec.revision) return
            rec.revision = win.revision
            if (win.change?.kind === 'append') scan(id, win.change.entries, true)
            else if (win.change?.kind === 'replace') scan(id, win.change.entries, false)
          }
          rec.stop = binding.eventSource.subscribe(onEvent)
          attached.set(id, rec)
          onEvent()
        }
      }

      const stopList = ctx.sessions.list.subscribe(syncSessions)
      const stopMounted = ctx.sidebarRight.mounted.subscribe(() => {
        syncSessions()
        const current = ctx.sidebarRight.mounted.getSnapshot()
        if (current) flush(current, 0)
      })
      syncSessions()
      registerToolRow(ctx)
      ctx.effect(() => () => {
        disposed = true
        stopList()
        stopMounted()
        for (const id of [...attached.keys()]) detachSession(id)
        for (const id of [...retryTimers.keys()]) clearTimer(id)
      }, 'tune-sidebar-open: listeners')
    }
    return exports
  },
})
