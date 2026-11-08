// stream-stall：模型的流式回答已经开始输出、之后却只剩心跳没有新内容时，断开这次请求，交给官方重试。
// 起因：DeepSeek 降级时出现过回答开始输出后再也不出内容、但每 10 秒左右发一次心跳的情况（实测连续 10 分钟）。
// 官方 llm-deepseek 的流空闲超时（默认 5 分钟）把心跳也算作活动，每来一次心跳就重新计时，于是永远不超时，
// 官方 dsh-llm-retry 的重试（传输失败、超时默认都会重试）也就不会启动，界面一直停在“思考”。
// 这里包一层全局 fetch，只管 POST 到 …/messages 且接受 text/event-stream 的请求：响应字节原样转交，顺带数 SSE 事件，
// 心跳（注释行、ping 事件）和 message_start 不算进展。开始出内容后连续 stallSeconds 秒没有进展，就中止这次请求，
// DSH 按传输失败处理并自动重试。只看两次进展之间的间隔，不限制思考多久、输出多长。
// 第一个内容出来之前可能是在排队，默认不管（firstContentSeconds: 0），仍按官方的空闲超时。
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-stream-stall'

const DEFAULTS = { enabled: true, stallSeconds: 180, firstContentSeconds: 0 }
const record = createRecorder('stream-stall.log')

// 不算进展的 SSE 事件类型。
const IDLE_TYPES = new Set(['ping', 'message_start'])

export class StreamStallError extends Error {
  constructor(phase, seconds) {
    super(phase === 'first-content'
      ? `model stream sent no content within ${seconds}s (only heartbeats)`
      : `model stream stalled: no new content for ${seconds}s (only heartbeats)`)
    this.name = 'StreamStallError'
    this.code = 'STREAM_STALL'
    this.phase = phase
  }
}

const headerOf = (headers, key) => {
  if (!headers) return ''
  if (typeof headers.get === 'function') return headers.get(key) ?? ''
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === key) return String(v)
  return ''
}

/** 要盯的请求：字符串或 URL 形式的地址，POST 到 …/messages，并且要的是事件流。 */
export function isModelStream(input, init) {
  if (typeof input !== 'string' && !(input instanceof URL)) return false
  if (String(init?.method ?? 'GET').toUpperCase() !== 'POST') return false
  let path
  try { path = new URL(String(input)).pathname } catch { return false }
  return path.endsWith('/messages') && headerOf(init?.headers, 'accept').includes('text/event-stream')
}

/** 把字节流切成 SSE 行，报告每个 data 行的事件类型；类型读不出来时当作内容（宁可不判停滞）。 */
export function createSseCounter(onEvent) {
  const decoder = new TextDecoder()
  let buffer = ''
  return (chunk) => {
    buffer += decoder.decode(chunk, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      onEvent(/"type"\s*:\s*"([A-Za-z_]+)"/.exec(line)?.[1] ?? 'unknown')
    }
  }
}

/** 包装 fetch。返回的函数在 active() 为假时原样转交。 */
export function wrapFetch(original, { stallSeconds, firstContentSeconds }, { active = () => true, sink = record } = {}) {
  return async function fetchWithStallGuard(input, init) {
    if (!active() || !isModelStream(input, init)) return original(input, init)
    const stop = new AbortController()
    const signal = init.signal ? AbortSignal.any([init.signal, stop.signal]) : stop.signal
    const response = await original(input, { ...init, signal })
    if (!response.ok || response.body === null || !headerOf(response.headers, 'content-type').includes('text/event-stream')) return response

    const path = (() => { try { return new URL(String(input)).pathname } catch { return '' } })()
    let timer, events = 0, out
    const clear = () => { clearTimeout(timer); timer = undefined }
    const arm = (seconds, phase) => {
      clear()
      if (!(seconds > 0)) return
      timer = setTimeout(() => {
        const error = new StreamStallError(phase, seconds)
        sink({ event: 'stalled', path, phase, seconds, events })
        out?.error(error)
        stop.abort(error)
      }, seconds * 1000)
      timer.unref?.()
    }
    const count = createSseCounter((type) => {
      events++
      // message_stop 之后回答已经完整，不再计时（DSH 读到它就停止读取）。
      if (type === 'message_stop') clear()
      else if (!IDLE_TYPES.has(type)) arm(stallSeconds, 'stalled')
    })
    signal.addEventListener('abort', clear, { once: true })
    arm(firstContentSeconds, 'first-content')
    const body = response.body.pipeThrough(new TransformStream({
      start(controller) { out = controller },
      transform(chunk, controller) { controller.enqueue(chunk); count(chunk) },
      flush() { clear() },
      // DSH 读完 message_stop 就取消读取，不会走到 flush；不撤计时器的话 stallSeconds 后会对已结束的请求误报一次。
      cancel() { clear() },
    }))
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
  }
}

export function apply(ctx, config) {
  const c = { ...DEFAULTS, ...config }
  if (!c.enabled) return
  let active = true
  const original = globalThis.fetch
  const wrapped = wrapFetch(original, c, { active: () => active })
  globalThis.fetch = wrapped
  record({ event: 'loaded', stallSeconds: c.stallSeconds, firstContentSeconds: c.firstContentSeconds })
  // 停用后：没人再包过就还原；别人在外面又包了一层就留着，只是不再生效。
  ctx.effect(() => () => {
    active = false
    if (globalThis.fetch === wrapped) globalThis.fetch = original
  }, 'stream-stall fetch wrapper')
}
