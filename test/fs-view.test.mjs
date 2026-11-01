import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'fs-view-'))
const { syncedEditIntent, apply, sniffImage, imageMismatch } = await import('../plugins/fs-view.mjs')
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
  const edit = hooks.filter((h) => h[0] === 'fs/edit-intent')
  assert.equal(edit.length, 1)
  assert.equal(edit[0][2], true)
  const none = []
  apply({ fs: { stat: file('v') }, on: (...a) => none.push(a) }, { editSync: false })
  assert.equal(none.filter((h) => h[0] === 'fs/edit-intent').length, 0)
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

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

test('按文件头认格式；扩展名一致、认不出、相对路径不算不一致', () => {
  assert.equal(sniffImage(JPEG), 'jpeg')
  assert.equal(sniffImage(PNG), 'png')
  assert.equal(sniffImage(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1')), 'webp')
  assert.equal(sniffImage(Buffer.from('hello')), undefined)
  assert.equal(imageMismatch('/x/a.png', () => JPEG), 'jpeg')
  assert.equal(imageMismatch('/x/a.JPG', () => JPEG), undefined)
  assert.equal(imageMismatch('/x/a.png', () => Buffer.from('hello')), undefined)
  assert.equal(imageMismatch('a.png', () => JPEG), undefined)
  assert.equal(imageMismatch('/x/a', () => JPEG), undefined)
})

test('read_image 读 .png 名字的 JPEG：换成 .jpg 副本去读，结果里是原路径，读完副本删掉', async () => {
  const hooks = {}
  apply({ fs: { stat: file('v') }, on: (name, fn) => { hooks[name] = fn } }, {})
  const path = join(mkdtempSync(join(tmpdir(), 'fs-view-img-')), 'shot.png')
  writeFileSync(path, JPEG)
  const exec = { name: 'read_image', arguments: { file_path: path } }
  let seen
  const result = await hooks['tools/execute'](exec, async () => {
    seen = exec.arguments.file_path
    assert.deepEqual(readFileSync(seen), JPEG)
    return { content: [{ type: 'text', text: `<path>${seen}</path>` }], data: JPEG }
  })
  assert.match(seen, /shot\.jpg$/)
  assert.equal(result.content[0].text, `<path>${path}</path>`)
  assert.equal(result.data, JPEG)
  assert.equal(existsSync(seen), false)
  const ok = { name: 'read_image', arguments: { file_path: path.replace('.png', '.jpg') } }
  writeFileSync(ok.arguments.file_path, JPEG)
  const before = ok.arguments.file_path
  await hooks['tools/execute'](ok, async () => ({}))
  assert.equal(ok.arguments.file_path, before)
})
