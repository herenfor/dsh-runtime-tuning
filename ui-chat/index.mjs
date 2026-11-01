// 聊天界面的替身（见 ../plugins/chat-answer-fix.mjs）：生成浏览器那一半，服务端那一半原样转出官方的。
import { pathToFileURL } from 'node:url'
import { prepareChatFix } from '../plugins/chat-answer-fix.mjs'

const fix = prepareChatFix()
if (fix.officialIndex === undefined) throw new Error(`dsh-runtime-tuning chat-answer-fix: ${fix.error}`)
const official = await import(pathToFileURL(fix.officialIndex).href)

export const Config = official.Config
export const inject = official.inject
// 官方那一行被停用了，用户写在它上面的配置（比如 transcriptView）从那里取过来
export function configOf(entries) {
  for (const entry of entries ?? []) if (entry.options?.id === 'ui-chat') return entry.options.config
  return undefined
}

export function apply(ctx, config) {
  let inherited
  try { inherited = configOf(ctx.loader?.entries?.()) } catch {}
  const merged = { ...(inherited ?? {}), ...(config ?? {}) }
  return official.apply(ctx, typeof official.Config === 'function' ? official.Config(merged) : merged)
}
