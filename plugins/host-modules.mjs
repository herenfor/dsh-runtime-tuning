import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { findHostPackage } from './chat-answer-fix.mjs'

const SELF_ANCHOR = fileURLToPath(import.meta.url)

/** Read optional Cordis `profileContext` service without adding a hard inject requirement. */
export function readProfileContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return undefined
  if (typeof ctx.get === 'function') {
    try {
      const pc = ctx.get('profileContext')
      if (pc && typeof pc === 'object') return pc
    } catch {}
  }
  try {
    const pc = ctx.profileContext
    if (pc && typeof pc === 'object') return pc
  } catch {}
  return undefined
}

/** Collect ordered host resolution anchors, preferring `ctx.profileContext.installAnchor`. */
export function hostAnchors(ctxOrEntry) {
  if (typeof ctxOrEntry === 'string') {
    return ctxOrEntry ? [ctxOrEntry] : [process.argv[1], SELF_ANCHOR].filter(Boolean)
  }
  const raw = []
  if (Array.isArray(ctxOrEntry)) {
    raw.push(...ctxOrEntry)
  } else {
    const pc = readProfileContext(ctxOrEntry)
    if (pc?.installAnchor) raw.push(pc.installAnchor)
    if (pc?.dir) raw.push(join(pc.dir, 'package.json'))
    if (process.env.DSH_INSTALL_ANCHOR) raw.push(process.env.DSH_INSTALL_ANCHOR)
    if (process.argv[1]) raw.push(process.argv[1])
    raw.push(SELF_ANCHOR)
  }
  return [...new Set(raw.filter((x) => typeof x === 'string' && x.length > 0))]
}

export const hostDirectory = (name, ctxOrEntry) => findHostPackage(hostAnchors(ctxOrEntry), name)
export function hostImport(name, ctxOrEntry) {
  const directory = hostDirectory(name, ctxOrEntry)
  return import(pathToFileURL(createRequire(join(directory, 'package.json')).resolve(`@deepseek-ai/${name}`)).href)
}
