import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { TEXT, apply } from '../plugins/collaboration-prompt.mjs'

test('collaboration guidance applies to the user-facing agent without replacing other sections', () => {
  let section
  apply({ systemPrompt: { getSectionOrder: () => 0, section: value => { section = value } } })
  assert.equal(section.order, 1)
  assert.equal(section.complete, undefined)
  assert.equal(section.text({ agent: { session: { header: { delegationDepth: 0 } } } }), TEXT)
  assert.equal(section.text({ agent: { session: { header: { delegationDepth: 1 } } } }), '')
})

test('the collaborative preset retains every official standard row, group isolation and built-in skill', async t => {
  const entry = process.env.DSH_BIN ?? join(homedir(), '.local/bin/dsh')
  if (!existsSync(entry)) return t.skip('host DSH is absent')
  const old = process.argv[1]; process.argv[1] = entry
  try {
    const { standardComposition, buildCollaborativeConfig } = await import('../plugins/collaborative-preset.mjs')
    const official = standardComposition(), before = JSON.stringify(official.plugins)
    const ours = buildCollaborativeConfig({}, official)
    assert.equal(ours.id, 'collaborative')
    const flatten = rows => rows.flatMap(row => [row, ...(row.group ? flatten(row.config) : [])])
    const expected = flatten(official.plugins), actual = flatten(ours.plugins)
    assert.equal(actual.length, expected.length + 3)
    for (const row of expected) {
      const next = actual.find(candidate => candidate.id === row.id)
      assert.ok(next, row.id)
      if (['skill-filesystem', 'tool-fs-search'].includes(row.id)) continue
      if (row.group) { assert.deepEqual(next.isolate, row.isolate); continue }
      assert.deepEqual(next, row, row.id)
    }
    assert.deepEqual(actual.find(r => r.id === 'skill-filesystem'), expected.find(r => r.id === 'skill-filesystem'), 'official skill expressions retain their original declaration base URL')
    assert.match(actual.find(r => r.id === 'tool-fs-search').name, /grep-enhanced\.mjs$/)
    assert.equal(actual.find(r => r.id === 'compaction-basic').name, '@deepseek-ai/dsh-compaction-basic', 'compaction-effort stays disabled by default (rc.5 fixed upstream)')
    const optedIn = buildCollaborativeConfig({ compactionEffort: true }, official)
    const optedInFlat = flatten(optedIn.plugins)
    assert.match(optedInFlat.find(r => r.id === 'compaction-basic').name, /compaction-effort\.mjs$/)
    assert.equal(flatten(buildCollaborativeConfig({ plugins: optedIn.plugins, compactionEffort: false }, official).plugins).find(r => r.id === 'compaction-basic').name, '@deepseek-ai/dsh-compaction-basic')
    assert.equal(JSON.stringify(official.plugins), before, 'never mutate the original composition')
    assert.deepEqual(buildCollaborativeConfig({ enhancedGrep: false }, official).plugins.find(r => r.id === 'tool-fs-search'), official.plugins.find(r => r.id === 'tool-fs-search'))
    const custom = buildCollaborativeConfig({ plugins: [{ id: 'tool-fs-search', name: 'custom-search' }, { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem', config: { customSkillDirs: ['/custom/skills'] } }] }, official)
    assert.equal(custom.plugins[0].name, 'custom-search')
    assert.deepEqual(custom.plugins[1].config.customSkillDirs, ['/custom/skills'])
    const rollback = buildCollaborativeConfig({ plugins: ours.plugins, enhancedGrep: false }, official)
    assert.equal(rollback.plugins.find(r => r.id === 'tool-fs-search').name, '@deepseek-ai/dsh-tool-fs-search')
  } finally { process.argv[1] = old }
})
