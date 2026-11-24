import test from 'node:test'
import assert from 'node:assert/strict'
import { wrapFetch } from '../plugins/responses-text-recovery.mjs'

const url = 'https://fixture.invalid/v1/responses'
const post = { method: 'POST' }
const headers = { 'content-type': 'text/event-stream; charset=utf-8', 'content-length': '99', 'x-request-id': 'fixture' }
const encoder = new TextEncoder()
const text = { type: 'message', id: 'msg_fixture', role: 'assistant', content: [{ type: 'output_text', text: '测试进展。' }] }
const tool = { type: 'function_call', id: 'fc_fixture', call_id: 'call_fixture', name: 'fixture', arguments: '{}' }
const itemDone = (index, item) => ({ type: 'response.output_item.done', output_index: index, item })
const terminal = (output, type = 'response.completed') => ({ type, response: { output } })
const frame = (event, newline = '\n') => `event: ${event.type}${newline}data: ${JSON.stringify(event)}${newline}${newline}`

function fixture(raw, size = 17) {
  const data = encoder.encode(raw)
  const body = new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < data.length; offset += size) controller.enqueue(data.subarray(offset, offset + size))
      controller.close()
    },
  })
  const events = []
  const fetch = wrapFetch(async () => new Response(body, { headers }), { sink: entry => events.push(entry) })
  return { fetch, events }
}

test('recovers terminal-only text before the terminal event across SSE and UTF-8 chunk boundaries', async () => {
  const original = frame(itemDone(1, tool), '\r\n')
  const final = frame(terminal([text, tool]), '\r\n')
  const { fetch, events } = fixture(`: keepalive\r\n\r\n${original}${final}`, 1)
  const response = await fetch(new Request(url, post))
  assert.equal(response.headers.get('content-length'), null)
  assert.equal(response.headers.get('x-request-id'), 'fixture')
  assert.equal(await response.text(), `: keepalive\r\n\r\n${original}${frame(itemDone(0, text))}${final}`)
  assert.deepEqual(events, [{ event: 'recovered', items: 1 }])
})

test('preserves already delivered text, tool-only, malformed and unterminated frames', async () => {
  const raw = ': comment\n\ndata: bad JSON\n\n' + frame(itemDone(0, text)) + frame(itemDone(1, tool))
    + frame(terminal([text, tool])) + frame(terminal([tool])) + 'data: [DONE]'
  const { fetch, events } = fixture(raw)
  assert.equal(await (await fetch(url, post)).text(), raw)
  assert.deepEqual(events, [])
})

test('completes a partially streamed message and leaves the original incomplete status intact', async () => {
  const start = frame({ ...itemDone(0, text), type: 'response.output_item.added' })
  const delta = frame({ type: 'response.output_text.delta', output_index: 0, delta: '测试' })
  const final = frame(terminal([text], 'response.incomplete'))
  const { fetch, events } = fixture(start + delta + final)
  assert.equal(await (await fetch(url, post)).text(), start + delta + frame(itemDone(0, text)) + final)
  assert.deepEqual(events, [{ event: 'recovered', items: 1 }])
})

test('leaves other requests, non-SSE responses and HTTP failures untouched', async () => {
  const cases = [
    [url, undefined, new Response(null, { headers })],
    [url.replace('/responses', '/messages'), post, new Response('other stream', { headers })],
    [url, post, Response.json({ output: [text] })],
    [url, post, new Response('upstream failure', { status: 502, headers })],
  ]
  for (const [input, init, response] of cases) {
    const fetch = wrapFetch(async () => response)
    assert.equal(await fetch(input, init), response)
  }
})

test('forwards frames as they arrive and propagates reader cancellation to the upstream', { timeout: 1000 }, async () => {
  const { promise: canceled, resolve: cancel } = Promise.withResolvers()
  const raw = frame(itemDone(0, text))
  const body = new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode(raw)) },
    cancel,
  })
  const fetch = wrapFetch(async () => new Response(body, { headers }))
  const reader = (await fetch(url, post)).body.getReader()
  assert.equal(new TextDecoder().decode((await reader.read()).value), raw)
  await reader.cancel('test stop')
  assert.equal(await canceled, 'test stop')
})
