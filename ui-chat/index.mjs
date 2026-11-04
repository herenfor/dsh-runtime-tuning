// 聊天界面的替身（见 ../plugins/chat-answer-fix.mjs）：生成浏览器那一半，服务端那一半原样转出官方的。
import { pathToFileURL } from 'node:url'
import { createRecorder } from '../plugins/log.mjs'
import { prepareChatFix } from '../plugins/chat-answer-fix.mjs'

const fix = prepareChatFix()
if (fix.officialIndex === undefined) throw new Error(`dsh-runtime-tuning chat-answer-fix: ${fix.error}`)
const official = await import(pathToFileURL(fix.officialIndex).href)
const record = createRecorder('chat-answer-fix.log')

export const OWN_ID = 'runtime-tuning-ui-chat'
// 官方 Config 里的显示设置（都是界面上能改的字段）。按当前版本的 Config 读，官方加了字段（0.2.2 加了 foldedReplies）也跟着搬。
export const SETTING_FIELDS = Object.keys(official.Config?.dict ?? {}).length > 0
  ? Object.keys(official.Config.dict)
  : ['transcriptView', 'collapseTiming', 'performanceUsage', 'linkOpening']
// DSH 刚启动时加载器可能还在一次重载事务里，这时写设置会报这个错（cordis 4.1 起），过一会儿再写。
const BUSY = /transactions cannot be nested/
const RETRY_MS = [500, 1000, 2000, 4000, 8000]

export const Config = official.Config
export const inject = official.inject
export function configOf(entries, id = 'ui-chat') {
  for (const entry of entries ?? []) if (entry.options?.id === id) return entry.options.config
  return undefined
}

// 显示设置读写的是正在运行的这一行。用户以前存在官方那行（ui-chat）上的设置，这一行还没有的字段搬过来一次；
// 这一行已经有的不动，所以之后在界面上改的始终算数。
export function settingsToCarry(entries) {
  entries = [...(entries ?? [])]  // 新版加载器（cordis-plugin-loader 1.1）给的是迭代器，只能走一遍
  const from = configOf(entries) ?? {}
  const own = configOf(entries, OWN_ID) ?? {}
  const carry = {}
  for (const key of SETTING_FIELDS) if (from[key] !== undefined && own[key] === undefined) carry[key] = from[key]
  return Object.keys(carry).length > 0 ? carry : undefined
}

export function apply(ctx, config) {
  official.apply(ctx, config)
  if (!fix.settings) return
  ctx.inject(['settings'], (child) => {
    child.effect(() => {
      let stopped = false
      ;(async () => {
        await ctx.loader?.await?.()
        if (stopped) return
        const carry = settingsToCarry(ctx.loader?.entries?.())
        if (carry === undefined) return
        for (let attempt = 0; ; attempt++) {
          try { await child.settings.update(OWN_ID, carry); break } catch (error) {
            if (!BUSY.test(String(error)) || attempt >= RETRY_MS.length) throw error
            await new Promise((r) => setTimeout(r, RETRY_MS[attempt]))
            if (stopped) return
          }
        }
        record({ event: 'settings-carried', fields: Object.keys(carry) })
      })().catch((error) => record({ event: 'settings-carry-failed', error: String(error).slice(0, 300) }))
      return () => { stopped = true }
    }, 'ui-chat settings carry-over')
  })
}
