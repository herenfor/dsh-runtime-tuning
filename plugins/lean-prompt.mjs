// lean-prompt：精简预设（lean）里的执行规则，只在这个预设里加载。
// 发行基线（23 步）里多出来的步骤，几乎都是"一步只查一样"：学一个 CLI 的用法分了 3 步，归档任务卡 mkdir / write / 改索引又是 3 步。
// 每步都要等一次模型，所以把"互不依赖的读取和检查一起发、多个文件的修改同一步做"写成一段固定规则，不再按轮纠偏。
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-lean-prompt'
export const inject = ['systemPrompt']

const record = createRecorder('lean-prompt.log')

export const TEXT = [
  'Work in as few steps as the task allows; every step waits for a model call.',
  'Before each step, decide everything the next decision needs and gather it at once: independent read, glob, grep and web calls go in the same reply as parallel tool calls, and several read-only shell checks (git status, listings, version lookups, log tails) go in one bash command.',
  'Make related edits to several files in the same reply.',
  'When you need a command-line tool\'s usage, get all of it in one call (for example `tool --help; tool sub --help`).',
  'When the project documents a script or workflow for the task, read that document once and follow it instead of rediscovering each step.',
].join(' ')

export function apply(ctx) {
  ctx.systemPrompt.section({ name: 'dsh-lean-execution', order: ctx.systemPrompt.getSectionOrder('TOOL_JOBS') + 2, text: TEXT })
  record({ event: 'loaded' })
}
