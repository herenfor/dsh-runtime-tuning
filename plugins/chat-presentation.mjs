// Browser additions are serialized into the generated copy, never the official bundle.
export const TABLE_CSS = `
[data-runtime-tuning-tables] [class*="tableScroll"] {
 box-sizing:border-box!important;width:100%!important;max-width:100%!important;
 margin-left:0!important;padding-left:0!important;padding-bottom:0!important;
 overflow-x:auto!important;
}
[data-runtime-tuning-tables] [class*="tableScroll"]>table {
 width:100%!important;max-width:none!important;table-layout:auto!important;
}
[data-runtime-tuning-tables] [class*="tableScroll"]>table :is(th,td) {
 min-width:0!important;max-width:none!important;padding:6px 9px!important;
 vertical-align:top;text-align:start;overflow-wrap:break-word!important;word-break:normal!important;
 border-bottom:1px solid var(--dsw-alias-divider-primary,rgba(128,128,128,.25))!important;
}
[data-runtime-tuning-tables] [class*="tableScroll"]>table th {font-weight:600!important;white-space:nowrap!important}
[data-runtime-tuning-tables] [class*="tableScroll"][data-tune-overflow] {
 border-right:2px solid var(--dsw-alias-label-tertiary,#888);
}
.tune-approval {display:flex;flex-direction:column;gap:9px;line-height:20px;font-size:13px;font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary);word-break:normal;overflow-wrap:anywhere}
.tune-approval .tune-label {font-size:12px;color:var(--dsw-alias-label-secondary);line-height:18px}
.tune-approval .tune-purpose {font-size:15px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}
.tune-approval .tune-permission {font-size:14px;line-height:22px;font-weight:500}
.tune-approval p {margin:0}
.tune-approval .tune-note {color:var(--dsw-alias-label-secondary)}
.tune-approval .tune-file {padding:7px 10px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08));border-radius:8px}
.tune-approval button {align-self:flex-start;font:inherit;color:inherit;background:transparent;border:1px solid var(--dsw-alias-divider-primary,rgba(128,128,128,.25));border-radius:8px;padding:4px 9px;cursor:pointer}
.tune-approval button:focus-visible {outline:2px solid var(--dsw-alias-label-link,#5885df)}
.tune-approval .tune-buttons {display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tune-approval pre {margin:4px 0 0;padding:8px 10px;font-size:12px;line-height:19px;white-space:pre;overflow:auto;max-height:180px;max-width:100%;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.08));border-radius:8px}
.tune-approval .tune-remove {color:var(--dsw-alias-status-error-label,#be4b45)}
.tune-approval .tune-add {color:var(--dsw-alias-status-success-label,#29804b)}
[data-approval-scroll]:has(.tune-approval[data-tune-ready]) > :is([class*="heading_"],[class*="headline_"],[class$="_heading"],[class$="_headline"]):not(:has(button)) {display:none}
`

// No global tables: only the real assistant Markdown body identified at its render seam.
export function installPresentation(ctx, css, options = {}) {
  const id = 'dsh-runtime-tuning-presentation'
  ctx.effect(() => {
    let style = document.getElementById(id)
    if (!style) { style = document.createElement('style'); style.id = id; document.head.append(style) }
    const settings = ctx.configForms.get('runtime-tuning-ui-chat')
    const refresh = () => {
      const split = css.indexOf('.tune-approval')
      style.textContent = (settings.getSnapshot().value?.tableLayout === false ? '' : css.slice(0, split)) + css.slice(split)
    }
    refresh()
    const unsubscribe = settings.subscribe(() => { refresh(); scan() })
    const clean = new Map()
    const resize = new ResizeObserver(entries => entries.forEach(({ target }) => measure(target)))
    function restore(node, state) {
      node.removeAttribute('data-tune-overflow')
      if (state.tabAdded) { node.removeAttribute('tabindex'); state.tabAdded = false }
      if (state.ariaBefore === null) node.removeAttribute('aria-label')
      else node.setAttribute('aria-label', state.ariaBefore)
    }
    function measure(node) {
      const state = clean.get(node)
      if (!state) return
      const overflow = node.scrollWidth > node.clientWidth + 1
      node.toggleAttribute('data-tune-overflow', overflow)
      if (overflow) {
        if (!node.hasAttribute('tabindex')) { node.tabIndex = 0; state.tabAdded = true }
        node.setAttribute('aria-label', ctx.locale.getSnapshot().active.startsWith('zh') ? '表格，可横向滚动' : 'Table, scroll horizontally')
      } else restore(node, state)
    }
    function scan() {
      if (settings.getSnapshot().value?.tableLayout === false) {
        for (const [n, state] of clean) { resize.unobserve(n); restore(n, state) }
        clean.clear(); return
      }
      for (const n of document.querySelectorAll('[data-runtime-tuning-tables] [class*="tableScroll"]')) {
        if (!clean.has(n)) { clean.set(n, { tabAdded: false, ariaBefore: n.getAttribute('aria-label') }); resize.observe(n) }
        measure(n)
      }
      for (const n of clean.keys()) if (!n.isConnected) { resize.unobserve(n); clean.delete(n) }
    }
    const observer = new MutationObserver(scan)
    if (options.tables !== false) { observer.observe(document.body, { childList: true, subtree: true, characterData: true }); scan() }
    return () => { unsubscribe(); observer.disconnect(); resize.disconnect(); style.remove(); for (const [n, state] of clean) restore(n, state) }
  }, 'runtime-tuning: chat presentation')
}

// React component factory; ctx supplies the existing session and Connection carriers.
export function approvalComponent(ctx, React) {
  const { createElement: h, useState, useEffect, useSyncExternalStore } = React
  return function TuningApproval({ callId, sessionId, useChat }) {
    const original = useChat(snapshot => {
      for (const node of snapshot.nodes.values()) {
        const r = node.kind === 'tool-call' ? node.data.root : undefined
        if (r?.callId === callId && !('kind' in r) && r.phase === 'start') {
          try { const a = JSON.parse(r.argsRaw); const value = r.name === 'terminal_send' ? a.text : a.command; return typeof value === 'string' ? value : undefined } catch { return undefined }
        }
      }
    })
    const [snapshot, setSnapshot] = useState(null)
    const [expanded, setExpanded] = useState(false)
    const [details, setDetails] = useState(false)
    const [copied, setCopied] = useState(false)
    const form = ctx.configForms.get('runtime-tuning-ui-chat')
    const settings = useSyncExternalStore(f => form.subscribe(f), () => form.getSnapshot())
    const enabled = settings.value?.approvalDetails !== false
    const locale = useSyncExternalStore(f => ctx.locale.subscribe(f), () => ctx.locale.getSnapshot()).active
    const zh = String(locale).startsWith('zh')
    const t = (a, b) => zh ? a : b
    useEffect(() => {
      setSnapshot(null); setExpanded(false); setDetails(false)
      const controller = new AbortController()
      let active = true, timer, snapshotId
      // Read through Connection, so Desktop IPC and web use the same authenticated channel.
      const read = async () => {
        try {
          const r = await ctx.get('connection').rpc.call('/api', 'runtimeTuningApproval/read', { args: { request: { sessionId, callId, ...(snapshotId ? { snapshotId } : {}) } } }, controller.signal)
          if (active) {
            if (r.ok && r.value?.schemaVersion === 1 && r.value.sessionId === sessionId && r.value.callId === callId) { snapshotId ??= r.value.snapshotId; setSnapshot(r.value) }
            else { setSnapshot(null); if (!r.ok) active = false }
          }
        } catch { if (active) setSnapshot(null) }
        if (active) timer = setTimeout(read, 1000)
      }
      if (enabled && sessionId && callId) void read()
      return () => { active = false; clearTimeout(timer); controller.abort() }
    }, [callId, sessionId, enabled])
    // Metadata is meaningful only in the matching live native request's detail seat.
    if (!snapshot || !enabled) return original ?? null
    const s = snapshot
    const label = text => h('div', { className: 'tune-label' }, text)
    const section = (title, content) => h('div', null, label(title), content)
    const button = (text, click) => h('button', { type: 'button', onClick: e => { e.stopPropagation(); click() } }, text)
    const permission = s.requestedMode === 'danger-full-access' ? t('申请完整访问权限', 'Request full access') : s.requestedMode === 'workspace-write' ? t('申请工作区写入权限', 'Request workspace write access') : t('权限范围未核实', 'Permission scope unverified')
    const scope = s.requestedMode === 'danger-full-access' ? t('仅本次调用；不限于所列文件', 'This call only; access is not limited to listed files') : s.requestedMode === 'workspace-write' ? t('仅本次调用；工作区范围由宿主策略决定', 'This call only; workspace scope is defined by the host policy') : t('以原生审批请求为准', 'Refer to the native approval request')
    return h('div', { className: 'tune-approval', 'data-tune-ready': s.snapshotId, 'data-tune-generation': s.generation },
      section(t('请求目的', 'Request purpose'), h('div', { className: 'tune-purpose' }, s.purpose || t('调用未提供具体目的', 'No specific purpose provided'))),
      section(t('本次权限 · 工具参数', 'Requested permission · tool arguments'), h(React.Fragment, null, h('div', { className: 'tune-permission' }, permission), h('p', { className: 'tune-note' }, scope))),
      s.filePath ? section(t('涉及对象 · 文件参数', 'Target · file argument'), h('div', { className: 'tune-file' }, s.filePath, h('div', { className: 'tune-note' }, t('真实边界未核实', 'Real path boundary unverified')))) : null,
      section(s.edit ? (s.replaceAll ? t('替换片段 · 所有匹配项', 'Replacement fragment · all matches') : t('替换片段', 'Replacement fragment')) : t('原始调用', 'Original call'), h(React.Fragment, null,
        s.edit ? h('pre', null, h('span', { className: 'tune-remove' }, '- ' + s.edit.before), '\n', h('span', { className: 'tune-add' }, '+ ' + s.edit.after)) : null,
        h('div', { className: 'tune-buttons' }, h('span', null, s.toolName, s.command ? ` · ${s.command.split('\n').length} ${t('行', 'lines')}` : ''),
          button(expanded ? t('收起', 'Collapse') : t('查看', 'Expand'), () => setExpanded(v => !v)),
          button(copied ? t('已复制', 'Copied') : t('复制', 'Copy'), () => { navigator.clipboard?.writeText(s.command ?? s.raw).then(() => setCopied(true)).catch(() => setCopied(false)) })),
        expanded ? h('pre', null, s.command ?? s.raw) : null)),
      button(details ? t('收起目录与调用详情', 'Hide directory and call details') : t('目录与调用详情', 'Directory and call details'), () => setDetails(v => !v)),
      details ? h('pre', null, JSON.stringify({ tool: s.toolName, directoryArgument: s.workdir ?? null, directoryStatus: s.workdir ? 'tool argument; not a resolved realpath' : 'unknown before tool resolves its cwd', capturePhase: s.capturePhase, arguments: JSON.parse(s.raw) }, null, 2)) : null)
  }
}

export function patchPresentation(source) {
  // These anchors belong to distinct render/registration sites; contract drift disables only that feature.
  const replace = (text, pattern, replacement) => {
    const count = [...text.matchAll(new RegExp(pattern.source, 'g'))].length
    return count === 1 ? { text: text.replace(pattern, replacement), done: true } : { text, done: false }
  }
  const body = /className:AssistantMarkdown_module_css_default\.body,children:/
  const table = replace(source, body, 'className:AssistantMarkdown_module_css_default.body,"data-runtime-tuning-tables":"",children:')
  // Exact official ApprovalCommand registration, not the core ApprovalCard.
  const detail = /ctx\.slots\.register\(\{name:([`"'])conversation\.approval\.detail\1\},ApprovalCommand\)/
  const approval = replace(table.text, detail, 'ctx.slots.register({name:$1conversation.approval.detail$1,inject:sessionId=>({sessionId})},__tuneApprovalComponent(ctx,react))')
  const apply = /function apply\(ctx\)\{/
  const code = `${installPresentation.toString()}\nconst __tuneApprovalComponent=${approvalComponent.toString()};\n`
  const wired = replace(approval.text, apply, code + 'function apply(ctx){installPresentation(ctx,' + JSON.stringify(TABLE_CSS) + ',{tables:' + table.done + '});')
  // Without a unique install seam nothing changes, including detail registration.
  return wired.done ? { text: wired.text, tables: table.done, approval: approval.done } : { text: source, tables: false, approval: false }
}
