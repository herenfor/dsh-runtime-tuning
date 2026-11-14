import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'tuned-'))
const { findHostPackage } = await import('../plugins/chat-answer-fix.mjs')
const { TEXT, apply, resolvePresetConfig } = await import('../plugins/tool-use-prompt.mjs')

const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const tuned = patch.slice(patch.indexOf('- id: runtime-tuning-preset-tuned'))

test('tool-use-prompt 只加一段工具使用规则，不限制思考', () => {
  const sections = []
  apply({ systemPrompt: { section: (s) => sections.push(s), getSectionOrder: () => 10 } })
  assert.deepEqual(sections, [{ name: 'dsh-runtime-tuning-tool-use', order: 12, text: TEXT }])
  assert.match(TEXT, /parallel tool calls/)
  assert.match(TEXT, /not about thinking less/)
  assert.doesNotMatch(TEXT, /as few steps/)
})

test('调优预设去掉了定时、goal、计划模式、workflow 和 subagent_fork', () => {
  for (const gone of ['dsh-tool-schedule', 'dsh-tool-goal', 'dsh-command-goal', 'dsh-plan-mode', 'dsh-tool-workflow', 'dsh-workflow-ptc', 'provider: fork']) assert.equal(tuned.includes(gone), false, gone)
  assert.match(tuned, /name: '@herenfor\/dsh-tune\/plugins\/tool-use-prompt\.mjs'/)
})

test('L2：预设引用的官方包在本机 DSH 里都存在（含子路径导出）', (t) => {
  const dsh = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(dsh)) return t.skip('host dsh-cli install absent')
  const names = [...tuned.matchAll(/name: '@deepseek-ai\/([a-z0-9-]+)(\/[a-z0-9-]+)?'/g)]
  assert.ok(names.length >= 18)
  for (const [, pkg, sub] of names) {
    const dir = findHostPackage(dsh, pkg)
    const exports = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).exports ?? {}
    if (sub !== undefined) assert.ok(exports[`.${sub}`] !== undefined, `${pkg}${sub}`)
  }
})

test('调优预设默认关闭（会话绑定预设，用的人自己打开）', () => {
  assert.match(tuned, /^- id: runtime-tuning-preset-tuned\n      name: \.\/plugins\/tuned-preset\.mjs\n      disabled: true\n/)
})

// 手写的预设不会跟着官方变：本机 DSH 的 standard 一改，这里就报出来，按报出的差异手动更新 cordis.patch.yml。
test('L2：调优预设与本机 DSH 的 standard 只差有意去掉和加上的几项', (t) => {
  const dsh = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(dsh)) return t.skip('host dsh-cli install absent')
  const { parse } = createRequire(join(findHostPackage(dsh, 'dsh-config-editor'), 'package.json'))('yaml')
  const load = (text) => parse(text, { customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (v) => `!!js ${v}` }] })
  const presetOf = (layer, id) => layer.flatMap((row) => row.insert ?? [row]).find((row) => row.config?.id === id).config.plugins
  const flat = (rows, out = new Map()) => {
    for (const { config, ...row } of rows ?? []) {
      if (row.group) flat(config, out)
      out.set(row.id, JSON.stringify(row.group ? row : { ...row, config }))
    }
    return out
  }
  const standard = flat(presetOf(load(readFileSync(join(findHostPackage(dsh, 'dsh-web-app'), 'presets/standard.patch.yml'), 'utf8')), 'standard'))
  const ours = flat(presetOf(load(patch), 'tuned'))
  const removed = ['tool-schedule', 'command-goal', 'tool-goal', 'planning', 'plan-mode', 'tool-subagent-fork', 'workflow-ptc', 'tool-workflow']
  // standard 的 skill-filesystem.customSkillDirs 用声明文件里的 baseUrl 解析 @deepseek-ai/dsh-agent-preset/skills；
  // 调优预设声明在插件包里，照抄会在挂载时解析失败。调优模式因此没有 dsh-doc 技能，其余配置必须一致。
  const withoutSkillDirs = (row) => {
    const value = JSON.parse(row)
    if (value.config) {
      delete value.config.customSkillDirs
      if (Object.keys(value.config).length === 0) delete value.config
    }
    return JSON.stringify(value)
  }
  const drift = []
  for (const [id, row] of standard) {
    if (removed.includes(id)) continue
    const same = id === 'skill-filesystem' ? withoutSkillDirs(row) === ours.get(id) : ours.get(id) === row
    if (!same) drift.push(`${id}\n  standard: ${row}\n  tuned:    ${ours.get(id)}`)
  }
  for (const id of ours.keys()) if (!standard.has(id) && id !== 'tool-use-prompt') drift.push(`${id} 只在调优预设里`)
  for (const id of removed) if (!standard.has(id)) drift.push(`${id} 已不在 standard 里，去掉的清单要更新`)
  assert.deepEqual(drift, [], `DSH 的 standard 变了，按下面的差异更新调优预设：\n${drift.join('\n')}`)
})


test('upgrade keeps the preset definition and anchors its own child independently of dependency aliases', () => {
  for (const name of ['@herenfor/dsh-tune/plugins/tool-use-prompt.mjs', 'dsh-runtime-tuning/plugins/tool-use-prompt.mjs']) {
    const config = { id: 'tuned', name: 'My tuning', order: 2, plugins: [{ id: 'tool-use-prompt', name }, { id: 'custom', name: 'user-custom-plugin', config: { enabled: true } }] }
    const url = 'file:///installed-under-old-alias/plugins/tool-use-prompt.mjs'
    const actual = resolvePresetConfig(config, url)
    assert.equal(actual.id, config.id); assert.equal(actual.name, config.name)
    assert.equal(actual.plugins[0].name, url)
    assert.equal(config.plugins[0].name, name)
    assert.equal(actual.plugins[1], config.plugins[1])
  }
  const custom = { plugins: [{ id: 'tool-use-prompt', name: 'user-replacement' }] }
  assert.equal(resolvePresetConfig(custom).plugins[0], custom.plugins[0])
})
