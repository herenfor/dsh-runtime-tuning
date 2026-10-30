import test from 'node:test'
import assert from 'node:assert/strict'
import { check, longestSleep, rewrite } from '../plugins/wait-guard.mjs'

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

test('长时间阻塞的 job_output：默认在 execute 静默改 wait: false；silentClamp: false 时在 pre-execute 拒绝', () => {
  assert.equal(check({ name: 'job_output', arguments: { job_id: 'b1', wait: true, timeout_ms: 240000 }, agent: top }), undefined)
  const r1 = rewrite({ name: 'job_output', arguments: Object.freeze({ job_id: 'b1', wait: true, timeout_ms: 240000 }), agent: top })
  assert.equal(r1.rule, 'long-job-wait')
  assert.equal(r1.arguments.wait, false)
  assert.equal(Object.isFrozen(r1.arguments), true)
  assert.equal(rewrite({ name: 'job_output', arguments: { job_id: 'b1', wait: true }, agent: top }).rule, 'long-job-wait')  // 默认 30 s
  assert.equal(rewrite({ name: 'job_output', arguments: { job_id: 'b1', wait: true, timeout_ms: 10000 }, agent: top }), undefined)
  assert.equal(rewrite({ name: 'job_output', arguments: { job_id: 'b1' }, agent: top }), undefined)
  assert.equal(rewrite({ name: 'job_output', arguments: { job_id: 'b1', wait: true, timeout_ms: 240000 }, agent: sub }), undefined)
  assert.equal(check({ name: 'job_output', arguments: { job_id: 'b1', wait: true, timeout_ms: 240000 }, agent: top }, { silentClamp: false }).rule, 'long-job-wait')
})

test('前台 bash/pwsh 超长 timeoutMs 静默封顶；后台、未超限、子代理或关闭时不改', () => {
  const r = rewrite({ name: 'bash', arguments: Object.freeze({ command: 'cargo build', timeoutMs: 300000 }), agent: top })
  assert.equal(r.rule, 'foreground-timeout')
  assert.equal(r.arguments.timeoutMs, 30000)
  assert.equal(Object.isFrozen(r.arguments), true)
  assert.equal(rewrite({ name: 'pwsh', arguments: { command: 'dotnet build', timeoutMs: 120000 }, agent: top }).arguments.timeoutMs, 30000)
  assert.equal(rewrite({ name: 'bash', arguments: { command: 'cargo build', timeoutMs: 300000, run_in_background: true }, agent: top }), undefined)
  assert.equal(rewrite({ name: 'bash', arguments: { command: 'echo ok', timeoutMs: 15000 }, agent: top }), undefined)
  assert.equal(rewrite({ name: 'bash', arguments: { command: 'echo ok' }, agent: top }), undefined)
  assert.equal(rewrite({ name: 'bash', arguments: { command: 'cargo build', timeoutMs: 300000 }, agent: sub }), undefined)
  assert.equal(rewrite({ name: 'bash', arguments: { command: 'cargo build', timeoutMs: 300000 }, agent: top }, { maxForegroundTimeoutMs: 0 }), undefined)
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

// 旧用例覆盖声明计时和 30 分钟硬保底，默认关掉收尾清点；清点的用例单独打开。
function harness(status = 'idle', config) {
  const timers = [], woken = [], agent = { status, followup: (m) => woken.push(m) }
  const tracker = createTracker({
    config: { turnEndAudit: false, ...config },
    now: () => 60 * 60_000,
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

// ---- rev 4：task_status 结束本轮 ----
import { describeReply, promptText } from '../plugins/wait-guard.mjs'

test('describeReply 数出工具调用和答复文字', () => {
  assert.deepEqual(describeReply([{ type: 'reasoning', text: 'x' }, { type: 'text', text: '好了' }, { type: 'tool-call', id: 'c1' }]), { calls: ['c1'], hasText: true })
  assert.deepEqual(describeReply([{ type: 'text', text: '  ' }, { type: 'tool-call', id: 'c1' }]), { calls: ['c1'], hasText: false })
  assert.deepEqual(describeReply(undefined), { calls: [], hasText: false })
})

test('只有“答复文字 + 唯一的 task_status”才结束本轮', () => {
  const h = harness()
  const reply = (...content) => h.ev('assistant/message', { message: { content } })
  reply({ type: 'text', text: '做完了' }, { type: 'tool-call', id: 'c1' })
  assert.equal(h.tracker.canConclude('s', 'c1'), true)
  assert.equal(h.tracker.canConclude('s', 'other'), false)

  reply({ type: 'text', text: '做完了' }, { type: 'tool-call', id: 'c2' }, { type: 'tool-call', id: 'c3' })
  assert.equal(h.tracker.canConclude('s', 'c3'), false)  // 同一步还有别的工具，结束会让模型看不到它的结果

  reply({ type: 'tool-call', id: 'c4' })
  assert.equal(h.tracker.canConclude('s', 'c4'), false)  // 没写答复，结束了用户就看不到总结
  assert.equal(h.tracker.canConclude('unknown', 'c4'), false)
})

const audited = (status) => harness(status, { turnEndAudit: true })
const startedAt = (h, jobId, minutesAgo, label) => h.ev('job/registered', { jobId, owner: 's', label, startedAt: (60 - minutesAgo) * 60_000 })
const end = (h) => h.ev('turn/end', { reason: { kind: 'completed' } })

test('收尾清点：没认领的任务在一轮结束 1 秒后唤醒一次，列出 id、已运行时间、命令和三个选项', () => {
  const h = audited()
  h.ev('turn/start'); startedAt(h, 'bash-c7', 9, 'cd job-hunt && python tools/sweep.py 2>&1 | tail -50'); end(h)
  assert.deepEqual(h.timers.map((t) => t.ms), [1000])
  h.timers[0].fn()
  const text = h.woken[0].content[0].text
  assert.match(text, /bash-c7, running 9 min: cd job-hunt && python tools\/sweep\.py/)
  assert.match(text, /ps inside the command sandbox cannot see them/)
  assert.match(text, /state "waiting"/); assert.match(text, /services/); assert.match(text, /job_kill/)
  assert.equal(h.woken[0].source.summary, 'turn-end check: 1 background job(s) still running')
})

test('收尾清点每个任务只问一次：那一轮仍不表态就退回 30 分钟硬保底；用户发消息、或有新任务留到一轮结束才重新问', () => {
  const h = audited()
  h.ev('turn/start'); started(h, 'bash-a'); end(h); h.timers[0].fn()
  h.ev('turn/start'); end(h)
  assert.equal(h.timers[1].ms, 30 * 60_000)

  h.ev('user/message', { source: { kind: 'user' } }); h.ev('turn/start'); end(h)
  assert.equal(h.timers[2].ms, 1000)
  h.timers[2].fn(); h.ev('turn/start'); started(h, 'bash-fg'); ended(h, 'bash-fg'); end(h)
  assert.equal(h.timers[3].ms, 30 * 60_000)  // 前台命令登记后马上结束，不触发
  h.ev('turn/start'); started(h, 'bash-b'); end(h)
  assert.equal(h.timers[4].ms, 1000)
  h.timers[4].fn()
  assert.match(h.woken.at(-1).content[0].text, /bash-a[\s\S]*bash-b/)
})

test('收尾清点：声明 waiting 认领当时在跑的任务，按预计时间计时；之后新启动的任务还要再问', () => {
  const h = audited()
  h.ev('turn/start'); started(h, 'bash-1'); h.tracker.declare('s', h.waiting); end(h)
  assert.deepEqual(h.timers.map((t) => t.ms), [10 * 60_000])
  h.ev('turn/start'); started(h, 'bash-2'); end(h)
  assert.equal(h.timers.at(-1).ms, 1000)
  h.timers.at(-1).fn()
  assert.match(h.woken[0].content[0].text, /bash-2/)
  assert.doesNotMatch(h.woken[0].content[0].text, /bash-1/)
})

test('收尾清点不问：服务、已结束的任务、按停止结束的一轮、子代理、别的会话的任务', () => {
  const svc = audited()
  svc.ev('turn/start'); started(svc, 'bash-dev'); svc.tracker.declare('s', normalizeStatus({ state: 'done', services: ['bash-dev'] })); end(svc)
  assert.equal(svc.timers.length, 0)

  const settled = audited()
  settled.ev('turn/start'); started(settled, 'bash-a'); end(settled); ended(settled, 'bash-a'); settled.timers[0].fn()
  assert.equal(settled.woken.length, 0)

  const stopped = audited()
  stopped.ev('turn/start'); started(stopped, 'bash-a'); stopped.ev('turn/end', { reason: { kind: 'aborted' } })
  assert.equal(stopped.timers.length, 0)

  const foreign = audited()
  foreign.ev('turn/start'); started(foreign, 'bash-x', 'other'); end(foreign)
  assert.equal(foreign.timers.length, 0)

  const sub = audited()
  sub.tracker.onEvent({ id: 'sub', header: { delegationDepth: 1 } }, { type: 'job/registered', data: { jobId: 'bash-a', owner: 'sub' } })
  sub.tracker.onEvent({ id: 'sub', header: { delegationDepth: 1 } }, { type: 'turn/end', data: { reason: { kind: 'completed' } } })
  assert.equal(sub.timers.length, 0)
})

test('收尾清点：唤醒前 DSH 已开始新一轮就取消且不算问过；模型正忙不唤醒', () => {
  const h = audited()
  h.ev('turn/start'); started(h, 'bash-a'); end(h)
  h.ev('turn/start')
  assert.equal(h.timers[0].cleared, true)
  end(h)
  assert.equal(h.timers[1].ms, 1000)

  const busy = audited('running')
  busy.ev('turn/start'); started(busy, 'bash-a'); end(busy); busy.timers[0].fn()
  assert.equal(busy.woken.length, 0)
})

test('promptText：开着收尾清点时说明会被问、要先停掉不需要的任务', () => {
  assert.match(promptText({ undeclaredMinutes: 30, concludeTurn: true, turnEndAudit: true }), /asks you once to account for each/)
  assert.doesNotMatch(promptText({ undeclaredMinutes: 30, concludeTurn: true, turnEndAudit: false }), /asks you once/)
})

