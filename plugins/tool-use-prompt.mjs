// tool-use-prompt：调优预设（tuned）里的工具使用规则，只在这个预设里加载。
// 目标是把活干好、用好工具，不是让模型少想：思考不设限，验证也不减。
// 发行基线（23 步）里多出来的步骤，几乎都是"一步只查一样"：学一个 CLI 的用法分了 3 步，归档任务卡 mkdir / write / 改索引又是 3 步。
// 每次工具往返都要等一次模型，所以把"已经知道要什么就一起拿、多个文件的修改同一步做"写成固定规则。
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-tool-use-prompt'
export const inject = ['systemPrompt']

const record = createRecorder('tool-use-prompt.log')

export const TEXT = [
  'Think as much as the task needs; these rules are about using tools efficiently, not about thinking less.',
  'Every tool round trip waits for a model call, so once you know what the next decision needs, gather it together: independent read, glob, grep and web calls go in the same reply as parallel tool calls, and several read-only shell checks (git status, listings, version lookups, log tails) go in one bash command.',
  'When you know the edits several files need, make them in the same reply.',
  'When you need a command-line tool\'s usage, get all of it in one call (for example `tool --help; tool sub --help`).',
  'When the project documents a script or workflow for the task, read that document once and follow it instead of rediscovering each step.',
  'Check your results as carefully as you otherwise would: batching saves round trips, not verification.',
].join(' ')

export function apply(ctx) {
  ctx.systemPrompt.section({ name: 'dsh-runtime-tuning-tool-use', order: ctx.systemPrompt.getSectionOrder('TOOL_JOBS') + 2, text: TEXT })
  record({ event: 'loaded' })
}

// Preset children resolve from the host profile, whose dependency key may still
// be the pre-npm name. Use this installed module's URL instead of its package name.
export function resolvePresetConfig(config, moduleUrl = import.meta.url) {
  const selfNames = new Set([
    '@herenfor/dsh-tune/plugins/tool-use-prompt.mjs',
    'dsh-runtime-tuning/plugins/tool-use-prompt.mjs',
  ])
  return {
    ...config,
    plugins: config.plugins.map(row => row.id === 'tool-use-prompt' && selfNames.has(row.name)
      ? { ...row, name: moduleUrl }
      : row),
  }
}
