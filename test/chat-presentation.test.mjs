import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  TABLE_CSS,
  approvalComposerComponent,
  patchPresentation,
  selectTuningComposer,
} from '../plugins/chat-presentation.mjs'
import { findHostPackage } from '../plugins/chat-answer-fix.mjs'
import { APPROVAL_VIEW_SCHEMA_VERSION, formatApprovalPermissionText } from '../plugins/approval-contract.mjs'

const tableAnchor = 'className:AssistantMarkdown_module_css_default.body,children:'
const fullDetailAnchor = 'ctx.slots.inject(`conversation.approval.detail`,()=>ctx.slots.register({name:`conversation.approval.detail`},ApprovalCommand))'
const minDetailAnchor = 'ctx.slots.register({name:`conversation.approval.detail`},ApprovalCommand)'
const applyAnchor = 'function apply(ctx){'

test('presentation patches are independent and each needs one exact anchor', () => {
  const p = patchPresentation(applyAnchor + tableAnchor + fullDetailAnchor)
  assert.equal(p.tables, true)
  assert.equal(p.approval, true)
  assert.ok(p.text.includes('conversation.composer'))
  assert.ok(p.text.includes('priority:-10'))
  assert.ok(p.text.includes('runtimeTuningApproval/read'))

  assert.equal(patchPresentation(applyAnchor + tableAnchor + tableAnchor + fullDetailAnchor).tables, false)
  assert.equal(patchPresentation(applyAnchor + tableAnchor + fullDetailAnchor + fullDetailAnchor).approval, false)
  assert.equal(patchPresentation(applyAnchor + tableAnchor + minDetailAnchor).approval, true)
  assert.equal(patchPresentation(applyAnchor + tableAnchor).tables, true)
  assert.deepEqual(patchPresentation(tableAnchor + fullDetailAnchor), {
    text: tableAnchor + fullDetailAnchor,
    tables: false,
    approval: false,
  })
})

for (const [label, bin] of [
  ['rc.2', '/home/s/.local/bin/dsh'],
  ['rc.3', '/home/s/dshwsl-desk/dsh-rc3/node_modules/@deepseek-ai/dsh/lib/bin.js'],
]) {
  test(`installed ${label} bundle mounts unified composer, preserves detail fallback, and passes JS parsing`, (t) => {
    if (!existsSync(bin)) return t.skip(`${label} host absent`)
    const dir = findHostPackage(bin, 'dsh-client-ui-chat')
    const file = join(dir, 'lib/client.js')
    const original = readFileSync(file, 'utf8')
    const p = patchPresentation(original)
    assert.equal(p.tables, true)
    assert.equal(p.approval, true)
    assert.doesNotThrow(() => new Function(p.text))
    assert.ok(p.text.includes('conversation.approval.detail'))
    assert.ok(p.text.includes('conversation.composer'))
    assert.ok(p.text.includes('runtimeTuningApproval/read'))
    assert.ok(p.text.includes('.tune-approval-2line'))
  })
}

test('selectTuningComposer matches tool approvals and CUA approval questions only', () => {
  assert.equal(selectTuningComposer({ pendingInteraction: undefined }), null)
  assert.equal(selectTuningComposer({ pendingInteraction: { kind: 'approval', callId: 'c1' } }).channel, 'tool-approval')

  assert.equal(selectTuningComposer({
    pendingInteraction: {
      kind: 'question',
      questions: [{ id: 'cua-app-access', intent: { kind: 'approval', approve: 'Allow', reject: 'Deny' } }],
    },
  }).channel, 'cua-question')

  assert.equal(selectTuningComposer({
    pendingInteraction: {
      kind: 'question',
      questions: [{ id: 'cua-mouse-control', intent: { kind: 'approval', approve: 'Allow', reject: 'Deny' } }],
    },
  }).channel, 'cua-question')

  // Regular user questions & plan review pass through untouched
  assert.equal(selectTuningComposer({
    pendingInteraction: { kind: 'question', questions: [{ id: 'ask-1', question: 'Which port?' }] },
  }), null)
  assert.equal(selectTuningComposer({ pendingInteraction: { kind: 'plan-review', questions: [] } }), null)
})

test('R1: composer synchronously isolates bound snapshots across key changes, same callId, CUA repeats, and slow/out-of-order RPCs', async (t) => {
  const deferred = () => {
    let resolve
    let reject
    const promise = new Promise((res, rej) => { resolve = res; reject = rej })
    return { promise, resolve, reject }
  }

  let activeLocale = 'en-US'
  const pendingRpcs = []
  const answers = []
  const fakeCtx = {
    configForms: { get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ value: { approvalDetails: true } }) }) },
    locale: {
      subscribe: () => () => {},
      getSnapshot: () => ({ active: activeLocale }),
      resolveText: (m) => m?.[activeLocale.split('-')[0]] ?? m?.en ?? '',
      translate: (ns, key) => `${ns}.${key}`,
    },
    get: (k) => (k === 'connection'
      ? {
          rpc: {
            call: (_api, _method, { args }) => {
              const d = deferred()
              pendingRpcs.push({ request: args.request, ...d })
              return d.promise
            },
          },
        }
      : undefined),
  }

  const states = []
  const refs = []
  const effects = []
  let stateIdx = 0
  let refIdx = 0
  const cleanups = []
  const ReactStub = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) {
      const i = stateIdx++
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial
      return [states[i], (val) => { states[i] = typeof val === 'function' ? val(states[i]) : val }]
    },
    useRef(initial) {
      const i = refIdx++
      if (!(i in refs)) refs[i] = { current: initial }
      return refs[i]
    },
    useSyncExternalStore: (_sub, getSnap) => getSnap(),
    useEffect(fn) { effects.push(fn) },
  }
  const Component = approvalComposerComponent(fakeCtx, ReactStub)
  t.after(() => { while (cleanups.length > 0) cleanups.pop()() })

  const renderAndCapture = (pendingInteraction) => {
    stateIdx = 0
    refIdx = 0
    effects.length = 0
    let card = null
    const matched = selectTuningComposer({ pendingInteraction })
    const rendered = Component({
      matched,
      sessionId: 'sess-r1',
      renderFactorySlot: (slotName, props) => { card = { slotName, props }; return { slotName, props } },
    })
    return { rendered, card }
  }
  const flushEffects = async () => {
    while (cleanups.length > 0) cleanups.pop()()
    for (const fn of effects) {
      const dispose = fn()
      if (typeof dispose === 'function') cleanups.push(dispose)
    }
    await new Promise((r) => setTimeout(r, 5))
  }

  // Request 1: approval:11 (missing .key test with WeakMap also covered below; here key='approval:11')
  const req1 = {
    kind: 'approval',
    key: 'approval:11',
    sessionId: 'sess-r1',
    toolName: 'bash',
    callId: 'c-11',
    reason: 'Native raw request 11',
    answerable: true,
    answer: (o) => answers.push(['11', o]),
  }
  renderAndCapture(req1)
  await flushEffects()
  assert.equal(pendingRpcs.length, 1)
  pendingRpcs[0].resolve({
    ok: true,
    value: {
      schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
      channel: 'tool-approval',
      snapshotId: 'snap-11',
      generation: 1,
      sessionId: 'sess-r1',
      requestKey: 'tool:sess-r1:c-11:1',
      callId: 'c-11',
      reason: 'Reason 11: inspect old artifact',
      reasonSource: 'model',
      permission: { kind: 'sandbox-escalation', requestedMode: 'workspace-write', subjectName: 'bash', lifetime: 'call' },
      choices: [{ id: 'rejected', lifetime: 'none', label: 'Reject' }, { id: 'allowed-once', lifetime: 'call', label: 'Allow once' }],
    },
  })
  await new Promise((r) => setTimeout(r, 5))
  const view11 = renderAndCapture(req1)
  assert.equal(view11.card.props.title, 'Reason 11: inspect old artifact')

  // Switch immediately to Request 2 (approval:13) while RPC 2 is still pending -> MUST NOT flash Reason 11!
  const req2 = {
    kind: 'approval',
    key: 'approval:13',
    sessionId: 'sess-r1',
    toolName: 'bash',
    callId: 'c-13',
    reason: 'Native raw request 13',
    answerable: true,
    answer: (o) => answers.push(['13', o]),
  }
  const syncView13 = renderAndCapture(req2)
  assert.equal(syncView13.card.props.title, 'Native raw request 13', 'synchronous key switch must immediately show req2 native card')
  assert.equal(syncView13.card.props.callId, 'c-13')
  syncView13.card.props.onAllow()
  assert.deepEqual(answers.at(-1), ['13', 'allowed-once'])

  // Flush effects for req2 (RPC index 1) and also simulate SAME callId twice WITHOUT .key (WeakMap fallback)
  await flushEffects()
  pendingRpcs[1].resolve({
    ok: true,
    value: {
      schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
      channel: 'tool-approval',
      snapshotId: 'snap-13',
      generation: 2,
      sessionId: 'sess-r1',
      requestKey: 'tool:sess-r1:c-13:2',
      callId: 'c-13',
      reason: 'Reason 13: run smoke tests',
      reasonSource: 'model',
      permission: { kind: 'sandbox-escalation', requestedMode: 'danger-full-access', subjectName: 'bash', lifetime: 'call' },
      choices: [{ id: 'rejected', lifetime: 'none', label: 'Reject' }, { id: 'allowed-once', lifetime: 'call', label: 'Allow once' }],
    },
  })
  await new Promise((r) => setTimeout(r, 5))
  const view13 = renderAndCapture(req2)
  assert.equal(view13.card.props.title, 'Reason 13: run smoke tests')

  // Same callId twice without .key (out-of-order RPC resolution!)
  const noKeyA = {
    kind: 'approval',
    sessionId: 'sess-r1',
    toolName: 'bash',
    callId: 'shared-call',
    reason: 'Native shared A',
    answerable: true,
    answer: (o) => answers.push(['sharedA', o]),
  }
  const noKeyB = {
    kind: 'approval',
    sessionId: 'sess-r1',
    toolName: 'bash',
    callId: 'shared-call',
    reason: 'Native shared B',
    answerable: true,
    answer: (o) => answers.push(['sharedB', o]),
  }
  renderAndCapture(noKeyA)
  await flushEffects()
  const rpcIdxA = pendingRpcs.length - 1

  // Switch to B before A resolves -> B must render Native shared B cleanly
  const syncB = renderAndCapture(noKeyB)
  assert.equal(syncB.card.props.title, 'Native shared B')
  await flushEffects()
  const rpcIdxB = pendingRpcs.length - 1

  // B resolves first with Reason B
  pendingRpcs[rpcIdxB].resolve({
    ok: true,
    value: {
      schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
      channel: 'tool-approval',
      snapshotId: 'snap-B',
      generation: 3,
      sessionId: 'sess-r1',
      requestKey: 'tool:sess-r1:shared-call:3',
      callId: 'shared-call',
      reason: 'Reason B only',
      reasonSource: 'model',
      permission: { kind: 'sandbox-escalation', requestedMode: 'workspace-write', subjectName: 'bash', lifetime: 'call' },
      choices: [{ id: 'rejected', lifetime: 'none', label: 'Reject' }, { id: 'allowed-once', lifetime: 'call', label: 'Allow once' }],
    },
  })
  await new Promise((r) => setTimeout(r, 5))
  // Late RPC A finally arrives out-of-order -> MUST BE IGNORED
  pendingRpcs[rpcIdxA].resolve({
    ok: true,
    value: {
      schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
      channel: 'tool-approval',
      snapshotId: 'snap-A',
      generation: 2,
      sessionId: 'sess-r1',
      requestKey: 'tool:sess-r1:shared-call:2',
      callId: 'shared-call',
      reason: 'Stale Reason A',
      reasonSource: 'model',
      permission: { kind: 'sandbox-escalation', requestedMode: 'workspace-write', subjectName: 'bash', lifetime: 'call' },
      choices: [{ id: 'rejected', lifetime: 'none', label: 'Reject' }, { id: 'allowed-once', lifetime: 'call', label: 'Allow once' }],
    },
  })
  await new Promise((r) => setTimeout(r, 5))
  const finalB = renderAndCapture(noKeyB)
  assert.equal(finalB.card.props.title, 'Reason B only')

  // CUA same-app twice sequentially must synchronously reset & show second native card while waiting
  const makeCua = (key, question) => ({
    kind: 'question',
    key,
    sessionId: 'sess-r1',
    questions: [{
      id: 'cua-app-access',
      question,
      detail: `${question} detail`,
      intent: { kind: 'approval', subject: { name: 'Excel' }, approve: 'Allow', reject: 'Deny' },
    }],
    snapshot: () => ({ channel: 'waterfall', closed: false }),
    answer: () => Promise.resolve(),
  })
  const cua1 = makeCua('question:cua:1', 'Excel request 1')
  renderAndCapture(cua1)
  await flushEffects()
  pendingRpcs.at(-1).resolve({
    ok: true,
    value: {
      schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
      channel: 'cua-question',
      snapshotId: 'snap-cua-1',
      generation: 4,
      sessionId: 'sess-r1',
      requestKey: 'cua:sess-r1:1',
      reason: 'First Excel step',
      reasonSource: 'tool-adapter',
      permission: { kind: 'application-access', subjectName: 'Excel', lifetime: 'session' },
      choices: [{ id: 'reject', lifetime: 'none', label: 'Deny' }, { id: 'approve', lifetime: 'session', label: 'Allow' }],
    },
  })
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(renderAndCapture(cua1).card.props.title, 'First Excel step')

  const cua2 = makeCua('question:cua:2', 'Excel request 2')
  const syncCua2 = renderAndCapture(cua2)
  assert.equal(syncCua2.card.props.title, 'Excel request 2')
  assert.equal(syncCua2.card.props.description, 'Excel request 2 detail')
})

function renderComposerWithHarness({ ctx, matched, sessionId = 'sess-1' }) {
  const states = []
  const refs = []
  const effects = []
  let stateIdx = 0
  let refIdx = 0
  let rendered = null

  const ReactStub = {
    createElement(type, props, ...children) {
      return { type, props, children }
    },
    useState(initial) {
      const i = stateIdx++
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial
      return [states[i], (val) => { states[i] = typeof val === 'function' ? val(states[i]) : val }]
    },
    useRef(initial) {
      const i = refIdx++
      if (!(i in refs)) refs[i] = { current: initial }
      return refs[i]
    },
    useSyncExternalStore(_sub, getSnap) {
      return getSnap()
    },
    useEffect(fn) {
      effects.push(fn)
    },
  }

  const Component = approvalComposerComponent(ctx, ReactStub)
  let capturedCard = null
  const renderFactorySlot = (slotName, props) => {
    capturedCard = { slotName, props }
    return { slotName, props }
  }

  const runRender = () => {
    stateIdx = 0
    refIdx = 0
    effects.length = 0
    rendered = Component({ matched, sessionId, renderFactorySlot })
    return { rendered, card: capturedCard }
  }

  const cleanups = []
  return {
    runRender,
    async flushEffects() {
      for (const fn of effects) {
        const dispose = fn()
        if (typeof dispose === 'function') cleanups.push(dispose)
      }
      await new Promise((r) => setTimeout(r, 10))
    },
    disposeAll() {
      while (cleanups.length > 0) cleanups.pop()()
    },
  }
}

test('composer renders 2-line plain text card for tool-approval & CUA and falls back natively when disabled or mismatched', async (t) => {
  let approvalDetails = true
  let activeLocale = 'zh-CN'
  let rpcResponse = {
    ok: true,
    value: {
      schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
      channel: 'tool-approval',
      snapshotId: 'snap-tool',
      generation: 1,
      sessionId: 'sess-1',
      requestKey: 'tool:sess-1:c1:1',
      callId: 'c1',
      reason: '需要清理构建缓存目录',
      reasonSource: 'model',
      permission: { kind: 'sandbox-escalation', requestedMode: 'danger-full-access', subjectName: 'bash', lifetime: 'call' },
      choices: [{ id: 'rejected', lifetime: 'none', label: '拒绝' }, { id: 'allowed-once', lifetime: 'call', label: '允许一次' }],
    },
  }

  const answers = []
  const fakeCtx = {
    configForms: { get: () => ({ subscribe: () => () => {}, getSnapshot: () => ({ value: { approvalDetails } }) }) },
    locale: {
      subscribe: () => () => {},
      getSnapshot: () => ({ active: activeLocale }),
      resolveText: (m) => m?.[activeLocale.split('-')[0]] ?? m?.en ?? '',
      translate: (ns, key) => `${ns}.${key}`,
    },
    get: (k) => (k === 'connection' ? { rpc: { call: async () => rpcResponse } } : undefined),
  }

  // 1. Tool approval 2-line path
  const toolPending = {
    kind: 'approval',
    key: 'approval:1',
    sessionId: 'sess-1',
    toolName: 'bash',
    callId: 'c1',
    reason: 'escalate sandbox to danger-full-access: raw fallback',
    answerable: true,
    answer: (outcome) => { answers.push(outcome); return Promise.resolve() },
  }
  const h1 = renderComposerWithHarness({ ctx: fakeCtx, matched: selectTuningComposer({ pendingInteraction: toolPending }) })
  t.after(() => h1.disposeAll())
  h1.runRender()
  await h1.flushEffects()
  const res1 = h1.runRender()

  assert.equal(res1.rendered.type, 'div')
  assert.equal(res1.rendered.props.className, 'tune-approval-2line')
  assert.equal(res1.card.slotName, 'conversation.approval.card')
  assert.equal(res1.card.props.title, '需要清理构建缓存目录')
  assert.equal(res1.card.props.description, formatApprovalPermissionText(rpcResponse.value, 'zh-CN'))
  assert.equal('callId' in res1.card.props, false, '2-line card omits callId so raw command details do not mount')
  assert.equal('subject' in res1.card.props, false)
  await res1.card.props.onAllow()
  await res1.card.props.onReject()
  assert.deepEqual(answers, ['allowed-once', 'rejected'])

  // 2. ApprovalDetails disabled falls back to native props (with callId restored)
  approvalDetails = false
  h1.runRender()
  await h1.flushEffects()
  const resNative = h1.runRender()
  assert.equal(resNative.card.props.callId, 'c1')
  assert.equal(resNative.card.props.title, 'escalate sandbox to danger-full-access: raw fallback')

  // 3. CUA app-access keeps warning, allowLabel, onAlways; fabricated callId fails back to native
  approvalDetails = true
  const cuaPending = {
    kind: 'question',
    key: 'question:cua:1',
    sessionId: 'sess-1',
    questions: [{
      id: 'cua-app-access',
      question: 'Allow Chrome control?',
      detail: 'Native verbose detail',
      intent: {
        kind: 'approval',
        subject: { name: 'Chrome', icon: 'chrome.png' },
        approve: 'Allow for this session',
        reject: 'Deny',
        always: 'Always allow',
      },
    }],
    snapshot: () => ({ channel: 'waterfall', closed: false }),
    answer: (payload) => { answers.push(payload); return Promise.resolve() },
  }
  rpcResponse = {
    ok: true,
    value: {
      schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
      channel: 'cua-question',
      snapshotId: 'snap-cua',
      generation: 2,
      sessionId: 'sess-1',
      requestKey: 'cua:sess-1:cua-app-access:2',
      reason: '允许操作应用 Chrome 以导出报告',
      reasonSource: 'tool-adapter',
      permission: { kind: 'application-access', subjectName: 'Chrome', lifetime: 'session' },
      choices: [
        { id: 'reject', lifetime: 'none', label: '拒绝' },
        { id: 'approve', lifetime: 'session', label: '本会话允许' },
        { id: 'always', lifetime: 'persistent', label: '始终允许' },
      ],
    },
  }
  const h2 = renderComposerWithHarness({ ctx: fakeCtx, matched: selectTuningComposer({ pendingInteraction: cuaPending }) })
  t.after(() => h2.disposeAll())
  h2.runRender()
  await h2.flushEffects()
  const resCua = h2.runRender()
  assert.equal(resCua.card.props.title, '允许操作应用 Chrome 以导出报告')
  assert.equal(resCua.card.props.description, '申请在本会话控制应用「Chrome」（可选择始终允许）')
  assert.equal('callId' in resCua.card.props, false)
  assert.equal('subject' in resCua.card.props, false)
  assert.equal(resCua.card.props.warning.label, 'cuaPermissions.approvalRisks')
  assert.equal(typeof resCua.card.props.onAlways, 'function')

  // 4. CUA mouse-control preserves immediate-move & session/restart expiry disclosures with zero Risks popover
  const mousePending = {
    kind: 'question',
    key: 'question:cua:mouse',
    sessionId: 'sess-1',
    questions: [{
      id: 'cua-mouse-control',
      question: 'Allow agent to move your mouse pointer?',
      detail: 'Allowing moves your pointer to this target now. Your choice is remembered until you close the session or restart DSH.',
      intent: {
        kind: 'approval',
        approve: 'Allow for this session',
        reject: 'Deny',
        display: {
          question: { en: 'Allow agent to move your mouse pointer?', zh: '允许智能体移动鼠标指针？' },
          detail: {
            en: 'Allowing moves your pointer to this target now. Your choice is remembered until you close the session or restart DSH.',
            zh: '允许后，指针会立即移到目标位置。会话会记住你的选择，直到关闭会话或重启 DSH。',
          },
          approve: { en: 'Allow for this session', zh: '本会话允许' },
        },
      },
    }],
    snapshot: () => ({ channel: 'waterfall', closed: false }),
    answer: (payload) => { answers.push(payload); return Promise.resolve() },
  }
  rpcResponse = {
    ok: true,
    value: {
      schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
      channel: 'cua-question',
      snapshotId: 'snap-mouse',
      generation: 3,
      sessionId: 'sess-1',
      requestKey: 'cua:sess-1:cua-mouse-control:3',
      reason: '允许智能体移动鼠标指针？允许后，指针会立即移到目标位置。会话会记住你的选择，直到关闭会话或重启 DSH。',
      reasonSource: 'tool-adapter',
      permission: { kind: 'mouse-control', lifetime: 'session' },
      choices: [
        { id: 'reject', lifetime: 'none', label: '拒绝' },
        { id: 'approve', lifetime: 'session', label: '本会话允许' },
      ],
    },
  }
  const hMouse = renderComposerWithHarness({ ctx: fakeCtx, matched: selectTuningComposer({ pendingInteraction: mousePending }) })
  t.after(() => hMouse.disposeAll())
  hMouse.runRender()
  await hMouse.flushEffects()
  const resMouse = hMouse.runRender()
  assert.equal('warning' in resMouse.card.props, false)
  assert.match(resMouse.card.props.title, /立即移到目标位置/)
  assert.match(resMouse.card.props.title, /关闭会话或重启 DSH/)
  assert.match(resMouse.card.props.description, /立即移动/)
  assert.match(resMouse.card.props.description, /关闭会话或重启 DSH/)

  // Fabricated callId on CUA response fails validation and falls back cleanly to native card
  rpcResponse = { ok: true, value: { ...rpcResponse.value, callId: 'fabricated' } }
  const hBadCua = renderComposerWithHarness({ ctx: fakeCtx, matched: selectTuningComposer({ pendingInteraction: cuaPending }) })
  t.after(() => hBadCua.disposeAll())
  hBadCua.runRender()
  await hBadCua.flushEffects()
  const resBadCua = hBadCua.runRender()
  assert.equal(resBadCua.card.props.subject.name, 'Chrome')
  assert.equal(resBadCua.card.props.description, 'Native verbose detail')
})

test('TABLE_CSS preserves table/approval split and wrapping rules', () => {
  const split = TABLE_CSS.indexOf('.tune-approval')
  assert.ok(split > 0)
  assert.match(TABLE_CSS.slice(split), /overflow-wrap:anywhere/)
  assert.match(TABLE_CSS.slice(split), /word-break:normal/)
})

test('generated provider carries official assets and removes superseded cached assets', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { generate } = await import('../plugins/chat-answer-fix.mjs')
  const root = mkdtempSync(join(tmpdir(), 'chat-assets-'))
  const official = join(root, 'official')
  const out = join(root, 'out')
  try {
    mkdirSync(join(official, 'lib/assets'), { recursive: true })
    mkdirSync(join(out, 'assets'), { recursive: true })
    writeFileSync(join(out, 'assets/old.png'), 'stale')
    writeFileSync(join(official, 'lib/assets/whale.png'), 'current official asset')
    writeFileSync(join(official, 'lib/client.js'), 'function apply(ctx){}')
    writeFileSync(join(official, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/dsh-client-ui-chat',
      version: '0.2.2-rc.3',
      exports: { './client': './lib/client.js', './assets/*': './lib/assets/*' },
    }))
    const result = generate(official, out)
    assert.equal(result.assets, true)
    assert.equal(JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')).exports['./assets/*'], './assets/*')
    assert.deepEqual(readdirSync(join(out, 'assets')), ['whale.png'])
    assert.equal(readFileSync(join(out, 'assets/whale.png'), 'utf8'), 'current official asset')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
