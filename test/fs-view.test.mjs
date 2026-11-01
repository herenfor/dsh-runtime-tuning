import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'fs-view-'))
const { syncedEditIntent, apply } = await import('../plugins/fs-view.mjs')
const { findHostPackage } = await import('../plugins/chat-answer-fix.mjs')

const fsError = (code) => Object.assign(new Error(code), { code })
// 和 cordis 的 waterfall 一样：依次调用，每个处理器拿到 next
const waterfall = (cbs, ...args) => { const list = [...cbs]; const next = () => (list.shift() ?? (() => undefined))(...args, next); return next() }
const file = (version) => async () => ({ type: 'file', version, size: 1 })

test('未读过的文件：返回当前版本，记一次 unread', async () => {
  const synced = []
  const h = syncedEditIntent(file('v2'), (kind) => synced.push(kind))
  const intent = await waterfall([h, () => { throw fsError('FS_NOT_OBSERVED') }], { targetKey: 'a' }, {})
  assert.deepEqual(intent, { version: 'v2' })
  assert.deepEqual(synced, ['unread'])
})

test('读后被改过：版本换成当前的，记一次 stale', async () => {
  const synced = []
  const h = syncedEditIntent(file('v2'), (kind) => synced.push(kind))
  assert.deepEqual(await waterfall([h, () => ({ version: 'v1' })], {}, {}), { version: 'v2' })
  assert.deepEqual(synced, ['stale'])
})

test('版本一致、文件不存在、其他错误：原样放行', async () => {
  const synced = []
  const on = (kind) => synced.push(kind)
  assert.deepEqual(await waterfall([syncedEditIntent(file('v1'), on), () => ({ version: 'v1' })], {}, {}), { version: 'v1' })
  await assert.rejects(waterfall([syncedEditIntent(async () => undefined, on), () => { throw fsError('FS_NOT_OBSERVED') }], {}, {}), /FS_NOT_OBSERVED/)
  await assert.rejects(waterfall([syncedEditIntent(file('v1'), on), () => { throw fsError('FS_NOT_FOUND') }], {}, {}), /FS_NOT_FOUND/)
  assert.deepEqual(synced, [])
})

test('apply 用 prepend 注册在 fs/edit-intent 上；关掉 editSync 不注册', () => {
  const hooks = []
  apply({ fs: { stat: file('v') }, on: (...a) => hooks.push(a) }, {})
  assert.equal(hooks.length, 1)
  assert.equal(hooks[0][0], 'fs/edit-intent')
  assert.equal(hooks[0][2], true)
  const none = []
  apply({ fs: { stat: file('v') }, on: (...a) => none.push(a) }, { editSync: false })
  assert.equal(none.length, 0)
})

test('L2：排在本机 DSH 的 fs-observation-policy 前面时，未读和读后变了都能通过', async (t) => {
  const dsh = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(dsh)) return t.skip('host dsh-cli install absent')
  const policy = await import(pathToFileURL(join(findHostPackage(dsh, 'dsh-fs-observation-policy'), 'lib/index.js')).href)
  const handlers = {}
  policy.apply({ effect: () => {}, on: (event, cb) => { handlers[event] = cb } })
  const exec = { agent: { session: {} } }
  const target = { targetKey: 'k', displayPath: 'f.txt' }
  const ours = syncedEditIntent(file('v2'), () => {})
  // 官方处理器单独跑：未读过就拒绝
  await assert.rejects(waterfall([handlers['fs/edit-intent']], target, exec), (e) => e.code === 'FS_NOT_OBSERVED')
  assert.deepEqual(await waterfall([ours, handlers['fs/edit-intent']], target, exec), { version: 'v2' })
  handlers['fs/observed'](target, { kind: 'present', version: 'v1' }, exec)
  assert.deepEqual(await waterfall([ours, handlers['fs/edit-intent']], target, exec), { version: 'v2' })
})
