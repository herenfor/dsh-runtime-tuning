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
//
// rev 3 增加硬保底：模型没声明 waiting（没调 task_status，或者声明了 done），但一轮结束时后台还有任务在跑，
// 也按 undeclaredMinutes 计时，到点唤醒模型去检查。模型在 services 里列出的任务（故意留着的开发服务器之类）不计时。
// - task_status 结束本轮：它和最终答复写在同一条回复里、又是这一步唯一的工具调用时，执行完直接结束这一轮，
//   省掉“调完工具再请求一次模型、把答复重复一遍”的那一步。和别的工具一起调用时不结束，否则模型看不到那些结果。
//
// rev 4 收尾清点（turnEndAudit）：一轮正常结束时还有没认领的后台任务（没声明 waiting、不在 services 里），
// 就立刻唤醒一次，列出 DSH 任务表里的事实（id、已运行多久、命令），要求模型对每个任务三选一：在等、是服务、job_kill。
// 每个任务只问一次；那一轮还不表态就退回 undeclaredMinutes 硬保底。用户发消息后重新开始问。
// 起因：模型在沙箱里用 ps 看不到后台任务，误以为任务已退出，留下一个空转 40 分钟的扫描进程。
//
// rev 5 任务事实（jobNotes）：在结果后附上 DSH 任务表里的事实，不拦截、不多花一步。
// - 命令里有 ps / pgrep / pidof 等：每条命令有自己的沙箱，看不到后台任务，附上本会话还在跑的任务。
// - 启动的脚本和一个还在跑的任务相同：附上那个任务，让模型决定 job_kill 还是有意并行。
// - job_output 没有新输出、list_agents 里有子代理在跑：说明完成时会自动通知，不用再查。
import { randomUUID } from 'node:crypto'
import { createRecorder } from './log.mjs'

export const name = 'dsh-wait-guard'
export const inject = ['systemPrompt', 'tools']

const DEFAULTS = {
  maxSleepSeconds: 5, maxBlockingWaitMs: 15000, jobsDefaultWaitMs: 30000, maxForegroundTimeoutMs: 30000,
  silentClamp: true, topLevelOnly: true,
  wakeup: true, backstopFactor: 2, maxBackstopWakes: 2, maxExpectedMinutes: 240, undeclaredMinutes: 30,
  concludeTurn: true, turnEndAudit: true, jobNotes: true,
}
// deferContext 收的是一条完整的 user 消息，不是字符串：DSH 下一步会读 source.kind，传字符串会让这一轮报错中断。
export const contextMessage = (text, summary) => ({
  id: randomUUID(), role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'dsh-wait-guard', form: 'notice', summary },
})
// DSH 先写 turn/end，返回后才把 agent 置为空闲；稍等一下再唤醒。
const AUDIT_DELAY_MS = 1000
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
  if (!c.silentClamp && exec.name === 'job_output' && args.wait === true && (!c.topLevelOnly || isTopLevel(exec))) {
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

/** 返回静默改参结果（整对象冻结替换 + 尾部提示字符串）；无需改写时返回 undefined。 */
export function rewrite(exec, config = DEFAULTS) {
  const c = { ...DEFAULTS, ...config }
  if (!c.wakeup || !c.silentClamp) return undefined
  const args = exec.arguments ?? {}
  if ((exec.name === 'bash' || exec.name === 'pwsh') && args.run_in_background !== true && c.maxForegroundTimeoutMs > 0 && (!c.topLevelOnly || isTopLevel(exec))) {
    if (typeof args.timeoutMs === 'number' && Number.isFinite(args.timeoutMs) && args.timeoutMs > c.maxForegroundTimeoutMs) {
      return {
        rule: 'foreground-timeout', fromSeconds: args.timeoutMs / 1000, toSeconds: c.maxForegroundTimeoutMs / 1000,
        arguments: Object.freeze({ ...args, timeoutMs: c.maxForegroundTimeoutMs }),
        context: `[dsh-wait-guard] Foreground timeoutMs (${args.timeoutMs}ms) was clamped to ${c.maxForegroundTimeoutMs}ms so slow commands promote to the background instead of holding the turn. If promoted, you are notified automatically when the background job finishes.`,
      }
    }
  }
  if (exec.name === 'job_output' && args.wait === true && (!c.topLevelOnly || isTopLevel(exec))) {
    const ms = args.timeout_ms ?? c.jobsDefaultWaitMs
    if (ms > c.maxBlockingWaitMs) {
      return {
        rule: 'long-job-wait', fromSeconds: ms / 1000, toSeconds: 0,
        arguments: Object.freeze({ ...args, wait: false }),
        context: `[dsh-wait-guard] Blocking wait of ${ms / 1000}s on job ${args.job_id} (limit ${c.maxBlockingWaitMs / 1000}s) was downgraded to wait: false so the turn stays responsive. You are notified automatically when the job finishes; do independent work now, or end your turn and wait for the completion notice.`,
      }
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
    services: { type: 'array', items: { type: 'string' }, description: 'Any state: ids of background jobs you deliberately leave running, such as a dev server or a watcher. Every other job still running when the turn ends gets a backstop wake.' },
  },
  required: ['state'],
  additionalProperties: false,
}

/** 校验并规整 task_status 参数；不合法时抛出给模型看的错误。 */
export function normalizeStatus(args, config = DEFAULTS) {
  const c = { ...DEFAULTS, ...config }
  const services = args?.services ?? []
  if (!Array.isArray(services) || services.some((id) => typeof id !== 'string' || id.trim() === '')) throw new Error('services must be a list of job ids')
  if (args?.state === 'done' || args?.state === 'asking') return { state: args.state, summary: args.summary, services }
  if (args?.state !== 'waiting') throw new Error('state must be "waiting", "asking" or "done"')
  if (typeof args.waiting_for !== 'string' || args.waiting_for.trim() === '') throw new Error('waiting needs waiting_for: which job(s) you are waiting on')
  const minutes = args.expected_minutes
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) throw new Error('waiting needs expected_minutes: a positive number')
  return { state: 'waiting', waiting_for: args.waiting_for, expected_minutes: Math.min(minutes, c.maxExpectedMinutes), summary: args.summary, services }
}

export function backstopText(declared, elapsedMinutes) {
  return `[dsh-wait-guard backstop] You ended the previous turn waiting for: ${declared.waiting_for} ` +
    `(expected about ${declared.expected_minutes} min). ${elapsedMinutes} min have passed and no completion notice has resumed you. ` +
    'Check the job with job_list / job_output (wait: false). If it is stuck, job_kill it and tell the user what happened. ' +
    'If it is still making progress, call task_status with state "waiting" and a new estimate, then end your turn.'
}

export function undeclaredText(jobIds, elapsedMinutes) {
  return `[dsh-wait-guard backstop] You ended the previous turn while background job(s) ${jobIds.join(', ')} were still running, ` +
    `without declaring that you were waiting for them. ${elapsedMinutes} min have passed and no completion notice has resumed you. ` +
    'Check them with job_list / job_output (wait: false). If one is stuck, job_kill it and tell the user what happened. ' +
    'If the work is still making progress, call task_status with state "waiting", waiting_for and expected_minutes, then end your turn. ' +
    'If a job is a service you mean to leave running, list its id in task_status services.'
}

const shortLabel = (label) => {
  const line = String(label ?? '').replace(/\s+/g, ' ').trim()
  return line.length > 80 ? `${line.slice(0, 77)}...` : line
}

const jobLine = ({ id, label, startedAt }, now) => {
  const minutes = typeof startedAt === 'number' ? `, running ${Math.max(0, Math.round((now - startedAt) / 60_000))} min` : ''
  return `- ${id}${minutes}${label ? `: ${shortLabel(label)}` : ''}`
}

/** jobs: [{ id, label, startedAt }]，startedAt 为毫秒时间戳。 */
export function auditText(jobs, now = Date.now()) {
  return '[dsh-wait-guard] You ended the turn while these background jobs are still running ' +
    '(from the DSH job table; ps inside the command sandbox cannot see them):\n' + jobs.map((job) => jobLine(job, now)).join('\n') + '\n' +
    'Decide for each one, then end your turn:\n' +
    '- still needed and you are waiting for it: task_status with state "waiting", waiting_for and expected_minutes\n' +
    '- a service you leave running on purpose: task_status with its id in services\n' +
    '- no longer needed: job_kill it\n' +
    'Keep the reply short; the user has already seen your previous answer.'
}

const PROCESS_TOOLS = /(?:^|[\s;&|(`])(?:ps|pgrep|pidof|pkill|killall)(?=$|[\s;&|)])/m
// 被解释器或 ./ 直接执行的脚本；只读脚本（cat、sed）不算。
const RUN_SCRIPT = /(?:^|[\s;&|(])(?:(?:\S*\/)?(?:python[\d.]*|node|bash|sh|zsh|ruby|perl|deno|bun|tsx)\s+(?:-\S+\s+)*|\.\/)([^\s;&|'"]+\.(?:py|sh|mjs|cjs|js|ts|rb|pl))/g
const scriptsOf = (command) => new Set([...String(command ?? '').matchAll(RUN_SCRIPT)].map((m) => m[1].split('/').pop()))

/** 执行前就能判断的提醒：查进程、重复启动。jobs 是本会话还在跑的任务。 */
export function commandNotes(exec, jobs, now = Date.now()) {
  if ((exec.name !== 'bash' && exec.name !== 'pwsh') || jobs.length === 0) return []
  const command = String(exec.arguments?.command ?? '')
  const notes = []
  if (PROCESS_TOOLS.test(command)) notes.push({
    kind: 'process-check',
    text: '[dsh-wait-guard] Each command runs in its own sandbox, so ps / pgrep here cannot see background jobs. ' +
      'Background jobs of this session that are still running (from the DSH job table):\n' + jobs.map((job) => jobLine(job, now)).join('\n') +
      '\nUse job_list / job_output to check them and job_kill to stop one.',
  })
  const scripts = scriptsOf(command)
  const same = jobs.filter((job) => String(job.label ?? '').trim() === command.trim() || [...scriptsOf(job.label)].some((s) => scripts.has(s)))
  if (same.length > 0) notes.push({
    kind: 'duplicate-run',
    text: '[dsh-wait-guard] A background job of this session is still running the same script:\n' + same.map((job) => jobLine(job, now)).join('\n') +
      '\nIf that run is stale or superseded, job_kill it; if you mean to run both in parallel, carry on.',
  })
  return notes
}

/** 看过结果才能判断的提醒：没有新输出还在查、子代理还在跑。 */
export function resultNote(exec, result) {
  const text = JSON.stringify(result ?? '')
  if (exec.name === 'job_output' && text.includes('(no new output)') && text.includes('[status: running]')) return {
    kind: 'poll-job',
    text: '[dsh-wait-guard] Nothing new since your last read. DSH notifies you when this job finishes; do other work or end your turn instead of checking again.',
  }
  if (exec.name === 'list_agents' && text.includes('[running]')) return {
    kind: 'poll-agents',
    text: '[dsh-wait-guard] Subagents send you a message when they finish; you do not need to poll list_agents.',
  }
  return undefined
}

/**
 * 每个顶层会话的声明和兜底计时。和 DSH 的接触面全部作为参数传进来，方便测试：
 * setTimer/clearTimer 是计时器，getAgent(sessionId) 返回 { status, followup }。
 */
export function createTracker({ config = DEFAULTS, setTimer, clearTimer, getAgent, record: note = () => {}, now = Date.now }) {
  const c = { ...DEFAULTS, ...config }
  const sessions = new Map()
  const stateOf = (id) => {
    let s = sessions.get(id)
    if (s === undefined) sessions.set(id, s = { declared: undefined, timer: undefined, wakes: 0, jobs: new Map(), services: new Set(), acknowledged: new Set(), audited: new Set(), reply: undefined })
    return s
  }
  const disarm = (s) => { if (s.timer !== undefined) clearTimer(s.timer); s.timer = undefined }

  const pendingJobs = (s) => [...s.jobs.keys()].filter((job) => !s.services.has(job))
  const unclaimedJobs = (s) => pendingJobs(s).filter((job) => !s.acknowledged.has(job))

  function audit(id) {
    const s = stateOf(id)
    s.timer = undefined
    const unclaimed = unclaimedJobs(s)
    if (unclaimed.length === 0) return note({ event: 'audit-skipped', session: id, reason: 'jobs claimed or finished' })
    const agent = getAgent(id)
    if (agent === undefined || agent.status !== 'idle') return note({ event: 'audit-skipped', session: id, status: agent?.status })
    for (const job of unclaimed) s.audited.add(job)
    agent.followup({
      id: randomUUID(), role: 'user',
      content: [{ type: 'text', text: auditText(unclaimed.map((job) => ({ id: job, ...s.jobs.get(job) })), now()) }],
      source: { kind: 'dsh-wait-guard', form: 'notice', summary: `turn-end check: ${unclaimed.length} background job(s) still running` },
    })
    note({ event: 'audit-wake', session: id, jobs: unclaimed.length })
  }

  // declared 为 undefined 时是硬保底：只要到点时还有没列进 services 的任务在跑，就唤醒。
  function fire(id, declared, minutes) {
    const s = stateOf(id)
    s.timer = undefined
    const pending = pendingJobs(s)
    if (declared === undefined && pending.length === 0) return note({ event: 'backstop-skipped', session: id, reason: 'jobs finished' })
    const agent = getAgent(id)
    if (agent === undefined || agent.status !== 'idle') return note({ event: 'backstop-skipped', session: id, status: agent?.status })
    if (s.wakes >= c.maxBackstopWakes) return note({ event: 'backstop-exhausted', session: id, wakes: s.wakes })
    s.wakes += 1
    agent.followup({
      id: randomUUID(), role: 'user',
      content: [{ type: 'text', text: declared === undefined ? undeclaredText(pending, minutes) : backstopText(declared, minutes) }],
      source: {
        kind: 'dsh-wait-guard', form: 'notice',
        summary: declared === undefined ? `backstop: ${pending.length} background job(s) still running` : `backstop: still waiting for ${declared.waiting_for}`,
      },
    })
    note({ event: 'backstop-wake', session: id, minutes, wakes: s.wakes, undeclared: declared === undefined })
  }

  return {
    declare(id, declared) {
      const s = stateOf(id)
      s.declared = declared
      for (const job of declared.services ?? []) s.services.add(job)
      if (declared.state === 'waiting') for (const job of pendingJobs(s)) s.acknowledged.add(job)
      note({ event: 'declared', session: id, state: declared.state, expected_minutes: declared.expected_minutes })
    },
    /** 这次调用是否独占所在的那条回复、且那条回复带着答复文字：只有这时结束本轮才不丢信息。 */
    canConclude(id, callId) {
      const reply = sessions.get(id)?.reply
      return reply !== undefined && reply.hasText && reply.calls.length === 1 && reply.calls[0] === callId
    },
    onEvent(session, event) {
      if ((session.header?.delegationDepth ?? 0) > 0) return
      const s = stateOf(session.id)
      if (event.type === 'assistant/message') { s.reply = describeReply(event.data?.message?.content); return }
      if (event.type === 'turn/start') { disarm(s); s.declared = undefined; return }
      if (event.type === 'user/message' && event.data?.source?.kind === 'user') { s.wakes = 0; s.audited.clear(); return }
      if (event.type === 'job/registered') {
        if ((event.data?.owner ?? session.id) !== session.id) return
        s.jobs.set(event.data?.jobId, { label: event.data?.label, startedAt: event.data?.startedAt ?? now() })
        return
      }
      if (event.type === 'job/settled') {
        const job = event.data?.jobId
        s.jobs.delete(job); s.services.delete(job); s.acknowledged.delete(job); s.audited.delete(job)
        return
      }
      if (event.type !== 'turn/end') return
      const reason = event.data?.reason?.kind
      const declared = s.declared?.state === 'waiting' ? s.declared : undefined
      const pending = pendingJobs(s)
      // DSH 把每条前台命令也登记成任务，所以只看一轮结束时还在跑、而且还没问过的任务。
      if (c.turnEndAudit && reason === 'completed' && unclaimedJobs(s).some((job) => !s.audited.has(job))) {
        s.timer = setTimer(() => audit(session.id), AUDIT_DELAY_MS)
        return note({ event: 'audit-armed', session: session.id, jobs: unclaimedJobs(s).length })
      }
      if (declared === undefined && (c.undeclaredMinutes <= 0 || pending.length === 0)) return
      if (reason !== 'completed') return note({ event: 'not-armed', session: session.id, reason })
      const minutes = declared === undefined ? c.undeclaredMinutes : Math.ceil(declared.expected_minutes * c.backstopFactor)
      s.timer = setTimer(() => fire(session.id, declared, minutes), minutes * 60_000)
      note({ event: 'armed', session: session.id, minutes, undeclared: declared === undefined, jobs: declared === undefined ? pending.length : undefined })
    },
    /** 本会话登记过、还没结束的任务（含服务）。 */
    runningJobs(id) { return [...(sessions.get(id)?.jobs ?? new Map())].map(([job, info]) => ({ id: job, ...info })) },
    dispose() { for (const s of sessions.values()) disarm(s); sessions.clear() },
  }
}

/** 一条模型回复里的工具调用 id，以及有没有给用户看的文字。 */
export function describeReply(content) {
  const blocks = Array.isArray(content) ? content : []
  return {
    calls: blocks.filter((b) => b?.type === 'tool-call').map((b) => b.id),
    hasText: blocks.some((b) => b?.type === 'text' && typeof b.text === 'string' && b.text.trim() !== ''),
  }
}

// 有硬保底时 task_status 只在两种情况下需要：任务会跑得比硬保底更久，或者它是故意留着的服务。
// 真实长会话里模型几乎从不声明，新会话里声明又常常单独占一步；状态交给 runtime 按事实判断，声明只补充这两样信息。
const BASE_PROMPT = 'Never block a turn waiting for a background job or with sleep, and do not check a job\'s log right after starting it: ' +
  'you are notified in-session when it finishes. While jobs run, do independent work. ' +
  'Put independent reads, checks and edits into one reply as parallel tool calls instead of one call per reply. '

const optionalStatusText = (c) => 'When nothing else is left, end the turn even if jobs are still running and tell the user what is running. ' +
  (c.turnEndAudit
    ? 'Right after such a turn ends, dsh-wait-guard lists the jobs still running and asks you once to account for each: waiting for it, ' +
      'a service left running on purpose, or no longer needed (job_kill). Kill jobs you no longer need before ending the turn. '
    : '') +
  'The completion notice starts a new turn, and dsh-wait-guard wakes you after about ' + c.undeclaredMinutes + ' minutes if a job never reports back. ' +
  'Call task_status only in two cases: a job you leave running will take longer than ' +
  c.undeclaredMinutes + ' minutes (state "waiting" with waiting_for and expected_minutes), or a job is a service you leave running on purpose, ' +
  'such as a dev server or a watcher (state "done" with its id in services).' +
  (c.concludeTurn ? ' Make task_status the only tool call in the reply that carries your final message: that ends the turn directly.' : '')

export const promptText = (c) => BASE_PROMPT + (c.undeclaredMinutes > 0 ? optionalStatusText(c) : requiredStatusText(c))

const requiredStatusText = (c) =>
  'Before you end a turn, call task_status as your last tool call. ' +
  (c.concludeTurn ? 'Write your final message and call task_status in the same reply, as its only tool call: that ends the turn directly, so do not repeat the message afterwards. ' : '') +
  'Use state "done" when the request is finished or you only answered something. ' +
  'Use state "asking" when you end the turn because you still need the user\'s answer to a question you asked; their answer starts a new turn. ' +
  'Use state "waiting" when you end the turn while work you still need is running, with waiting_for (job ids and what they do) and expected_minutes; ' +
  'tell the user what is running. The job-completion notice starts a new turn; if it never comes, dsh-wait-guard wakes you after about ' +
  'twice expected_minutes so you can check the job. A service you started on purpose and leave running is not "waiting": mention it, use "done" ' +
  'and list its job id in services.' + (c.undeclaredMinutes > 0
    ? ` Any other background job still running when the turn ends gets a backstop wake after about ${c.undeclaredMinutes} minutes.` : '')

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

  ctx.on('tools/execute', async (exec, next) => {
    try {
      const patch = rewrite(exec, c)
      if (patch !== undefined) {
        exec.arguments = patch.arguments
        if (typeof exec.deferContext === 'function') exec.deferContext(contextMessage(patch.context, `clamped ${patch.rule}`))
        record({ event: 'clamped', rule: patch.rule, tool: exec.name, fromSeconds: patch.fromSeconds, toSeconds: patch.toSeconds, session: exec.agent?.session?.id })
      }
    } catch (error) {
      record({ event: 'clamp-failed', tool: exec?.name, error: String(error) })
    }
    const noting = c.wakeup && c.jobNotes && isTopLevel(exec) && typeof exec.deferContext === 'function'
    let notes = []
    try {
      if (noting) notes = commandNotes(exec, tracker.runningJobs(exec.agent?.session?.id), Date.now())
    } catch (error) {
      record({ event: 'note-failed', tool: exec?.name, error: String(error) })
    }
    const result = await next()
    try {
      const after = noting ? resultNote(exec, result) : undefined
      if (after !== undefined) notes.push(after)
      for (const note of notes) exec.deferContext(contextMessage(note.text, `job note: ${note.kind}`))
      if (notes.length > 0) record({ event: 'noted', kinds: notes.map((note) => note.kind), tool: exec.name, session: exec.agent?.session?.id })
    } catch (error) {
      record({ event: 'note-failed', tool: exec?.name, error: String(error) })
    }
    return result
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
      description: (c.undeclaredMinutes > 0
        ? `Optional. Use only when a background job you leave running will take longer than ${c.undeclaredMinutes} minutes, or to mark services you leave running on purpose. `
        : 'Declare, as the last call of a turn, whether the user\'s task is done, waiting on background work, or waiting for the user\'s answer. ') +
        'Called as the only tool in the reply that carries your final message, it ends the turn directly. ' +
        'Waiting turns are resumed by the job-completion notice, or by a dsh-wait-guard backstop wake if that never arrives.',
      parameters: STATUS_PARAMETERS,
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_args, value) => [{ type: 'text', text: value.text }],
      },
      async execute(args, exec) {
        const declared = normalizeStatus(args, c)
        const id = exec.agent?.session?.id
        let concluded = false
        if (id !== undefined && isTopLevel(exec)) {
          tracker.declare(id, declared)
          if (c.concludeTurn && tracker.canConclude(id, exec.callId)) { exec.concludeTurn(); concluded = true }
          record({ event: 'status-call', session: id, state: declared.state, concluded })
        }
        const head = declared.state !== 'waiting' ? `Recorded: ${declared.state}.`
          : `Recorded: waiting for ${declared.waiting_for} (~${declared.expected_minutes} min).`
        return {
          state: declared.state,
          text: concluded ? `${head} The turn ends here.`
            : declared.state === 'waiting' ? `${head} End your turn now; the completion notice resumes you.` : head,
        }
      },
    })
  } catch (error) {
    record({ event: 'tool-register-failed', error: String(error) })
  }

  try {
    ctx.systemPrompt.section({ name: 'dsh-wait-guard', order: ctx.systemPrompt.getSectionOrder('TOOL_JOBS') + 1, text: promptText(c) })
  } catch (error) {
    record({ event: 'prompt-section-failed', error: String(error) })
  }
}
