// net-log：记下发往模型服务的请求在网络层失败的原因。
// DSH 的会话日志里只有 "DeepSeek Messages transport failed"，底层原因（连接被重置、TLS 失败、对端断开）在转换时丢掉了。
// 60 个会话里有 172 次这种失败，106 次都是请求发出后恰好 5 秒报错，要知道原因才能判断是代理、网络还是服务端。
// Node 的 undici 把每个请求的阶段和错误发布在 diagnostics_channel 上（全进程共享，DSH 自带的 undici 也发布到同名频道）。
// 这里只订阅、不改请求；只记目标主机、路径（不含查询串）、走到哪一步、耗时和错误码/错误信息，不记请求头和内容。
import dc from 'node:diagnostics_channel'
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-net-log'

const DEFAULTS = { enabled: true, hosts: ['deepseek.com'] }
const record = createRecorder('net-log.log')

const hostOf = (origin) => { try { return new URL(String(origin)).hostname } catch { return '' } }

/** origin 的主机是 hosts 里的某一个，或是它的子域名。 */
export const matches = (origin, hosts) => {
  const host = hostOf(origin)
  return host !== '' && hosts.some((h) => host === h || host.endsWith(`.${h}`))
}

/** 错误和它的 cause 链，每层只留 name / code / message。 */
export function describe(error) {
  const chain = []
  const seen = new Set()
  for (let e = error; e && typeof e === 'object' && !seen.has(e) && chain.length < 4; e = e.cause) {
    seen.add(e)
    chain.push({ name: e.name, ...(e.code === undefined ? {} : { code: e.code }), message: String(e.message ?? '').slice(0, 200) })
  }
  return chain
}

/** 按请求记下走到了哪一步：sent（已发出）→ body-sent（请求体发完）→ headers（收到响应头）。 */
export function createWatcher(hosts, sink, now = Date.now) {
  const requests = new WeakMap()
  let seen = false
  const step = (stage) => ({ request }) => { const r = requests.get(request); if (r) r.stage = stage }
  return {
    create({ request }) {
      if (!matches(request?.origin, hosts)) return
      requests.set(request, { at: now(), stage: 'sent' })
      // 第一次看到目标主机的请求时记一行，确认频道在真实环境里接上了（之后只记失败）
      if (!seen) { seen = true; sink({ event: 'watching', host: hostOf(request.origin) }) }
    },
    bodySent: step('body-sent'),
    headers: step('headers'),
    error({ request, error }) {
      const r = requests.get(request)
      if (!r) return
      requests.delete(request)
      sink({
        event: 'request-error', host: hostOf(request.origin), path: String(request.path ?? '').split('?')[0],
        method: request.method, stage: r.stage, elapsedMs: now() - r.at, errors: describe(error),
      })
    },
  }
}

export function apply(ctx, config = {}) {
  const c = { ...DEFAULTS, ...config }
  if (!c.enabled) return
  const watcher = createWatcher(c.hosts, record)
  const channels = [
    ['undici:request:create', watcher.create],
    ['undici:request:bodySent', watcher.bodySent],
    ['undici:request:headers', watcher.headers],
    ['undici:request:error', watcher.error],
  ].map(([channel, fn]) => [channel, (message) => { try { fn(message) } catch {} }])
  for (const [channel, fn] of channels) dc.subscribe(channel, fn)
  record({ event: 'loaded', hosts: c.hosts })
  ctx.effect(() => () => { for (const [channel, fn] of channels) dc.unsubscribe(channel, fn) }, 'net-log channel subscriptions')
}
