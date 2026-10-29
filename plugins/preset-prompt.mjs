// preset-prompt：runtime-tuning 预设专用的提示词。
// 官方 tool:jobs 段落要求“给最终答复前用 job_output 收齐所有后台任务”，wait-guard 却让模型在任务还在跑时
// 结束这一轮、用 task_status 声明；两段同时出现，模型两边都不照做。这里把两段合成一段，只说一种结束方式。
// 它是顶层插件，但只改写选了 runtime-tuning 预设的会话：每个顶层 agent 创建时，在 agent 自己的作用域里挂一个
// system-prompt/assemble 改写，每次组装时再看这个会话当前用的是哪个预设。官方预设、子代理一概不动；没装 wait-guard 时也不改。
// （不放进预设内部当子插件：预设子插件的相对路径按宿主目录解析，找不到这个文件。）
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-preset-prompt'

export const JOBS_SECTION = 'tool:jobs'
export const WAIT_GUARD_SECTION = 'dsh-wait-guard'
const record = createRecorder('preset-prompt.log')

export const UNIFIED_JOBS_TEXT = 'Track every background job id you start. Never block a turn on a job: no sleep, no long job_output waits, ' +
  'and no peeking at its log right after starting it. You are notified in-session when a job finishes. ' +
  'While jobs run, do independent work, batch independent reads and checks into one reply, do not duplicate a running job\'s work, ' +
  'and job_kill jobs that stopped mattering. ' +
  'When nothing else is left, end the turn even if jobs are still running: write your final message, tell the user what is running, ' +
  'and in that same reply call task_status as its only tool call. That ends the turn directly; do not repeat the message afterwards. ' +
  'Use state "waiting" with waiting_for (job ids and what they do) and expected_minutes while work you still need is running; ' +
  'the completion notice starts a new turn. Use "asking" when you need the user\'s answer to a question you asked, and "done" when the request is finished. ' +
  'A service you leave running on purpose, such as a dev server or a watcher, is "done" with its job id in services. ' +
  'If a job never reports back, dsh-wait-guard wakes you so you can check it.'

/** 把 tool:jobs 换成合并后的说法，并去掉 wait-guard 的独立段落；没有 wait-guard 段落时原样返回。 */
export function rewrite(assembly) {
  const sections = assembly?.sections
  if (!Array.isArray(sections) || !sections.some((s) => s.name === WAIT_GUARD_SECTION)) return assembly
  const hasJobs = sections.some((s) => s.name === JOBS_SECTION)
  const next = sections
    .filter((s) => !(hasJobs && s.name === WAIT_GUARD_SECTION))
    .map((s) => (s.name === (hasJobs ? JOBS_SECTION : WAIT_GUARD_SECTION) ? { ...s, text: UNIFIED_JOBS_TEXT } : s))
  return { ...assembly, sections: next }
}

const DEFAULTS = { preset: 'runtime-tuning' }

/** 会话当前用的预设：会话开始前切换过的话，以切换后的为准。 */
export function presetOf(agent, projections) {
  try {
    const selected = projections?.stateOf(agent.session, 'agentPreset')
    if (typeof selected === 'string') return selected
  } catch {}
  return agent?.session?.header?.agentPreset
}

export function apply(ctx, config = {}) {
  const c = { ...DEFAULTS, ...config }
  record({ event: 'loaded', config: c })
  ctx.on('agent/created', ({ agent }) => {
    if ((agent?.session?.header?.delegationDepth ?? 0) > 0 || agent?.ctx === undefined) return
    let logged = false
    agent.ctx.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next()
      if (presetOf(agent, ctx.get('sessionProjections')) !== c.preset) return result
      try {
        const rewritten = rewrite(result)
        if (!logged) { logged = true; record({ event: rewritten === result ? 'skipped' : 'rewrote', session: agent.id }) }
        return rewritten
      } catch (error) {
        record({ event: 'rewrite-failed', session: agent.id, error: String(error).slice(0, 300) })
        return result
      }
    })
  })
}
