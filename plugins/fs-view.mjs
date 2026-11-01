// fs-view：让模型以为的文件状态和实际一致，能在 runtime 里办成的就不让模型撞错再重来。
// editSync：edit 前 DSH 的 fs-observation-policy 要求文件读过、且读后没变，否则报 FS_NOT_OBSERVED / FS_STALE_VERSION。
// 77 个会话里这样失败了 46 次，大多是模型先用 bash 的 sed / grep 看过（不算读过）或用 python / sed -i 改过（版本变了）。
// edit 按 old_string 精确替换、还要求唯一，原文对不上照样失败，所以这里把期望版本换成文件的当前版本，省掉"读一遍再重试"那一步。
// write 是整文件覆盖，没有这层校验，不动它。
// imageSniff：read_image 先按扩展名定格式，字节对不上就拒绝（curl 下来的 JPEG 存成 .png 很常见），模型得改名再读。
// 这里按文件头判断真实格式，不一致时复制一份扩展名正确的副本给它读，读完删掉；结果里的路径换回原文件。
import { randomUUID } from 'node:crypto'
import { copyFileSync, mkdirSync, openSync, readSync, closeSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, isAbsolute, join } from 'node:path'
import { createRecorder } from './log.mjs'
import { replaceInStrings } from './session-tmp.mjs'

export const name = 'dsh-runtime-tuning-fs-view'
export const inject = ['fs']

const DEFAULTS = { enabled: true, editSync: true, imageSniff: true }
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

const EXTENSIONS = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif', '.webp': 'webp' }
const PREFERRED = { png: '.png', jpeg: '.jpg', gif: '.gif', webp: '.webp' }

/** 按文件头认 PNG / JPEG / GIF / WebP，认不出返回 undefined。 */
export function sniffImage(head) {
  if (head.length >= 4 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'png'
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg'
  if (head.length >= 4 && head.toString('latin1', 0, 4) === 'GIF8') return 'gif'
  if (head.length >= 12 && head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  return undefined
}

const readHead = (path) => {
  const fd = openSync(path, 'r')
  try { const buf = Buffer.alloc(16); return buf.subarray(0, readSync(fd, buf, 0, 16, 0)) } finally { closeSync(fd) }
}

/** 扩展名声明的格式和文件头不一致时返回真实格式；一致、认不出、不是绝对路径都返回 undefined。 */
export function imageMismatch(path, head = readHead) {
  if (typeof path !== 'string' || !isAbsolute(path)) return undefined
  const declared = EXTENSIONS[extname(path).toLowerCase()]
  if (declared === undefined) return undefined
  let actual
  try { actual = sniffImage(head(path)) } catch { return undefined }
  return actual !== undefined && actual !== declared ? actual : undefined
}

export function apply(ctx, config) {
  const c = { ...DEFAULTS, ...config }
  record({ event: 'loaded', config: c })
  if (!c.enabled) return
  if (c.imageSniff) ctx.on('tools/execute', async (exec, next) => {
    let original, copy
    try {
      const path = exec.name === 'read_image' ? exec.arguments?.file_path : undefined
      const actual = imageMismatch(path)
      if (actual !== undefined) {
        const dir = join(tmpdir(), `dsh-fs-view-${process.getuid?.() ?? 'user'}`, randomUUID())
        mkdirSync(dir, { recursive: true, mode: 0o700 })
        copy = join(dir, basename(path, extname(path)) + PREFERRED[actual])
        copyFileSync(path, copy)
        original = path
        exec.arguments = { ...exec.arguments, file_path: copy }
        record({ event: 'image-retyped', from: extname(path).toLowerCase(), to: actual, session: exec.agent?.session?.id })
      }
    } catch (error) {
      record({ event: 'sniff-failed', error: String(error) })
    }
    if (copy === undefined) return next()
    try {
      return replaceInStrings(await next(), copy, original)
    } finally {
      rmSync(join(copy, '..'), { recursive: true, force: true })
    }
  })
  if (!c.editSync) return
  if (typeof ctx.fs?.stat !== 'function') return record({ event: 'unavailable', reason: 'ctx.fs.stat missing' })
  const onSync = (kind, exec) => record({ event: 'edit-synced', kind, session: exec?.agent?.session?.id })
  ctx.on('fs/edit-intent', syncedEditIntent((target, signal) => ctx.fs.stat(target, signal), onSync), true)
}
