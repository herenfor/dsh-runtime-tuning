import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'chat-answer-fix-'))
const { ANCHOR, REPLACEMENT, SETTINGS_ANCHOR, SETTINGS_REPLACEMENT, chatFixActive, findHostPackage, generate, patchClient } = await import('../plugins/chat-answer-fix.mjs')
const { resolveConclude } = await import('../plugins/wait-guard.mjs')

test('只在要改的那一行恰好出现一次时替换', () => {
  assert.deepEqual(patchClient(`a\n${ANCHOR}\n${SETTINGS_ANCHOR}\nb`), { text: `a\n${REPLACEMENT}\n${SETTINGS_REPLACEMENT}\nb`, patched: true, settings: true })
  assert.deepEqual(patchClient('a\nb'), { text: 'a\nb', patched: false, settings: false })
  assert.equal(patchClient(`${ANCHOR}${ANCHOR}`).patched, false)
  // 两处互不影响：回答那行找不到时，设置的命名空间照样要换（运行的仍是我们这一行）
  assert.deepEqual(patchClient(SETTINGS_ANCHOR), { text: SETTINGS_REPLACEMENT, patched: false, settings: true })
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

test('L2：从本机正在用的官方聊天界面生成替身，只差那两行', (t) => {
  const pnpm = join(homedir(), '.local/share/dsh-cli/node_modules/.pnpm')
  const dsh = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(pnpm) || !existsSync(dsh)) return t.skip('host dsh-cli install absent')
  const official = findHostPackage(dsh, 'dsh-client-ui-chat')
  const out = mkdtempSync(join(tmpdir(), 'ui-chat-'))
  const result = generate(official, out)
  assert.equal(result.patched, true)
  assert.equal(result.settings, true)
  const pkg = JSON.parse(readFileSync(join(official, 'package.json'), 'utf8'))
  const generated = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'))
  assert.equal(generated.name, '@deepseek-ai/dsh-client-ui-chat')  // 另外 8 个界面插件按这个名字依赖它
  assert.deepEqual(generated.dsh, pkg.dsh)
  assert.deepEqual(generated.exports, { '.': './index.mjs', './client': './client.js' })
  const before = readFileSync(join(official, 'lib/client.js'), 'utf8')
  assert.equal(readFileSync(join(out, 'client.js'), 'utf8'), before.replace(ANCHOR, REPLACEMENT).replace(SETTINGS_ANCHOR, SETTINGS_REPLACEMENT))
  assert.ok(existsSync(result.officialIndex))
  assert.deepEqual(readdirSync(out).sort(), ['client.js', 'package.json'])
})

test('L2：替身能加载官方服务端；用户存在 ui-chat 上的显示设置，只把我们这行还没有的搬过来', async (t) => {
  if (!existsSync(join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js'))) return t.skip('host dsh-cli install absent')
  process.argv[1] = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  const ui = await import('../ui-chat/index.mjs')
  assert.equal(typeof ui.apply, 'function')
  assert.deepEqual(Object.keys(ui.Config.dict ?? {}).sort(), [...ui.SETTING_FIELDS].sort())  // 官方显示设置字段没变
  const row = (id, config) => ({ options: { id, config } })
  const official = row('ui-chat', { transcriptView: 'standard', linkOpening: 'new-tab' })
  assert.deepEqual(ui.settingsToCarry([official, row('runtime-tuning-ui-chat')]), { transcriptView: 'standard', linkOpening: 'new-tab' })
  // 我们这行已经存过的（之后在界面上改的）不覆盖
  assert.deepEqual(ui.settingsToCarry([official, row('runtime-tuning-ui-chat', { transcriptView: 'compact' })]), { linkOpening: 'new-tab' })
  assert.equal(ui.settingsToCarry([official, row('runtime-tuning-ui-chat', { transcriptView: 'compact', linkOpening: 'sidebar' })]), undefined)
  assert.equal(ui.settingsToCarry([row('runtime-tuning-ui-chat')]), undefined)
  assert.equal(ui.settingsToCarry(undefined), undefined)
})

test('启动后通过 DSH 的设置接口写到我们这一行，只写一次需要的字段', async (t) => {
  if (!existsSync(join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js'))) return t.skip('host dsh-cli install absent')
  const ui = await import('../ui-chat/index.mjs')
  const updates = []
  const fake = (entries) => {
    const child = { effect: (fn) => fn(), settings: { configure: () => () => {}, update: async (ns, patch) => { updates.push([ns, patch]) } } }
    return { fiber: {}, inject: (_deps, fn) => fn(child), loader: { await: async () => {}, entries: () => entries } }
  }
  ui.apply(fake([{ options: { id: 'ui-chat', config: { transcriptView: 'standard' } } }, { options: { id: 'runtime-tuning-ui-chat' } }]))
  ui.apply(fake([{ options: { id: 'ui-chat', config: { transcriptView: 'standard' } } }, { options: { id: 'runtime-tuning-ui-chat', config: { transcriptView: 'verbose' } } }]))
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(updates, [['runtime-tuning-ui-chat', { transcriptView: 'standard' }]])
})

test('替身真的在用才算：补丁打上、官方那行停用、我们这行启用', () => {
  const row = (id, disabled) => ({ options: { id }, disabled })
  assert.equal(chatFixActive([row('ui-chat', true), row('runtime-tuning-ui-chat', false)], true), true)
  assert.equal(chatFixActive([row('ui-chat', true), row('runtime-tuning-ui-chat', false)], false), false)  // 没打上补丁
  assert.equal(chatFixActive([row('ui-chat', false), row('runtime-tuning-ui-chat', true)], true), false)  // 用户按文档关掉了
  assert.equal(chatFixActive([row('ui-chat', false), row('runtime-tuning-ui-chat', false)], true), false)  // 两行都开着
  assert.equal(chatFixActive(undefined, true), false)
})
