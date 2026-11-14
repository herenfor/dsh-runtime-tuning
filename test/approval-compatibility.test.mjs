import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findHostPackage } from '../plugins/chat-answer-fix.mjs'
import { ApprovalSnapshots, mountApprovalHooks } from '../plugins/approval-info.mjs'

// Compare official tool/result behavior, including real harmless Bash output.
// Only the shell capability and PTC runtime are fixtures; permissions, tool
// definitions, approval service, and both execution pipelines are installed DSH.
async function runCases(entry, enhanced) {
  const load = (name) => import(pathToFileURL(join(findHostPackage(entry, name), 'lib/index.js')).href)
  const { Context } = await load('cordis')
  const { default: ToolsService } = await load('dsh-tools')
  const { default: ApprovalService } = await load('dsh-user-approval')
  const { NativeToolExecutor } = await load('dsh-tool-executor-native')
  const { PtcExecutor } = await load('dsh-tool-executor-ptc')
  const bash = await load('dsh-tool-bash')
  const ctx = new Context()
  const events = []
  const session = { id: 'compat-session', header: {}, append: (type, data) => events.push({ type, data }) }
  const agent = { id: 'compat-agent', origin: 'main', session, ctx }
  const noop = () => () => {}
  let policy = 'ask', decision = 'allowed-once', asks = 0, executions = 0
  let view
  ctx.provide('systemPrompt', { section: noop, context: noop, tools: noop, getSectionOrder: () => 50, getContextOrder: () => 50 })
  ctx.provide('sessionProjections', {
    register: () => ({ stateOf: () => ({ policy, turnOpen: true }), unregister: noop }),
  })
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'read-only' }) })
  ctx.provide('workingDirectory', { ensure: async () => '/tmp' })
  ctx.provide('shellEnv', { collect: () => ({}) })
  ctx.provide('shell', {
    sandboxMode: 'read-only',
    resolve: (req) => ({ ...req, workdir: '/tmp', timeoutMs: 5000 }),
    async execute(spec) {
      assert.equal(spec.command, 'printf APPROVAL_COMPAT_OK')
      assert.equal(spec.sandboxPolicy.mode, 'danger-full-access')
      const text = execFileSync('/bin/bash', ['-c', spec.command], { encoding: 'utf8' })
      executions++
      return { result: async () => ({
        exitCode: 0, signal: null, timedOut: false, aborted: false, timeoutMs: 5000,
        stdout: { text, truncated: false }, stderr: { text: '', truncated: false },
      }) }
    },
  })
  ctx.provide('ptcRuntime', {
    language: 'typescript', programFormat: 'module', sandboxMode: 'read-only', retainsState: false,
    resolve: (req) => ({ ...req, timeoutMs: 5000 }),
    async run() { executions++; return { value: 'PTC_COMPAT_OK', logs: [] } },
    async release() {},
  })
  try {
    await ctx.plugin(ToolsService)
    await ctx.plugin(ApprovalService, { policy: 'ask' })
    bash.apply(ctx, { enableRunInBackground: false })
    const snapshots = new ApprovalSnapshots()
    if (enhanced) await mountApprovalHooks(ctx, { snapshots })
    ctx.on('approval/request', (req) => {
      asks++
      view = snapshots.read({ sessionId: session.id, callId: req.callId })
      return decision
    })
    const native = new NativeToolExecutor(ctx)
    const ptc = new PtcExecutor(ctx)
    const results = []
    async function run(justification, { tool = 'bash', outcome = 'allowed-once', approvalPolicy = 'ask' } = {}) {
      decision = outcome
      policy = approvalPolicy
      view = undefined
      const before = { asks, executions }
      const args = {
        description: 'Verify approval compatibility', sandbox_permissions: 'danger-full-access', justification,
        ...(tool === 'run_code' ? { code: 'return 1' } : { command: 'printf APPROVAL_COMPAT_OK' }),
      }
      const batch = await (tool === 'run_code' ? ptc : native).execute({
        calls: [{ id: 'same-call-id', name: tool, arguments: JSON.stringify(args) }],
        agent, signal: new AbortController().signal,
      })
      const result = batch.results[0].result
      results.push({
        isError: Boolean(result.isError), text: result.content.map((c) => c.text).join(''),
        code: result.error?.info?.code, asks: asks - before.asks, executions: executions - before.executions,
      })
      return view
    }
    const longReason = 'Inspect the requested diagnostic information outside the workspace to identify why the application cannot connect to the development service before proposing a narrowly scoped fix.'
    for (const reason of [longReason, 'TODO', 'placeholder', 'First line\nSecond line', '`diagnostic`', '{"command":"diagnostic"}']) {
      assert.equal(await run(reason), null)
      assert.equal(results.at(-1).isError, false)
      assert.equal(results.at(-1).asks, 1)
      assert.equal(results.at(-1).executions, 1)
    }
    const valid = 'Read the requested diagnostic outside the workspace.'
    const validView = await run(valid)
    if (enhanced) assert.equal(validView.reason, valid)
    for (const outcome of ['rejected', 'cancelled', 'unavailable']) {
      await run(longReason, { outcome })
      assert.equal(results.at(-1).isError, true)
      assert.equal(results.at(-1).executions, 0)
    }
    await run(longReason, { approvalPolicy: 'never' })
    assert.equal(results.at(-1).asks, 0)
    assert.equal(results.at(-1).executions, 0)
    await run('') // Official argument error, not our presentation error.
    assert.equal(results.at(-1).isError, true)
    assert.match(results.at(-1).text, /invalid justification/)
    await run(longReason, { tool: 'run_code' })
    assert.equal(results.at(-1).isError, false)
    assert.equal(results.at(-1).executions, 1)
    await run('TODO', { tool: 'run_code', outcome: 'rejected' })
    assert.equal(results.at(-1).executions, 0)
    if (enhanced) assert.equal(snapshots.active.size, 0)
    return { results, audit: events.filter((e) => e.type.startsWith('approval/')).map((e) => ({ type: e.type, reason: e.data.reason, outcome: e.data.outcome })) }
  } finally {
    await ctx.fiber.dispose()
  }
}

for (const [label, entry] of [
  ['rc.2', '/home/s/.local/bin/dsh'],
  ['rc.3', '/home/s/dshwsl-desk/dsh-rc3/node_modules/@deepseek-ai/dsh/lib/bin.js'],
]) {
  test(`official approval compatibility (${label}): long/repeated reasons, native outcomes, never, argument checks, PTC and audit`, async (t) => {
    if (!existsSync(entry)) return t.skip(`${label} Host absent`)
    assert.deepEqual(await runCases(entry, true), await runCases(entry, false))
  })
}
