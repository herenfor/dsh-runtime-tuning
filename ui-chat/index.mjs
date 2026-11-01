// 聊天界面的替身（见 ../plugins/chat-answer-fix.mjs）：生成浏览器那一半，服务端那一半原样转出官方的。
import { pathToFileURL } from 'node:url'
import { prepareChatFix } from '../plugins/chat-answer-fix.mjs'

const fix = prepareChatFix()
if (fix.officialIndex === undefined) throw new Error(`dsh-runtime-tuning chat-answer-fix: ${fix.error}`)
const official = await import(pathToFileURL(fix.officialIndex).href)

export const Config = official.Config
export const inject = official.inject
// 官方那一行被停用了，用户写在它上面的配置（比如 transcriptView）从那里取过来
export function configOf(entries, id = 'ui-chat') {
  for (const entry of entries ?? []) if (entry.options?.id === id) return entry.options.config
  return undefined
}

// 加载器传进来的 config 已经过了官方 schema（每一项都是包装过的对象），不能再过一遍，否则报 expected "completion" but got {}。
// 所以合并的是两行的原始配置（官方那行 + 我们这行），只过一次 schema；出任何问题都退回加载器给的 config。
export function resolveConfig(ctx, config) {
  let entries
  try { entries = ctx.loader?.entries?.() } catch {}
  const inherited = configOf(entries)
  let resolved = config
  if (inherited !== undefined && typeof official.Config === 'function') {
    try { resolved = official.Config({ ...inherited, ...(configOf(entries, 'runtime-tuning-ui-chat') ?? {}) }) } catch { resolved = config }
  }
  return resolved
}

export function apply(ctx, config) {
  return official.apply(ctx, resolveConfig(ctx, config))
}
