// dsh-progress-note：模型埋头干活、很久没对用户说一句话时，提醒它顺手汇报一两句进展。
// DSH 的模型几乎只在最后才写正文：近期 17 个长会话里，带工具调用的步骤写了正文的比例大多是 0%，
// 最长一段连续 208 步、46 分钟没有任何给用户看的话。界面并不隐藏中途的回复，缺的只是模型开口。
// 做法参考 Claude Code：顶层会话一轮进行中，距上一段可见正文（或用户发话）超过 minutes 分钟、其间至少 minSteps 个
// 工具步，就在这一步的工具结果后附一条提醒（deferContext），请模型在下一次调用工具时顺带写一两句进展、接着干活。
// 提醒里说明"不带工具调用的回复会结束这一轮"，避免模型停下来汇报；每次提醒后的第一条回复记进日志，看模型怎么回应。
// 只读会话事件、只用 tools/execute 的 deferContext，不改官方工具和提示词，不限制思考。
import { randomUUID } from 'node:crypto'
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-progress-note'

const DEFAULTS = { enabled: true, minutes: 3, minSteps: 3 }
const record = createRecorder('progress-note.log')

export function noteText(minutes) {
  return `The user has not seen any message from you for about ${minutes} minutes while you work. ` +
    'In your next reply, write one or two short sentences for the user, in their language, on what you have found or done so far and what you are doing next, ' +
    'and send them together with your next tool calls. Keep working afterwards: a reply without tool calls ends the turn, so send one only when the task is finished. ' +
    'Do not mention this note.'
}

export const contextMessage = (text, summary) => ({
  id: randomUUID(), role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'dsh-progress-note', form: 'notice', summary },
})

export const isTopLevelSession = (session) => {
  const depth = session?.header?.delegationDepth
  return depth === undefined || depth === 0
}

const hasText = (content) => content.some((block) => block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '')

/** 按会话记：本轮是否在进行、上一段可见正文的时间、其后的工具步数、上次提醒的时间。 */
export function createTracker(config, { now = Date.now, sink = record } = {}) {
  const sessions = new Map()
  return {
    onEvent(sessionId, event) {
      const time = typeof event.time === 'number' ? event.time : now()
      if (event.type === 'turn/start') {
        sessions.set(sessionId, { lastVisible: time, steps: 0, notedAt: -Infinity, awaiting: false })
        return
      }
      const s = sessions.get(sessionId)
      if (s === undefined) return
      if (event.type === 'turn/end') return void sessions.delete(sessionId)
      if (event.type !== 'assistant/message') return
      const content = event.data?.message?.content ?? []
      const tools = content.some((block) => block.type === 'tool-call')
      const text = hasText(content)
      if (s.awaiting) {
        s.awaiting = false
        sink({ event: 'reply-after-note', session: sessionId, reply: text ? (tools ? 'text-with-tools' : 'text-only') : 'tools-only' })
      }
      if (text) { s.lastVisible = time; s.steps = 0 } else if (tools) s.steps++
    },
    /** 该提醒时返回已沉默的分钟数并记下这次提醒，否则 undefined。同一步多个工具只提醒一次。 */
    due(sessionId) {
      const s = sessions.get(sessionId)
      if (s === undefined || s.awaiting) return undefined
      const t = now(), ms = config.minutes * 60_000
      if (t - s.lastVisible < ms || s.steps < config.minSteps || t - s.notedAt < ms) return undefined
      s.notedAt = t
      s.awaiting = true
      return Math.round((t - s.lastVisible) / 60_000)
    },
    size: () => sessions.size,
  }
}

export function apply(ctx, config = {}) {
  const c = { ...DEFAULTS, ...config }
  record({ event: 'loaded', config: c })
  if (!c.enabled || !(c.minutes > 0)) return
  const tracker = createTracker(c)
  ctx.on('session/event', (session, event) => {
    try {
      if (isTopLevelSession(session)) tracker.onEvent(session?.id, event)
    } catch (error) { record({ event: 'track-failed', error: String(error) }) }
  })
  ctx.on('tools/execute', async (exec, next) => {
    const result = await next()
    try {
      const session = exec.agent?.session
      if (session?.id === undefined || !isTopLevelSession(session) || typeof exec.deferContext !== 'function') return result
      const minutes = tracker.due(session.id)
      if (minutes === undefined) return result
      exec.deferContext(contextMessage(noteText(minutes), 'progress note'))
      record({ event: 'noted', session: session.id, minutes })
    } catch (error) {
      record({ event: 'note-failed', tool: exec?.name, error: String(error) })
    }
    return result
  })
}
