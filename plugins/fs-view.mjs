// fs-view：让模型以为的文件状态和实际一致，能在 runtime 里办成的就不让模型撞错再重来。
// editSync：edit 前 DSH 的 fs-observation-policy 要求文件读过、且读后没变，否则报 FS_NOT_OBSERVED / FS_STALE_VERSION。
// 77 个会话里这样失败了 46 次，大多是模型先用 bash 的 sed / grep 看过（不算读过）或用 python / sed -i 改过（版本变了）。
// edit 按 old_string 精确替换、还要求唯一，原文对不上照样失败，所以这里把期望版本换成文件的当前版本，省掉"读一遍再重试"那一步。
// write 是整文件覆盖，没有这层校验，不动它。
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-fs-view'
export const inject = ['fs']

const DEFAULTS = { enabled: true, editSync: true }
const record = createRecorder('fs-view.log')

/**
 * fs/edit-intent 的 waterfall 处理器，排在 observation policy 前面。
 * 文件不存在或不是普通文件时原样交给后面（照常报错）；未读过或读后变了时返回当前版本。
 */
export function syncedEditIntent(stat, onSync) {
  return async (target, exec, next) => {
    let info
    try { info = await stat(target, exec?.signal) } catch { return next() }
    if (info?.type !== 'file' || info.version === undefined) return next()
    let intent
    try {
      intent = await next()
    } catch (error) {
      if (error?.code !== 'FS_NOT_OBSERVED') throw error
      onSync('unread', exec)
      return { version: info.version }
    }
    if (intent?.version !== undefined && intent.version !== info.version) {
      onSync('stale', exec)
      return { ...intent, version: info.version }
    }
    return intent
  }
}

export function apply(ctx, config) {
  const c = { ...DEFAULTS, ...config }
  record({ event: 'loaded', config: c })
  if (!c.enabled || !c.editSync) return
  if (typeof ctx.fs?.stat !== 'function') return record({ event: 'unavailable', reason: 'ctx.fs.stat missing' })
  const onSync = (kind, exec) => record({ event: 'edit-synced', kind, session: exec?.agent?.session?.id })
  ctx.on('fs/edit-intent', syncedEditIntent((target, signal) => ctx.fs.stat(target, signal), onSync), true)
}
