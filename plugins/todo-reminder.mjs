// dsh-todo-reminder：任务清单有没做完的项、又很久没更新时，提醒模型对一下进度。
// DSH 的 todo_write 只把清单写进会话，没有任何后续提醒：长任务里清单写一次就被忘掉，界面上一直停在第一项
// （两周 41 个会话里用过清单的 3 个，结束时全都没收尾；最长的一个第 14 步写下 6 项，之后 62 步再没更新）。
// 做法参考 Claude Code：清单 N 步没更新、距上次提醒也过了 N 步，就在下一次工具调用的结果后面附一条提醒，
// 带上清单当前内容，语气是"对不上就更新，还准就忽略"。和 CC 不同的是：没写过清单、或清单已全部完成时不提醒，
// 不引导模型去用这个工具。只读会话事件、只用 tools/execute 的 deferContext，不改官方工具和提示词。
// DSH 重启后内存里的清单丢失，下一次 todo_write 之前不会提醒。
import { randomUUID } from 'node:crypto'
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-todo-reminder'

const DEFAULTS = { enabled: true, stepsSinceWrite: 10, stepsBetweenReminders: 10 }
const record = createRecorder('todo-reminder.log')
const MARK = { completed: 'x', in_progress: '>', pending: ' ' }

/** 提醒正文：说明多久没更新，附清单当前内容。 */
export function reminderText(todos, steps) {
  const lines = todos.map((todo) => `- [${MARK[todo.status] ?? ' '}] ${todo.content}${todo.status === 'in_progress' ? ' (in progress)' : ''}`)
  return `The todo list has not been updated in the last ${steps} steps and still has unfinished items. ` +
    'If your progress has moved on, update it with todo_write (mark finished items completed, keep the current one in_progress); ' +
    'if it no longer matches the work, rewrite it. If it is still accurate, ignore this note and do not mention it to the user.\n\n' +
    `Current todo list:\n${lines.join('\n')}`
}

export const contextMessage = (text, summary) => ({
  id: randomUUID(), role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'dsh-todo-reminder', form: 'notice', summary },
})

/** 按会话记步数、最后一次清单和上次提醒；due() 决定这一步要不要提醒。 */
export function createTracker(config) {
  const sessions = new Map()
  return {
    onEvent(sessionId, event) {
      if (event.type === 'step/start') {
        const s = sessions.get(sessionId)
        if (s) s.step++
        return
      }
      if (event.type !== 'todo/write') return
      const todos = Array.isArray(event.data?.todos) ? event.data.todos : []
      if (todos.length === 0 || todos.every((todo) => todo.status === 'completed')) return void sessions.delete(sessionId)
      const s = sessions.get(sessionId) ?? { step: 0, remindedAt: -Infinity }
      s.todos = todos
      s.writtenAt = s.step
      sessions.set(sessionId, s)
    },
    /** 该提醒时返回 { todos, steps } 并记下这一步，否则 undefined。同一步多个工具只提醒一次。 */
    due(sessionId) {
      const s = sessions.get(sessionId)
      if (!s) return undefined
      const steps = s.step - s.writtenAt
      if (steps < config.stepsSinceWrite || s.step - s.remindedAt < config.stepsBetweenReminders) return undefined
      s.remindedAt = s.step
      return { todos: s.todos, steps }
    },
    size: () => sessions.size,
  }
}

export function apply(ctx, config = {}) {
  const c = { ...DEFAULTS, ...config }
  record({ event: 'loaded', config: c })
  if (!c.enabled) return
  const tracker = createTracker(c)
  ctx.on('session/event', (session, event) => {
    try { tracker.onEvent(session?.id, event) } catch (error) { record({ event: 'track-failed', error: String(error) }) }
  })
  ctx.on('tools/execute', async (exec, next) => {
    const result = await next()
    try {
      const id = exec.agent?.session?.id
      if (exec.name === 'todo_write' || id === undefined || typeof exec.deferContext !== 'function') return result
      const due = tracker.due(id)
      if (due === undefined) return result
      exec.deferContext(contextMessage(reminderText(due.todos, due.steps), 'todo list reminder'))
      record({ event: 'reminded', session: id, steps: due.steps, open: due.todos.filter((todo) => todo.status !== 'completed').length })
    } catch (error) {
      record({ event: 'remind-failed', tool: exec?.name, error: String(error) })
    }
    return result
  })
}
