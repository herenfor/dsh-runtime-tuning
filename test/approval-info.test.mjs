import test from 'node:test'
import assert from 'node:assert/strict'
import { ApprovalSnapshots, makeSnapshot, validateReason } from '../plugins/approval-info.mjs'
const args = { command: 'printf ok', sandbox_permissions: 'danger-full-access', justification: 'Print a diagnostic outside the sandbox to verify the execution environment.' }
const agent = { id: 'a', session: { id: 's' } }
const execution = (overrides = {}) => ({ token: Symbol(), callId: 'c', name: 'bash', agent, signal: new AbortController().signal, arguments: { ...args }, ...overrides })
const request = (e, overrides = {}) => ({ agent: e.agent, toolName: e.name, callId: e.callId, reason: `escalate sandbox to ${e.arguments.sandbox_permissions}: ${e.arguments.justification}`, signal: new AbortController().signal, ...overrides })
test('reason validation rejects objectively invalid fields and accepts both languages', () => {
  for (const change of [{ justification: '' }, { justification: 'TODO' }, { justification: '需要更高权限' }, { justification: 'x'.repeat(1201) }, { sandbox_permissions: 'read-only' }, { justification: 'sk-' + 'a'.repeat(25) }]) assert.ok(validateReason(execution({ arguments: { ...args, ...change } })))
  assert.equal(validateReason(execution()), undefined)
  assert.equal(validateReason(execution({ arguments: { ...args, justification: '更新验收说明，需要扩大当前目录的写入权限。' } })), undefined)
  assert.equal(validateReason(execution({ name: 'custom', arguments: { sandbox_permissions: 'custom' } })), undefined)
})
test('captures current execution arguments; never guesses effective permission or paths', () => {
  const e = execution(); e.arguments = { ...args, command: 'actual rewritten command', workdir: '/tmp/real-argument' }
  const s = makeSnapshot(e, request(e), 2)
  assert.equal(s.command, 'actual rewritten command'); assert.equal(s.workdir, '/tmp/real-argument'); assert.equal(s.generation, 2)
  assert.equal(s.effectiveMode, undefined); assert.equal(s.resolvedPath, undefined); assert.equal(s.outsideWorkspace, undefined)
  assert.ok(Object.isFrozen(s)); assert.equal(makeSnapshot(e, request(e, { toolName: 'custom' }), 3), null)
})
test('replacement fragment is not a complete diff; replace_all stays explicit', () => {
  const e = execution({ name: 'edit', arguments: { sandbox_permissions: args.sandbox_permissions, justification: args.justification, file_path: '/outside/file', old_string: 'a', new_string: 'b', replace_all: true } })
  const s = makeSnapshot(e, request(e), 1); assert.deepEqual(s.edit, { before: 'a', after: 'b' }); assert.equal(s.replaceAll, true); assert.equal(s.modificationCount, undefined)
})
test('oversize or credential-bearing arguments never leave the metadata store', () => {
  for (const command of ['a'.repeat(66000), 'echo ghp_' + 'a'.repeat(40)]) { const e = execution({ arguments: { ...args, command } }); assert.equal(makeSnapshot(e, request(e), 1), null) }
})
test('isolates exact agents, sessions and calls; invalidates on completion and abort', () => {
  const store = new ApprovalSnapshots(), e = execution(); store.track(e)
  const control = new AbortController(), done = store.begin(request(e, { signal: control.signal }))
  const s = store.read({ sessionId: 's', callId: 'c' }); assert.ok(s)
  assert.equal(store.read({ sessionId: 'other', callId: 'c' }), null)
  assert.equal(store.read({ sessionId: 's', callId: 'other' }), null)
  assert.equal(store.read({ sessionId: 's', callId: 'c', snapshotId: 'stale' }), null)
  control.abort(); assert.equal(store.read({ sessionId: 's', callId: 'c' }), null); done()
  const end = store.begin(request(e)); assert.notEqual(store.read({ sessionId: 's', callId: 'c' }).snapshotId, s.snapshotId); end()
  assert.equal(store.pending.size, 0); store.untrack(e); assert.equal(store.active.size, 0)
})
test('ambiguous executions or pending generations fail back to native', () => {
  const store = new ApprovalSnapshots(), e = execution(), second = execution(); store.track(e); store.track(second)
  store.begin(request(e)); assert.equal(store.read({ sessionId: 's', callId: 'c' }), null)
  store.untrack(second); const d1 = store.begin(request(e)), d2 = store.begin(request(e))
  assert.equal(store.read({ sessionId: 's', callId: 'c' }), null); d1(); d2()
  store.begin(request(e, { agent: { ...agent } })); assert.equal(store.pending.size, 0)
})
test('malformed queries and requests without a live execution cannot reveal data', () => {
  const store = new ApprovalSnapshots(); assert.throws(() => store.read({}), /invalid/)
  store.begin(request(execution())); assert.equal(store.read({ sessionId: 's', callId: 'c' }), null)
})
test('one correction is keyed by operation and turn, not by changing call ids', async () => {
  const { ReasonGuard } = await import('../plugins/approval-info.mjs'), guard = new ReasonGuard()
  const e = execution({ arguments: { ...args, justification: 'TODO' } })
  assert.ok(guard.check(e))
  assert.equal(guard.check({ ...e, callId: 'new', arguments: args }), undefined)
  assert.ok(guard.check({ ...e, callId: 'newer' }))
  assert.match(guard.check({ ...e, callId: 'another', arguments: { justification: args.justification, sandbox_permissions: args.sandbox_permissions, command: args.command } }), /exhausted/)
  guard.reset(agent.session); assert.equal(guard.check({ ...e, arguments: args }), undefined)
})

test('unsupported tool schemas and failed capability reads stay native', async () => {
  const { supportsApproval } = await import('../plugins/approval-info.mjs')
  assert.equal(supportsApproval({ tools: { get: () => ({ parameters: { properties: { sandbox_permissions: { enum: ['danger-full-access'] } } } }) } }, execution()), false)
  assert.equal(supportsApproval({ tools: { get() { throw Error('changed contract') } } }, execution()), false)
  assert.equal(supportsApproval({ tools: { get: () => ({ parameters: { properties: { justification: { type: 'string' }, sandbox_permissions: { enum: ['workspace-write', 'danger-full-access'] } } } }) } }, execution()), true)
})

test('unpaired calls and unrelated hook reasons retain the native approval explanation', () => {
  const e = execution()
  assert.equal(makeSnapshot(e, request(e, { reason: 'A different policy requires confirmation' }), 1), null)
  const plain = execution({ arguments: { command: 'printf ok' } })
  assert.equal(makeSnapshot(plain, request(plain), 1), null)
})
