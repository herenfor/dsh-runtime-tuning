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
.tune-approval-2line [data-approval-key] [data-approval-scroll] {
 min-width:0;max-width:100%;overflow-x:hidden;overflow-y:auto;white-space:normal;overflow-wrap:anywhere;word-break:normal;
}
.tune-approval-2line [data-approval-key] [data-approval-scroll] * {
 min-width:0;max-width:100%;white-space:normal;overflow-wrap:anywhere;word-break:normal;
}
.tune-approval-2line [data-approval-key] [data-approval-scroll] > :first-child {
 display:flex;flex-wrap:wrap;align-items:baseline;
}
.tune-approval-2line [data-approval-key] [data-approval-scroll] > :first-child > :first-child {
 flex:0 1 auto;min-width:0;max-width:100%;
}
.tune-approval-2line [data-approval-key] [data-approval-scroll] button {
 flex-shrink:0;white-space:nowrap;
}
`

/**
 * Determine active locale bucket (`'zh'` or `'en'`).
 * Embedded identically into browser generated bundles and shared by Host contracts.
 * @param {string | undefined} locale - BCP-47 locale string.
 * @returns {'zh' | 'en'}
 */
export function resolveLocaleFamily(locale) {
  if (typeof locale === 'string' && locale.toLowerCase().startsWith('zh')) return 'zh'
  return 'en'
}

/**
 * Format Line 2 plain-text permission description from a schema v2 `ApprovalView`.
 * Shared verbatim between Node approval contracts and the browser composer slot.
 * @param {object} view - Schema v2 `ApprovalView`.
 * @param {string | undefined} locale - UI locale string.
 * @returns {string} Plain single-paragraph permission summary.
 */
export function formatApprovalPermissionText(view, locale) {
  const fam = resolveLocaleFamily(locale)
  const perm = view?.permission
  if (!perm) return fam === 'zh' ? '请求执行授权' : 'Permission requested'
  const subject = typeof perm.subjectName === 'string' && perm.subjectName.trim() ? perm.subjectName.trim() : undefined
  const hasAlways = Array.isArray(view?.choices) && view.choices.some((c) => c.lifetime === 'persistent')

  if (perm.kind === 'sandbox-escalation') {
    const modeLabel = perm.requestedMode === 'danger-full-access'
      ? (fam === 'zh' ? '完全访问权限' : 'full access')
      : (fam === 'zh' ? '工作区写入权限' : 'workspace write access')
    if (fam === 'zh') {
      return `申请${modeLabel}（仅本次调用${subject ? ` · ${subject}` : ''}）`
    }
    return `Request ${modeLabel} for this call only${subject ? ` (${subject})` : ''}`
  }

  if (perm.kind === 'tool-confirmation') {
    if (fam === 'zh') {
      return `需要确认执行（仅本次调用${subject ? ` · ${subject}` : ''}）`
    }
    return `Confirmation required for this call only${subject ? ` (${subject})` : ''}`
  }

  if (perm.kind === 'application-access') {
    if (fam === 'zh') {
      return `申请在本会话控制应用${subject ? `「${subject}」` : ''}${hasAlways ? '（可选择始终允许）' : ''}`
    }
    return `Control ${subject ?? 'this application'} for this session${hasAlways ? ' (or choose Always allow)' : ''}`
  }

  if (perm.kind === 'mouse-control') {
    if (fam === 'zh') {
      return '控制鼠标指针：允许后立即移动 · 记住到关闭会话或重启 DSH'
    }
    return 'Control mouse pointer: moves immediately on allow · until closing session or restarting DSH'
  }

  return fam === 'zh' ? '申请执行权限' : 'Permission requested'
}

/**
 * Match both tool-approval waterfalls (`kind === 'approval'`) and CUA
 * approval questions (`cua-app-access` / `cua-mouse-control`) in the
 * ascending-priority `conversation.composer` chain slot.
 * Non-approval questions (`ask_user_question`, `plan-review`) return null.
 */
export function selectTuningComposer({ pendingInteraction } = {}) {
  if (!pendingInteraction || typeof pendingInteraction !== 'object') return null
  if (pendingInteraction.kind === 'approval') {
    return { channel: 'tool-approval', pending: pendingInteraction }
  }
  if (
    pendingInteraction.kind === 'question'
    && Array.isArray(pendingInteraction.questions)
    && pendingInteraction.questions.length === 1
  ) {
    const item = pendingInteraction.questions[0]
    if (
      (item?.id === 'cua-app-access' || item?.id === 'cua-mouse-control')
      && item?.intent?.kind === 'approval'
    ) {
      return { channel: 'cua-question', pending: pendingInteraction, item, intent: item.intent }
    }
  }
  return null
}

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
    const resize = new ResizeObserver((entries) => entries.forEach(({ target }) => measure(target)))
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
export function approvalComposerComponent(ctx, React) {
  const { createElement: h, useEffect, useRef, useState, useSyncExternalStore } = React
  const noopSubscribe = () => () => {}
  // Fallback identity for Pending objects that lack a unique .key (e.g. legacy forms or test doubles).
  const pendingRefIds = new WeakMap()
  let nextPendingRefId = 1
  const getPendingRefId = (pending) => {
    if (!pending || typeof pending !== 'object') return `prim:${String(pending ?? '')}`
    let id = pendingRefIds.get(pending)
    if (id === undefined) {
      id = `ref:${nextPendingRefId++}`
      pendingRefIds.set(pending, id)
    }
    return id
  }
  const isSnapshotCompatible = (value, expected) => {
    if (!value || value.schemaVersion !== 2) return false
    if (value.channel !== expected.channel || value.sessionId !== expected.sessionId) return false
    if (typeof value.reason !== 'string' || !value.reason.trim()) return false
    if (!value.permission || typeof value.permission.kind !== 'string') return false
    if (expected.channel === 'tool-approval') {
      if (value.callId !== expected.callId) return false
    } else if (expected.channel === 'cua-question') {
      if (value.callId !== undefined) return false
      const expectedKind = expected.cuaId === 'cua-app-access' ? 'application-access' : 'mouse-control'
      if (value.permission.kind !== expectedKind) return false
      if (expected.subjectName !== undefined && value.permission.subjectName !== expected.subjectName) return false
    }
    if (expected.expectedSnapshotId !== undefined && value.snapshotId !== expected.expectedSnapshotId) return false
    return true
  }

  return function TuningApprovalComposer(props) {
    const { matched, renderFactorySlot } = props
    const channel = matched.channel
    const pending = matched.pending
    const sessionId = props.sessionId ?? pending.sessionId
    const callId = channel === 'tool-approval' ? pending.callId : undefined
    const cuaId = channel === 'cua-question' ? matched.item?.id : undefined
    const subjectName = channel === 'cua-question' ? matched.intent?.subject?.name : undefined
    const toolName = channel === 'tool-approval' ? pending.toolName : undefined
    const rawKey = pending?.key
    const requestKey = (typeof rawKey === 'string' && rawKey.length > 0)
      ? rawKey
      : (typeof rawKey === 'number' ? String(rawKey) : getPendingRefId(pending))

    const form = ctx.configForms?.get?.('runtime-tuning-ui-chat')
    const settings = useSyncExternalStore(
      (f) => (form ? form.subscribe(f) : noopSubscribe()),
      () => (form ? form.getSnapshot() : { value: { approvalDetails: true } }),
    )
    const enabled = settings?.value?.approvalDetails !== false

    const localeSnap = useSyncExternalStore(
      (f) => (ctx.locale?.subscribe ? ctx.locale.subscribe(f) : noopSubscribe()),
      () => (ctx.locale?.getSnapshot ? ctx.locale.getSnapshot() : { active: 'en' }),
    )
    const locale = String(localeSnap?.active ?? 'en')

    const keySig = `${requestKey}|${channel}|${sessionId ?? ''}|${callId ?? ''}|${cuaId ?? ''}|${subjectName ?? ''}|${toolName ?? ''}|${enabled}`
    const prevKeySig = useRef(keySig)
    const lockedSnapshotId = useRef(undefined)
    const effectSeqRef = useRef(0)
    if (prevKeySig.current !== keySig) {
      prevKeySig.current = keySig
      lockedSnapshotId.current = undefined
    }

    const [boundSnapshot, setBoundSnapshot] = useState(null)
    // Verify synchronously during render so key changes never flash or mix an old request's text with new actions.
    const activeSnapshot =
      enabled &&
      boundSnapshot &&
      boundSnapshot.keySig === keySig &&
      isSnapshotCompatible(boundSnapshot.value, {
        channel,
        sessionId,
        callId,
        cuaId,
        subjectName,
        expectedSnapshotId: lockedSnapshotId.current,
      })
        ? boundSnapshot.value
        : null

    useEffect(() => {
      let active = true
      let timer
      const controller = new AbortController()
      const effectKeySig = keySig
      const effectSeq = ++effectSeqRef.current
      const expected = { channel, sessionId, callId, cuaId, subjectName }

      if (!enabled || !sessionId || (callId === undefined && cuaId === undefined)) {
        setBoundSnapshot((prev) => (prev && prev.keySig !== effectKeySig ? prev : null))
        return () => { active = false; controller.abort() }
      }
      setBoundSnapshot((prev) => (prev && prev.keySig === effectKeySig ? prev : null))

      const read = async () => {
        try {
          const rpc = ctx.get?.('connection')?.rpc
          if (!rpc) {
            if (active && effectSeq === effectSeqRef.current && prevKeySig.current === effectKeySig) {
              setBoundSnapshot((prev) => (prev && prev.keySig !== effectKeySig ? prev : null))
            }
            return
          }
          const req = {
            sessionId,
            channel,
            ...(callId !== undefined ? { callId } : {}),
            ...(cuaId !== undefined ? { cuaId } : {}),
            ...(subjectName !== undefined ? { subjectName } : {}),
            ...(lockedSnapshotId.current !== undefined ? { snapshotId: lockedSnapshotId.current } : {}),
            ...(locale ? { locale } : {}),
          }
          const r = await rpc.call('/api', 'runtimeTuningApproval/read', { args: { request: req } }, controller.signal)
          if (!active || controller.signal.aborted || effectSeq !== effectSeqRef.current || prevKeySig.current !== effectKeySig) return
          if (r?.ok && isSnapshotCompatible(r.value, { ...expected, expectedSnapshotId: lockedSnapshotId.current })) {
            lockedSnapshotId.current ??= r.value.snapshotId
            setBoundSnapshot((prev) => {
              if (effectSeq !== effectSeqRef.current || prevKeySig.current !== effectKeySig) return prev
              if (prev?.keySig === effectKeySig && typeof prev.value?.generation === 'number' && typeof r.value.generation === 'number' && r.value.generation < prev.value.generation) {
                return prev
              }
              return { keySig: effectKeySig, value: r.value }
            })
          } else {
            setBoundSnapshot((prev) => (prev && prev.keySig !== effectKeySig ? prev : null))
            if (r && !r.ok) active = false
          }
        } catch {
          if (active && effectSeq === effectSeqRef.current && prevKeySig.current === effectKeySig) {
            setBoundSnapshot((prev) => (prev && prev.keySig !== effectKeySig ? prev : null))
          }
        }
        if (active && !controller.signal.aborted && effectSeq === effectSeqRef.current && prevKeySig.current === effectKeySig) {
          timer = setTimeout(read, 1000)
        }
      }

      void read()
      return () => { active = false; clearTimeout(timer); controller.abort() }
    }, [keySig, locale])

    const resolveText = (text) => (ctx.locale?.resolveText ? ctx.locale.resolveText(text) : (text?.en ?? ''))
    const translate = (ns, key, params) => (ctx.locale?.translate ? ctx.locale.translate(ns, key, params) : key)

    let nativeCardProps
    if (channel === 'tool-approval') {
      const approval = pending
      const nativeTitle = (approval.displayReason === undefined ? approval.reason : resolveText(approval.displayReason))
        ?? translate('approval', 'escalation', { toolName: approval.toolName })
      nativeCardProps = {
        requestKey: approval.key,
        title: nativeTitle,
        ...(approval.callId === undefined ? {} : { callId: approval.callId }),
        canAnswer: () => approval.answerable,
        onAllow: () => approval.answer('allowed-once'),
        onReject: () => approval.answer('rejected'),
      }
    } else {
      const { item, intent } = matched
      const warning = item.id === 'cua-app-access'
        ? {
          label: translate('cuaPermissions', 'approvalRisks'),
          title: translate('cuaPermissions', 'approvalRiskTitle'),
          detail: translate('cuaPermissions', 'approvalRiskNotice'),
        }
        : undefined
      const answerCua = (label) => pending.answer({ answers: [{ id: item.id, selected: [label] }] })
      nativeCardProps = {
        requestKey: pending.key,
        ...(warning ? { warning } : {}),
        title: intent.display === undefined ? item.question : resolveText(intent.display.question),
        ...(item.detail === undefined ? {} : {
          description: intent.display?.detail === undefined ? item.detail : resolveText(intent.display.detail),
        }),
        ...(intent.subject === undefined ? {} : { subject: intent.subject }),
        allowLabel: intent.display?.approve === undefined ? intent.approve : resolveText(intent.display.approve),
        canAnswer: () => pending.snapshot().channel !== 'none' && !pending.snapshot().closed,
        onAllow: () => answerCua(intent.approve),
        onReject: () => answerCua(intent.reject),
        ...(intent.always === undefined ? {} : { onAlways: () => answerCua(intent.always) }),
      }
    }

    if (typeof renderFactorySlot !== 'function') return null

    if (!activeSnapshot) {
      return renderFactorySlot('conversation.approval.card', nativeCardProps)
    }

    const twoLineProps = {
      requestKey: nativeCardProps.requestKey,
      ...(nativeCardProps.warning ? { warning: nativeCardProps.warning } : {}),
      title: activeSnapshot.reason,
      description: formatApprovalPermissionText(activeSnapshot, locale),
      // Deliberately omit callId & subject so card body stays strictly 2 plain-text lines
      // while native strip, border, warning popover, buttons, and keyboard shortcuts stay intact.
      ...(nativeCardProps.allowLabel !== undefined ? { allowLabel: nativeCardProps.allowLabel } : {}),
      canAnswer: nativeCardProps.canAnswer,
      onAllow: nativeCardProps.onAllow,
      onReject: nativeCardProps.onReject,
      ...(nativeCardProps.onAlways !== undefined ? { onAlways: nativeCardProps.onAlways } : {}),
    }

    return h('div', {
      className: 'tune-approval-2line',
      'data-tune-ready': activeSnapshot.snapshotId,
      'data-tune-generation': String(activeSnapshot.generation),
      'data-tune-channel': activeSnapshot.channel,
      'data-tune-reason-source': activeSnapshot.reasonSource,
      style: { display: 'contents' },
    }, renderFactorySlot('conversation.approval.card', twoLineProps))
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

  // Preserve official ApprovalCommand detail registration AND mount unified conversation.composer at priority -10.
  const fullDetail = /ctx\.slots\.inject\((["'`])conversation\.approval\.detail\1,\(\)=>ctx\.slots\.register\(\{name:\1conversation\.approval\.detail\1\},ApprovalCommand\)\)/
  const minDetail = /ctx\.slots\.register\(\{name:(["'`])conversation\.approval\.detail\1\},ApprovalCommand\)/
  const composerReg = 'ctx.slots.inject($1conversation.composer$1,()=>ctx.slots.register({name:$1conversation.composer$1,priority:-10,select:__tuneSelectComposer,inject:sessionId=>({sessionId})},__tuneApprovalComposer(ctx,react)))'
  let approval = replace(table.text, fullDetail, '$&;' + composerReg)
  if (!approval.done && [...table.text.matchAll(new RegExp(fullDetail.source, 'g'))].length === 0) {
    approval = replace(table.text, minDetail, '$&;' + composerReg)
  }

  const apply = /function apply\(ctx\)\{/
  const helpers = [
    resolveLocaleFamily.toString(),
    formatApprovalPermissionText.toString(),
    selectTuningComposer.toString(),
    installPresentation.toString(),
    `const __tuneSelectComposer=${selectTuningComposer.name};`,
    `const __tuneApprovalComposer=${approvalComposerComponent.toString()};`,
  ].join('\n') + '\n'
  const wired = replace(approval.text, apply, helpers + 'function apply(ctx){installPresentation(ctx,' + JSON.stringify(TABLE_CSS) + ',{tables:' + table.done + '});')
  // Without a unique install seam nothing changes, including approval composer registration.
  return wired.done ? { text: wired.text, tables: table.done, approval: approval.done } : { text: source, tables: false, approval: false }
}
