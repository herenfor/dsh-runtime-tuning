import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'net-log-'))
const { apply, createWatcher, describe, matches } = await import('../plugins/net-log.mjs')

test('只看配置里的主机和它的子域名', () => {
  assert.equal(matches('https://api.deepseek.com', ['deepseek.com']), true)
  assert.equal(matches('https://deepseek.com', ['deepseek.com']), true)
  assert.equal(matches('https://notdeepseek.com', ['deepseek.com']), false)
  assert.equal(matches('not a url', ['deepseek.com']), false)
})

test('错误按 cause 链展开，只留 name / code / message', () => {
  const inner = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
  const outer = new TypeError('fetch failed', { cause: inner })
  assert.deepEqual(describe(outer), [{ name: 'TypeError', message: 'fetch failed' }, { name: 'Error', code: 'ECONNRESET', message: 'socket hang up' }])
})

test('记下请求走到哪一步、耗时，以及不含查询串的路径', () => {
  const out = []
  let t = 1000
  const w = createWatcher(['deepseek.com'], (r) => out.push(r), () => t)
  const request = { origin: 'https://api.deepseek.com', path: '/v1/messages?key=x', method: 'POST' }
  w.create({ request }); w.bodySent({ request }); t = 6000
  w.error({ request, error: new Error('other side closed') })
  w.error({ request, error: new Error('again') })  // 同一个请求只记一次
  const other = { origin: 'https://example.com', path: '/' }
  w.create({ request: other }); w.error({ request: other, error: new Error('x') })
  assert.deepEqual(out, [{ event: 'watching', host: 'api.deepseek.com' }, { event: 'request-error', host: 'api.deepseek.com', path: '/v1/messages', method: 'POST', stage: 'body-sent', elapsedMs: 5000, errors: [{ name: 'Error', message: 'other side closed' }] }])
})

test('L2：真实 fetch 收到响应头后被对端断开，日志里有 headers 阶段、底层错误，路径不带查询串', () => {
  // 子进程里跑：本机可能设了 NODE_USE_ENV_PROXY，它在 Node 启动时就生效
  const home = mkdtempSync(join(tmpdir(), 'net-log-l2-'))
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/_proxy$/i.test(k)))
  const plugin = new URL('../plugins/net-log.mjs', import.meta.url).href
  const script = `
    import { createServer } from 'node:http'
        const { apply } = await import(${JSON.stringify(plugin)})
    const server = createServer((req, res) => { res.writeHead(200); res.write('a'); setTimeout(() => res.socket.destroy(), 20) })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    apply({ effect: () => {} }, { hosts: ['127.0.0.1'] })
    try { const res = await fetch('http://127.0.0.1:' + server.address().port + '/v1/messages?token=secret'); await res.text() } catch {}
    server.close()
    await new Promise((r) => setTimeout(r, 100))`
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...env, DSH_HOME: home }, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const lines = readFileSync(join(home, 'logs', 'dsh-runtime-tuning', 'net-log.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(lines.filter((l) => l.event === 'watching').length, 1)
  const failure = lines.find((l) => l.event === 'request-error')
  assert.equal(failure.host, '127.0.0.1')
  assert.equal(failure.path, '/v1/messages')
  assert.equal(failure.stage, 'headers')
  assert.ok(failure.errors.length >= 1)
  assert.doesNotMatch(JSON.stringify(lines), /secret/)
})
