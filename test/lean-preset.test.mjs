import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'lean-'))
const { findHostPackage } = await import('../plugins/chat-answer-fix.mjs')
const { TEXT, apply } = await import('../plugins/lean-prompt.mjs')

const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const lean = patch.slice(patch.indexOf('- id: runtime-tuning-preset-lean'))

test('lean-prompt 只加一段执行规则', () => {
  const sections = []
  apply({ systemPrompt: { section: (s) => sections.push(s), getSectionOrder: () => 10 } })
  assert.deepEqual(sections, [{ name: 'dsh-lean-execution', order: 12, text: TEXT }])
  assert.match(TEXT, /parallel tool calls/)
})

test('精简预设去掉了定时、goal、计划模式、workflow 和 subagent_fork', () => {
  for (const gone of ['dsh-tool-schedule', 'dsh-tool-goal', 'dsh-command-goal', 'dsh-plan-mode', 'dsh-tool-workflow', 'dsh-workflow-ptc', 'provider: fork']) assert.equal(lean.includes(gone), false, gone)
  assert.match(lean, /name: dsh-runtime-tuning\/plugins\/lean-prompt\.mjs/)
})

test('L2：预设引用的官方包在本机 DSH 里都存在（含子路径导出）', (t) => {
  const dsh = join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (!existsSync(dsh)) return t.skip('host dsh-cli install absent')
  const names = [...lean.matchAll(/name: '@deepseek-ai\/([a-z0-9-]+)(\/[a-z0-9-]+)?'/g)]
  assert.ok(names.length >= 18)
  for (const [, pkg, sub] of names) {
    const dir = findHostPackage(dsh, pkg)
    const exports = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).exports ?? {}
    if (sub !== undefined) assert.ok(exports[`.${sub}`] !== undefined, `${pkg}${sub}`)
  }
})
