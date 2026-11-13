import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'chat-answer-fix-'))
const { chatFixActive, findHostPackage, generate, patchClient } = await import('../plugins/chat-answer-fix.mjs')
const { patchPresentation } = await import('../plugins/chat-presentation.mjs')
const { resolveConclude } = await import('../plugins/wait-guard.mjs')

test('三处各自只在恰好匹配一次时替换（兼容 rc.2 压缩后的写法）', () => {
  const compressed = 'function latestAnswer(turn){const data=turn.steps.at(-1)?.data.get(`assistant-step`);if(!isFinalAssistant(data)||!hasAssistantReplyContent(data.blocks))return null;return data.blocks.some(block=>block.kind===`tool-call`)?null:data}\nconst CHAT_SETTINGS_NAMESPACE=`ui-chat`;'
  const patched = patchClient(compressed)
  assert.equal(patched.patched, true)
  assert.equal(patched.settings, true)
  assert.equal(patched.closing, true)
  assert.match(patched.text, /turn\.status !== `closed`/)
  assert.match(patched.text, /const CHAT_SETTINGS_NAMESPACE = `runtime-tuning-ui-chat`/)
  assert.match(patched.text, /const last = turn\.steps\.at\(-1\)/)
  // rc.1 的双引号写法（未压缩）照样能改
  const legacy = 'return data.blocks.some((block) => block.kind === "tool-call") ? null : data;\nconst data = turn.steps.at(-1)?.data.get("assistant-step");\nconst CHAT_SETTINGS_NAMESPACE = "ui-chat";'
  const legacyPatched = patchClient(legacy)
  assert.equal(legacyPatched.patched && legacyPatched.settings && legacyPatched.closing, true)
  assert.deepEqual(patchClient('a\nb'), { text: 'a\nb', patched: false, settings: false, closing: false })
  assert.equal(patchClient(`${compressed}${compressed}`).patched, false)
  // 几处互不影响：回答那行找不到时，设置的命名空间照样要换（运行的仍是我们这一行）
  assert.deepEqual(patchClient('const CHAT_SETTINGS_NAMESPACE=`ui-chat`'), { text: 'const CHAT_SETTINGS_NAMESPACE = `runtime-tuning-ui-chat`', patched: false, settings: true, closing: false })
})

test('先按 Node 的模块解析从 dsh 入口找：不是 pnpm 安装（比如 npm 全局装、打包进应用）也能找到', () => {
  const bin = '/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js'
  const fs = { realpathSync: (p) => p, existsSync: () => false, readdirSync: () => [] }
  const resolve = (from, request) => {
    assert.equal(from, bin)
    return `/usr/lib/node_modules/${request}`
  }
  assert.equal(findHostPackage(bin, 'dsh-client-ui-chat', fs, resolve), '/usr/lib/node_modules/@deepseek-ai/dsh-client-ui-chat')
  // 解析不到时不报 Node 的错，接着用下面两种找法；都找不到才报
  assert.throws(() => findHostPackage(bin, 'dsh-client-ui-chat', fs, () => { throw new Error('MODULE_NOT_FOUND') }), /not a pnpm install/)
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

test('L2：从本机正在用的官方聊天界面生成替身，回答与显示补丁分别按契约接入', (t) => {
  const pnpm = join(homedir(), '.local/share/dsh-cli/node_modules/.pnpm')
  const dsh = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(pnpm) || !existsSync(dsh)) return t.skip('host dsh-cli install absent')
  const official = findHostPackage(dsh, 'dsh-client-ui-chat')
  const out = mkdtempSync(join(tmpdir(), 'ui-chat-'))
  const result = generate(official, out)
  assert.equal(result.patched, true)
  assert.equal(result.settings, true)
  assert.equal(result.closing, true)
  const pkg = JSON.parse(readFileSync(join(official, 'package.json'), 'utf8'))
  const generated = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'))
  assert.equal(generated.name, '@deepseek-ai/dsh-client-ui-chat')  // 另外 8 个界面插件按这个名字依赖它
  assert.deepEqual(generated.dsh, pkg.dsh)
  assert.deepEqual(generated.exports, { '.': './index.mjs', './client': './client.js', ...(result.assets ? { './assets/*': './assets/*' } : {}) })
  const before = readFileSync(join(official, 'lib/client.js'), 'utf8')
  const expect = patchClient(before)
  assert.equal(expect.patched, true)
  assert.equal(expect.settings, true)
  assert.equal(expect.closing, true)
  assert.equal(readFileSync(join(out, 'client.js'), 'utf8'), patchPresentation(expect.text).text)
  assert.ok(existsSync(result.officialIndex))
  assert.deepEqual(readdirSync(out).sort(), [...(result.assets ? ['assets'] : []), 'client.js', 'package.json'])
})

test('L2：生成的 latestAnswer 在收尾只补了清单时取前一段正文，其余情况和原来一样', (t) => {
  const dsh = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(dsh)) return t.skip('host dsh-cli install absent')
  const out = mkdtempSync(join(tmpdir(), 'ui-chat-'))
  generate(findHostPackage(dsh, 'dsh-client-ui-chat'), out)
  const client = readFileSync(join(out, 'client.js'), 'utf8')
  const pick = (name) => {
    const at = client.indexOf(`function ${name}(`)
    assert.ok(at >= 0, name)
    let depth = 0
    for (let i = client.indexOf('{', at); ; i++) {
      if (client[i] === '{') depth++
      else if (client[i] === '}' && --depth === 0) return client.slice(at, i + 1)
    }
  }
  const latestAnswer = new Function(`${pick('hasAssistantReplyContent')}\n${pick('isFinalAssistant')}\n${pick('latestAnswer')}\nreturn latestAnswer`)()
  const step = (...blocks) => ({ data: new Map([['assistant-step', { finalNode: {}, blocks }]]) })
  const summary = step({ kind: 'text', text: '总结' })
  const todo = step({ kind: 'reasoning', text: 'x' }, { kind: 'tool-call', name: 'todo_write' })
  assert.equal(latestAnswer({ status: 'closed', steps: [summary, todo] })?.blocks[0].text, '总结')
  assert.equal(latestAnswer({ status: 'open', steps: [summary, todo] }), null)  // 还在跑：不提前显示
  assert.equal(latestAnswer({ status: 'closed', steps: [summary, step({ kind: 'tool-call', name: 'bash' })] }), null)  // 别的工具：照旧
  assert.equal(latestAnswer({ status: 'closed', steps: [summary] })?.blocks[0].text, '总结')
  assert.equal(latestAnswer({ status: 'closed', steps: [todo] }), null)  // 前面没有正文：照旧
})

test('L2：替身能加载官方服务端；用户存在 ui-chat 上的显示设置，只把我们这行还没有的搬过来', async (t) => {
  if (!existsSync(join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js'))) return t.skip('host dsh-cli install absent')
  process.argv[1] = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  const ui = await import('../ui-chat/index.mjs')
  assert.equal(typeof ui.apply, 'function')
  assert.deepEqual([...ui.SETTING_FIELDS].sort(), Object.keys(ui.Config.dict ?? {}).sort())  // 按当前官方 Config 的字段搬
  for (const field of ['transcriptView', 'collapseTiming', 'performanceUsage', 'linkOpening']) assert.ok(ui.SETTING_FIELDS.includes(field))
  const row = (id, config) => ({ options: { id, config } })
  const official = row('ui-chat', { transcriptView: 'standard', linkOpening: 'new-tab' })
  assert.deepEqual(ui.settingsToCarry([official, row('runtime-tuning-ui-chat')]), { transcriptView: 'standard', linkOpening: 'new-tab' })
  // 我们这行已经存过的（之后在界面上改的）不覆盖
  assert.deepEqual(ui.settingsToCarry([official, row('runtime-tuning-ui-chat', { transcriptView: 'compact' })]), { linkOpening: 'new-tab' })
  assert.equal(ui.settingsToCarry([official, row('runtime-tuning-ui-chat', { transcriptView: 'compact', linkOpening: 'sidebar' })]), undefined)
  assert.equal(ui.settingsToCarry([row('runtime-tuning-ui-chat')]), undefined)
  assert.equal(ui.settingsToCarry(undefined), undefined)
  // 新版加载器给迭代器，我们这行排在官方前面也要认出来
  const both = [row('runtime-tuning-ui-chat', { transcriptView: 'standard' }), row('ui-chat', { transcriptView: 'standard' })]
  assert.equal(ui.settingsToCarry(both.values()), undefined)
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

test('刚启动时加载器还在重载事务里（写设置报 nested），过一会儿重试', async (t) => {
  if (!existsSync(join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js'))) return t.skip('host dsh-cli install absent')
  const ui = await import('../ui-chat/index.mjs')
  let calls = 0
  const child = { effect: (fn) => fn(), settings: { configure: () => () => {}, update: async () => { if (++calls === 1) throw new Error('HMR transactions cannot be nested') } } }
  ui.apply({ fiber: {}, inject: (_deps, fn) => fn(child), loader: { await: async () => {}, entries: () => [{ options: { id: 'ui-chat', config: { linkOpening: 'new-tab' } } }, { options: { id: 'runtime-tuning-ui-chat' } }] } })
  await new Promise((r) => setTimeout(r, 700))
  assert.equal(calls, 2)
})

test('替身真的在用才算：补丁打上、官方那行停用、我们这行启用', () => {
  const row = (id, disabled) => ({ options: { id }, disabled })
  assert.equal(chatFixActive([row('ui-chat', true), row('runtime-tuning-ui-chat', false)], true), true)
  assert.equal(chatFixActive([row('ui-chat', true), row('runtime-tuning-ui-chat', false)], false), false)  // 没打上补丁
  assert.equal(chatFixActive([row('ui-chat', false), row('runtime-tuning-ui-chat', true)], true), false)  // 用户按文档关掉了
  assert.equal(chatFixActive([row('ui-chat', false), row('runtime-tuning-ui-chat', false)], true), false)  // 两行都开着
  assert.equal(chatFixActive(undefined, true), false)
})
