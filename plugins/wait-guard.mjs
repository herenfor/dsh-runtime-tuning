// dsh-wait-guard：不让模型用前台 sleep 或长时间阻塞的 job_output 把整轮对话卡住。
// DSH 已经会在后台任务结束时通知模型（忙时插进下一步，空闲时开启新的一轮），
// 系统提示词也写了“不要轮询、不要 sleep”，但模型常常不照做；这里在工具执行前强制执行。
//
// rev 2 增加：
// - task_status 工具：模型结束一轮前声明 done（做完了）还是 waiting（在等后台任务）。
// - 兜底唤醒：声明 waiting 的一轮正常结束后开始计时，超过 backstopFactor × expected_minutes
//   还没有新一轮（完成通知没来，比如任务卡死），就主动唤醒模型去检查。
//   用户按停止结束的一轮不计时：用户叫停的事不该被插件重新拉起来。
// - wakeup: false 时整个插件不生效：没有唤醒，拦截等待只会让任务停住。
// - asking：问了用户问题、只差回答时用。它不是在等后台任务，所以不计时（回答会自己开启新的一轮）。
import { randomUUID } from 'node:crypto'
import { createRecorder } from './log.mjs'

export const name = 'dsh-wait-guard'
export const inject = ['systemPrompt', 'tools']

const DEFAULTS = {
  maxSleepSeconds: 5, maxBlockingWaitMs: 15000, jobsDefaultWaitMs: 30000, topLevelOnly: true,
  wakeup: true, backstopFactor: 2, maxBackstopWakes: 2, maxExpectedMinutes: 240,
}
const record = createRecorder('wait-guard.log')

const UNIT = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }

/** 命令里最长的一次 sleep（秒）；没有返回 0。 */
export function longestSleep(command) {
  let longest = 0
  for (const m of command.matchAll(/(?:^|[\s;&|(`])sleep\s+(\d+(?:\.\d+)?)([smhd]?)(?=$|[\s;&|)`])/g))
    longest = Math.max(longest, Number(m[1]) * UNIT[m[2]])
  for (const m of command.matchAll(/Start-Sleep\b[^;|\n]*?(?:-(Milliseconds|ms)\s+(\d+)|(?:-(?:Seconds|s)\s+)?(\d+(?:\.\d+)?))/gi))
    longest = Math.max(longest, m[2] !== undefined ? Number(m[2]) / 1000 : Number(m[3] ?? 0))
  return longest
}

function isTopLevel(exec) {
  const depth = exec.agent?.session?.header?.delegationDepth
  return depth === undefined || depth === 0
}

/** 返回拒绝理由；放行时返回 undefined。 */
export function check(exec, config = DEFAULTS) {
  const c = { ...DEFAULTS, ...config }
  if (!c.wakeup) return undefined
  const args = exec.arguments ?? {}
  if ((exec.name === 'bash' || exec.name === 'pwsh') && args.run_in_background !== true && typeof args.command === 'string') {
    const seconds = longestSleep(args.command)
    if (seconds > c.maxSleepSeconds) return {
      rule: 'foreground-sleep', seconds,
      reason: `foreground sleep of ${seconds}s is blocked by dsh-wait-guard (limit ${c.maxSleepSeconds}s): it holds the whole turn and queues the user's messages. ` +
        'To wait for something, start the work with run_in_background: true and keep going — you are notified automatically when a background job finishes. ' +
        'If there is nothing else to do, call task_status with state "waiting", tell the user what is still running and end your turn; the completion notice starts a new turn.',
    }
  }
  if (exec.name === 'job_output' && args.wait === true && (!c.topLevelOnly || isTopLevel(exec))) {
    const ms = args.timeout_ms ?? c.jobsDefaultWaitMs
    if (ms > c.maxBlockingWaitMs) return {
      rule: 'long-job-wait', seconds: ms / 1000,
      reason: `blocking on job ${args.job_id} for ${ms / 1000}s is blocked by dsh-wait-guard (limit ${c.maxBlockingWaitMs / 1000}s). ` +
        'You are notified automatically when the job finishes. Do independent work now, use wait: false to peek at new output, ' +
        'or call task_status with state "waiting", tell the user what is running and end your turn — the completion notice starts a new turn.',
    }
  }
  return undefined
}

export const STATUS_PARAMETERS = {
  type: 'object',
  properties: {
    state: { type: 'string', enum: ['waiting', 'asking', 'done'], description: '"done": the request is finished (or you only answered something). "waiting": you are ending the turn while background work you still need is running. "asking": you are ending the turn because you need the user\'s answer to a question you asked.' },
    waiting_for: { type: 'string', description: 'waiting only: the background job id(s) and what they do.' },
    expected_minutes: { type: 'number', description: 'waiting only: how many more minutes you expect the work to take.' },
    summary: { type: 'string', description: 'One line on where things stand.' },
  },
  required: ['state'],
  additionalProperties: false,
}

/** 校验并规整 task_status 参数；不合法时抛出给模型看的错误。 */
export function normalizeStatus(args, config = DEFAULTS) {
  const c = { ...DEFAULTS, ...config }
  if (args?.state === 'done' || args?.state === 'asking') return { state: args.state, summary: args.summary }
  if (args?.state !== 'waiting') throw new Error('state must be "waiting", "asking" or "done"')
  if (typeof args.waiting_for !== 'string' || args.waiting_for.trim() === '') throw new Error('waiting needs waiting_for: which job(s) you are waiting on')
  const minutes = args.expected_minutes
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) throw new Error('waiting needs expected_minutes: a positive number')
  return { state: 'waiting', waiting_for: args.waiting_for, expected_minutes: Math.min(minutes, c.maxExpectedMinutes), summary: args.summary }
}

export function backstopText(declared, elapsedMinutes) {
  return `[dsh-wait-guard backstop] You ended the previous turn waiting for: ${declared.waiting_for} ` +
    `(expected about ${declared.expected_minutes} min). ${elapsedMinutes} min have passed and no completion notice has resumed you. ` +
    'Check the job with job_list / job_output (wait: false). If it is stuck, job_kill it and tell the user what happened. ' +
    'If it is still making progress, call task_status with state "waiting" and a new estimate, then end your turn.'
}

/**
 * 每个顶层会话的声明和兜底计时。和 DSH 的接触面全部作为参数传进来，方便测试：
 * setTimer/clearTimer 是计时器，getAgent(sessionId) 返回 { status, followup }。
 */
export function createTracker({ config = DEFAULTS, setTimer, clearTimer, getAgent, record: note = () => {} }) {
  const c = { ...DEFAULTS, ...config }
  const sessions = new Map()
  const stateOf = (id) => {
    let s = sessions.get(id)
    if (s === undefined) sessions.set(id, s = { declared: undefined, timer: undefined, wakes: 0 })
    return s
  }
  const disarm = (s) => { if (s.timer !== undefined) clearTimer(s.timer); s.timer = undefined }

  function fire(id, declared, minutes) {
    const s = stateOf(id)
    s.timer = undefined
    const agent = getAgent(id)
    if (agent === undefined || agent.status !== 'idle') return note({ event: 'backstop-skipped', session: id, status: agent?.status })
    if (s.wakes >= c.maxBackstopWakes) return note({ event: 'backstop-exhausted', session: id, wakes: s.wakes })
    s.wakes += 1
    agent.followup({
      id: randomUUID(), role: 'user',
      content: [{ type: 'text', text: backstopText(declared, minutes) }],
      source: { kind: 'dsh-wait-guard', form: 'notice', summary: `backstop: still waiting for ${declared.waiting_for}` },
    })
    note({ event: 'backstop-wake', session: id, minutes, wakes: s.wakes })
  }

  return {
    declare(id, declared) {
      stateOf(id).declared = declared
      note({ event: 'declared', session: id, state: declared.state, expected_minutes: declared.expected_minutes })
    },
    onEvent(session, event) {
      if ((session.header?.delegationDepth ?? 0) > 0) return
      const s = stateOf(session.id)
      if (event.type === 'turn/start') { disarm(s); s.declared = undefined; return }
      if (event.type === 'user/message' && event.data?.source?.kind === 'user') { s.wakes = 0; return }
      if (event.type !== 'turn/end') return
      const reason = event.data?.reason?.kind
      const declared = s.declared
      if (declared?.state !== 'waiting') return
      if (reason !== 'completed') return note({ event: 'not-armed', session: session.id, reason })
      const minutes = Math.ceil(declared.expected_minutes * c.backstopFactor)
      s.timer = setTimer(() => fire(session.id, declared, minutes), minutes * 60_000)
      note({ event: 'armed', session: session.id, minutes })
    },
    dispose() { for (const s of sessions.values()) disarm(s); sessions.clear() },
  }
}

const PROMPT = 'Never block a turn waiting for a background job or with sleep. While a job runs, do independent work. ' +
  'Before you end a turn, call task_status as your last tool call. Use state "done" when the request is finished or you only answered something. ' +
  'Use state "asking" when you end the turn because you still need the user\'s answer to a question you asked; their answer starts a new turn. ' +
  'Use state "waiting" when you end the turn while work you still need is running, with waiting_for (job ids and what they do) and expected_minutes; ' +
  'tell the user what is running. The job-completion notice starts a new turn; if it never comes, dsh-wait-guard wakes you after about ' +
  'twice expected_minutes so you can check the job. A service you started on purpose and leave running is not "waiting": mention it and use "done".'

export function apply(ctx, config = {}) {
  const c = { ...DEFAULTS, ...config }
  record({ event: 'loaded', config: c })
  if (!c.wakeup) return record({ event: 'inactive', reason: 'wakeup disabled' })

  ctx.on('tools/pre-execute', (exec, next) => {
    let verdict
    try { verdict = check(exec, c) } catch (error) { record({ event: 'check-failed', error: String(error) }) }
    if (verdict === undefined) return next()
    record({ event: 'denied', rule: verdict.rule, tool: exec.name, seconds: verdict.seconds, session: exec.agent?.session?.id })
    return Promise.resolve({ kind: 'deny', reason: verdict.reason })
  })

  const tracker = createTracker({
    config: c, record,
    setTimer: (fn, ms) => { const t = setTimeout(fn, ms); t.unref?.(); return t },
    clearTimer: (t) => clearTimeout(t),
    getAgent: (id) => ctx.get('agents')?.get(id),
  })
  ctx.effect(() => () => tracker.dispose(), 'wait-guard backstop timers')
  ctx.on('session/event', (session, event) => {
    try { tracker.onEvent(session, event) } catch (error) { record({ event: 'track-failed', error: String(error) }) }
  })

  try {
    ctx.tools.register({
      name: 'task_status',
      description: 'Declare, as the last call of a turn, whether the user\'s task is done, waiting on background work, or waiting for the user\'s answer. Waiting turns are resumed by the job-completion notice, or by a dsh-wait-guard backstop wake if that never arrives.',
      parameters: STATUS_PARAMETERS,
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: value.text }],
      },
      async execute(args, exec) {
        const declared = normalizeStatus(args, c)
        const id = exec.agent?.session?.id
        if (id !== undefined && isTopLevel(exec)) tracker.declare(id, declared)
        return {
          state: declared.state,
          text: declared.state !== 'waiting' ? `Recorded: ${declared.state}.`
            : `Recorded: waiting for ${declared.waiting_for} (~${declared.expected_minutes} min). End your turn now; the completion notice resumes you.`,
        }
      },
    })
  } catch (error) {
    record({ event: 'tool-register-failed', error: String(error) })
  }

  try {
    ctx.systemPrompt.section({ name: 'dsh-wait-guard', order: ctx.systemPrompt.getSectionOrder('TOOL_JOBS') + 1, text: PROMPT })
  } catch (error) {
    record({ event: 'prompt-section-failed', error: String(error) })
  }
}
