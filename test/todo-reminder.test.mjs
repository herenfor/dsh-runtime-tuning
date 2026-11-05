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
  apply({ on: (name, fn) => { handlers[name] = fn } }, config)
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
  apply({ on: (name, fn) => { handlers[name] = fn } }, { enabled: false })
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
  apply({ on: (name, fn) => { handlers[name] = fn } })
  handlers['session/event']({ id: 's' }, { type: 'todo/write', data: { todos: OPEN } })
  for (let i = 0; i < 15; i++) handlers['session/event']({ id: 's' }, { type: 'step/start', data: {} })
  const result = await handlers['tools/execute']({ name: 'bash', agent: { session: { id: 's' } }, deferContext: () => { throw new Error('boom') } }, async () => 'ok')
  assert.equal(result, 'ok')
  assert.match(reminderText(OPEN, 12), /last 12 steps/)
})
