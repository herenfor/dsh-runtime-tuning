import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-responses-text-recovery'

const record = createRecorder('responses-text-recovery.log')
const FRAME_BREAK = /(?:\r\n|\r(?!\n)|\n){2}/g

function parseEvent(frame) {
  const data = frame.split(/\r\n|\r|\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).replace(/^ /, ''))
    .join('\n')
  if (!data.trimStart().startsWith('{')) return undefined
  try { return JSON.parse(data) } catch { return undefined }
}

function hasMessageText(item) {
  return item?.type === 'message' && item.role === 'assistant' && Array.isArray(item.content)
    && item.content.some(part => part?.type === 'output_text' && typeof part.text === 'string' && part.text.length > 0
      || part?.type === 'refusal' && typeof part.refusal === 'string' && part.refusal.length > 0)
}

const itemKey = (item, index) => item.id || index

/** Supply missing assistant message endings before the terminal event reaches pi-ai. */
function repairBody(body, sink) {
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
  const encoder = new TextEncoder()
  const delivered = new Set()
  let pending = ''

  const repair = (frame, controller) => {
    const event = parseEvent(frame)
    if (event?.type === 'response.output_item.done' && hasMessageText(event.item)) {
      delivered.add(itemKey(event.item, event.output_index))
    }
    if (event?.type !== 'response.completed' && event?.type !== 'response.incomplete') return
    const output = event.response?.output
    if (!Array.isArray(output)) return
    let count = 0
    for (const [index, item] of output.entries()) {
      if (!hasMessageText(item)) continue
      const key = itemKey(item, index)
      if (delivered.has(key)) continue
      const done = { type: 'response.output_item.done', output_index: index, item }
      controller.enqueue(encoder.encode(`event: ${done.type}\ndata: ${JSON.stringify(done)}\n\n`))
      delivered.add(key)
      count++
    }
    if (count > 0) sink({ event: 'recovered', items: count })
  }

  const emitFrames = (controller, eof = false) => {
    let start = 0
    for (const separator of pending.matchAll(FRAME_BREAK)) {
      const end = separator.index + separator[0].length
      // A trailing CR may be the first byte of a split CRLF.
      if (!eof && end === pending.length && pending.endsWith('\r')) break
      repair(pending.slice(start, separator.index), controller)
      controller.enqueue(encoder.encode(pending.slice(start, end)))
      start = end
    }
    pending = pending.slice(start)
  }

  return body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true })
      emitFrames(controller)
    },
    flush(controller) {
      pending += decoder.decode()
      emitFrames(controller, true)
      if (pending) controller.enqueue(encoder.encode(pending))
    },
  }))
}

function isResponsesRequest(input, init) {
  const request = input instanceof Request ? input : undefined
  if (String(init?.method ?? request?.method ?? 'GET').toUpperCase() !== 'POST') return false
  const url = request?.url ?? input
  return URL.canParse(url) && /\/responses\/?$/.test(new URL(url).pathname)
}

export function wrapFetch(original, { active = () => true, sink = record } = {}) {
  return async function fetchWithResponsesRecovery(input, init) {
    const response = await original(input, init)
    if (!active() || !isResponsesRequest(input, init) || !response.ok || response.body === null
      || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'text/event-stream') return response
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    const repaired = new Response(repairBody(response.body, sink), { status: response.status, statusText: response.statusText, headers })
    for (const key of ['url', 'redirected', 'type']) Object.defineProperty(repaired, key, { value: response[key] })
    return repaired
  }
}

export function apply(ctx, config = {}) {
  if (config.enabled === false) return
  let active = true
  const original = globalThis.fetch
  const wrapped = wrapFetch(original, { active: () => active })
  globalThis.fetch = wrapped
  record({ event: 'loaded' })
  ctx.effect(() => () => {
    active = false
    if (globalThis.fetch === wrapped) globalThis.fetch = original
  }, 'responses-text-recovery fetch wrapper')
}
