// progress-note：顶层会话一轮进行中，很久没有可见正文时，在工具结果后附一条请模型汇报进展的提醒。
// 日志写到临时目录，不碰真实的 $DSH_HOME。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'progress-note-'))
const { apply, createTracker, noteText } = await import('../plugins/progress-note.mjs')

const MIN = 60_000
// 所有假宿主共用一个假时钟（插件按 Date.now 计时）
const realNow = Date.now
let clock = 0
Date.now = () => clock
test.after(() => { Date.now = realNow })
const toolStep = { message: { content: [{ type: 'reasoning', text: 'x' }, { type: 'tool-call', name: 'bash' }] } }
const textStep = { message: { content: [{ type: 'text', text: '先看了日志，接下来跑测试。' }, { type: 'tool-call', name: 'bash' }] } }

function fakeHost(config, header = { delegationDepth: 0 }) {
  const handlers = {}
  apply({ on: (name, fn) => { handlers[name] = fn } }, config)
  const session = { id: 's', header }
  const notes = []
  const host = {
    notes, handlers,
    at: (minutes) => { clock = minutes * MIN },
    event: (type, data) => handlers['session/event']?.(session, { type, time: clock, data }),
    /** 一个工具步：assistant/message 后执行一个工具。 */
    step: async (data = toolStep, name = 'bash') => {
      host.event('assistant/message', data)
      await handlers['tools/execute']?.({ name, agent: { session }, deferContext: (m) => notes.push(m) }, async () => 'ok')
    },
  }
  host.restore = () => {}
  clock = 0
  return host
}

test('一轮里超过 3 分钟、至少 3 个工具步没有可见正文：提醒一次，提醒带"不带工具调用会结束这一轮"', async () => {
  const host = fakeHost()
  try {
    host.event('turn/start', {})
    host.at(1); await host.step(); await host.step()
    host.at(3.5); await host.step()
    assert.equal(host.notes.length, 1)
    const text = host.notes[0].content[0].text
    assert.match(text, /about 4 minutes/)
    assert.match(text, /together with your next tool calls/)
    assert.match(text, /reply without tool calls ends the turn/)
    assert.equal(host.notes[0].source.kind, 'dsh-progress-note')
  } finally { host.restore() }
})

test('不到时间、步数不够、刚写过正文都不提醒；写过正文后重新计时', async () => {
  const host = fakeHost()
  try {
    host.event('turn/start', {})
    host.at(2.9); await host.step(); await host.step(); await host.step()
    assert.equal(host.notes.length, 0)  // 3 步了，但还不到 3 分钟
    host.at(10); await host.step()
    assert.equal(host.notes.length, 1)
    const fresh = fakeHost()
    fresh.event('turn/start', {})
    fresh.at(5); await fresh.step(); await fresh.step()  // 步数不够
    assert.equal(fresh.notes.length, 0)
    fresh.at(5.5); await fresh.step(textStep)  // 写了正文：清零
    fresh.at(7); await fresh.step(); await fresh.step(); await fresh.step()
    assert.equal(fresh.notes.length, 0)
    fresh.at(8.6); await fresh.step()
    assert.equal(fresh.notes.length, 1)
  } finally { host.restore() }
})

test('提醒后等模型回应：下一条回复记进日志，之前不再提醒；再沉默 3 分钟再提醒', async () => {
  const logs = []
  let t = 0
  const tracker = createTracker({ minutes: 3, minSteps: 3 }, { now: () => t, sink: (e) => logs.push(e) })
  const ev = (type, data) => tracker.onEvent('s', { type, time: t, data })
  ev('turn/start', {})
  t = 1 * MIN; ev('assistant/message', toolStep); ev('assistant/message', toolStep); ev('assistant/message', toolStep)
  t = 4 * MIN
  assert.equal(tracker.due('s'), 4)
  assert.equal(tracker.due('s'), undefined)  // 同一步其他工具
  ev('assistant/message', toolStep)  // 模型没写进展
  assert.deepEqual(logs.map((e) => e.reply), ['tools-only'])
  t = 5 * MIN; ev('assistant/message', toolStep); ev('assistant/message', toolStep)
  assert.equal(tracker.due('s'), undefined)  // 距上次提醒不到 3 分钟
  t = 7.1 * MIN
  assert.equal(tracker.due('s'), 7)
  ev('assistant/message', textStep)
  assert.deepEqual(logs.map((e) => e.reply), ['tools-only', 'text-with-tools'])
  t = 8 * MIN; ev('assistant/message', { message: { content: [{ type: 'text', text: '做完了。' }] } })
  assert.equal(logs.length, 2)  // 只记提醒后的第一条
})

test('轮次之外、子代理、关闭时都不提醒', async () => {
  const idle = fakeHost()
  const child = fakeHost(undefined, { delegationDepth: 1 })
  const off = fakeHost({ enabled: false })
  try {
    for (const host of [idle, child, off]) {
      host.at(0)
      if (host !== idle) host.event('turn/start', {})
      for (let i = 0; i < 5; i++) { host.at(i * 2); await host.step() }
    }
    assert.deepEqual([idle.notes.length, child.notes.length, off.notes.length], [0, 0, 0])
    assert.deepEqual(Object.keys(off.handlers), [])
    idle.event('turn/start', {}); idle.event('turn/end', {})
    idle.at(100); await idle.step(); await idle.step(); await idle.step()
    assert.equal(idle.notes.length, 0)  // 轮次结束后清掉
  } finally { idle.restore() }
})

test('提醒出错不影响工具结果；正文按用户语言写由模型决定', async () => {
  const handlers = {}
  apply({ on: (name, fn) => { handlers[name] = fn } }, { minutes: 0.0001, minSteps: 1 })
  const session = { id: 's' }
  clock = 10 * MIN
  handlers['session/event'](session, { type: 'turn/start', time: Date.now() - MIN, data: {} })
  handlers['session/event'](session, { type: 'assistant/message', time: Date.now(), data: toolStep })
  const result = await handlers['tools/execute']({ name: 'bash', agent: { session }, deferContext: () => { throw new Error('boom') } }, async () => 'ok')
  assert.equal(result, 'ok')
  assert.match(noteText(5), /in their language/)
})
