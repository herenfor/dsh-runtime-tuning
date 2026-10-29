import test from 'node:test'
import assert from 'node:assert/strict'
import { check, longestSleep } from '../plugins/wait-guard.mjs'

const top = { session: { id: 's', header: { delegationDepth: 0 } } }
const sub = { session: { id: 's2', header: { delegationDepth: 1 } } }

test('longestSleep 认出常见写法', () => {
  assert.equal(longestSleep('sleep 90; echo waited'), 90)
  assert.equal(longestSleep('make && sleep 2m'), 120)
  assert.equal(longestSleep('while ! ready; do sleep 5; done'), 5)
  assert.equal(longestSleep('echo sleepy; ./sleep10'), 0)
  assert.equal(longestSleep('Start-Sleep -Seconds 30'), 30)
  assert.equal(longestSleep('Start-Sleep -Milliseconds 500'), 0.5)
  assert.equal(longestSleep('git log --grep sleep'), 0)
})

test('前台长 sleep 被拒，后台和短 sleep 放行', () => {
  assert.equal(check({ name: 'bash', arguments: { command: 'sleep 90; echo waited' }, agent: top }).rule, 'foreground-sleep')
  assert.equal(check({ name: 'pwsh', arguments: { command: 'Start-Sleep 20' }, agent: top }).rule, 'foreground-sleep')
  assert.equal(check({ name: 'bash', arguments: { command: 'sleep 90', run_in_background: true }, agent: top }), undefined)
  assert.equal(check({ name: 'bash', arguments: { command: 'sleep 3 && curl x' }, agent: top }), undefined)
})

test('长时间阻塞的 job_output 被拒，短等待、不等待、子代理放行', () => {
  assert.equal(check({ name: 'job_output', arguments: { job_id: 'b1', wait: true, timeout_ms: 240000 }, agent: top }).rule, 'long-job-wait')
  assert.equal(check({ name: 'job_output', arguments: { job_id: 'b1', wait: true }, agent: top }).rule, 'long-job-wait')  // 默认 30 s
  assert.equal(check({ name: 'job_output', arguments: { job_id: 'b1', wait: true, timeout_ms: 10000 }, agent: top }), undefined)
  assert.equal(check({ name: 'job_output', arguments: { job_id: 'b1' }, agent: top }), undefined)
  assert.equal(check({ name: 'job_output', arguments: { job_id: 'b1', wait: true, timeout_ms: 240000 }, agent: sub }), undefined)
})

test('其他工具不受影响', () => {
  assert.equal(check({ name: 'read', arguments: { path: 'sleep 90' }, agent: top }), undefined)
})

// ---- rev 2：task_status 与兜底唤醒 ----
import { normalizeStatus, createTracker } from '../plugins/wait-guard.mjs'

test('wakeup: false 时不拦截', () => {
  assert.equal(check({ name: 'bash', arguments: { command: 'sleep 90' }, agent: top }, { wakeup: false }), undefined)
})

test('task_status 参数校验', () => {
  assert.deepEqual(normalizeStatus({ state: 'done' }), { state: 'done', summary: undefined, services: [] })
  assert.equal(normalizeStatus({ state: 'waiting', waiting_for: 'bash-1 build', expected_minutes: 999 }).expected_minutes, 240)
  assert.throws(() => normalizeStatus({ state: 'paused' }))
  assert.throws(() => normalizeStatus({ state: 'waiting', expected_minutes: 5 }))
  assert.throws(() => normalizeStatus({ state: 'waiting', waiting_for: 'bash-1', expected_minutes: 0 }))
})

function harness(status = 'idle', config) {
  const timers = [], woken = [], agent = { status, followup: (m) => woken.push(m) }
  const tracker = createTracker({
    config,
    setTimer: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t },
    clearTimer: (t) => { t.cleared = true },
    getAgent: () => agent,
  })
  const s = { id: 's', header: { delegationDepth: 0 } }
  const ev = (type, data = {}) => tracker.onEvent(s, { type, data })
  const waiting = { state: 'waiting', waiting_for: 'bash-1 build', expected_minutes: 5 }
  return { timers, woken, agent, tracker, ev, waiting }
}

test('waiting 且正常结束：按 2 倍预计时间计时，到点唤醒空闲的模型', () => {
  const h = harness()
  h.ev('turn/start'); h.tracker.declare('s', h.waiting); h.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(h.timers.length, 1)
  assert.equal(h.timers[0].ms, 10 * 60_000)
  h.timers[0].fn()
  assert.equal(h.woken.length, 1)
  assert.equal(h.woken[0].source.kind, 'dsh-wait-guard')
  assert.match(h.woken[0].content[0].text, /bash-1 build/)
})

test('用户按停止结束的一轮不计时', () => {
  const h = harness()
  h.ev('turn/start'); h.tracker.declare('s', h.waiting); h.ev('turn/end', { reason: { kind: 'aborted', reason: { kind: 'user' } } })
  assert.equal(h.timers.length, 0)
})

test('done、或没有声明的一轮不计时', () => {
  const h = harness()
  h.ev('turn/start'); h.tracker.declare('s', { state: 'done' }); h.ev('turn/end', { reason: { kind: 'completed' } })
  h.ev('turn/start'); h.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(h.timers.length, 0)
})

test('完成通知先开了新一轮：计时器被取消', () => {
  const h = harness()
  h.ev('turn/start'); h.tracker.declare('s', h.waiting); h.ev('turn/end', { reason: { kind: 'completed' } })
  h.ev('turn/start')
  assert.equal(h.timers[0].cleared, true)
})

test('模型正忙就不唤醒；连续兜底唤醒有上限，用户发消息后重置', () => {
  const busy = harness('running')
  busy.ev('turn/start'); busy.tracker.declare('s', busy.waiting); busy.ev('turn/end', { reason: { kind: 'completed' } })
  busy.timers[0].fn()
  assert.equal(busy.woken.length, 0)

  const h = harness()
  const round = () => { h.ev('turn/start'); h.tracker.declare('s', h.waiting); h.ev('turn/end', { reason: { kind: 'completed' } }); h.timers.at(-1).fn() }
  round(); round(); round()
  assert.equal(h.woken.length, 2)
  h.ev('user/message', { source: { kind: 'user' } })
  round()
  assert.equal(h.woken.length, 3)
})

test('子代理会话不参与', () => {
  const h = harness()
  const child = { id: 'c', header: { delegationDepth: 1 } }
  h.tracker.declare('c', h.waiting)
  h.tracker.onEvent(child, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  assert.equal(h.timers.length, 0)
})

test('asking 合法，且不计时', () => {
  assert.equal(normalizeStatus({ state: 'asking' }).state, 'asking')
  const h = harness()
  h.ev('turn/start'); h.tracker.declare('s', { state: 'asking' }); h.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(h.timers.length, 0)
})

// ---- rev 3：没有声明 waiting 时的硬保底 ----
const started = (h, jobId, owner = 's') => h.ev('job/registered', { jobId, owner })
const ended = (h, jobId) => h.ev('job/settled', { jobId })

test('没声明就结束一轮、后台还有任务：30 分钟后唤醒，并列出任务 id', () => {
  const h = harness()
  h.ev('turn/start'); started(h, 'bash-a'); h.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(h.timers.length, 1)
  assert.equal(h.timers[0].ms, 30 * 60_000)
  h.timers[0].fn()
  assert.equal(h.woken.length, 1)
  assert.match(h.woken[0].content[0].text, /bash-a/)
})

test('声明 done 也照样计时；列进 services 的任务不计时', () => {
  const h = harness()
  h.ev('turn/start'); started(h, 'bash-a'); h.tracker.declare('s', normalizeStatus({ state: 'done' })); h.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(h.timers.length, 1)

  const svc = harness()
  svc.ev('turn/start'); started(svc, 'bash-dev'); svc.tracker.declare('s', normalizeStatus({ state: 'done', services: ['bash-dev'] }))
  svc.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(svc.timers.length, 0)
})

test('服务和普通任务混在一起：只为普通任务计时，唤醒文本里没有服务', () => {
  const h = harness()
  h.ev('turn/start'); started(h, 'bash-dev'); started(h, 'bash-build')
  h.tracker.declare('s', normalizeStatus({ state: 'done', services: ['bash-dev'] })); h.ev('turn/end', { reason: { kind: 'completed' } })
  h.timers[0].fn()
  assert.match(h.woken[0].content[0].text, /bash-build/)
  assert.doesNotMatch(h.woken[0].content[0].text, /bash-dev/)
})

test('任务在一轮结束前、或计时期间结束：不唤醒', () => {
  const before = harness()
  before.ev('turn/start'); started(before, 'bash-a'); ended(before, 'bash-a'); before.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(before.timers.length, 0)

  const during = harness()
  during.ev('turn/start'); started(during, 'bash-a'); during.ev('turn/end', { reason: { kind: 'completed' } })
  ended(during, 'bash-a'); during.timers[0].fn()
  assert.equal(during.woken.length, 0)
})

test('硬保底：按停止结束的一轮不计时，别的会话的任务不算，undeclaredMinutes 为 0 时关闭', () => {
  const stopped = harness()
  stopped.ev('turn/start'); started(stopped, 'bash-a'); stopped.ev('turn/end', { reason: { kind: 'aborted' } })
  assert.equal(stopped.timers.length, 0)

  const foreign = harness()
  foreign.ev('turn/start'); started(foreign, 'bash-x', 'other'); foreign.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(foreign.timers.length, 0)

  const off = harness('idle', { undeclaredMinutes: 0 })
  off.ev('turn/start'); started(off, 'bash-a'); off.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(off.timers.length, 0)
})

test('声明了 waiting 仍按预计时间计时，不走硬保底', () => {
  const h = harness()
  h.ev('turn/start'); started(h, 'bash-1'); h.tracker.declare('s', h.waiting); h.ev('turn/end', { reason: { kind: 'completed' } })
  assert.equal(h.timers.length, 1)
  assert.equal(h.timers[0].ms, 10 * 60_000)
})

test('services 参数校验', () => {
  assert.deepEqual(normalizeStatus({ state: 'done', services: ['bash-dev'] }).services, ['bash-dev'])
  assert.throws(() => normalizeStatus({ state: 'done', services: 'bash-dev' }))
  assert.throws(() => normalizeStatus({ state: 'done', services: [''] }))
})
