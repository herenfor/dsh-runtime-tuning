// 通过 apply 把 task_status 接到一个假的宿主上，确认“答复 + 唯一的 task_status”会真的结束本轮。
// 日志写到临时目录，不碰真实的 $DSH_HOME。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
