// todo-reminder：按会话事件记步数，清单有未完成项且 N 步没更新时，在工具结果后附一条提醒。
// 日志写到临时目录，不碰真实的 $DSH_HOME。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'todo-reminder-'))
const { apply, reminderText } = await import('../plugins/todo-reminder.mjs')

const OPEN = [{ content: '盘点样书', status: 'in_progress' }, { content: '写清单', status: 'pending' }]

function fakeHost(config) {
  const handlers = {}
  apply({ on: (name, fn) => { handlers[name] = fn } }, { closingCheck: false, ...config })
  const session = { id: 's' }
  const notes = []
  const host = {
    notes,
    event: (type, data, s = session) => handlers['session/event'](s, { type, data }),
    write: (todos) => host.event('todo/write', { todos }),
    /** 一步：step/start 后执行 tools 里的每个工具。 */
    step: async (tools = ['bash'], s = session) => {
      host.event('step/start', {}, s)
      for (const name of tools) {
        await handlers['tools/execute']({ name, agent: { session: s }, deferContext: (m) => notes.push({ session: s.id, m }) }, async () => 'ok')
      }
    },
    steps: async (n, tools) => { for (let i = 0; i < n; i++) await host.step(tools) },
  }
  return host
}

test('（阈值 10）清单写下后第 10 步提醒一次，再过 10 步再提醒；提醒带清单当前内容', async () => {
  const host = fakeHost({ stepsSinceWrite: 10, stepsBetweenReminders: 10 })
  await host.step(['todo_write']); host.write(OPEN)
  await host.steps(9)
  assert.equal(host.notes.length, 0)
  await host.step()
  assert.equal(host.notes.length, 1)
  const text = host.notes[0].m.content[0].text
  assert.match(text, /last 10 steps/)
  assert.match(text, /- \[>\] 盘点样书 \(in progress\)\n- \[ \] 写清单/)
  assert.equal(host.notes[0].m.source.kind, 'dsh-todo-reminder')
  assert.match(text, /same step as your next tool call/)
  await host.steps(9)
  assert.equal(host.notes.length, 1)
  await host.step()
  assert.equal(host.notes.length, 2)
})

test('更新清单后重新计数', async () => {
  const host = fakeHost({ stepsSinceWrite: 10, stepsBetweenReminders: 10 })
  host.write(OPEN)
  await host.steps(8)
  host.write([{ ...OPEN[0], status: 'completed' }, { ...OPEN[1], status: 'in_progress' }])
  await host.steps(9)
  assert.equal(host.notes.length, 0)
  await host.step()
  assert.equal(host.notes.length, 1)
  assert.match(host.notes[0].m.content[0].text, /- \[x\] 盘点样书\n- \[>\] 写清单/)
})

test('没写过清单、清单全部完成或为空时不提醒', async () => {
  const host = fakeHost({ stepsSinceWrite: 10, stepsBetweenReminders: 10 })
  await host.steps(30)
  host.write(OPEN.map((t) => ({ ...t, status: 'completed' })))
  await host.steps(30)
  host.write([])
  await host.steps(30)
  assert.equal(host.notes.length, 0)
})

test('同一步多个工具只提醒一次；todo_write 本身不带提醒', async () => {
  const host = fakeHost({ stepsSinceWrite: 10, stepsBetweenReminders: 10 })
  host.write(OPEN)
  await host.steps(9)
  await host.step(['bash', 'read', 'bash'])
  assert.equal(host.notes.length, 1)
  const late = fakeHost({ stepsSinceWrite: 10, stepsBetweenReminders: 10 })
  late.write(OPEN)
  await late.steps(9)
  await late.step(['todo_write'])
  assert.equal(late.notes.length, 0)
})

test('按会话分开计数：子代理的步数不算到父会话上', async () => {
  const host = fakeHost({ stepsSinceWrite: 10, stepsBetweenReminders: 10 })
  host.write(OPEN)
  const child = { id: 'child' }
  for (let i = 0; i < 20; i++) await host.step(['bash'], child)
  assert.equal(host.notes.length, 0)
})

test('阈值可配，enabled: false 时不挂钩子', async () => {
  const host = fakeHost({ stepsSinceWrite: 3, stepsBetweenReminders: 5 })
  host.write(OPEN)
  await host.steps(3)
  assert.equal(host.notes.length, 1)
  await host.steps(5)
  assert.equal(host.notes.length, 2)
  const handlers = {}
  apply({ on: (name, fn) => { handlers[name] = fn } }, { enabled: false, closingCheck: false })
  assert.deepEqual(Object.keys(handlers), [])
})

test('默认 15 步才提醒', async () => {
  const host = fakeHost()
  host.write(OPEN)
  await host.steps(14)
  assert.equal(host.notes.length, 0)
  await host.step()
  assert.equal(host.notes.length, 1)
})

test('提醒出错不影响工具结果', async () => {
  const handlers = {}
  apply({ on: (name, fn) => { handlers[name] = fn } }, { closingCheck: false })
  handlers['session/event']({ id: 's' }, { type: 'todo/write', data: { todos: OPEN } })
  for (let i = 0; i < 15; i++) handlers['session/event']({ id: 's' }, { type: 'step/start', data: {} })
  const result = await handlers['tools/execute']({ name: 'bash', agent: { session: { id: 's' } }, deferContext: () => { throw new Error('boom') } }, async () => 'ok')
  assert.equal(result, 'ok')
  assert.match(reminderText(OPEN, 12), /last 12 steps/)
})

/** 收尾检查用的假宿主：带 agent/turn-stopping、agent.inject 和 concludeTurn。 */
function closingHost(header = { delegationDepth: 0 }) {
  const handlers = {}
  apply({ on: (name, fn) => { handlers[name] = fn } }, { closingCheck: true })
  const session = { id: 's', header }
  const injected = []
  const agent = { session, inject: (m) => injected.push(m) }
  const event = (type, data) => handlers['session/event'](session, { type, data })
  return {
    handlers, injected, event,
    stopping: (turn = 1) => handlers['agent/turn-stopping']?.({ agent, turn }),
    reply: (...names) => event('assistant/message', { message: { content: names.map((name) => ({ type: 'tool-call', name })) } }),
    exec: async (name) => {
      let concluded = false
      await handlers['tools/execute']({ name, agent: { session }, concludeTurn: () => { concluded = true }, deferContext: () => {} }, async () => 'ok')
      return concluded
    },
  }
}

test('收尾检查：清单有未完成项时排一条消息，只调 todo_write 的那一步直接结束本轮；每轮一次', async () => {
  const host = closingHost()
  host.event('todo/write', { todos: OPEN })
  host.stopping(1)
  assert.equal(host.injected.length, 1)
  assert.match(host.injected[0].content[0].text, /ending this turn[\s\S]*- \[>\] 盘点样书 \(in progress\)/)
  host.reply('todo_write')
  host.event('todo/write', { todos: OPEN.map((t) => ({ ...t, status: 'completed' })) })
  assert.equal(await host.exec('todo_write'), true)
  host.stopping(1)  // 结束那一步之后 DSH 会再问一次：同一轮不再排
  assert.equal(host.injected.length, 1)
  host.event('turn/end', {})
  host.event('todo/write', { todos: OPEN })
  host.stopping(2)
  assert.equal(host.injected.length, 2)
})

test('收尾检查：模型又开始干活（同一步还有别的工具）时不结束本轮；清单已完成、没写过、子代理都不检查', async () => {
  const host = closingHost()
  host.event('todo/write', { todos: OPEN })
  host.stopping(1)
  host.reply('todo_write', 'bash')
  assert.equal(await host.exec('todo_write'), false)
  const done = closingHost()
  done.event('todo/write', { todos: OPEN.map((t) => ({ ...t, status: 'completed' })) })
  done.stopping(1)
  const never = closingHost()
  never.stopping(1)
  const child = closingHost({ delegationDepth: 1 })
  child.event('todo/write', { todos: OPEN })
  child.stopping(1)
  assert.deepEqual([done.injected.length, never.injected.length, child.injected.length], [0, 0, 0])
  assert.equal(await never.exec('todo_write'), false)  // 没排过消息的 todo_write 不结束本轮
})

test('收尾检查关闭时不挂 agent/turn-stopping', () => {
  const handlers = {}
  apply({ on: (name, fn) => { handlers[name] = fn } }, { closingCheck: false })
  assert.equal(handlers['agent/turn-stopping'], undefined)
})
