import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'preset-prompt-'))
const { rewrite, presetOf, apply, UNIFIED_JOBS_TEXT, JOBS_SECTION, WAIT_GUARD_SECTION } = await import('../plugins/preset-prompt.mjs')

const assembly = (...names) => ({ sections: names.map((name) => ({ name, text: `${name} text` })), contexts: [], tools: [], variables: {} })

test('两段都在：tool:jobs 换成合并后的说法，wait-guard 段落去掉，其他段落不动', () => {
  const out = rewrite(assembly('persona', JOBS_SECTION, WAIT_GUARD_SECTION, 'tool:web'))
  assert.deepEqual(out.sections.map((s) => s.name), ['persona', JOBS_SECTION, 'tool:web'])
  assert.equal(out.sections[1].text, UNIFIED_JOBS_TEXT)
  assert.equal(out.sections[0].text, 'persona text')
})

test('没装 wait-guard：原样返回；没有 tool:jobs：把 wait-guard 段落换成合并说法', () => {
  const plain = assembly('persona', JOBS_SECTION)
  assert.equal(rewrite(plain), plain)
  const out = rewrite(assembly('persona', WAIT_GUARD_SECTION))
  assert.deepEqual(out.sections.map((s) => s.name), ['persona', WAIT_GUARD_SECTION])
  assert.equal(out.sections[1].text, UNIFIED_JOBS_TEXT)
})

test('presetOf：以会话开始前切换后的预设为准，读不到时退回创建时的预设', () => {
  const agent = { session: { header: { agentPreset: 'standard' } } }
  assert.equal(presetOf(agent, { stateOf: () => 'runtime-tuning' }), 'runtime-tuning')
  assert.equal(presetOf(agent, { stateOf: () => undefined }), 'standard')
  assert.equal(presetOf(agent, { stateOf: () => { throw new Error('no unit') } }), 'standard')
  assert.equal(presetOf(agent, undefined), 'standard')
})

function fakeHost(preset, depth = 0) {
  const hostHandlers = {}, agentHandlers = {}
  const ctx = {
    on: (name, fn) => { hostHandlers[name] = fn },
    get: (name) => (name === 'sessionProjections' ? { stateOf: () => preset } : undefined),
  }
  apply(ctx)
  const agent = { id: 's', session: { header: { delegationDepth: depth } }, ctx: { on: (name, fn) => { agentHandlers[name] = fn } } }
  hostHandlers['agent/created']({ agent })
  return (input) => agentHandlers['system-prompt/assemble']?.(input, {}, async () => input)
}

test('只改写 runtime-tuning 预设的顶层会话', async () => {
  const input = assembly(JOBS_SECTION, WAIT_GUARD_SECTION)
  assert.equal((await fakeHost('runtime-tuning')(input)).sections.length, 1)
  assert.equal(await fakeHost('standard')(input), input)
  assert.equal(fakeHost('runtime-tuning', 1)(input), undefined)  // 子代理不挂改写
})
