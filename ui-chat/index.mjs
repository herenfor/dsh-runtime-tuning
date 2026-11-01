// 聊天界面的替身（见 ../plugins/chat-answer-fix.mjs）：生成浏览器那一半，服务端那一半原样转出官方的。
import { pathToFileURL } from 'node:url'
import { prepareChatFix } from '../plugins/chat-answer-fix.mjs'

const fix = prepareChatFix()
if (fix.officialIndex === undefined) throw new Error(`dsh-runtime-tuning chat-answer-fix: ${fix.error}`)
const official = await import(pathToFileURL(fix.officialIndex).href)

export const Config = official.Config
export const inject = official.inject
export function apply(ctx, config) {
  return official.apply(ctx, config)
}
