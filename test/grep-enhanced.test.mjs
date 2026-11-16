import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEnhancedArgs, enhancedCommand, parseSearchOutput, matchPreview, matchingFragments, retainSearch } from '../plugins/grep-engine.mjs'
const base = ({ pattern, path, include }) => ({ pattern, ...(path ? { path } : {}), ...(include ? { include } : {}) })
const args = values => parseEnhancedArgs({ pattern: 'needle', ...values }, base)

test('grep modes preserve argument boundaries and reject conflicting or unbounded requests', () => {
  const input = args({ path: '-file', include: '*.{ts,tsx}', output_mode: 'files_with_matches', exclude: ['**/dist/**'] })
  assert.deepEqual(enhancedCommand(input), ['--files-with-matches', '--null', '--regexp=needle', '--glob=*.{ts,tsx}', '--glob=!**/dist/**', '--', '-file'])
  assert.ok(enhancedCommand(args({ output_mode: 'count', path: 'single-file.txt' })).includes('--with-filename'), 'single-file counts include the same unambiguous filename as directory counts')
  for (const invalid of [{ output_mode: 'count', context: 1 }, { context: 1, only_matching: true }, { head_limit: 0 }, { head_limit: 251 }, { context: 51 }, { exclude: ['!x'] }]) assert.throws(() => args(invalid))
})

test('NUL records preserve filenames containing colon, spaces and newlines and reject incomplete data', () => {
  assert.deepEqual(parseSearchOutput('a:b\n c\0z\0', 'files_with_matches'), [{ path: 'a:b\n c' }, { path: 'z' }])
  assert.deepEqual(parseSearchOutput(['a:b\n c', '3\nz', '2\n'].join('\0'), 'count'), [{ path: 'a:b\n c', count: 3 }, { path: 'z', count: 2 }])
  assert.throws(() => parseSearchOutput('unfinished', 'files_with_matches'))
  assert.throws(() => parseSearchOutput('x\0NaN\n', 'count'))
})

test('long UTF-8 lines retain late and separated matches with explicit byte ranges', () => {
  const line = '中'.repeat(2000) + 'MATCH' + '😀'.repeat(1500) + 'TAIL'
  const offset = Buffer.byteLength('中'.repeat(2000)), end = Buffer.byteLength(line)
  const result = matchPreview(line, [{ start: offset, end: offset + 5 }, { start: end - 4, end }], 2000)
  assert.ok(result.text.includes('MATCH')); assert.ok(result.text.includes('TAIL'))
  assert.ok(!result.text.includes('\ufffd')); assert.ok(result.truncated); assert.match(result.text, /bytes/)
})

test('fragments use ripgrep offsets including newline matches, not a second regex', () => {
  const raw = '甲\nB\n'
  const event = JSON.stringify({ type: 'match', data: { path: { text: 'x' }, line_number: 7, lines: { text: raw }, submatches: [{ start: 3, end: 5 }] } })
  const row = parseSearchOutput(event, 'content')[0]
  assert.equal(matchingFragments(row)[0].line, '\nB')
  assert.equal(matchingFragments(row)[0].lineNumber, 7)
  assert.throws(() => parseSearchOutput(JSON.stringify({ type: 'match', data: { path: { text: 'x' }, line_number: 1, lines: { text: 'abc' } } }), 'content'))
})

test('retention distinguishes complete scanning from a bounded preview and keeps real source lines', () => {
  const rows = [{ path: 'x', lineNumber: 1, line: 'before', kind: 'context', spans: [] }, ...Array.from({ length: 4 }, (_, i) => ({ path: 'x', lineNumber: i + 2, line: 'needle', kind: 'match', spans: [{ start: 0, end: 6 }] }))]
  const view = retainSearch(rows, args({ head_limit: 2 }))
  assert.equal(view.summary.total, 4); assert.equal(view.summary.shown, 2); assert.equal(view.summary.complete, true); assert.equal(view.summary.truncated, true)
  assert.equal(view.rows[0].kind, 'context')
  const tiny = retainSearch(rows, args({}), { metaBytes: 300 })
  assert.equal(tiny.rows.length, 0); assert.equal(tiny.summary.truncated, true)
})
