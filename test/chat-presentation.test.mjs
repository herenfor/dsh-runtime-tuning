import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { patchPresentation } from '../plugins/chat-presentation.mjs'
const table = 'className:AssistantMarkdown_module_css_default.body,children:'
const detail = 'ctx.slots.register({name:`conversation.approval.detail`},ApprovalCommand)'
const apply = 'function apply(ctx){'
test('presentation patches are independent and each needs one exact anchor', () => {
  const p = patchPresentation(apply + table + detail)
  assert.equal(p.tables, true); assert.equal(p.approval, true)
  assert.equal(patchPresentation(apply + table + table + detail).tables, false)
  assert.equal(patchPresentation(apply + table + detail + detail).approval, false)
  assert.equal(patchPresentation(apply + table).tables, true)
  assert.deepEqual(patchPresentation(table + detail), { text: table + detail, tables: false, approval: false })
})
test('installed rc3 bundle retains native approval policy and passes JavaScript parsing', t => {
  const file = '/home/s/dshwsl-desk/dsh-rc3/node_modules/@deepseek-ai/dsh-client-ui-chat/lib/client.js'
  if (!existsSync(file)) return t.skip('rc3 host absent')
  const original = readFileSync(file, 'utf8'), p = patchPresentation(original)
  assert.equal(p.tables, true); assert.equal(p.approval, true)
  assert.doesNotThrow(() => new Function(p.text))
  assert.equal(p.text.includes('onAllow:'), original.includes('onAllow:'))
  assert.ok(p.text.includes('runtimeTuningApproval/read'))
})
test('generated provider carries official assets and removes superseded cached assets', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { generate } = await import('../plugins/chat-answer-fix.mjs')
  const root = mkdtempSync(join(tmpdir(), 'chat-assets-')), official = join(root, 'official'), out = join(root, 'out')
  try {
    mkdirSync(join(official, 'lib/assets'), { recursive: true }); mkdirSync(join(out, 'assets'), { recursive: true })
    writeFileSync(join(out, 'assets/old.png'), 'stale')
    writeFileSync(join(official, 'lib/assets/whale.png'), 'current official asset')
    writeFileSync(join(official, 'lib/client.js'), 'function apply(ctx){}')
    writeFileSync(join(official, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-client-ui-chat', version: '0.2.2-rc.3', exports: { './client': './lib/client.js', './assets/*': './lib/assets/*' } }))
    const result = generate(official, out)
    assert.equal(result.assets, true)
    assert.equal(JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')).exports['./assets/*'], './assets/*')
    assert.deepEqual(readdirSync(join(out, 'assets')), ['whale.png'])
    assert.equal(readFileSync(join(out, 'assets/whale.png'), 'utf8'), 'current official asset')
  } finally { rmSync(root, { recursive: true, force: true }) }
})
