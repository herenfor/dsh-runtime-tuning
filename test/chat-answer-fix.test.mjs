import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'chat-answer-fix-'))
const { ANCHOR, REPLACEMENT, chatFixActive, findHostPackage, generate, patchClient } = await import('../plugins/chat-answer-fix.mjs')
const { resolveConclude } = await import('../plugins/wait-guard.mjs')

test('只在要改的那一行恰好出现一次时替换', () => {
  assert.deepEqual(patchClient(`a\n${ANCHOR}\nb`), { text: `a\n${REPLACEMENT}\nb`, patched: true })
  assert.deepEqual(patchClient('a\nb'), { text: 'a\nb', patched: false })
  assert.equal(patchClient(`${ANCHOR}${ANCHOR}`).patched, false)
})

test('先用 dsh 旁边链接的那一份，没有再在仓库里找唯一的一份', () => {
  const bin = '/s/.pnpm/@deepseek-ai+dsh@1_x/node_modules/@deepseek-ai/dsh/lib/bin.js'
  const sibling = '/s/.pnpm/@deepseek-ai+dsh@1_x/node_modules/@deepseek-ai/dsh-client-ui-chat'
  const linked = { realpathSync: (p) => (p === sibling ? '/s/.pnpm/chat@new' : p), existsSync: (p) => p === sibling, readdirSync: () => [] }
  assert.equal(findHostPackage(bin, 'dsh-client-ui-chat', linked), '/s/.pnpm/chat@new')
  const scan = (names) => ({ realpathSync: (p) => p, existsSync: () => false, readdirSync: () => names })
  assert.equal(findHostPackage(bin, 'dsh-client-ui-chat', scan(['@deepseek-ai+dsh-client-ui-chat@1_y'])),
    '/s/.pnpm/@deepseek-ai+dsh-client-ui-chat@1_y/node_modules/@deepseek-ai/dsh-client-ui-chat')
  assert.equal(findHostPackage(bin, 'dsh-client-ui-chat', scan(['@deepseek-ai+dsh-client-ui-chat@0_old', '@deepseek-ai+dsh-client-ui-chat@1_new'])),
    '/s/.pnpm/@deepseek-ai+dsh-client-ui-chat@1_new/node_modules/@deepseek-ai/dsh-client-ui-chat')  // 与 dsh@1 同版本
  assert.throws(() => findHostPackage(bin, 'dsh-client-ui-chat', scan(['@deepseek-ai+dsh-client-ui-chat@2_a', '@deepseek-ai+dsh-client-ui-chat@3_b'])), /found 0/)
})

test('concludeTurn: auto 只在补丁打上时结束本轮', () => {
  assert.equal(resolveConclude('auto', () => true), true)
  assert.equal(resolveConclude('auto', () => false), false)
  assert.equal(resolveConclude(true, () => false), true)
  assert.equal(resolveConclude(false, () => true), false)
})

test('L2：从本机正在用的官方聊天界面生成替身，只差那一行', (t) => {
  const pnpm = join(homedir(), '.local/share/dsh-cli/node_modules/.pnpm')
  const dsh = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(pnpm) || !existsSync(dsh)) return t.skip('host dsh-cli install absent')
  const official = findHostPackage(dsh, 'dsh-client-ui-chat')
  const out = mkdtempSync(join(tmpdir(), 'ui-chat-'))
  const result = generate(official, out)
  assert.equal(result.patched, true)
  const pkg = JSON.parse(readFileSync(join(official, 'package.json'), 'utf8'))
  const generated = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'))
  assert.equal(generated.name, '@deepseek-ai/dsh-client-ui-chat')  // 另外 8 个界面插件按这个名字依赖它
  assert.deepEqual(generated.dsh, pkg.dsh)
  assert.deepEqual(generated.exports, { '.': './index.mjs', './client': './client.js' })
  const before = readFileSync(join(official, 'lib/client.js'), 'utf8')
  assert.equal(readFileSync(join(out, 'client.js'), 'utf8'), before.replace(ANCHOR, REPLACEMENT))
  assert.ok(existsSync(result.officialIndex))
  assert.deepEqual(readdirSync(out).sort(), ['client.js', 'package.json'])
})

test('L2：替身能加载官方服务端，并把写在 ui-chat 上的配置转交过去', async (t) => {
  if (!existsSync(join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js'))) return t.skip('host dsh-cli install absent')
  process.argv[1] = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  const ui = await import('../ui-chat/index.mjs')
  assert.equal(typeof ui.apply, 'function')
  assert.deepEqual(ui.configOf([{ options: { id: 'x' } }, { options: { id: 'ui-chat', config: { transcriptView: 'standard' } } }]), { transcriptView: 'standard' })
  assert.equal(ui.configOf([]), undefined)
  assert.doesNotThrow(() => ui.Config({ transcriptView: 'standard' }))  // 和加载器一样先过官方 schema
})

test('替身真的在用才算：补丁打上、官方那行停用、我们这行启用', () => {
  const row = (id, disabled) => ({ options: { id }, disabled })
  assert.equal(chatFixActive([row('ui-chat', true), row('runtime-tuning-ui-chat', false)], true), true)
  assert.equal(chatFixActive([row('ui-chat', true), row('runtime-tuning-ui-chat', false)], false), false)  // 没打上补丁
  assert.equal(chatFixActive([row('ui-chat', false), row('runtime-tuning-ui-chat', true)], true), false)  // 用户按文档关掉了
  assert.equal(chatFixActive([row('ui-chat', false), row('runtime-tuning-ui-chat', false)], true), false)  // 两行都开着
  assert.equal(chatFixActive(undefined, true), false)
})
