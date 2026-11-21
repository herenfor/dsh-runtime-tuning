window.__ModuleLoader__.load({
  id: '@herenfor/dsh-tune-conversation-find',
  factory: (require) => {
    const exports = {}
    const MODULE_ID = '@herenfor/dsh-tune-conversation-find'
    const CONFIG_NS = 'runtime-tuning-conversation-find'
    const COMMAND_ID = 'conversation.findInSession'
    const LOCALE_NS = 'tuneConversationFind'
    const STYLE_ID = '@herenfor/dsh-tune-conversation-find/ui.css'
    const HIGHLIGHT_ALL = 'dsh-tune-find-match'
    const HIGHLIGHT_CURRENT = 'dsh-tune-find-current'
    const POS_STORAGE_KEY = 'dsh-tune:conversation-find:pos'
    const POS_EDGE_MARGIN = 8
    const MAX_HISTORY_CACHE_BYTES = 8 * 1024 * 1024
    const DEFAULT_PAGE_OPTIONS = { maxMessages: 500, turnWindow: { minMessages: 50, minTurns: 2 } }
    const DEBOUNCE_MS = 150
    const SCOPE_EXTRA_KEYS = ['reasoning', 'tool', 'command', 'context', 'compaction', 'todo', 'error']
    const DEFAULT_SEARCH_SCOPE = Object.freeze({
      body: true,
      reasoning: false,
      tool: false,
      command: false,
      context: false,
      compaction: false,
      todo: false,
      error: false,
    })
    const SHORTCUT_DEFAULTS = {
      'desktop:windows': { code: 'KeyF', modifiers: ['primary'] },
      'desktop:macos': { code: 'KeyF', modifiers: ['primary'] },
      'desktop:linux': { code: 'KeyF', modifiers: ['primary'] },
      'web:windows': { code: 'KeyF', modifiers: ['primary', 'alt'] },
      'web:macos': { code: 'KeyF', modifiers: ['primary', 'alt'] },
    }
    const LOCALES = {
      zh: {
        openLabel: '在当前对话中查找',
        placeholder: '在当前对话中查找…',
        caseSensitive: '区分大小写',
        prev: '上一处',
        next: '下一处',
        close: '关闭',
        searchHistory: '搜索全部历史',
        pause: '暂停',
        resume: '继续',
        retry: '重试',
        scanning: '正在搜索更早历史…',
        statusMore: '仍有更早历史',
        statusDone: '已查完',
        statusPaused: '已暂停',
        statusError: '读取失败',
        statusLoadingTarget: '正在加载该轮历史…',
        foundCount: '已找到 {count} 处',
        noMatches: '无匹配',
        fallbackTurn: '已定位到消息/轮次',
        fallbackHidden: '当前视图未展示此内容',
        relocate: '重新定位',
        dragHandle: '拖动浮窗位置（双击重置）',
        scopeBtn: '搜索范围（默认仅正文；右键浮窗亦可打开）',
        scopeMenuTitle: '搜索范围',
        scopeBody: '正文（提问与回复）',
        scopeDefaultTag: '默认',
        scopeReset: '仅搜正文',
        scopeAll: '全部范围',
        noSession: '当前无打开的对话',
        src_user: '用户输入',
        src_steering: '插话消息',
        src_context: '注入上下文',
        src_reasoning: '思考过程',
        src_response: '助手回复',
        src_tool: '工具调用/结果',
        src_command: '斜杠命令',
        src_compaction: '压缩摘要',
        src_todo: '待办列表',
        src_error: '轮次错误',
      },
      en: {
        openLabel: 'Find in conversation',
        placeholder: 'Find in conversation…',
        caseSensitive: 'Match case',
        prev: 'Previous match',
        next: 'Next match',
        close: 'Close',
        searchHistory: 'Search full history',
        pause: 'Pause',
        resume: 'Resume',
        retry: 'Retry',
        scanning: 'Searching older history…',
        statusMore: 'More history available',
        statusDone: 'Searched all history',
        statusPaused: 'Paused',
        statusError: 'Load failed',
        statusLoadingTarget: 'Loading turn history…',
        foundCount: '{count} matches',
        noMatches: 'No matches',
        fallbackTurn: 'Located in message/turn',
        fallbackHidden: 'Content not visible in current view',
        relocate: 'Relocate',
        dragHandle: 'Drag to move (double-click to reset)',
        scopeBtn: 'Search scope (body text only by default; right-click bar)',
        scopeMenuTitle: 'Search scope',
        scopeBody: 'Conversation body (user & replies)',
        scopeDefaultTag: 'Default',
        scopeReset: 'Body only',
        scopeAll: 'Select all',
        noSession: 'No active conversation',
        src_user: 'User message',
        src_steering: 'Steering',
        src_context: 'Context',
        src_reasoning: 'Reasoning',
        src_response: 'Assistant reply',
        src_tool: 'Tool call/output',
        src_command: 'Command',
        src_compaction: 'Compaction summary',
        src_todo: 'Todo list',
        src_error: 'Turn error',
      },
    }
    const FIND_CSS = `
.TCF_wrap{position:fixed;top:52px;right:20px;z-index:220;pointer-events:none;max-width:calc(100vw - 32px)}
.TCF_bar{pointer-events:auto;box-sizing:border-box;width:min(420px,calc(100vw - 32px));display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:12px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));box-shadow:0 8px 28px rgba(0,0,0,.18);font-size:13px;line-height:18px}
.TCF_row{display:flex;align-items:center;gap:4px;min-width:0}
.TCF_drag{display:inline-flex;flex:none;align-items:center;justify-content:center;width:18px;height:26px;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:grab;touch-action:none;user-select:none}
.TCF_drag:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-secondary)}
.TCF_wrap[data-dragging="true"] .TCF_drag,.TCF_wrap[data-dragging="true"] .TCF_bar{cursor:grabbing;user-select:none}
.TCF_inputWrap{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:6px;padding:0 8px;height:30px;border-radius:8px;background:var(--dsw-alias-bg-module-platform,rgba(128,128,128,.08));border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.2))}
.TCF_inputWrap:focus-within{border-color:var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6))}
.TCF_input{flex:1 1 auto;min-width:0;border:0;outline:0;background:transparent;color:inherit;font:inherit;font-size:13px;padding:0}
.TCF_count{flex:none;font-size:12px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap}
.TCF_btn{display:inline-flex;flex:none;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 5px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.TCF_btn:enabled:not([aria-pressed="true"]):hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary)}
.TCF_btn:focus-visible,.TCF_drag:focus-visible,.TCF_link:focus-visible,.TCF_trig:focus-visible,.TCF_menuItem:focus-visible{outline:1px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:1px}
.TCF_btn:disabled{opacity:.42;cursor:default}
.TCF_btn[aria-pressed="true"]{background:var(--dsw-static-deepseek-500,var(--dsw-alias-state-business-primary,#3b82f6));color:#fff;font-weight:600}
.TCF_btn[aria-pressed="true"]:enabled:hover,.TCF_btn[aria-pressed="true"]:enabled:active{background:var(--dsw-static-blue-600,#2563eb);color:#fff}
.TCF_scopeBtn{position:relative}
.TCF_scopeBtn[aria-expanded="true"]{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.TCF_scopeBtn[data-custom-scope="true"],.TCF_scopeBtn[data-custom-scope="true"]:enabled:hover{color:var(--dsw-static-deepseek-500,var(--dsw-alias-state-business-primary,#3b82f6))}
.TCF_dot{position:absolute;top:3px;right:3px;width:5px;height:5px;border-radius:99px;background:var(--dsw-static-deepseek-500,var(--dsw-alias-state-business-primary,#3b82f6))}
.TCF_menu{pointer-events:auto;position:absolute;right:0;top:calc(100% + 6px);min-width:228px;max-width:calc(100vw - 32px);max-height:min(360px,calc(100vh - 80px));overflow-y:auto;box-sizing:border-box;display:flex;flex-direction:column;gap:2px;padding:6px;border-radius:10px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-layer-1,#fff));color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.22));box-shadow:0 10px 30px rgba(0,0,0,.22);font-size:12px;line-height:18px;z-index:230}
.TCF_menu[data-placement="above"]{top:auto;bottom:calc(100% + 6px)}
.TCF_menuHead{padding:2px 8px 4px;font-size:11px;font-weight:600;color:var(--dsw-alias-label-tertiary);user-select:none}
.TCF_menuSep{height:1px;margin:3px 4px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.16))}
.TCF_menuItem{display:flex;align-items:center;gap:8px;width:100%;box-sizing:border-box;padding:5px 8px;border:0;border-radius:7px;background:transparent;color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer}
.TCF_menuItem:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.TCF_chk{display:inline-flex;flex:none;align-items:center;justify-content:center;width:14px;height:14px;border-radius:4px;border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.45));background:transparent;color:#fff;box-sizing:border-box}
.TCF_menuItem[aria-checked="true"] .TCF_chk{border-color:var(--dsw-static-deepseek-500,var(--dsw-alias-state-business-primary,#3b82f6));background:var(--dsw-static-deepseek-500,var(--dsw-alias-state-business-primary,#3b82f6))}
.TCF_menuLabel{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.TCF_menuTag{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.TCF_menuFoot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:3px;padding:4px 4px 1px;border-top:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16))}
.TCF_meta{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-tertiary);min-width:0}
.TCF_status{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.TCF_actions{display:flex;align-items:center;gap:6px;flex:none}
.TCF_link{border:0;background:transparent;padding:2px 6px;border-radius:6px;color:var(--dsw-alias-link,#3b82f6);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.TCF_link:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
.TCF_excerpt{border-radius:8px;padding:6px 8px;background:var(--dsw-alias-bg-module-platform,rgba(128,128,128,.08));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.14));display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:17px}
.TCF_exHead{display:flex;align-items:center;justify-content:space-between;gap:6px;color:var(--dsw-alias-label-tertiary)}
.TCF_exText{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;overflow-wrap:anywhere;max-height:72px;overflow:auto}
.TCF_exMark{background:rgba(245,158,11,.36);color:inherit;border-radius:3px;padding:0 1px}
.TCF_trig{display:inline-flex;flex:none;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:28px;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;margin-left:2px}
.TCF_trig:hover,.TCF_trig:focus-visible{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12))}
::highlight(${HIGHLIGHT_ALL}){background-color:rgba(250,204,21,.34);color:inherit}
::highlight(${HIGHLIGHT_CURRENT}){background-color:rgba(249,115,22,.58);color:#fff}
`
    const ensureStyle = () => {
      if (typeof document === 'undefined') return () => {}
      let tag = document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_ID)}]`)
      if (tag) return () => { if (tag && tag.parentNode) tag.remove() }
      tag = document.createElement('style')
      tag.dataset.plugin = MODULE_ID
      tag.dataset.pluginCss = STYLE_ID
      tag.textContent = FIND_CSS
      ;(document.head || document.documentElement).appendChild(tag)
      return () => { if (tag && tag.parentNode) tag.remove() }
    }

    const conversationContextKey = (kind, id) => `${kind.length}:${kind}${id}`
    const normalizeSearchScope = (raw) => {
      const out = { ...DEFAULT_SEARCH_SCOPE }
      if (raw && typeof raw === 'object') {
        if (typeof raw.body === 'boolean') out.body = raw.body
        for (const k of SCOPE_EXTRA_KEYS) if (typeof raw[k] === 'boolean') out[k] = raw[k]
      }
      return out
    }
    const isCustomScope = (scope) => !scope?.body || SCOPE_EXTRA_KEYS.some((k) => Boolean(scope?.[k]))
    const resolveEnabledSourceKinds = (scope) => {
      const s = normalizeSearchScope(scope)
      const kinds = new Set()
      if (s.body) { kinds.add('user'); kinds.add('response') }
      for (const k of SCOPE_EXTRA_KEYS) if (s[k]) kinds.add(k)
      return kinds
    }
    const resolveExcludedGroupParts = (enabledKinds) => {
      if (!enabledKinds) return null
      const excluded = new Set()
      if (!enabledKinds.has('reasoning')) excluded.add('reasoning')
      if (!enabledKinds.has('response')) excluded.add('response')
      return excluded.size ? excluded : null
    }
    const buildAllowedDomTargets = (hitsList) => {
      const targets = new Set()
      for (const h of hitsList || []) {
        if (!h?.nodeKey) continue
        targets.add(h.nodeKey)
        targets.add(`${h.nodeKey}|${h.groupPart || ''}`)
      }
      return targets
    }
    const isReplacementOp = (op) => op !== undefined && op !== 'append'
    const isAppendSurface = (event) => Boolean(event) && !isReplacementOp(event.surfaceOp)
    const isCompactCheckpoint = (event) => event?.type === 'user/message'
      && isReplacementOp(event.surfaceOp)
      && event.data?.source?.kind === 'compact-checkpoint'

    const extractBlocksText = (content) => {
      if (!Array.isArray(content)) return ''
      const out = []
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string' && block.text !== '') {
          out.push(block.text)
        }
      }
      return out.join('\n')
    }

    const stringifyArgs = (args) => {
      if (typeof args === 'string') return args
      if (args === undefined || args === null) return ''
      try { return JSON.stringify(args) } catch { return String(args) }
    }

    const sanitizeFailure = (err) => {
      if (!err || typeof err !== 'object') return err ? String(err) : ''
      if (err.code === 'AUTH') return 'AUTH'
      const parts = []
      if (typeof err.message === 'string' && err.message) parts.push(err.message)
      else if (typeof err.reason === 'string' && err.reason) parts.push(err.reason)
      if (typeof err.name === 'string' && err.name && !parts.includes(err.name)) parts.push(err.name)
      if (typeof err.code === 'string' && err.code && !parts.includes(err.code)) parts.push(err.code)
      return parts.join(' ').trim()
    }
    const eventBytes = (fields) => {
      let bytes = 0
      for (const f of fields) if (typeof f.text === 'string') bytes += f.text.length * 2
      return bytes
    }

    const pushField = (fields, fieldKey, text, extra) => {
      if (typeof text !== 'string' || text === '') return
      fields.push({ fieldKey, text, ...(extra || {}) })
    }

    let prim
    try { prim = require('@deepseek-ai/dsh-client-ui-primitives') } catch {}
    const replyTextCache = new WeakMap()
    const searchableReplyText = (block) => {
      const text = block.text
      // Index the same visible words even when Markdown splits a filename across inline elements.
      if (typeof text !== 'string' || !prim?.extractMarkdownPlainText) return text
      if (!replyTextCache.has(block)) {
        let visibleText = text
        try { visibleText = prim.extractMarkdownPlainText(text) } catch { /* Keep malformed replies searchable. */ }
        replyTextCache.set(block, visibleText)
      }
      return replyTextCache.get(block)
    }

    const extractDurableEvent = (event) => {
      if (!event || typeof event !== 'object' || !Number.isSafeInteger(event.seq) || event.seq < 0) return null
      const seq = event.seq
      const d = event.data || {}
      if (event.type === 'turn/start' || event.type === 'turn/end' || event.type === 'step/start' || event.type === 'step/end') {
        const b = { kind: event.type, seq, turn: d.turn, step: d.step }
        if (event.type === 'turn/end' && d.reason?.kind === 'error') {
          const errText = sanitizeFailure(d.reason.error)
          const fields = []
          pushField(fields, 'error', errText)
          return {
            boundary: b,
            rec: fields.length ? { seq, stableId: `turnerr:${d.turn}`, nodeKind: 'turn-error', nodeId: String(d.turn), sourceKind: 'error', explicitTurn: d.turn, fields } : null,
          }
        }
        return { boundary: b, rec: null }
      }
      if (isCompactCheckpoint(event)) {
        const cid = typeof d.source?.compactionId === 'string' ? d.source.compactionId : ''
        if (!cid) return null
        const cmdId = d.source?.sourceCommandId !== undefined ? String(d.source.sourceCommandId) : undefined
        const fields = []
        pushField(fields, 'checkpoint', extractBlocksText(d.content))
        return { rec: { seq, linkKind: 'compact-checkpoint', compactionId: cid, sourceCommandId: cmdId, nodeKind: cmdId ? 'command' : 'compaction', nodeId: cmdId || cid, sourceKind: 'compaction', explicitTurn: d.turn, fields } }
      }
      if (event.type === 'compaction/summary') {
        const cid = typeof d.compactionId === 'string' ? d.compactionId : ''
        if (!cid) return null
        const cmdId = d.sourceCommandId !== undefined ? String(d.sourceCommandId) : undefined
        const fields = []
        pushField(fields, 'summary', extractBlocksText(d.summary))
        return { rec: { seq, linkKind: 'compact-summary', compactionId: cid, sourceCommandId: cmdId, nodeKind: cmdId ? 'command' : 'compaction', nodeId: cmdId || cid, sourceKind: 'compaction', explicitTurn: d.turn, fields } }
      }
      if (event.type === 'user/message') {
        if (!isAppendSurface(event)) return null
        const text = extractBlocksText(d.content)
        if (!text && d.source?.kind === 'retry') return null
        const fields = []
        pushField(fields, 'text', text)
        if (!fields.length) return null
        const src = d.source?.kind === 'user' ? 'user' : 'context'
        return { rec: { seq, stableId: `user:${d.id}`, nodeKind: 'input-message', nodeId: String(d.id), sourceKind: src, explicitTurn: d.turn, fields } }
      }
      if (event.type === 'developer/message') {
        if (!isAppendSurface(event)) return null
        const msg = d.message || {}
        const fields = []
        pushField(fields, 'text', extractBlocksText(msg.content))
        if (!fields.length) return null
        return { rec: { seq, stableId: `dev:${msg.id}`, nodeKind: 'developer-message', nodeId: String(msg.id), sourceKind: 'context', explicitTurn: d.turn, fields } }
      }
      if (event.type === 'assistant/message') {
        if (!isAppendSurface(event)) return null
        const turn = d.turn
        const step = d.step
        const content = Array.isArray(d.message?.content) ? d.message.content : []
        const fields = []
        const fallbackTools = []
        content.forEach((b, idx) => {
          if (!b || typeof b !== 'object') return
          if (b.type === 'reasoning') pushField(fields, `reasoning:${idx}`, b.text, { groupPart: 'reasoning', sourceKind: 'reasoning' })
          else if (b.type === 'text') pushField(fields, `text:${idx}`, searchableReplyText(b), { groupPart: 'response', sourceKind: 'response' })
          else if (b.type === 'tool-call' && b.id !== undefined) fallbackTools.push({ callId: String(b.id), name: b.name || '', argsRaw: stringifyArgs(b.arguments) })
        })
        return { rec: { seq, linkKind: 'assistant', stableId: `asst:${turn}:${step}`, nodeKind: 'assistant-step', nodeId: `${turn}:${step}`, sourceKind: 'response', explicitTurn: turn, explicitStep: step, fields, fallbackTools } }
      }
      if (event.type === 'command/run' || event.type === 'command/done') {
        const cmdId = String(d.commandId ?? '')
        if (!cmdId) return null
        const fields = []
        if (event.type === 'command/run') {
          if (typeof d.name === 'string' && d.name) pushField(fields, 'cmd', d.args ? `${d.name} ${d.args}` : d.name)
        } else {
          pushField(fields, 'outcome', d.text)
        }
        return { rec: { seq, stableId: `${event.type}:${cmdId}:${seq}`, nodeKind: 'command', nodeId: cmdId, sourceKind: 'command', explicitTurn: d.turn, fields } }
      }
      if (event.type === 'tool/call') {
        const cid = String(d.callId ?? '')
        if (!cid) return null
        const fields = []
        pushField(fields, 'name', d.name)
        pushField(fields, 'args', stringifyArgs(d.arguments))
        return { rec: { seq, linkKind: 'tool-call', linkId: cid, stableId: `toolcall:${cid}`, nodeKind: 'tool-call', nodeId: cid, sourceKind: 'tool', explicitTurn: d.turn, explicitStep: d.step, fields } }
      }
      if (event.type === 'tool/result') {
        if (!isAppendSurface(event)) return null
        const cid = String(d.message?.source?.callId ?? '')
        if (!cid) return null
        const fields = []
        pushField(fields, 'result', extractBlocksText(d.message?.content))
        pushField(fields, 'error', sanitizeFailure(d.error))
        return fields.length ? { rec: { seq, stableId: `toolres:${cid}:${seq}`, nodeKind: 'tool-call', nodeId: cid, sourceKind: 'tool', explicitTurn: d.turn, fields } } : null
      }
      if (event.type === 'tool/ptc-dispatch-start' || event.type === 'tool/ptc-dispatch') {
        const subId = String(d.subCallId ?? '')
        const rootId = String(d.rootCallId ?? '')
        if (!subId || !rootId) return null
        return {
          rec: {
            seq,
            linkKind: event.type === 'tool/ptc-dispatch-start' ? 'ptc-start' : 'ptc-end',
            subCallId: subId,
            parentCallId: String(d.parentCallId ?? ''),
            rootCallId: rootId,
            nodeKind: 'tool-call',
            nodeId: rootId,
            sourceKind: 'tool',
            explicitTurn: d.turn,
            name: typeof d.name === 'string' ? d.name : '',
            argsRaw: stringifyArgs(d.arguments),
            resultText: extractBlocksText(d.content),
            errorText: sanitizeFailure(d.error),
          },
        }
      }
      if (event.type === 'todo/write' && Array.isArray(d.todos)) {
        const fields = []
        d.todos.forEach((item, idx) => pushField(fields, `todo:${idx}`, item?.content))
        return fields.length ? { rec: { seq, stableId: `todo:${seq}`, nodeKind: null, nodeId: null, sourceKind: 'todo', explicitTurn: d.turn, fields } } : null
      }
      return null
    }
    const extractPageFromEvents = (events) => {
      const sorted = [...events].filter((e) => e && Number.isSafeInteger(e.seq) && e.seq >= 0).sort((a, b) => a.seq - b.seq)
      const boundaries = []
      const rawItems = []
      let minSeq = Infinity
      let maxSeq = -1
      let byteSize = 0
      for (const ev of sorted) {
        if (ev.seq < minSeq) minSeq = ev.seq
        if (ev.seq > maxSeq) maxSeq = ev.seq
        const extracted = extractDurableEvent(ev)
        if (!extracted) continue
        if (extracted.boundary) boundaries.push(extracted.boundary)
        if (extracted.rec) {
          rawItems.push(extracted.rec)
          if (Array.isArray(extracted.rec.fields)) byteSize += eventBytes(extracted.rec.fields)
          if (Array.isArray(extracted.rec.fallbackTools)) {
            for (const ft of extracted.rec.fallbackTools) byteSize += (ft.name.length + ft.argsRaw.length) * 2
          }
          if (typeof extracted.rec.name === 'string') byteSize += extracted.rec.name.length * 2
          if (typeof extracted.rec.argsRaw === 'string') byteSize += extracted.rec.argsRaw.length * 2
          if (typeof extracted.rec.resultText === 'string') byteSize += extracted.rec.resultText.length * 2
          if (typeof extracted.rec.errorText === 'string') byteSize += extracted.rec.errorText.length * 2
        }
      }
      return { minSeq: minSeq === Infinity ? null : minSeq, maxSeq: maxSeq < 0 ? null : maxSeq, boundaries, rawItems, byteSize }
    }

    const reduceTransientChunks = (transientEntries) => {
      const byStep = new Map()
      const byTool = new Map()
      for (const entry of transientEntries) {
        if (entry?.type !== 'transient' || entry.event?.type !== 'assistant/live-chunk') continue
        const ev = entry.event
        const d = ev.data || {}
        const chunk = d.chunk || {}
        const stepKey = `${d.attemptId}:${d.turn}:${d.step}`
        let stepState = byStep.get(stepKey)
        if (!stepState) {
          stepState = { attemptId: d.attemptId, turn: d.turn, step: d.step, seq: ev.seq, blocks: new Map() }
          byStep.set(stepKey, stepState)
        }
        stepState.seq = ev.seq
        if (chunk.type === 'block-start') {
          const prev = stepState.blocks.get(chunk.index)
          if (!prev) stepState.blocks.set(chunk.index, { kind: chunk.blockType, text: '', seq: ev.seq })
        } else if (chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') {
          const kind = chunk.type === 'reasoning-delta' ? 'reasoning' : 'text'
          const prev = stepState.blocks.get(chunk.index) || { kind, text: '', seq: ev.seq }
          stepState.blocks.set(chunk.index, { kind, text: prev.text + (chunk.text || ''), seq: prev.seq })
        } else if (chunk.type === 'block-end' && chunk.block) {
          const b = chunk.block
          if (b.type === 'text' || b.type === 'reasoning') {
            stepState.blocks.set(chunk.index, { kind: b.type, text: b.text || '', seq: ev.seq })
          } else if (b.type === 'tool-call' && b.id !== undefined) {
            byTool.set(String(b.id), { seq: ev.seq, turn: d.turn, step: d.step, callId: String(b.id), name: b.name || '', argsRaw: stringifyArgs(b.arguments), attemptId: d.attemptId })
          }
        } else if (chunk.type === 'tool-call-delta' && chunk.id !== undefined) {
          const cid = String(chunk.id)
          const prev = byTool.get(cid) || { seq: ev.seq, turn: d.turn, step: d.step, callId: cid, name: '', argsRaw: '', attemptId: d.attemptId }
          if (chunk.name) prev.name = chunk.name
          if (chunk.argumentsDelta) prev.argsRaw += chunk.argumentsDelta
          byTool.set(cid, prev)
        }
      }
      return { byStep, byTool }
    }
    const foldBoundaries = (boundaries) => {
      const sorted = [...boundaries].sort((a, b) => a.seq - b.seq)
      const turnStartSeqs = new Map()
      const spans = []
      let activeTurn
      for (const b of sorted) {
        if (b.kind === 'turn/start' && Number.isSafeInteger(b.turn)) {
          if (!turnStartSeqs.has(b.turn)) turnStartSeqs.set(b.turn, b.seq)
          activeTurn = b.turn
          spans.push({ seq: b.seq, turn: activeTurn })
        } else if (b.kind === 'turn/end' && Number.isSafeInteger(b.turn)) {
          if (activeTurn === b.turn) activeTurn = undefined
          spans.push({ seq: b.seq, turn: activeTurn })
        }
      }
      return { turnStartSeqs, spans }
    }

    const resolveTurnAt = (seq, explicitTurn, spans, turnStartSeqs) => {
      if (explicitTurn === null) return { turn: undefined, turnStartSeq: undefined, pendingTurn: false }
      if (Number.isSafeInteger(explicitTurn) && explicitTurn >= 0) {
        const start = turnStartSeqs.get(explicitTurn)
        return { turn: explicitTurn, turnStartSeq: start, pendingTurn: start === undefined }
      }
      let lo = 0
      let hi = spans.length
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (spans[mid].seq <= seq) lo = mid + 1
        else hi = mid
      }
      const turn = spans[lo - 1]?.turn
      const start = turn !== undefined ? turnStartSeqs.get(turn) : undefined
      return { turn, turnStartSeq: start, pendingTurn: turn === undefined || start === undefined }
    }

    const assembleSearchableItems = (boundaries, rawItems, transientEntries, index = foldBoundaries(boundaries)) => {
      const { turnStartSeqs, spans } = index
      const seenToolCalls = new Set()
      const seenPtcCalls = new Set()
      const compactionTexts = new Map()
      const settledSteps = new Set()
      for (const rec of rawItems) {
        if (rec.linkKind === 'tool-call' && rec.linkId) seenToolCalls.add(rec.linkId)
        if (rec.linkKind === 'assistant') settledSteps.add(`${rec.explicitTurn}:${rec.explicitStep}`)
        if (rec.linkKind === 'compact-summary' && rec.fields?.[0]?.text) compactionTexts.set(rec.compactionId, rec.fields[0].text)
      }
      const items = []
      const sortedRaw = [...rawItems].sort((a, b) => a.seq - b.seq)
      for (const rec of sortedRaw) {
        const coord = resolveTurnAt(rec.seq, rec.explicitTurn, spans, turnStartSeqs)
        const nodeKey = rec.nodeKind && rec.nodeId ? conversationContextKey(rec.nodeKind, rec.nodeId) : null
        if (rec.linkKind === 'ptc-start' || rec.linkKind === 'ptc-end') {
          const fields = []
          const already = seenPtcCalls.has(rec.subCallId)
          seenPtcCalls.add(rec.subCallId)
          if (!already) {
            pushField(fields, `ptc:${rec.subCallId}:name`, rec.name)
            pushField(fields, `ptc:${rec.subCallId}:args`, rec.argsRaw)
          }
          if (rec.linkKind === 'ptc-end') {
            pushField(fields, `ptc:${rec.subCallId}:res`, rec.resultText)
            pushField(fields, `ptc:${rec.subCallId}:err`, rec.errorText)
          }
          if (fields.length) items.push({ seq: rec.seq, durable: true, stableKey: `ptc:${rec.subCallId}:${rec.seq}`, nodeKey, sourceKind: 'tool', parentCallId: rec.parentCallId, subCallId: rec.subCallId, ...coord, fields })
          continue
        }
        if (rec.linkKind === 'compact-checkpoint') {
          const sumText = compactionTexts.get(rec.compactionId)
          const cpText = rec.fields?.[0]?.text
          if (!cpText || (sumText && (cpText === sumText || sumText.includes(cpText)))) continue
        }
        const fields = [...(rec.fields || [])]
        if (rec.linkKind === 'assistant' && Array.isArray(rec.fallbackTools)) {
          for (const ft of rec.fallbackTools) {
            if (!seenToolCalls.has(ft.callId)) {
              pushField(fields, `ftool:${ft.callId}:name`, ft.name, { sourceKind: 'tool', overrideNodeKey: conversationContextKey('tool-call', ft.callId) })
              pushField(fields, `ftool:${ft.callId}:args`, ft.argsRaw, { sourceKind: 'tool', overrideNodeKey: conversationContextKey('tool-call', ft.callId) })
            }
          }
        }
        if (fields.length) {
          items.push({ seq: rec.seq, durable: true, stableKey: rec.stableId || `${rec.linkKind}:${rec.compactionId || rec.nodeId || rec.seq}`, nodeKey, sourceKind: rec.sourceKind, ...coord, fields })
        }
      }
      const { byStep, byTool } = reduceTransientChunks(transientEntries || [])
      for (const st of byStep.values()) {
        if (settledSteps.has(`${st.turn}:${st.step}`)) continue
        const fields = []
        const indices = [...st.blocks.keys()].sort((a, b) => a - b)
        for (const idx of indices) {
          const b = st.blocks.get(idx)
          if (b && (b.kind === 'reasoning' || b.kind === 'text') && b.text) {
            pushField(fields, `${b.kind}:${idx}`, b.kind === 'text' ? searchableReplyText(b) : b.text, { groupPart: b.kind === 'reasoning' ? 'reasoning' : 'response', sourceKind: b.kind === 'reasoning' ? 'reasoning' : 'response' })
          }
        }
        if (fields.length) {
          const tStart = turnStartSeqs.get(st.turn)
          items.push({ seq: st.seq, durable: false, stableKey: `asst:${st.turn}:${st.step}`, nodeKey: conversationContextKey('assistant-step', `${st.turn}:${st.step}`), sourceKind: 'response', turn: st.turn, turnStartSeq: tStart, pendingTurn: tStart === undefined, fields })
        }
      }
      for (const tc of byTool.values()) {
        if (seenToolCalls.has(tc.callId)) continue
        const fields = []
        pushField(fields, 'name', tc.name)
        pushField(fields, 'args', tc.argsRaw)
        if (fields.length) {
          const tStart = turnStartSeqs.get(tc.turn)
          items.push({ seq: tc.seq, durable: false, stableKey: `toolcall:${tc.callId}`, nodeKey: conversationContextKey('tool-call', tc.callId), sourceKind: 'tool', turn: tc.turn, turnStartSeq: tStart, pendingTurn: tStart === undefined, fields })
        }
      }
      return items.sort((a, b) => a.seq - b.seq)
    }
    const escapeRegExp = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    const compileLiteralRegex = (query, caseSensitive) => {
      if (typeof query !== 'string' || query.length === 0) return null
      return new RegExp(escapeRegExp(query), caseSensitive ? 'gu' : 'giu')
    }

    const buildExcerpt = (text, offset, length) => {
      const ctxChars = 48
      const start = Math.max(0, offset - ctxChars)
      const end = Math.min(text.length, offset + length + ctxChars)
      const relStart = offset - start
      return {
        before: (start > 0 ? '…' : '') + text.slice(start, offset),
        match: text.slice(offset, offset + length),
        after: text.slice(offset + length, end) + (end < text.length ? '…' : ''),
        leftContext: text.slice(Math.max(0, offset - 20), offset),
        rightContext: text.slice(offset + length, Math.min(text.length, offset + length + 20)),
        relStart,
      }
    }

    const matchItems = (items, query, caseSensitive, { includeExcerpts = true, keepText = false, excerptKey, sourceKinds } = {}) => {
      const rx = compileLiteralRegex(query, caseSensitive)
      if (!rx) return []
      const hits = []
      const blockCounts = new Map()
      for (const item of items) {
        const baseNodeKey = item.nodeKey
        for (let fi = 0; fi < item.fields.length; fi++) {
          const f = item.fields[fi]
          if (!f || typeof f.text !== 'string' || !f.text) continue
          const srcKind = f.sourceKind || item.sourceKind || 'response'
          if (sourceKinds && !sourceKinds.has(srcKind)) continue
          const nodeKey = f.overrideNodeKey || baseNodeKey
          const groupPart = f.groupPart || null
          const blockSig = nodeKey ? `${nodeKey}|${groupPart || ''}` : null
          rx.lastIndex = 0
          let m
          let fieldOrdinal = 0
          while ((m = rx.exec(f.text)) !== null) {
            if (m[0].length === 0) { rx.lastIndex++; continue }
            const blockOrdinal = blockSig ? (blockCounts.get(blockSig) || 0) : 0
            if (blockSig) blockCounts.set(blockSig, blockOrdinal + 1)
            const hitKey = `${item.stableKey}|${f.fieldKey}|${fieldOrdinal}`
            hits.push({
              hitKey,
              seq: item.seq,
              durable: item.durable,
              turn: item.turn,
              turnStartSeq: item.turnStartSeq,
              pendingTurn: item.pendingTurn,
              nodeKey,
              groupPart,
              sourceKind: f.sourceKind || item.sourceKind || 'response',
              subCallId: item.subCallId || null,
              parentCallId: item.parentCallId || null,
              fieldKey: f.fieldKey,
              fieldOrder: fi,
              offset: m.index,
              length: m[0].length,
              fieldOrdinal,
              blockOrdinal,
              matchText: m[0],
              fieldText: keepText ? f.text : undefined,
              excerpt: includeExcerpts || excerptKey === hitKey ? buildExcerpt(f.text, m.index, m[0].length) : null,
            })
            fieldOrdinal++
          }
        }
      }
      return hits
    }

    const createHistoryCache = (maxBytes = MAX_HISTORY_CACHE_BYTES) => {
      let tick = 0
      let compactEvaluator = null
      const pages = new Map()
      const hitExcerpts = new Map()
      const totalCachedBytes = () => {
        let sum = 0
        for (const p of pages.values()) if (p.extracted) sum += p.extracted.byteSize
        return sum
      }
      const evictIfNeeded = () => {
        let sum = totalCachedBytes()
        if (sum <= maxBytes) return
        const lru = [...pages.values()].filter((p) => p.extracted).sort((a, b) => a.lruTick - b.lruTick)
        for (const p of lru) {
          if (sum <= maxBytes) break
          if (!p.compactHitsValidForQuery && typeof compactEvaluator === 'function') {
            p.compactHits = compactEvaluator(p).map((h) => ({ ...h, pageKey: p.pageKey, excerpt: null }))
            p.compactHitsValidForQuery = true
          }
          sum -= p.extracted.byteSize
          p.extracted = null
          p.evicted = true
        }
      }
      const putPage = (entry) => {
        tick++
        const pageKey = `${entry.minSeq}..${entry.maxSeq}`
        const rec = {
          pageKey,
          reqThroughSeq: entry.reqThroughSeq,
          reqBeforeSeq: entry.reqBeforeSeq,
          minSeq: entry.minSeq,
          maxSeq: entry.maxSeq,
          boundaries: entry.extracted.boundaries,
          extracted: entry.extracted,
          compactHits: (entry.compactHits || []).map((h) => ({ ...h, pageKey, excerpt: null })),
          compactHitsValidForQuery: Boolean(entry.compactHitsValidForQuery),
          evicted: false,
          lruTick: tick,
        }
        pages.set(pageKey, rec)
        evictIfNeeded()
        return rec
      }
      return {
        get pages() { return pages },
        get hitExcerpts() { return hitExcerpts },
        totalCachedBytes,
        setCompactEvaluator(fn) { compactEvaluator = fn },
        putPage,
        touch(pageKey) { const p = pages.get(pageKey); if (p) p.lruTick = ++tick },
        setPageHits(pageKey, hits) {
          const p = pages.get(pageKey)
          if (!p) return
          p.compactHits = hits.map((h) => ({ ...h, pageKey, excerpt: null }))
          p.compactHitsValidForQuery = true
        },
        pruneExcerpts(keepKeys) {
          for (const k of hitExcerpts.keys()) if (!keepKeys.has(k)) hitExcerpts.delete(k)
        },
        clear() { pages.clear(); hitExcerpts.clear() },
      }
    }
    const resolveSessionAddress = (sessionsSvc, binding, sessionId) => {
      const snapSub = binding?.session?.getSnapshot?.()?.subagent?.address
      if (snapSub && typeof snapSub === 'object') return { ...snapSub, kind: 'subagent' }
      const catalogSub = typeof sessionsSvc?.subagentAddress === 'function' ? sessionsSvc.subagentAddress(sessionId) : undefined
      if (catalogSub && typeof catalogSub === 'object') return { ...catalogSub, kind: 'subagent' }
      return { kind: 'session', sessionId }
    }

    const durableSeqBounds = (entries) => {
      let minSeq = Infinity
      let maxSeq = -1
      const events = []
      const transients = []
      for (const entry of entries || []) {
        if (!entry || !entry.event) continue
        if (entry.type === 'transient') {
          transients.push(entry)
          continue
        }
        if (entry.type === 'event' && Number.isSafeInteger(entry.event.seq) && entry.event.seq >= 0) {
          events.push(entry.event)
          if (entry.event.seq < minSeq) minSeq = entry.event.seq
          if (entry.event.seq > maxSeq) maxSeq = entry.event.seq
        }
      }
      return { minSeq: minSeq === Infinity ? null : minSeq, maxSeq: maxSeq < 0 ? null : maxSeq, events, transients }
    }

    const callSessionPageRpc = (remoteSession, request, signal) => {
      if (typeof remoteSession?.events === 'function') return remoteSession.events(request, signal)
      if (typeof remoteSession?.page === 'function') return remoteSession.page(request, signal)
      return Promise.reject(new Error('remote.session page method unavailable'))
    }

    const validatePageResult = (res, expectedThroughSeq, expectedBeforeSeq) => {
      if (!res || res.ok !== true || !res.value || !Array.isArray(res.value.records) || typeof res.value.hasMore !== 'boolean') {
        return { ok: false, reason: 'invalid-response' }
      }
      const { cursor, records, hasMore } = res.value
      if (!Number.isSafeInteger(cursor) || cursor < -1) return { ok: false, reason: 'invalid-cursor' }
      if (expectedThroughSeq !== undefined && cursor !== expectedThroughSeq) return { ok: false, reason: 'cursor-mismatch' }
      if (records.length === 0) {
        if (hasMore || (expectedBeforeSeq === undefined && cursor >= 0)) return { ok: false, reason: 'empty-page-gap' }
        if (expectedBeforeSeq !== undefined && expectedBeforeSeq > 0) return { ok: false, reason: 'gap-before-zero' }
        return { ok: true, cursor, events: [], minSeq: null, maxSeq: null, hasMore: false }
      }
      const events = []
      let prev = -1
      for (const rec of records) {
        const ev = rec?.event
        if (!ev || !Number.isSafeInteger(ev.seq) || ev.seq < 0 || ev.seq > cursor) return { ok: false, reason: 'invalid-seq' }
        if (prev >= 0 && ev.seq !== prev + 1) return { ok: false, reason: 'non-contiguous-page' }
        prev = ev.seq
        events.push(ev)
      }
      const minSeq = events[0].seq
      const maxSeq = events[events.length - 1].seq
      if (expectedBeforeSeq !== undefined) {
        if (minSeq >= expectedBeforeSeq) return { ok: false, reason: 'no-progress' }
        if (maxSeq !== expectedBeforeSeq - 1) return { ok: false, reason: 'gap-at-upper-bound' }
      }
      if (expectedBeforeSeq === undefined && maxSeq !== cursor) return { ok: false, reason: 'gap-at-cut' }
      if (!hasMore && minSeq > 0) return { ok: false, reason: 'stopped-before-zero' }
      return { ok: true, cursor, events, minSeq, maxSeq, hasMore }
    }

    const yieldThread = () => new Promise((resolve) => setTimeout(resolve, 0))

    const computeCombinedMatches = (cache, liveEntries, query, caseSensitive, sourceKinds = null) => {
      if (!query) return { hits: [], evictedPending: false }
      const { minSeq: liveMin, events: liveEvents, transients } = durableSeqBounds(liveEntries)
      const allBoundaries = []
      const liveExtracted = extractPageFromEvents(liveEvents)
      for (const boundary of liveExtracted.boundaries) allBoundaries.push(boundary)
      const activeRaw = []
      const evictedHits = []
      let evictedPending = false
      const sortedPages = [...cache.pages.values()].sort((a, b) => (a.minSeq ?? 0) - (b.minSeq ?? 0))
      for (const p of sortedPages) {
        for (const boundary of p.boundaries) allBoundaries.push(boundary)
        if (liveMin !== null && p.minSeq !== null && p.minSeq >= liveMin) continue
        if (p.extracted) {
          for (const rec of p.extracted.rawItems) {
            if (liveMin === null || rec.seq < liveMin) activeRaw.push(rec)
          }
        } else if (p.evicted) {
          if (p.compactHitsValidForQuery) {
            for (const h of p.compactHits) if (liveMin === null || h.seq < liveMin) evictedHits.push(h)
          } else {
            evictedPending = true
          }
        }
      }
      for (const rec of liveExtracted.rawItems) activeRaw.push(rec)
      const index = foldBoundaries(allBoundaries)
      const items = assembleSearchableItems(allBoundaries, activeRaw, transients, index)
      const { turnStartSeqs, spans } = index
      const freshHits = matchItems(items, query, caseSensitive, { includeExcerpts: false, keepText: true, sourceKinds })
      for (const h of evictedHits) {
        const coord = resolveTurnAt(h.seq, h.turn, spans, turnStartSeqs)
        h.turn = coord.turn ?? h.turn
        h.turnStartSeq = coord.turnStartSeq ?? h.turnStartSeq
        h.pendingTurn = coord.pendingTurn
      }
      const merged = [...evictedHits, ...freshHits].sort((a, b) => a.seq - b.seq || a.fieldOrder - b.fieldOrder || a.offset - b.offset)
      return { hits: merged, evictedPending, turnStartSeqs, spans }
    }
    const isExcludedTextAncestor = (node, rootEl, excludedGroupParts = null) => {
      let cur = node.parentElement
      while (cur && cur !== rootEl) {
        const tag = cur.tagName
        // DSH renders file links and inline file mentions as buttons with CSS-module classes.
        if (tag === 'BUTTON' && !cur.hasAttribute('data-ref-chip') && !/(?:^|\s)_?(?:fileLink|fileMention)(?:_|\s|$)/.test(cur.className)) return true
        if (tag === 'svg' || tag === 'SVG' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return true
        if (cur.hasAttribute('hidden') || cur.getAttribute('aria-hidden') === 'true') return true
        if (cur.hasAttribute('data-text-interaction-surface') || cur.hasAttribute('data-chat-node-key')) return true
        if (excludedGroupParts && excludedGroupParts.size) {
          const gp = cur.getAttribute?.('data-chat-group-part')
          if (gp && excludedGroupParts.has(gp)) return true
        }
        cur = cur.parentElement
      }
      return false
    }

    const collectBlockTextSegments = (rootEl, excludedGroupParts = null) => {
      if (!rootEl || typeof document === 'undefined' || typeof document.createTreeWalker !== 'function') {
        return { text: '', segments: [] }
      }
      if (excludedGroupParts && excludedGroupParts.size) {
        const rootPart = rootEl.getAttribute?.('data-chat-group-part')
        if (rootPart && excludedGroupParts.has(rootPart)) return { text: '', segments: [] }
      }
      const walker = document.createTreeWalker(rootEl, 4 /* NodeFilter.SHOW_TEXT */, {
        acceptNode: (n) => (isExcludedTextAncestor(n, rootEl, excludedGroupParts) ? 2 /* FILTER_REJECT */ : 1 /* FILTER_ACCEPT */),
      })
      const segments = []
      let joined = ''
      let n
      while ((n = walker.nextNode())) {
        const val = n.nodeValue || ''
        if (!val) continue
        const start = joined.length
        joined += val
        segments.push({ node: n, start, end: joined.length })
      }
      return { text: joined, segments }
    }

    const rangeFromDomOffsets = (segments, start, end, firstSegment) => {
      if (!segments.length || typeof document === 'undefined' || typeof document.createRange !== 'function') return null
      let startNode = null
      let startOff = 0
      let endNode = null
      let endOff = 0
      for (let i = firstSegment; i < segments.length; i++) {
        const seg = segments[i]
        if (!startNode && start >= seg.start && start < seg.end) {
          startNode = seg.node
          startOff = start - seg.start
        }
        if (end > seg.start && end <= seg.end) {
          endNode = seg.node
          endOff = end - seg.start
          break
        }
      }
      if (!startNode || !endNode) return null
      try {
        const range = document.createRange()
        range.setStart(startNode, startOff)
        range.setEnd(endNode, endOff)
        return range
      } catch {
        return null
      }
    }

    const matchRangesInBlock = (rootEl, query, caseSensitive, excludedGroupParts = null, limit = Infinity) => {
      const rx = compileLiteralRegex(query, caseSensitive)
      if (!rx) return []
      const { text, segments } = collectBlockTextSegments(rootEl, excludedGroupParts)
      if (!text) return []
      const out = []
      let segmentIndex = 0
      let m
      while (out.length < limit && (m = rx.exec(text)) !== null) {
        while (segments[segmentIndex].end <= m.index) segmentIndex++
        const range = rangeFromDomOffsets(segments, m.index, m.index + m[0].length, segmentIndex)
        if (range && range.toString() === m[0]) {
          out.push({ range, domOffset: m.index, domLength: m[0].length, domText: text })
        }
      }
      return out
    }

    const pickVerifiedHitRange = (rootEl, hit, query, caseSensitive, blockHitTotal, excludedGroupParts = null) => {
      const rx = compileLiteralRegex(query, caseSensitive)
      if (!rx) return null
      const { text, segments } = collectBlockTextSegments(rootEl, excludedGroupParts)
      const left = (hit.excerpt?.leftContext || '').trim().slice(-8)
      const right = (hit.excerpt?.rightContext || '').trim().slice(0, 8)
      let count = 0
      let bestScore = -1, bestOffset = -1, ties = 0
      let ordinalScore = -1, ordinalOffset = -1
      for (const match of text.matchAll(rx)) {
        const start = match.index
        const end = start + match[0].length
        let score = 0
        if (left && text.slice(Math.max(0, start - 16), start).trim().endsWith(left)) score++
        if (right && text.slice(end, end + 16).trim().startsWith(right)) score++
        if (score > bestScore) {
          bestScore = score
          bestOffset = start
          ties = 1
        } else if (score === bestScore) ties++
        if (count === hit.blockOrdinal) { ordinalScore = score; ordinalOffset = start }
        count++
      }
      let offset = -1
      if (count === blockHitTotal && ordinalScore === bestScore) offset = ordinalOffset
      else if (bestScore > 0 && ties === 1) offset = bestOffset
      if (offset < 0) return null
      // Case folding may match a different number of UTF-16 code units than the query.
      rx.lastIndex = offset
      const matched = rx.exec(text)
      if (!matched || matched.index !== offset) return null
      const range = rangeFromDomOffsets(segments, offset, offset + matched[0].length, 0)
      return range?.toString() === matched[0] ? range : null
    }
    const resolveMainConversationRoot = (doc, sessionId) => {
      if (!doc || !sessionId) return null
      const candidates = doc.querySelectorAll('[data-conversation-session]')
      for (const el of candidates) {
        if (el.dataset?.conversationSession !== sessionId) continue
        if (/embeddedBody/i.test(String(el.className || ''))) continue
        if (el.closest?.('[inert], [role="dialog"], [aria-modal="true"], [data-rightbar-col], [data-global-panel], [aria-hidden="true"]')) continue
        if (el.parentElement?.closest?.('[data-conversation-session]')) continue
        const flow = el.querySelector('[data-chat-flow]')
        if (!flow || flow.closest?.('[hidden]')) continue
        return { root: el, flow }
      }
      return null
    }

    const findTargetNodeElements = (flow, hit) => {
      if (!flow) return []
      if (hit.nodeKey) {
        const all = []
        for (const el of flow.querySelectorAll('[data-chat-node-key]')) {
          if (el.dataset?.chatNodeKey === hit.nodeKey) all.push(el)
        }
        if (all.length && hit.groupPart) {
          const byPart = []
          for (const el of all) {
            if (el.dataset?.chatGroupPart === hit.groupPart) byPart.push(el)
            else for (const sub of el.querySelectorAll?.('[data-chat-group-part]') || []) {
              if (sub.dataset?.chatGroupPart === hit.groupPart) byPart.push(sub)
            }
          }
          if (byPart.length) return byPart
        }
        if (all.length) return all
      }
      return []
    }

    const findTurnAnchor = (flow, turn) => {
      if (Number.isSafeInteger(turn)) {
        for (const el of flow.querySelectorAll('[data-chat-turn]')) {
          if (el.dataset?.chatTurn === String(turn) && !el.closest('[hidden]')) return el
        }
      }
      return null
    }

    const waitDomCommit = (observeRoot, isStale, timeoutMs = 240, untilFn = null) => new Promise((resolve) => {
      if (isStale()) return resolve(false)
      if (untilFn && untilFn()) return resolve(true)
      let done = false
      let timer = null
      let obs = null
      const finish = (ok) => {
        if (done) return
        done = true
        if (timer !== null) clearTimeout(timer)
        try { obs?.disconnect() } catch {}
        resolve(ok)
      }
      if (typeof MutationObserver === 'function' && observeRoot) {
        obs = new MutationObserver(() => {
          if (isStale()) return finish(false)
          if (untilFn && !untilFn()) return
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => finish(true))
          else finish(true)
        })
        try { obs.observe(observeRoot, { attributes: true, attributeFilter: ['hidden', 'aria-expanded'], childList: true, subtree: true }) } catch {}
      }
      timer = setTimeout(() => finish(!isStale()), timeoutMs)
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (isStale()) finish(false); else if (untilFn && untilFn()) finish(true) })
    })

    const revealHiddenAncestors = async (flow, targetEl, hit, query, caseSensitive, blockHitTotal, isStale, excludedGroupParts = null) => {
      if (!targetEl.closest?.('[hidden]') && pickVerifiedHitRange(targetEl, hit, query, caseSensitive, blockHitTotal, excludedGroupParts)) return targetEl
      const currentTarget = () => flow.contains(targetEl) ? targetEl : findTargetNodeElements(flow, hit)[0]
      const hiddenChain = []
      let cur = targetEl
      while (cur && cur !== flow) {
        if (cur.getAttribute?.('hidden') === 'until-found' || cur.hasAttribute?.('hidden')) hiddenChain.push(cur)
        cur = cur.parentElement
      }
      if (hiddenChain.length) {
        hiddenChain.reverse()
        for (const anc of hiddenChain) {
          if (isStale()) return null
          try { anc.dispatchEvent(new Event('beforematch', { bubbles: false })) } catch {}
        }
        await waitDomCommit(flow, isStale, 900, () => hiddenChain.every((anc) => !anc.hasAttribute?.('hidden')))
        if (isStale()) return null
      }
      let primary = currentTarget()
      const innerHidden = [...(primary?.querySelectorAll?.('[hidden="until-found"]') || [])]
      if (innerHidden.length) {
        for (const h of innerHidden) {
          if (isStale()) return null
          try { h.dispatchEvent(new Event('beforematch', { bubbles: false })) } catch {}
        }
        await waitDomCommit(primary, isStale, 600, () => innerHidden.every((h) => !h.hasAttribute?.('hidden')))
        if (isStale()) return null
        primary = currentTarget() || primary
      }
      if (hit.nodeKey && primary && !pickVerifiedHitRange(primary, hit, query, caseSensitive, blockHitTotal, excludedGroupParts)) {
        const toggles = [...primary.querySelectorAll('[aria-expanded="false"]')].filter((btn) => {
          if (btn.closest('[data-chat-node-key]') !== primary) return false
          if (btn.hasAttribute('aria-haspopup')) return false
          return btn.matches('button, [role="button"], [data-expandable]')
        })
        if (toggles.length >= 1 && toggles.length <= 4) {
          for (const toggleBtn of toggles) {
            if (isStale()) return null
            try { toggleBtn.click() } catch {}
            await waitDomCommit(primary, isStale, 450, () => !(typeof primary.contains === 'function' ? primary.contains(toggleBtn) : toggleBtn.isConnected) || toggleBtn.getAttribute('aria-expanded') !== 'false')
            if (isStale()) return null
            primary = currentTarget() || primary
            if (pickVerifiedHitRange(primary, hit, query, caseSensitive, blockHitTotal, excludedGroupParts)) break
          }
        }
      }
      return currentTarget() || null
    }
    const createHighlightManager = () => {
      const clear = () => {
        if (typeof CSS !== 'undefined' && CSS.highlights) {
          try { CSS.highlights.delete(HIGHLIGHT_ALL) } catch {}
          try { CSS.highlights.delete(HIGHLIGHT_CURRENT) } catch {}
        }
      }
      const apply = (visibleRanges, currentRange) => {
        clear()
        const hasCssHl = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function'
        if (hasCssHl) {
          if (visibleRanges.length) {
            try { CSS.highlights.set(HIGHLIGHT_ALL, new Highlight(...visibleRanges)) } catch {}
          }
          if (currentRange) {
            try { CSS.highlights.set(HIGHLIGHT_CURRENT, new Highlight(currentRange)) } catch {}
          }
        }
      }
      return { clear, apply }
    }

    const findMainScroller = (root, flow) => {
      if (!root || !flow) return null
      let cur = flow.parentElement
      while (cur && cur !== root.parentElement) {
        if (cur.scrollHeight > cur.clientHeight + 1) {
          const ov = typeof getComputedStyle === 'function' ? getComputedStyle(cur).overflowY : 'auto'
          if (ov === 'auto' || ov === 'scroll') return cur
        }
        cur = cur.parentElement
      }
      return root.querySelector('[data-conversation-scroll]') || flow.parentElement
    }

    const collectVisibleBlockRanges = (flow, scroller, query, caseSensitive, allowedTargets = null, excludedGroupParts = null) => {
      if (!flow || !query || typeof CSS === 'undefined' || !CSS.highlights) return []
      if (allowedTargets && allowedTargets.size === 0) return []
      const sRect = scroller?.getBoundingClientRect?.()
      const topBound = sRect ? sRect.top - 400 : -400
      const botBound = sRect ? sRect.bottom + 400 : 2000
      const ranges = []
      for (const nodeEl of flow.querySelectorAll('[data-chat-node-key]')) {
        if (nodeEl.closest('[hidden]')) continue
        if (allowedTargets) {
          const ownKey = nodeEl.dataset?.chatNodeKey || ''
          const ownPart = nodeEl.dataset?.chatGroupPart || ''
          if (ownPart) {
            if (!allowedTargets.has(`${ownKey}|${ownPart}`) && !allowedTargets.has(`${ownKey}|`)) continue
          } else if (!allowedTargets.has(ownKey)) {
            continue
          }
        }
        const r = nodeEl.getBoundingClientRect?.()
        if (sRect && r && (r.bottom < topBound || r.top > botBound)) continue
        for (const item of matchRangesInBlock(nodeEl, query, caseSensitive, excludedGroupParts, 250 - ranges.length)) {
          ranges.push(item.range)
          if (ranges.length >= 250) return ranges
        }
      }
      return ranges
    }

    const effectiveRect = (targetEl, range) => {
      const rr = range?.getBoundingClientRect?.()
      if (rr && (rr.width > 0 || rr.height > 0)) return rr
      return targetEl?.getBoundingClientRect?.() || null
    }

    const centerInScroller = (scroller, targetEl, range) => {
      if (!scroller || !scroller.getBoundingClientRect) return
      const rect = effectiveRect(targetEl, range)
      const sRect = scroller.getBoundingClientRect()
      if (!rect || sRect.height <= 0) return
      const nextTop = scroller.scrollTop + (rect.top - sRect.top) - Math.max(24, (sRect.height - rect.height) * 0.4)
      scroller.scrollTop = Math.max(0, nextTop)
    }

    const scrollToMatchTarget = (root, flow, targetEl, range, isStale) => {
      const innerBody = targetEl?.closest?.('[data-step-process-body]')
      if (innerBody && innerBody.scrollHeight > innerBody.clientHeight + 1) {
        centerInScroller(innerBody, targetEl, range)
      }
      const scroller = findMainScroller(root, flow)
      if (!scroller) return () => {}
      centerInScroller(scroller, targetEl, range)
      let userMoved = false
      const cancelFollow = () => { userMoved = true }
      const evts = ['wheel', 'touchstart', 'pointerdown']
      for (const ev of evts) scroller.addEventListener(ev, cancelFollow, { passive: true, once: true })
      const timer = setTimeout(() => {
        for (const ev of evts) scroller.removeEventListener(ev, cancelFollow)
        if (isStale() || userMoved) return
        const rect = effectiveRect(targetEl, range)
        const sRect = scroller.getBoundingClientRect?.()
        if (rect && sRect && (rect.top < sRect.top + 16 || rect.bottom > sRect.bottom - 16)) {
          centerInScroller(scroller, targetEl, range)
        }
      }, 190)
      return () => {
        clearTimeout(timer)
        for (const ev of evts) scroller.removeEventListener(ev, cancelFollow)
      }
    }
    const createFindController = (deps) => {
      const { sessions, layout, locale, doc = typeof document !== 'undefined' ? document : undefined } = deps
      let remoteSession = deps.remoteSession || null
      const listeners = new Set()
      const cache = createHistoryCache(MAX_HISTORY_CACHE_BYTES)
      const hl = createHighlightManager()
      let disposed = false
      let open = false
      let activeSessionId = null
      let activeBinding = null
      let lastRevision = -1
      let query = ''
      let caseSensitive = false
      let searchScope = { ...DEFAULT_SEARCH_SCOPE }
      let scopeMenuOpen = false
      let queryGen = 0
      const enabledKinds = () => resolveEnabledSourceKinds(searchScope)
      const excludedParts = () => resolveExcludedGroupParts(enabledKinds())
      cache.setCompactEvaluator((p) => (
        query ? matchItems(assembleSearchableItems(p.boundaries, p.extracted.rawItems, []), query, caseSensitive, { includeExcerpts: false, sourceKinds: enabledKinds() }) : []
      ))
      let hits = []
      let navigated = false
      let selectedIndex = -1
      let selectedHitKey = null
      let scanState = 'idle'
      let scanError = null
      let pinnedThroughSeq
      let nextBeforeSeq
      let remoteHasMore = false
      let hasEvictedPending = false
      let loadingTarget = false
      let fallbackNotice = null
      let scanAbort = null
      let scanGen = 0
      let navGen = 0
      let navAbort = null
      let debounceTimer = null
      let cancelScrollTimer = () => {}
      let returnFocusEl = null
      let runtime = 'web'
      let platform = 'windows'
      let unbindSession = () => {}
      let blockRenderCounts = new Map()
      let allowedDomTargets = new Set()
      let focusSeq = 0

      const t = (key, vars) => {
        const fam = typeof locale?.getSnapshot === 'function' && String(locale.getSnapshot()?.active || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
        let msg = LOCALES[fam][key] || LOCALES.en[key] || key
        if (vars) for (const [k, v] of Object.entries(vars)) msg = msg.replaceAll(`{${k}}`, String(v))
        return msg
      }

      const buildSnapshot = () => ({
        open, sessionId: activeSessionId, query, caseSensitive, scope: searchScope, hasCustomScope: isCustomScope(searchScope), scopeMenuOpen,
        hits, navigated, selectedIndex, selectedHitKey,
        scanState, scanError, remoteHasMore, hasEvictedPending, loadingTarget, fallbackNotice,
        hasRemote: Boolean(remoteSession && (typeof remoteSession.events === 'function' || typeof remoteSession.page === 'function')),
        canScanHistory: Boolean(query && (remoteHasMore || hasEvictedPending)),
        runtime, platform, activeHit: selectedIndex >= 0 && selectedIndex < hits.length ? hits[selectedIndex] : null, focusSeq,
      })
      let cachedSnapshot = buildSnapshot()
      const emit = () => { cachedSnapshot = buildSnapshot(); for (const fn of [...listeners]) fn() }
      const getSnapshot = () => cachedSnapshot

      const pruneAround = (centerIdx) => {
        const keep = new Set()
        const lo = Math.max(0, (centerIdx < 0 ? hits.length - 1 : centerIdx) - 20)
        const hi = Math.min(hits.length - 1, (centerIdx < 0 ? hits.length - 1 : centerIdx) + 20)
        for (let i = lo; i <= hi; i++) keep.add(hits[i].hitKey)
        cache.pruneExcerpts(keep)
      }

      const computeRemainingMore = (win) => {
        if (nextBeforeSeq !== undefined) return nextBeforeSeq > 0 && remoteHasMore
        return Boolean(win?.hasMore)
      }

      const prepareExcerpt = (hit) => {
        if (!hit.excerpt) hit.excerpt = hit.fieldText !== undefined
          ? buildExcerpt(hit.fieldText, hit.offset, hit.length) : cache.hitExcerpts.get(hit.hitKey) || null
      }

      const refreshVisibleHighlights = (currentRange) => {
        if (!open || !query || !activeSessionId || !doc) { hl.clear(); return }
        const mainRoot = resolveMainConversationRoot(doc, activeSessionId)
        if (!mainRoot) { hl.clear(); return }
        const exclParts = excludedParts()
        if (currentRange === undefined && navigated && selectedIndex >= 0 && hits[selectedIndex]) {
          const active = hits[selectedIndex]
          prepareExcerpt(active)
          const targets = findTargetNodeElements(mainRoot.flow, active)
          const sig = `${active.nodeKey || ''}|${active.groupPart || ''}`
          const blockTotal = blockRenderCounts.get(sig) || 1
          for (const el of targets) {
            if (el.closest?.('[hidden]')) continue
            const rng = pickVerifiedHitRange(el, active, query, caseSensitive, blockTotal, exclParts)
            if (rng) { currentRange = rng; break }
          }
        }
        const scroller = findMainScroller(mainRoot.root, mainRoot.flow)
        const visibleRanges = collectVisibleBlockRanges(mainRoot.flow, scroller, query, caseSensitive, allowedDomTargets, exclParts)
        hl.apply(visibleRanges, currentRange)
      }

      const cancelRefresh = () => {
        if (debounceTimer !== null) clearTimeout(debounceTimer)
        debounceTimer = null
      }
      const recomputeLocal = () => {
        cancelRefresh()
        if (!open || !activeBinding || !query) {
          hits = []
          allowedDomTargets.clear()
          blockRenderCounts.clear()
          selectedIndex = -1
          navigated = false
          selectedHitKey = null
          hasEvictedPending = false
          hl.clear()
          emit()
          return
        }
        const win = activeBinding.eventSource.getSnapshot()
        remoteHasMore = computeRemainingMore(win)
        const res = computeCombinedMatches(cache, win?.entries || [], query, caseSensitive, enabledKinds())
        hits = res.hits
        allowedDomTargets = buildAllowedDomTargets(hits)
        hasEvictedPending = res.evictedPending
        blockRenderCounts = new Map()
        for (const h of hits) {
          if (h.nodeKey) {
            const sig = `${h.nodeKey}|${h.groupPart || ''}`
            blockRenderCounts.set(sig, (blockRenderCounts.get(sig) || 0) + 1)
          }
        }
        if (navigated && selectedHitKey) {
          const foundIdx = hits.findIndex((h) => h.hitKey === selectedHitKey)
          if (foundIdx >= 0) selectedIndex = foundIdx
          else { selectedIndex = -1; navigated = false }
        } else {
          selectedIndex = -1
        }
        pruneAround(selectedIndex)
        refreshVisibleHighlights()
        emit()
      }

      // A burst of stream chunks or history pages needs only one search of the latest snapshot.
      const scheduleRefresh = () => {
        if (open && query && debounceTimer === null) debounceTimer = setTimeout(recomputeLocal, DEBOUNCE_MS)
      }

      const abortScanOnly = () => {
        scanGen++
        if (scanAbort) { try { scanAbort.abort() } catch {} scanAbort = null }
      }

      const abortNavigationOnly = () => {
        navGen++
        navAbort?.abort()
        navAbort = null
        loadingTarget = false
        cancelScrollTimer()
        cancelScrollTimer = () => {}
      }

      const resetScanCursor = () => {
        abortScanOnly()
        cache.clear()
        pinnedThroughSeq = undefined
        nextBeforeSeq = undefined
        hasEvictedPending = false
        scanError = null
        scanState = 'idle'
      }

      const onQueryChanged = (nextQuery, nextCase) => {
        query = nextQuery
        caseSensitive = nextCase
        queryGen++
        cache.hitExcerpts.clear()
        abortScanOnly()
        abortNavigationOnly()
        navigated = false
        selectedIndex = -1
        selectedHitKey = null
        fallbackNotice = null
        for (const p of cache.pages.values()) {
          p.compactHitsValidForQuery = false
          p.compactHits = []
        }
        scanState = 'idle'
        scanError = null
        cancelRefresh()
        emit()
        if (!query) { recomputeLocal(); return }
        scheduleRefresh()
      }

      const flushDebounce = () => {
        if (debounceTimer !== null) recomputeLocal()
      }

      const waitForLoadingOlderClear = (session, signal) => new Promise((resolve) => {
        if (signal.aborted || !session.getSnapshot().loadingOlder) return resolve()
        const finish = () => {
          unsubscribe()
          signal.removeEventListener('abort', finish)
          resolve()
        }
        const unsubscribe = session.subscribe(() => {
          if (!session.getSnapshot().loadingOlder) finish()
        })
        signal.addEventListener('abort', finish, { once: true })
      })

      const fetchEvictedExcerpt = async (hit, myNav, signal) => {
        if (!hit.pageKey || !remoteSession) return hit
        const page = cache.pages.get(hit.pageKey)
        if (!page) return hit
        cache.touch(hit.pageKey)
        if (page.extracted) {
          const items = assembleSearchableItems(page.boundaries, page.extracted.rawItems, [])
          const matched = matchItems(items, query, caseSensitive, { includeExcerpts: false, excerptKey: hit.hitKey, sourceKinds: enabledKinds() }).find((m) => m.hitKey === hit.hitKey)
          if (matched?.excerpt) { hit.excerpt = matched.excerpt; cache.hitExcerpts.set(hit.hitKey, matched.excerpt) }
          return hit
        }
        const req = { address: resolveSessionAddress(sessions, activeBinding, activeSessionId), throughSeq: page.reqThroughSeq, ...(page.reqBeforeSeq === undefined ? {} : { beforeSeq: page.reqBeforeSeq }), ...DEFAULT_PAGE_OPTIONS }
        const res = await callSessionPageRpc(remoteSession, req, signal).catch(() => null)
        if (disposed || navGen !== myNav) return hit
        const val = validatePageResult(res, page.reqThroughSeq, page.reqBeforeSeq)
        if (!val.ok) return hit
        const ext = extractPageFromEvents(val.events)
        const items = assembleSearchableItems(ext.boundaries, ext.rawItems, [])
        const pageHits = matchItems(items, query, caseSensitive, { includeExcerpts: false, excerptKey: hit.hitKey, sourceKinds: enabledKinds() })
        cache.putPage({ minSeq: val.minSeq ?? 0, maxSeq: val.maxSeq ?? -1, reqThroughSeq: page.reqThroughSeq, reqBeforeSeq: page.reqBeforeSeq, extracted: ext, compactHits: pageHits, compactHitsValidForQuery: true })
        const matched = pageHits.find((m) => m.hitKey === hit.hitKey)
        if (matched?.excerpt) { hit.excerpt = matched.excerpt; cache.hitExcerpts.set(hit.hitKey, matched.excerpt) }
        return hit
      }


      let detachScrollFn = () => {}
      let scrollRaf = null
      let unbindMainRetain = () => {}

      const resolveMainId = () => {
        if (!sessions) return null
        if (typeof sessions.mainId === 'string' && sessions.mainId) return sessions.mainId
        const byId = sessions.list?.getSnapshot?.()?.byId
        if (byId && typeof byId === 'object') {
          for (const row of Object.values(byId)) {
            if ((row?.retainedBy?.mainView ?? 0) > 0 && row.id) return row.id
          }
        }
        return null
      }

      const isObstructed = () => {
        if (layout?.panelInfo?.getSnapshot?.()?.activePanelId !== null && layout?.panelInfo?.getSnapshot?.()?.activePanelId !== undefined) return true
        if (!doc) return false
        if (doc.querySelector?.('[data-rightbar-fullscreen]')) return true
        if (doc.querySelector?.('[role="dialog"][aria-modal="true"], dialog[open]')) return true
        return false
      }

      const isActiveMainReady = (requireDom = false) => {
        if (!activeSessionId || !activeBinding || isObstructed()) return false
        const sess = activeBinding.session?.getSnapshot?.()
        if (!sess || sess.removed) return false
        if (sess.blank && !activeBinding.eventSource?.getSnapshot?.()?.entries?.length) return false
        if (requireDom && doc && doc.querySelectorAll?.('[data-conversation-session]').length > 0) {
          if (!resolveMainConversationRoot(doc, activeSessionId)) return false
        }
        return true
      }

      const detachScrollerListener = () => {
        detachScrollFn()
        detachScrollFn = () => {}
        if (scrollRaf !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scrollRaf)
        scrollRaf = null
      }

      const attachScrollerListener = () => {
        detachScrollerListener()
        if (!doc || !activeSessionId) return
        const mainRoot = resolveMainConversationRoot(doc, activeSessionId)
        const scroller = mainRoot ? findMainScroller(mainRoot.root, mainRoot.flow) : null
        if (!scroller) return
        const onScroll = () => {
          if (!open || !query || scrollRaf !== null) return
          if (typeof requestAnimationFrame === 'function') {
            scrollRaf = requestAnimationFrame(() => { scrollRaf = null; refreshVisibleHighlights() })
          } else {
            refreshVisibleHighlights()
          }
        }
        scroller.addEventListener('scroll', onScroll, { passive: true })
        detachScrollFn = () => scroller.removeEventListener('scroll', onScroll)
      }

      const startOrResumeScan = async () => {
        flushDebounce()
        const myQuery = query
        const myCase = caseSensitive
        const myKinds = enabledKinds()
        const mySessionId = activeSessionId
        if (!myQuery || !activeBinding || !remoteSession || scanState === 'scanning') return
        abortScanOnly()
        const myScan = ++scanGen
        const myQueryGen = queryGen
        const isStale = () => disposed || scanGen !== myScan || queryGen !== myQueryGen || activeSessionId !== mySessionId
        scanState = 'scanning'
        scanError = null
        emit()

        try {
          const evictedToRescan = [...cache.pages.values()].filter((p) => p.evicted && !p.compactHitsValidForQuery).sort((a, b) => a.minSeq - b.minSeq)
          for (const p of evictedToRescan) {
            if (isStale()) return
            scanAbort = new AbortController()
            const req = { address: resolveSessionAddress(sessions, activeBinding, mySessionId), throughSeq: p.reqThroughSeq, ...(p.reqBeforeSeq === undefined ? {} : { beforeSeq: p.reqBeforeSeq }), ...DEFAULT_PAGE_OPTIONS }
            const res = await callSessionPageRpc(remoteSession, req, scanAbort.signal)
            if (isStale()) return
            const val = validatePageResult(res, p.reqThroughSeq, p.reqBeforeSeq)
            if (!val.ok) { scanState = 'error'; scanError = val.error || t('statusError'); scanAbort = null; emit(); return }
            const ext = extractPageFromEvents(val.events)
            p.boundaries = ext.boundaries
            cache.setPageHits(p.pageKey, matchItems(assembleSearchableItems(ext.boundaries, ext.rawItems, []), myQuery, myCase, { includeExcerpts: false, sourceKinds: myKinds }))
            scheduleRefresh()
            await yieldThread()
          }

          let winSnap = activeBinding.eventSource.getSnapshot()
          let liveBounds = durableSeqBounds(winSnap?.entries || [])
          if (pinnedThroughSeq === undefined) pinnedThroughSeq = liveBounds.maxSeq !== null ? liveBounds.maxSeq : undefined
          if (nextBeforeSeq === undefined && liveBounds.minSeq !== null) nextBeforeSeq = liveBounds.minSeq
          let canPullMore = nextBeforeSeq !== undefined ? nextBeforeSeq > 0 && (remoteHasMore || Boolean(winSnap?.hasMore)) : Boolean(winSnap?.hasMore)

          while (canPullMore && !isStale()) {
            winSnap = activeBinding.eventSource.getSnapshot()
            liveBounds = durableSeqBounds(winSnap?.entries || [])
            if (liveBounds.minSeq !== null && nextBeforeSeq !== undefined && nextBeforeSeq > liveBounds.minSeq) nextBeforeSeq = liveBounds.minSeq
            if (nextBeforeSeq !== undefined && nextBeforeSeq <= 0) { remoteHasMore = false; break }
            scanAbort = new AbortController()
            const req = {
              address: resolveSessionAddress(sessions, activeBinding, mySessionId),
              ...(pinnedThroughSeq === undefined ? {} : { throughSeq: pinnedThroughSeq }),
              ...(nextBeforeSeq === undefined ? {} : { beforeSeq: nextBeforeSeq }),
              ...DEFAULT_PAGE_OPTIONS,
            }
            const res = await callSessionPageRpc(remoteSession, req, scanAbort.signal)
            if (isStale()) return
            const val = validatePageResult(res, pinnedThroughSeq, nextBeforeSeq)
            if (!val.ok) { scanState = 'error'; scanError = val.error || t('statusError'); scanAbort = null; emit(); return }
            if (val.events.length > 0) {
              const ext = extractPageFromEvents(val.events)
              if (pinnedThroughSeq === undefined) pinnedThroughSeq = val.cursor
              cache.putPage({
                minSeq: val.minSeq, maxSeq: val.maxSeq, reqThroughSeq: pinnedThroughSeq ?? val.maxSeq,
                reqBeforeSeq: nextBeforeSeq, extracted: ext,
              })
              nextBeforeSeq = val.minSeq
            }
            remoteHasMore = Boolean(val.hasMore) && (nextBeforeSeq === undefined || nextBeforeSeq > 0)
            scheduleRefresh()
            canPullMore = remoteHasMore && (nextBeforeSeq === undefined || nextBeforeSeq > 0)
            if (canPullMore) await yieldThread()
          }
          if (!isStale()) {
            scanAbort = null
            recomputeLocal()
            scanState = (remoteHasMore || hasEvictedPending) ? 'paused' : 'done'
            emit()
          }
        } catch (err) {
          if (!isStale()) {
            scanState = 'error'
            scanError = err?.message ? String(err.message) : t('statusError')
            scanAbort = null
            emit()
          }
        }
      }

      const pauseScan = () => {
        if (scanState !== 'scanning') return
        abortScanOnly()
        flushDebounce()
        scanState = (remoteHasMore || hasEvictedPending) ? 'paused' : 'done'
        emit()
      }

      const jumpToHit = async (index) => {
        if (!activeBinding || index < 0 || index >= hits.length) return
        abortNavigationOnly()
        navAbort = new AbortController()
        const signal = navAbort.signal
        const myNav = navGen
        const myQueryGen = queryGen
        const isStale = () => disposed || navGen !== myNav || queryGen !== myQueryGen
        const hit = hits[index]
        navigated = true
        selectedIndex = index
        selectedHitKey = hit.hitKey
        fallbackNotice = null
        pruneAround(index)
        emit()

        prepareExcerpt(hit)
        if (!hit.excerpt && hit.pageKey) { await fetchEvictedExcerpt(hit, myNav, signal); if (isStale()) return }

        const initialBounds = durableSeqBounds(activeBinding.eventSource.getSnapshot()?.entries || [])
        if (hit.durable !== false && (initialBounds.minSeq === null || hit.seq < initialBounds.minSeq)) {
          loadingTarget = true
          emit()
          const { session, eventSource } = activeBinding
          const targetSeq = hit.turnStartSeq ?? hit.seq
          let minSeq = initialBounds.minSeq
          try {
            while (!isStale() && (minSeq === null || minSeq > targetSeq)) {
              if (session.getSnapshot().loadingOlder) await waitForLoadingOlderClear(session, signal)
              if (isStale()) return
              if (typeof session.loadThrough === 'function') await session.loadThrough(targetSeq)
              else if (typeof session.loadOlder === 'function') await session.loadOlder()
              else break
              if (isStale()) return
              const win = eventSource.getSnapshot()
              const nextMin = durableSeqBounds(win.entries).minSeq
              if (nextMin === null || (minSeq !== null && nextMin >= minSeq)) break
              minSeq = nextMin
              if (typeof session.loadThrough === 'function' || !win.hasMore) break
            }
          } catch {
            // The Host may have published a partial page before the load failed.
          }
          if (isStale()) return
          loadingTarget = false
          if (!eventSource.getSnapshot().entries.some(entry => entry.type === 'event' && entry.event.seq === hit.seq)) {
            fallbackNotice = t('fallbackHidden')
            refreshVisibleHighlights()
            emit()
            return
          }
        }

        const mainRoot = resolveMainConversationRoot(doc, activeSessionId)
        let targets = mainRoot ? findTargetNodeElements(mainRoot.flow, hit) : []
        if (!targets.length && mainRoot) { await waitDomCommit(mainRoot.flow, isStale, 150); if (isStale()) return; targets = findTargetNodeElements(mainRoot.flow, hit) }
        if (!targets.length) {
          const anchor = mainRoot && findTurnAnchor(mainRoot.flow, hit.turn)
          fallbackNotice = t(anchor ? 'fallbackTurn' : 'fallbackHidden')
          refreshVisibleHighlights(null)
          if (anchor) cancelScrollTimer = scrollToMatchTarget(mainRoot.root, mainRoot.flow, anchor, null, isStale)
          emit()
          return
        }

        const sig = `${hit.nodeKey || ''}|${hit.groupPart || ''}`
        const blockTotal = blockRenderCounts.get(sig) || 1
        const exclParts = excludedParts()
        let primary = null
        let verifiedRange = null
        for (const candidate of targets) {
          const revealed = await revealHiddenAncestors(mainRoot.flow, candidate, hit, query, caseSensitive, blockTotal, isStale, exclParts)
          if (isStale()) return
          const rng = revealed ? pickVerifiedHitRange(revealed, hit, query, caseSensitive, blockTotal, exclParts) : null
          if (rng) { primary = revealed; verifiedRange = rng; break }
          if (!primary && revealed) primary = revealed
        }
        if (!verifiedRange && primary) {
          fallbackNotice = t('fallbackTurn')
          refreshVisibleHighlights(null)
          cancelScrollTimer = scrollToMatchTarget(mainRoot.root, mainRoot.flow, primary, null, isStale)
        } else if (verifiedRange) {
          refreshVisibleHighlights(verifiedRange)
          cancelScrollTimer = scrollToMatchTarget(mainRoot.root, mainRoot.flow, primary, verifiedRange, isStale)
        }
        emit()
      }


      const navigate = (delta) => {
        flushDebounce()
        if (!hits.length) return undefined
        let targetIdx
        if (!navigated || selectedIndex < 0) targetIdx = delta < 0 ? hits.length - 1 : 0
        else targetIdx = (selectedIndex + delta + hits.length) % hits.length
        return jumpToHit(targetIdx)
      }

      const openFind = (triggerEl = null) => {
        if (!isActiveMainReady(true)) return false
        const wasOpen = open
        open = true
        focusSeq++
        if (!wasOpen) returnFocusEl = triggerEl || doc?.activeElement || null
        attachScrollerListener()
        recomputeLocal()
        return true
      }

      const closeFind = (restoreFocus = true) => {
        if (!open) return
        const focusBack = returnFocusEl
        returnFocusEl = null
        cancelRefresh()
        abortNavigationOnly()
        resetScanCursor()
        open = false
        scopeMenuOpen = false
        navigated = false
        selectedIndex = -1
        selectedHitKey = null
        fallbackNotice = null
        hits = []
        allowedDomTargets.clear()
        blockRenderCounts.clear()
        detachScrollerListener()
        hl.clear()
        emit()
        if (restoreFocus) {
          if (focusBack && focusBack.isConnected && typeof focusBack.focus === 'function') {
            try { focusBack.focus({ preventScroll: true }) } catch {}
          } else {
            const mr = resolveMainConversationRoot(doc, activeSessionId)
            const fallback = mr?.root?.querySelector?.('textarea, [contenteditable="true"], button') || mr?.root
            if (fallback && typeof fallback.focus === 'function') {
              try { fallback.focus({ preventScroll: true }) } catch {}
            }
          }
        }
      }

      const syncMainSession = () => {
        const nextId = resolveMainId()
        const nextBinding = nextId ? sessions?.binding?.(nextId) || null : null
        if (nextId === activeSessionId && nextBinding === activeBinding) return
        unbindSession(); unbindSession = () => {}
        unbindMainRetain(); unbindMainRetain = () => {}
        resetScanCursor(); abortNavigationOnly()
        activeSessionId = nextId
        activeBinding = nextBinding
        lastRevision = -1
        navigated = false; selectedIndex = -1; selectedHitKey = null; fallbackNotice = null; hits = []
        if (nextId && typeof sessions?.retainInfo === 'function') {
          unbindMainRetain = sessions.retainInfo(nextId).subscribe(() => syncMainSession())
        }
        if (nextBinding) {
          if (nextBinding.session?.getSnapshot?.()?.removed) {
            activeBinding = null
            if (open) { open = false; scopeMenuOpen = false; detachScrollerListener() }
          } else {
            const unSubEvt = nextBinding.eventSource.subscribe(() => {
              const win = nextBinding.eventSource.getSnapshot()
              if (!win || win.revision !== lastRevision) {
                lastRevision = win?.revision ?? -1
                if (win?.change?.kind === 'replace') {
                  resetScanCursor()
                  abortNavigationOnly()
                  if (open) recomputeLocal()
                } else scheduleRefresh()
              }
            })
            const unSubSess = nextBinding.session.subscribe(() => {
              if (nextBinding.session?.getSnapshot?.()?.removed) {
                resetScanCursor(); abortNavigationOnly(); activeBinding = null
                unbindSession(); unbindSession = () => {}
                if (open) closeFind(false)
                else emit()
              }
            })
            unbindSession = () => { unSubEvt(); unSubSess() }
          }
        } else if (!nextId && open) {
          open = false
          scopeMenuOpen = false
          detachScrollerListener()
        }
        if (open && activeBinding) { attachScrollerListener(); recomputeLocal() }
        else { hl.clear(); emit() }
      }


      const setRemoteSession = (nextRemote) => {
        remoteSession = nextRemote || null
        emit()
      }

      const setRuntimePlatform = (rt, pf) => {
        if (rt) runtime = rt
        if (pf) platform = pf
        emit()
      }

      const canOpenShortcut = (scCtx) => {
        if (scCtx?.modal != null || scCtx?.region === 'terminal' || ['iframe', 'webview'].includes(scCtx?.source)) return false
        return isActiveMainReady(true)
      }

      const canOpenFromWebCapture = (target) => {
        if (runtime !== 'web' || !isActiveMainReady(true)) return false
        const el = target?.nodeType === 1 ? target : target?.parentElement
        if (!el) return true
        if (el.closest?.('[role="dialog"], [aria-modal="true"], [data-global-panel], [inert], [data-rightbar-fullscreen], .xterm, iframe, webview')) return false
        if (el.closest?.('[data-tune-find-root]')) return true
        const isEditable = el.matches?.('input, textarea, select') || Boolean(el.isContentEditable) || Boolean(el.closest?.('[contenteditable="true"], [contenteditable=""]'))
        if (isEditable && !el.closest?.('[data-conversation-session]')) return false
        return true
      }

      const applyScope = (nextScope) => {
        searchScope = normalizeSearchScope(nextScope)
        queryGen++
        cache.hitExcerpts.clear()
        const prevScan = scanState
        abortScanOnly()
        abortNavigationOnly()
        navigated = false
        selectedIndex = -1
        selectedHitKey = null
        fallbackNotice = null
        let anyEvicted = false
        for (const p of cache.pages.values()) {
          p.compactHitsValidForQuery = false
          p.compactHits = []
          if (p.evicted) anyEvicted = true
        }
        scanError = null
        scanState = (prevScan === 'done' && !anyEvicted)
          ? 'done'
          : (prevScan === 'paused' || prevScan === 'scanning') && (remoteHasMore || anyEvicted)
            ? 'paused'
            : 'idle'
        recomputeLocal()
      }
      const setScope = (nextScope) => applyScope(nextScope)
      const toggleScopeKey = (key) => {
        if (key !== 'body' && !SCOPE_EXTRA_KEYS.includes(key)) return
        applyScope({ ...searchScope, [key]: !searchScope[key] })
      }
      const resetScope = () => applyScope(DEFAULT_SEARCH_SCOPE)
      const selectAllScope = () => {
        const all = { body: true }
        for (const k of SCOPE_EXTRA_KEYS) all[k] = true
        applyScope(all)
      }
      const setScopeMenuOpen = (nextOpen) => {
        const val = Boolean(nextOpen)
        if (val === scopeMenuOpen) return
        scopeMenuOpen = val
        emit()
      }

      const setQuery = (nextQuery) => onQueryChanged(String(nextQuery ?? ''), caseSensitive)
      const toggleCaseSensitive = () => onQueryChanged(query, !caseSensitive)
      const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }

      const dispose = () => {
        if (disposed) return
        disposed = true
        cancelRefresh()
        abortScanOnly()
        abortNavigationOnly()
        unbindSession()
        unbindMainRetain()
        detachScrollerListener()
        cache.clear()
        hl.clear()
        listeners.clear()
      }

      syncMainSession()

      return {
        t,
        getSnapshot,
        subscribe,
        openFind,
        closeFind,
        setQuery,
        toggleCaseSensitive,
        setScope,
        toggleScopeKey,
        resetScope,
        selectAllScope,
        setScopeMenuOpen,
        navigate,
        jumpToHit,
        startOrResumeScan,
        pauseScan,
        syncMainSession,
        setRemoteSession,
        setRuntimePlatform,
        canOpenShortcut,
        canOpenFromWebCapture,
        refreshVisibleHighlights,
        recomputeLocal,
        dispose,
        get _cache() { return cache },
      }
    }


    const loadReactDeps = () => {
      let React = null
      try { React = require('react') } catch {}
      return { React, prim }
    }

    const svgIcon = (h, d, size = 14) => h(
      'svg',
      { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      h('path', { d }),
    )

    const gripIcon = (h) => h(
      'svg',
      { width: 10, height: 14, viewBox: '0 0 10 14', fill: 'currentColor', 'aria-hidden': 'true' },
      h('circle', { cx: '3', cy: '3', r: '1.1' }),
      h('circle', { cx: '7', cy: '3', r: '1.1' }),
      h('circle', { cx: '3', cy: '7', r: '1.1' }),
      h('circle', { cx: '7', cy: '7', r: '1.1' }),
      h('circle', { cx: '3', cy: '11', r: '1.1' }),
      h('circle', { cx: '7', cy: '11', r: '1.1' }),
    )

    const clampOverlayPosition = (pos, boxSize, viewportSize, margin = POS_EDGE_MARGIN) => {
      if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return null
      const vw = Number.isFinite(viewportSize?.width) && viewportSize.width > 0 ? viewportSize.width : 1280
      const vh = Number.isFinite(viewportSize?.height) && viewportSize.height > 0 ? viewportSize.height : 720
      const bw = Number.isFinite(boxSize?.width) && boxSize.width > 0 ? boxSize.width : Math.min(420, Math.max(160, vw - 32))
      const bh = Number.isFinite(boxSize?.height) && boxSize.height > 0 ? boxSize.height : 48
      const safeX = vw > bw + margin * 2 ? margin : Math.max(0, Math.floor((vw - bw) / 2))
      const maxLeft = Math.max(safeX, vw - bw - safeX)
      const safeY = vh > bh + margin * 2 ? margin : Math.max(0, Math.floor((vh - bh) / 2))
      const maxTop = Math.max(safeY, vh - bh - safeY)
      return {
        left: Math.round(Math.min(maxLeft, Math.max(safeX, pos.left))),
        top: Math.round(Math.min(maxTop, Math.max(safeY, pos.top))),
      }
    }

    const readSavedOverlayPosition = () => {
      try {
        const ls = typeof window !== 'undefined' ? window.localStorage : undefined
        const raw = ls?.getItem?.(POS_STORAGE_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed || !Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null
        return { left: parsed.left, top: parsed.top }
      } catch {
        return null
      }
    }

    const writeSavedOverlayPosition = (pos) => {
      try {
        const ls = typeof window !== 'undefined' ? window.localStorage : undefined
        if (!ls) return
        if (!pos) ls.removeItem?.(POS_STORAGE_KEY)
        else ls.setItem?.(POS_STORAGE_KEY, JSON.stringify({ left: pos.left, top: pos.top }))
      } catch {}
    }

    const createFindComponents = (controller) => {
      const { React, prim } = loadReactDeps()
      if (!React || typeof React.createElement !== 'function') return null
      const h = React.createElement

      const FindBarOverlay = (props) => {
        const snap = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
        const activePanelId = typeof props?.usePanelInfo === 'function' ? props.usePanelInfo((p) => p?.activePanelId ?? null) : null
        const inputRef = React.useRef(null)
        const wrapRef = React.useRef(null)
        const dragCleanupRef = React.useRef(null)
        const composingRef = React.useRef(false)
        const prevMenuOpenRef = React.useRef(false)
        const [draft, setDraft] = React.useState(snap.query)
        const [menuAbove, setMenuAbove] = React.useState(false)
        const [dragPos, setDragPos] = React.useState(() => {
          const saved = readSavedOverlayPosition()
          if (!saved) return null
          const vw = (typeof window !== 'undefined' && window.innerWidth) || 1280
          const vh = (typeof window !== 'undefined' && window.innerHeight) || 720
          return clampOverlayPosition(saved, null, { width: vw, height: vh })
        })
        const [dragging, setDragging] = React.useState(false)

        const reclampOverlay = () => {
          const el = wrapRef.current
          if (!el || typeof window === 'undefined') return
          const rect = typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
          const vp = { width: window.innerWidth || 1280, height: window.innerHeight || 720 }
          setDragPos((prev) => {
            if (!prev) return prev
            const next = clampOverlayPosition(prev, rect, vp)
            return next && (next.left !== prev.left || next.top !== prev.top) ? next : prev
          })
        }

        React.useEffect(() => {
          if (!composingRef.current && draft !== snap.query) setDraft(snap.query)
        }, [snap.query])

        React.useEffect(() => {
          if (!snap.open || activePanelId !== null) return
          const el = inputRef.current
          if (el && typeof el.focus === 'function') {
            el.focus({ preventScroll: true })
            if (typeof el.select === 'function') el.select()
          }
        }, [snap.open, snap.focusSeq, activePanelId])

        const hasMeta = Boolean(snap.query && (snap.scanState || snap.remoteHasMore || snap.hasEvictedPending || snap.loadingTarget))
        const hasExcerpt = Boolean(snap.fallbackNotice && snap.activeHit)
        React.useEffect(() => {
          if (!snap.open || activePanelId !== null || !dragPos) return
          reclampOverlay()
        }, [snap.open, activePanelId, hasMeta, hasExcerpt])

        React.useEffect(() => {
          if (!snap.open || activePanelId !== null || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
          window.addEventListener('resize', reclampOverlay)
          return () => window.removeEventListener('resize', reclampOverlay)
        }, [snap.open, activePanelId])

        React.useEffect(() => () => {
          dragCleanupRef.current?.()
          dragCleanupRef.current = null
        }, [])

        React.useEffect(() => {
          if (prevMenuOpenRef.current && !snap.scopeMenuOpen && snap.open && activePanelId === null) {
            inputRef.current?.focus?.({ preventScroll: true })
          }
          prevMenuOpenRef.current = snap.scopeMenuOpen
        }, [snap.scopeMenuOpen, snap.open, activePanelId])

        React.useEffect(() => {
          if (!snap.open || !snap.scopeMenuOpen || activePanelId !== null || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined
          const onOutsidePointer = (e) => {
            const target = e.target
            if (target?.closest?.('[data-tune-find-scope-menu="true"], [data-tune-find-scope="true"]')) return
            if (e.button === 2 && target?.closest?.('.TCF_bar') && !target?.closest?.('input, textarea, .TCF_exText')) return
            controller.setScopeMenuOpen(false)
          }
          window.addEventListener('pointerdown', onOutsidePointer, true)
          return () => window.removeEventListener('pointerdown', onOutsidePointer, true)
        }, [snap.open, snap.scopeMenuOpen, activePanelId])

        if (!snap.open || activePanelId !== null) return null
        const t = controller.t
        const countLabel = !snap.query
          ? ''
          : snap.hits.length === 0
            ? t('noMatches')
            : snap.navigated && snap.selectedIndex >= 0
              ? `${snap.selectedIndex + 1} / ${snap.hits.length}${snap.remoteHasMore ? '+' : ''}`
              : t('foundCount', { count: `${snap.hits.length}${snap.remoteHasMore ? '+' : ''}` })

        const statusText = snap.loadingTarget
          ? t('statusLoadingTarget')
          : snap.scanState === 'scanning'
            ? t('scanning')
            : snap.scanState === 'error'
              ? (snap.scanError || t('statusError'))
              : snap.scanState === 'done'
                ? t('statusDone')
                : snap.scanState === 'paused'
                  ? t('statusPaused')
                  : (snap.remoteHasMore || snap.hasEvictedPending)
                    ? t('statusMore')
                    : ''

        let scanBtn = null
        const runScanAct = (fn) => () => { fn(); inputRef.current?.focus?.({ preventScroll: true }) }
        if (snap.query && snap.hasRemote) {
          if (snap.scanState === 'scanning') {
            scanBtn = h('button', { type: 'button', className: 'TCF_link', 'data-tune-find-action': 'pause', onClick: runScanAct(() => controller.pauseScan()) }, t('pause'))
          } else if (snap.scanState === 'error') {
            scanBtn = h('button', { type: 'button', className: 'TCF_link', 'data-tune-find-action': 'retry', onClick: runScanAct(() => controller.startOrResumeScan()) }, t('retry'))
          } else if (snap.scanState === 'paused' && (snap.remoteHasMore || snap.hasEvictedPending)) {
            scanBtn = h('button', { type: 'button', className: 'TCF_link', 'data-tune-find-action': 'resume', onClick: runScanAct(() => controller.startOrResumeScan()) }, t('resume'))
          } else if (snap.remoteHasMore || snap.hasEvictedPending) {
            scanBtn = h('button', { type: 'button', className: 'TCF_link', 'data-tune-find-action': 'scan', onClick: runScanAct(() => controller.startOrResumeScan()) }, t('searchHistory'))
          }
        }

        const activeHit = snap.activeHit
        const excerpt = activeHit ? (activeHit.excerpt || controller._cache.hitExcerpts.get(activeHit.hitKey) || null) : null
        const showMeta = Boolean(snap.query && (statusText || scanBtn))
        const onBarKeyDown = (e) => {
          if (e.key === 'Escape' && !composingRef.current && !e.nativeEvent?.isComposing) {
            e.preventDefault()
            e.stopPropagation()
            if (snap.scopeMenuOpen) controller.setScopeMenuOpen(false)
            else controller.closeFind(true)
          }
        }
        const computeMenuAbove = () => {
          const rect = wrapRef.current?.getBoundingClientRect?.()
          if (!rect || typeof window === 'undefined') return false
          return ((window.innerHeight || 720) - rect.bottom) < 300 && rect.top > 280
        }
        const onBarContextMenu = (e) => {
          if (e.target?.closest?.('input, textarea, .TCF_exText')) return
          e.preventDefault?.()
          e.stopPropagation?.()
          setMenuAbove(computeMenuAbove())
          controller.setScopeMenuOpen(true)
        }
        const onBarPointerDown = (e) => {
          if (e.button !== undefined && e.button !== 0) return
          const target = e.target
          const handleEl = target?.closest?.('[data-tune-find-drag="true"]')
          if (!handleEl && target?.closest?.('input, textarea, select, button, a, [contenteditable], .TCF_inputWrap, .TCF_exText')) return
          const wrapEl = wrapRef.current
          if (!wrapEl || typeof wrapEl.getBoundingClientRect !== 'function' || typeof window === 'undefined') return
          e.preventDefault?.()
          dragCleanupRef.current?.()
          const rect = wrapEl.getBoundingClientRect()
          const originLeft = dragPos ? dragPos.left : rect.left
          const originTop = dragPos ? dragPos.top : rect.top
          const boxSize = { width: rect.width, height: rect.height }
          const startX = e.clientX
          const startY = e.clientY
          const pointerId = e.pointerId
          let moved = false
          let latest = null
          const captureEl = handleEl || e.currentTarget
          try { if (pointerId !== undefined) captureEl?.setPointerCapture?.(pointerId) } catch {}

          const onMove = (ev) => {
            if (pointerId !== undefined && ev.pointerId !== undefined && ev.pointerId !== pointerId) return
            const dx = ev.clientX - startX
            const dy = ev.clientY - startY
            if (!moved && Math.hypot(dx, dy) < 3) return
            if (!moved) { moved = true; setDragging(true) }
            const vp = { width: window.innerWidth || 1280, height: window.innerHeight || 720 }
            latest = clampOverlayPosition({ left: originLeft + dx, top: originTop + dy }, boxSize, vp)
            if (latest) setDragPos(latest)
          }
          const finish = (ev) => {
            if (ev && pointerId !== undefined && ev.pointerId !== undefined && ev.pointerId !== pointerId) return
            dragCleanupRef.current?.()
            dragCleanupRef.current = null
            setDragging(false)
            if (moved && latest) writeSavedOverlayPosition(latest)
            inputRef.current?.focus?.({ preventScroll: true })
          }
          dragCleanupRef.current = () => {
            window.removeEventListener?.('pointermove', onMove)
            window.removeEventListener?.('pointerup', finish)
            window.removeEventListener?.('pointercancel', finish)
            try { if (pointerId !== undefined) captureEl?.releasePointerCapture?.(pointerId) } catch {}
          }
          window.addEventListener?.('pointermove', onMove)
          window.addEventListener?.('pointerup', finish)
          window.addEventListener?.('pointercancel', finish)
        }
        const resetDragPos = (e) => {
          e?.preventDefault?.()
          e?.stopPropagation?.()
          dragCleanupRef.current?.()
          dragCleanupRef.current = null
          setDragging(false)
          setDragPos(null)
          writeSavedOverlayPosition(null)
          inputRef.current?.focus?.({ preventScroll: true })
        }

        return h(
          'div',
          {
            ref: wrapRef,
            className: 'TCF_wrap',
            'data-tune-find-root': 'true',
            'data-dragging': dragging ? 'true' : undefined,
            style: dragPos ? { left: `${dragPos.left}px`, top: `${dragPos.top}px`, right: 'auto' } : undefined,
            role: 'search',
            'aria-label': t('openLabel'),
            onKeyDown: onBarKeyDown,
          },
          h(
            'div',
            { className: 'TCF_bar', onPointerDown: onBarPointerDown, onContextMenu: onBarContextMenu },
            h(
              'div',
              { className: 'TCF_row' },
              h('button', {
                type: 'button',
                tabIndex: -1,
                className: 'TCF_drag',
                'data-tune-find-drag': 'true',
                title: t('dragHandle'),
                'aria-label': t('dragHandle'),
                onDoubleClick: resetDragPos,
              }, gripIcon(h)),
              h(
                'div',
                { className: 'TCF_inputWrap' },
                h('input', {
                  ref: inputRef,
                  type: 'text',
                  className: 'TCF_input',
                  'data-tune-find-input': 'true',
                  value: draft,
                  placeholder: t('placeholder'),
                  'aria-label': t('placeholder'),
                  onCompositionStart: () => { composingRef.current = true },
                  onCompositionEnd: (e) => { composingRef.current = false; const v = e.currentTarget.value; setDraft(v); controller.setQuery(v) },
                  onChange: (e) => { const v = e.currentTarget.value; setDraft(v); if (!composingRef.current) controller.setQuery(v) },
                  onKeyDown: (e) => {
                    if (composingRef.current || e.nativeEvent?.isComposing || e.keyCode === 229) return
                    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); controller.navigate(e.shiftKey ? -1 : 1) }
                    else if (e.key === 'Escape') {
                      e.preventDefault()
                      e.stopPropagation()
                      if (snap.scopeMenuOpen) controller.setScopeMenuOpen(false)
                      else controller.closeFind(true)
                    }
                  },
                }),
                countLabel ? h('span', { className: 'TCF_count', 'data-tune-find-count': 'true' }, countLabel) : null,
              ),
              h('button', { type: 'button', className: 'TCF_btn', 'data-tune-find-case': 'true', 'aria-pressed': snap.caseSensitive ? 'true' : 'false', title: t('caseSensitive'), 'aria-label': t('caseSensitive'), onClick: () => controller.toggleCaseSensitive() }, 'Aa'),
              h('button', {
                type: 'button',
                className: 'TCF_btn TCF_scopeBtn',
                'data-tune-find-scope': 'true',
                'data-custom-scope': snap.hasCustomScope ? 'true' : undefined,
                'aria-haspopup': 'menu',
                'aria-expanded': snap.scopeMenuOpen ? 'true' : 'false',
                title: t('scopeBtn'),
                'aria-label': t('scopeBtn'),
                onClick: () => {
                  const next = !snap.scopeMenuOpen
                  if (next) setMenuAbove(computeMenuAbove())
                  controller.setScopeMenuOpen(next)
                },
              }, svgIcon(h, 'M2 4h12M4 8h8M6 12h4', 14), snap.hasCustomScope ? h('span', { className: 'TCF_dot', 'aria-hidden': 'true' }) : null),
              h('button', { type: 'button', className: 'TCF_btn', 'data-tune-find-prev': 'true', disabled: snap.hits.length === 0, title: t('prev'), 'aria-label': t('prev'), onClick: () => controller.navigate(-1) }, svgIcon(h, 'M4 10L8 6L12 10')),
              h('button', { type: 'button', className: 'TCF_btn', 'data-tune-find-next': 'true', disabled: snap.hits.length === 0, title: t('next'), 'aria-label': t('next'), onClick: () => controller.navigate(1) }, svgIcon(h, 'M4 6L8 10L12 6')),
              h('button', { type: 'button', className: 'TCF_btn', 'data-tune-find-close': 'true', title: t('close'), 'aria-label': t('close'), onClick: () => controller.closeFind(true) }, svgIcon(h, 'M4 4L12 12M12 4L4 12')),
            ),
            showMeta ? h('div', { className: 'TCF_meta' }, h('span', { className: 'TCF_status', 'data-tune-find-status': 'true' }, statusText), h('div', { className: 'TCF_actions' }, scanBtn)) : null,
            (snap.fallbackNotice && activeHit) ? h(
              'div',
              { className: 'TCF_excerpt', 'data-tune-find-excerpt': 'true' },
              h(
                'div',
                { className: 'TCF_exHead' },
                h('span', null, `${t(`src_${activeHit.sourceKind || 'response'}`)}${Number.isSafeInteger(activeHit.turn) ? ` · #${activeHit.turn}` : ''} · ${snap.fallbackNotice}`),
                h('button', { type: 'button', className: 'TCF_link', 'data-tune-find-relocate': 'true', onClick: () => controller.jumpToHit(snap.selectedIndex) }, t('relocate')),
              ),
              excerpt ? h(
                'div',
                { className: 'TCF_exText' },
                excerpt.leftContext || '',
                h('mark', { className: 'TCF_exMark' }, excerpt.match || snap.query),
                excerpt.rightContext || '',
              ) : null,
            ) : null,
          ),
          snap.scopeMenuOpen ? h(
            'div',
            {
              className: 'TCF_menu',
              'data-tune-find-scope-menu': 'true',
              'data-placement': menuAbove ? 'above' : 'below',
              role: 'menu',
              'aria-label': t('scopeMenuTitle'),
            },
            h('div', { className: 'TCF_menuHead' }, t('scopeMenuTitle')),
            h(
              'button',
              {
                type: 'button',
                role: 'menuitemcheckbox',
                className: 'TCF_menuItem',
                'data-tune-find-scope-opt': 'body',
                'aria-checked': snap.scope.body ? 'true' : 'false',
                onClick: () => controller.toggleScopeKey('body'),
              },
              h('span', { className: 'TCF_chk', 'aria-hidden': 'true' }, snap.scope.body ? svgIcon(h, 'M3 8.2L6.2 11.4L13 4.6', 10) : null),
              h('span', { className: 'TCF_menuLabel' }, t('scopeBody')),
              h('span', { className: 'TCF_menuTag' }, t('scopeDefaultTag')),
            ),
            h('div', { className: 'TCF_menuSep', role: 'separator' }),
            ...SCOPE_EXTRA_KEYS.map((key) => h(
              'button',
              {
                key,
                type: 'button',
                role: 'menuitemcheckbox',
                className: 'TCF_menuItem',
                'data-tune-find-scope-opt': key,
                'aria-checked': snap.scope[key] ? 'true' : 'false',
                onClick: () => controller.toggleScopeKey(key),
              },
              h('span', { className: 'TCF_chk', 'aria-hidden': 'true' }, snap.scope[key] ? svgIcon(h, 'M3 8.2L6.2 11.4L13 4.6', 10) : null),
              h('span', { className: 'TCF_menuLabel' }, t(`src_${key}`)),
            )),
            h(
              'div',
              { className: 'TCF_menuFoot' },
              h('button', { type: 'button', className: 'TCF_link', 'data-tune-find-scope-reset': 'true', onClick: () => controller.resetScope() }, t('scopeReset')),
              h('button', { type: 'button', className: 'TCF_link', 'data-tune-find-scope-all': 'true', onClick: () => controller.selectAllScope() }, t('scopeAll')),
            ),
          ) : null,
        )
      }

      const FindHeaderUtilityButton = (props) => {
        const snap = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
        const hidden = typeof props?.useSession === 'function' ? props.useSession((s) => !s || Boolean(s.removed) || Boolean(s.blank)) : false
        const btnRef = React.useRef(null)
        if (hidden) return null
        const label = controller.t('openLabel')
        const glyph = h(
          'svg',
          { width: 15, height: 15, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
          h('circle', { cx: '7', cy: '7', r: '4.5' }),
          h('path', { d: 'M10.5 10.5L14 14' }),
        )
        const btn = h(
          'button',
          {
            ref: btnRef,
            type: 'button',
            className: 'TCF_trig',
            'data-tune-find-trigger': 'true',
            'aria-label': label,
            'aria-pressed': snap.open ? 'true' : 'false',
            title: label,
            onClick: () => {
              controller.syncMainSession()
              if (snap.open) controller.closeFind(true)
              else controller.openFind(btnRef.current)
            },
          },
          glyph,
        )
        if (prim?.Tooltip) {
          return h(prim.Tooltip, { label, side: 'bottom', delayMs: 500 }, btn)
        }
        return btn
      }

      return { FindBarOverlay, FindHeaderUtilityButton }
    }


    exports.inject = ['sessions', 'slots', 'locale', 'layout']
    exports.apply = (ctx) => {
      ctx.effect(() => ctx.locale.register(LOCALE_NS, LOCALES), 'tune-conversation-find: locale')
      ctx.effect(() => ensureStyle(), 'tune-conversation-find: css')
      const controller = createFindController({ sessions: ctx.sessions, layout: ctx.layout, locale: ctx.locale })
      const stopList = ctx.sessions?.list?.subscribe ? ctx.sessions.list.subscribe(() => controller.syncMainSession()) : null
      const stopPanel = ctx.layout?.panelInfo?.subscribe ? ctx.layout.panelInfo.subscribe(() => {
        if (ctx.layout.panelInfo.getSnapshot()?.activePanelId != null) controller.closeFind(false)
      }) : null

      const ui = createFindComponents(controller)
      if (ui && ctx.slots) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay', id: 'runtime-tuning.conversation-find', locale: LOCALE_NS,
          inject: () => ({ hooks: { findState: controller }, controller }),
        }, ui.FindBarOverlay))
        ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities', id: 'runtime-tuning.conversation-find-trigger', order: -10, locale: LOCALE_NS,
          inject: () => ({ controller }),
        }, ui.FindHeaderUtilityButton))
      }

      if (typeof ctx.inject === 'function') {
        ctx.inject(['shortcuts'], (scope) => {
          scope.effect(() => {
            controller.setRuntimePlatform(scope.shortcuts.runtime || 'web', scope.shortcuts.platform || 'windows')
            return scope.shortcuts.register({
              id: COMMAND_ID,
              label: () => controller.t('openLabel'),
              aliases: ['find', 'search', 'ctrl+f', '查找', '搜索'],
              defaults: SHORTCUT_DEFAULTS,
              regions: ['page', 'editable'],
              modals: [],
              resolve: (scCtx) => {
                controller.syncMainSession()
                if (!controller.canOpenShortcut(scCtx)) return { status: 'pass' }
                return { status: 'handled', run: () => controller.openFind(scCtx?.target || null) }
              },
            })
          }, 'tune-conversation-find: shortcut')
        })

        ctx.inject(['remote.session'], (scope) => {
          scope.effect(() => {
            const rs = (typeof scope.get === 'function' ? scope.get('remote.session') : null) || null
            controller.setRemoteSession(rs)
            return () => controller.setRemoteSession(null)
          }, 'tune-conversation-find: remote-session')
        })

        ctx.inject(['configForms'], (scope) => {
          scope.effect(() => {
            const form = scope.configForms?.get?.(CONFIG_NS)
            if (!form || typeof window === 'undefined') return undefined
            let attached = false
            const onKeyDown = (e) => {
              if (e.defaultPrevented || e.isComposing || e.keyCode === 229) return
              if (String(e.key || '').toLowerCase() !== 'f' && e.code !== 'KeyF') return
              if (e.altKey || e.shiftKey) return
              const pf = controller.getSnapshot().platform
              const primaryHeld = pf === 'macos' ? (e.metaKey && !e.ctrlKey) : (e.ctrlKey && !e.metaKey)
              if (!primaryHeld) return
              controller.syncMainSession()
              if (!controller.canOpenFromWebCapture(e.target)) return
              e.preventDefault()
              e.stopPropagation()
              controller.openFind(e.target)
            }
            const syncCapture = () => {
              const want = controller.getSnapshot().runtime === 'web' && form.getSnapshot?.()?.value?.interceptCtrlFOnWeb === true
              if (want === attached) return
              attached = want
              if (want) window.addEventListener('keydown', onKeyDown, true)
              else window.removeEventListener('keydown', onKeyDown, true)
            }
            syncCapture()
            const unsubForm = form.subscribe(syncCapture)
            const unsubCtrl = controller.subscribe(syncCapture)
            return () => {
              if (attached) window.removeEventListener('keydown', onKeyDown, true)
              unsubForm?.()
              unsubCtrl?.()
            }
          }, 'tune-conversation-find: web-ctrl-f')
        })
      }

      let escAttached = false
      const onGlobalEscape = (e) => {
        if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229 || e.altKey || e.ctrlKey || e.metaKey) return
        const snap = controller.getSnapshot()
        if (!snap.open) return
        if (e.target?.closest?.('[role="dialog"], [aria-modal="true"]') || (typeof document !== 'undefined' && document.querySelector?.('[role="dialog"][aria-modal="true"], dialog[open]'))) return
        e.preventDefault()
        e.stopPropagation()
        if (snap.scopeMenuOpen) controller.setScopeMenuOpen(false)
        else controller.closeFind(true)
      }
      const syncEsc = () => {
        if (typeof window === 'undefined') return
        const want = controller.getSnapshot().open
        if (want === escAttached) return
        escAttached = want
        if (want) window.addEventListener('keydown', onGlobalEscape, true)
        else window.removeEventListener('keydown', onGlobalEscape, true)
      }
      syncEsc()
      const unsubEsc = controller.subscribe(syncEsc)

      ctx.effect(() => () => {
        if (escAttached && typeof window !== 'undefined') window.removeEventListener('keydown', onGlobalEscape, true)
        unsubEsc()
        stopList?.()
        stopPanel?.()
        controller.dispose()
      }, 'tune-conversation-find: cleanup')
    }

    exports.__internals = {
      MODULE_ID, CONFIG_NS, COMMAND_ID, LOCALE_NS, SHORTCUT_DEFAULTS, MAX_HISTORY_CACHE_BYTES, DEFAULT_PAGE_OPTIONS, DEBOUNCE_MS,
      SCOPE_EXTRA_KEYS, DEFAULT_SEARCH_SCOPE, normalizeSearchScope, isCustomScope, resolveEnabledSourceKinds, resolveExcludedGroupParts, buildAllowedDomTargets,
      conversationContextKey, extractDurableEvent, extractPageFromEvents, reduceTransientChunks, foldBoundaries, resolveTurnAt,
      assembleSearchableItems, compileLiteralRegex, buildExcerpt, matchItems, createHistoryCache, resolveSessionAddress,
      durableSeqBounds, validatePageResult, computeCombinedMatches, collectBlockTextSegments, matchRangesInBlock,
      pickVerifiedHitRange, resolveMainConversationRoot, findTargetNodeElements, revealHiddenAncestors, createHighlightManager,
      findMainScroller, collectVisibleBlockRanges, scrollToMatchTarget, clampOverlayPosition, readSavedOverlayPosition, writeSavedOverlayPosition, createFindController, createFindComponents,
    }
    return exports
  },
})
