import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'stream-stall-'))
after(() => rmSync(process.env.DSH_HOME, { recursive: true, force: true }))
const { StreamStallError, apply, createSseCounter, isModelStream, wrapFetch } = await import('../plugins/stream-stall.mjs')

const URL_ = 'https://api.deepseek.com/anthropic/v1/messages'
const POST = { method: 'POST', headers: { accept: 'text/event-stream', 'content-type': 'application/json' } }
const enc = new TextEncoder()
const event = (type) => `event: ${type}\ndata: {"type":"${type}","index":0}\n\n`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 假的上游：按脚本吐出 SSE 片段（数字表示等待毫秒），记下收到的 signal。 */
function fakeUpstream(script) {
  const seen = {}
  const original = async (input, init) => {
    seen.signal = init.signal
    const body = new ReadableStream({
      async start(c) {
        for (const step of script) {
          if (typeof step === 'number') await sleep(step)
          else if (!init.signal.aborted) c.enqueue(enc.encode(step))
        }
        if (!init.signal.aborted) c.close()
      },
    })
    init.signal.addEventListener('abort', () => { seen.aborted = init.signal.reason })
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
  }
  return { original, seen }
}
const readAll = async (response) => {
  const reader = response.body.getReader(), dec = new TextDecoder()
  let text = ''
  for (;;) { const { done, value } = await reader.read(); if (done) return text; text += dec.decode(value) }
}

test('只盯 POST 到 …/messages 且要事件流的请求', () => {
  assert.equal(isModelStream(URL_, POST), true)
  assert.equal(isModelStream(new URL(URL_), { ...POST, headers: new Headers(POST.headers) }), true)
  assert.equal(isModelStream(URL_, { ...POST, method: 'GET' }), false)
  assert.equal(isModelStream('https://api.deepseek.com/anthropic/v1/files', POST), false)
  assert.equal(isModelStream(URL_, { method: 'POST', headers: { accept: 'application/json' } }), false)
  assert.equal(isModelStream(new Request(URL_, POST), undefined), false)
})

test('SSE 计数：跨块拼行，注释行不算事件，读不出类型的算内容', () => {
  const types = []
  const feed = createSseCounter((t) => types.push(t))
  feed(enc.encode(': keep-alive\n\nevent: ping\ndata: {"ty'))
  feed(enc.encode('pe":"ping"}\n\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta"}}\n\ndata: [x]\n'))
  assert.deepEqual(types, ['ping', 'content_block_delta', 'unknown'])
})

test('开始出内容后只剩心跳：到时断开上游，读取方拿到 StreamStallError', async () => {
  const { original, seen } = fakeUpstream([event('message_start'), event('content_block_delta'), ...Array(20).fill(0).flatMap(() => [20, ': keep-alive\n\n', event('ping')])])
  const logs = []
  const fetch = wrapFetch(original, { stallSeconds: 0.1, firstContentSeconds: 0 }, { sink: (e) => logs.push(e) })
  const started = Date.now()
  await assert.rejects(readAll(await fetch(URL_, POST)), (e) => e instanceof StreamStallError && e.phase === 'stalled')
  assert.ok(Date.now() - started < 300)
  assert.ok(seen.aborted instanceof StreamStallError)
  assert.deepEqual(logs.map((e) => [e.event, e.phase, e.path]), [['stalled', 'stalled', '/anthropic/v1/messages']])
})

test('内容持续在来（间隔都短于限制）：字节原样转交，不判停滞', async () => {
  const parts = [event('message_start'), ...Array(8).fill(0).flatMap(() => [40, event('content_block_delta')]), event('message_stop')]
  const { original, seen } = fakeUpstream(parts)
  const fetch = wrapFetch(original, { stallSeconds: 0.1, firstContentSeconds: 0 }, { sink: () => assert.fail('不该判停滞') })
  assert.equal(await readAll(await fetch(URL_, POST)), parts.filter((p) => typeof p === 'string').join(''))
  assert.equal(seen.aborted, undefined)
})

test('第一个内容出来前（排队）默认不管；设了 firstContentSeconds 才管', async () => {
  const queued = [event('message_start'), 60, event('ping'), 60, event('ping'), 60, event('content_block_delta'), event('message_stop')]
  const relaxed = wrapFetch(fakeUpstream(queued).original, { stallSeconds: 0.1, firstContentSeconds: 0 }, { sink: () => assert.fail('不该判停滞') })
  assert.match(await readAll(await relaxed(URL_, POST)), /message_stop/)
  const strict = wrapFetch(fakeUpstream(queued).original, { stallSeconds: 1, firstContentSeconds: 0.1 }, { sink: () => {} })
  await assert.rejects(readAll(await strict(URL_, POST)), (e) => e.phase === 'first-content')
})

test('用户按停止：调用方的 signal 照常传到上游，不记停滞', async () => {
  const { original, seen } = fakeUpstream([event('content_block_delta'), ...Array(20).fill(0).flatMap(() => [20, event('ping')])])
  const fetch = wrapFetch(original, { stallSeconds: 0.2, firstContentSeconds: 0 }, { sink: () => assert.fail('不该判停滞') })
  const user = new AbortController()
  const reading = readAll(await fetch(URL_, { ...POST, signal: user.signal }))
  await sleep(50)
  user.abort(new Error('user stop'))
  assert.equal(seen.signal.aborted, true)
  assert.equal(seen.aborted.message, 'user stop')
  await sleep(250)
  void reading.catch(() => {})
})

test('不相关的请求、出错的响应、停用后：原样转交', async () => {
  const plain = new Response('{}', { status: 200 })
  const fetch = wrapFetch(async () => plain, { stallSeconds: 0.1 }, { active: () => false })
  assert.equal(await fetch(URL_, POST), plain)
  const other = wrapFetch(async () => plain, { stallSeconds: 0.1 })
  assert.equal(await other('https://api.deepseek.com/models', {}), plain)
  const failed = new Response('{"error":{}}', { status: 529, headers: { 'content-type': 'application/json' } })
  assert.equal(await wrapFetch(async () => failed, { stallSeconds: 0.1 })(URL_, POST), failed)
})

test('apply 换上全局 fetch，停用时还原', () => {
  const before = globalThis.fetch, effects = []
  apply({ effect: (fn) => effects.push(fn()) }, {})
  assert.notEqual(globalThis.fetch, before)
  for (const dispose of effects) dispose()
  assert.equal(globalThis.fetch, before)
  apply({ effect: () => assert.fail('关掉时不该装') }, { enabled: false })
  assert.equal(globalThis.fetch, before)
})

test('真实套接字：本机假服务只发心跳时，Node 的 fetch 被断开，服务端看到连接关闭', async () => {
  // 用 localhost：本机开了代理时 Node 的 fetch 按环境变量走代理，no_proxy 里通常有 localhost，127.* 这种写法它不认。
  let closed
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(event('message_start') + event('content_block_delta'))
    const beat = setInterval(() => res.write(': keep-alive\n\n'), 20)
    closed = new Promise((r) => res.on('close', () => { clearInterval(beat); r() }))
  })
  await new Promise((r) => server.listen(0, 'localhost', r))
  try {
    const fetch = wrapFetch(globalThis.fetch, { stallSeconds: 0.15, firstContentSeconds: 0 }, { sink: () => {} })
    const response = await fetch(`http://localhost:${server.address().port}/anthropic/v1/messages`, POST)
    await assert.rejects(readAll(response), StreamStallError)
    await closed
  } finally { server.close() }
})

test('读到 message_stop 后取消读取（DSH 的做法）、或上游之后只剩心跳：都不再计时，不误报', async () => {
  const tail = Array(15).fill(0).flatMap(() => [20, event('ping')])
  for (const cancelAfterStop of [true, false]) {
    const { original } = fakeUpstream([event('message_start'), event('content_block_delta'), event('message_stop'), ...tail])
    const logs = []
    const fetch = wrapFetch(original, { stallSeconds: 0.1, firstContentSeconds: 0 }, { sink: (e) => logs.push(e) })
    const reader = (await fetch(URL_, POST)).body.getReader(), dec = new TextDecoder()
    let text = ''
    while (!text.includes('message_stop')) text += dec.decode((await reader.read()).value)
    if (cancelAfterStop) await reader.cancel()
    else void (async () => { try { while (!(await reader.read()).done); } catch {} })()
    await sleep(250)
    assert.deepEqual(logs, [], `cancelAfterStop=${cancelAfterStop}`)
  }
})
