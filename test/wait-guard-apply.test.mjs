// 通过 apply 把 task_status 接到一个假的宿主上，确认“答复 + 唯一的 task_status”会真的结束本轮。
// 日志写到临时目录，不碰真实的 $DSH_HOME。
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'wait-guard-'))
const { apply, promptText } = await import('../plugins/wait-guard.mjs')

function fakeHost(config) {
  const handlers = {}, tools = {}
  const ctx = {
    on: (name, fn) => { handlers[name] = fn },
    effect: () => {},
    get: () => undefined,
    tools: { register: (def) => { tools[def.name] = def } },
    systemPrompt: { section: () => {}, getSectionOrder: () => 0 },
  }
  apply(ctx, config)
  const session = { id: 's', header: { delegationDepth: 0 } }
  return {
    reply: (...content) => handlers['session/event'](session, { type: 'assistant/message', data: { message: { content } } }),
    call: async (callId, args) => {
      let concluded = false
      const value = await tools.task_status.execute(args, { callId, agent: { session }, concludeTurn: () => { concluded = true } })
      return { value, concluded }
    },
  }
}

test('答复和唯一的 task_status 在同一条回复里：结束本轮', async () => {
  const host = fakeHost()
  host.reply({ type: 'text', text: '已完成。' }, { type: 'tool-call', id: 'c1' })
  const { value, concluded } = await host.call('c1', { state: 'done' })
  assert.equal(concluded, true)
  assert.match(value.text, /turn ends here/)
})

test('同一步还有别的工具，或者 concludeTurn: false：不结束', async () => {
  const mixed = fakeHost()
  mixed.reply({ type: 'text', text: '先看一下' }, { type: 'tool-call', id: 'b1' }, { type: 'tool-call', id: 'c1' })
  assert.equal((await mixed.call('c1', { state: 'done' })).concluded, false)

  const off = fakeHost({ concludeTurn: false })
  off.reply({ type: 'text', text: '已完成。' }, { type: 'tool-call', id: 'c1' })
  assert.equal((await off.call('c1', { state: 'done' })).concluded, false)
})

test('有硬保底时 task_status 是可选的；关掉硬保底就恢复每轮声明', () => {
  const optional = promptText({ undeclaredMinutes: 30, concludeTurn: true })
  assert.match(optional, /Call task_status only in two cases/)
  assert.match(optional, /longer than 30 minutes/)
  assert.match(optional, /parallel tool calls/)
  assert.doesNotMatch(optional, /Before you end a turn, call task_status/)
  assert.match(promptText({ undeclaredMinutes: 0, concludeTurn: true }), /Before you end a turn, call task_status/)
})

test('apply 挂载 tools/execute：冻结参数整对象替换并注入 deferContext（含本机宿主 L2 契约验证）', async (t) => {
  const handlers = {}
  apply({
    on: (name, fn) => { handlers[name] = fn },
    effect: () => {},
    get: () => undefined,
    tools: { register: () => {} },
    systemPrompt: { section: () => {}, getSectionOrder: () => 0 },
  })
  const notes = []
  const exec = {
    name: 'bash',
    arguments: Object.freeze({ command: 'cargo build', timeoutMs: 180000 }),
    agent: { session: { id: 's', header: { delegationDepth: 0 } } },
    deferContext: (s) => notes.push(s),
  }
  await handlers['tools/execute'](exec, () => Promise.resolve('ok'))
  assert.equal(exec.arguments.timeoutMs, 30000)
  assert.equal(notes.length, 1)
  assert.equal(notes[0].role, 'user')
  assert.equal(notes[0].source.kind, 'dsh-wait-guard')
  assert.match(notes[0].content[0].text, /clamped to 30000ms/)

  const pnpm = join(homedir(), '.local/share/dsh-cli/node_modules/.pnpm')
  if (!existsSync(pnpm)) return t.diagnostic('host dsh-cli pnpm store absent; skipped L2 contract check')
  const pick = (prefix, sub) => {
    const dir = readdirSync(pnpm).find((d) => d.startsWith(prefix))
    return dir && join(pnpm, dir, 'node_modules', sub, 'lib/index.js')
  }
  const cordisFile = pick('@deepseek-ai+cordis@', '@deepseek-ai/cordis')
  const spFile = pick('@deepseek-ai+dsh-system-prompt@', '@deepseek-ai/dsh-system-prompt')
  const toolsFile = pick('@deepseek-ai+dsh-tools@', '@deepseek-ai/dsh-tools')
  if (!cordisFile || !spFile || !toolsFile) return
  const { Context } = await import(pathToFileURL(cordisFile).href)
  const spMod = await import(pathToFileURL(spFile).href)
  const toolsMod = await import(pathToFileURL(toolsFile).href)
  const ctx = new Context()
  ctx.plugin(spMod.default)
  ctx.plugin(toolsMod.default)
  ctx.plugin({ name: 'wg-test', apply })
  await new Promise((r) => setTimeout(r, 30))
  ctx.tools.register({
    name: 'bash', description: 't',
    parameters: { type: 'object', properties: { command: { type: 'string' }, timeoutMs: { type: 'number' } }, required: ['command'] },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_a, v) => [{ type: 'text', text: v.text }] },
    async execute(args) { return { text: `timeoutMs=${args.timeoutMs}` } },
  })
  const res = await ctx.tools.execute({
    callId: 'c1', rootCallId: 'c1', signal: new AbortController().signal,
    name: 'bash', arguments: { command: 'cargo build', timeoutMs: 300000 },
  })
  assert.equal(res.isError, false)
  assert.equal(res.value.text, 'timeoutMs=30000')
  assert.equal(res.additionalContexts?.length, 1)
  // agent loop 把 additionalContexts 当消息拼进下一步，会读 source.kind（传字符串时这一轮报错中断）
  assert.equal(res.additionalContexts[0].source.kind, 'dsh-wait-guard')
})

test('apply：任务事实在执行前后附到结果里；子代理和关掉 jobNotes 时不附', async () => {
  const run = async (config, depth, command, name = 'bash', output = 'ok') => {
    const handlers = {}
    apply({ on: (n, fn) => { handlers[n] = fn }, effect: () => {}, get: () => undefined,
      tools: { register: () => {} }, systemPrompt: { section: () => {}, getSectionOrder: () => 0 } }, config)
    const session = { id: 's', header: { delegationDepth: depth } }
    handlers['session/event'](session, { type: 'job/registered', data: { jobId: 'bash-c7', owner: 's', label: 'python tools/sweep.py', startedAt: Date.now() } })
    const notes = []
    const exec = { name, arguments: Object.freeze({ command }), agent: { session }, deferContext: (s) => notes.push(s) }
    const result = await handlers['tools/execute'](exec, () => Promise.resolve({ content: [{ type: 'text', text: output }] }))
    return { notes, result }
  }
  const top = await run({}, 0, 'ps aux | grep sweep')
  assert.equal(top.notes.length, 1)
  assert.match(top.notes[0].content[0].text, /bash-c7, running 0 min: python tools\/sweep\.py/)
  assert.equal(top.result.content[0].text, 'ok')
  assert.match((await run({}, 0, undefined, 'job_output', '(no new output)\n[status: running]')).notes[0].content[0].text, /Nothing new since your last read/)
  assert.deepEqual((await run({}, 1, 'ps aux')).notes, [])
  assert.deepEqual((await run({ jobNotes: false }, 0, 'ps aux')).notes, [])
})
