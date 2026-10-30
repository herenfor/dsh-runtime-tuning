import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, utimesSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'session-tmp-home-'))
const { apply, createRoots, rebindTmp, sweepStale } = await import('../plugins/session-tmp.mjs')
const linuxOnly = { skip: process.platform !== 'linux' && 'bwrap /tmp rebinding is Linux-only' }

test('rebindTmp 只换 -- 之前的 --tmpfs /tmp；没有时返回 undefined', () => {
  const argv = ['bwrap', '--ro-bind', '/', '/', '--tmpfs', '/tmp', '--bind', '/w', '/w', '--', 'bash', '-c', 'echo --tmpfs /tmp']
  assert.deepEqual(rebindTmp(argv, '/s'), ['bwrap', '--ro-bind', '/', '/', '--bind', '/s', '/tmp', '--bind', '/w', '/w', '--', 'bash', '-c', 'echo --tmpfs /tmp'])
  assert.equal(rebindTmp(['bwrap', '--', 'bash', '-c', 'x', '--tmpfs', '/tmp'], '/s'), undefined)
  assert.equal(rebindTmp(['landlock-run', '--rw', '/tmp', '--', 'bash'], '/s'), undefined)
})

test('子代理沿着 parentSession 归到根会话；环不会死循环', () => {
  const roots = createRoots()
  roots.note({ id: 'child', header: { parentSession: 'parent' } })
  roots.note({ id: 'grandchild', header: { parentSession: 'child' } })
  roots.note({ id: 'parent', header: {} })
  assert.equal(roots.rootOf('grandchild'), 'parent')
  assert.equal(roots.rootOf('other'), 'other')
  roots.note({ id: 'a', header: { parentSession: 'b' } }); roots.note({ id: 'b', header: { parentSession: 'a' } })
  assert.ok(['a', 'b'].includes(roots.rootOf('a')))
})

test('sweepStale 只删超过时限的子目录', () => {
  const base = mkdtempSync(join(tmpdir(), 'session-tmp-sweep-'))
  mkdirSync(join(base, 'old')); mkdirSync(join(base, 'new'))
  const past = new Date(Date.now() - 48 * 3_600_000); utimesSync(join(base, 'old'), past, past)
  assert.equal(sweepStale(base, 24), 1)
  assert.deepEqual(readdirSync(base), ['new'])
})

function fakeHost(config) {
  const handlers = {}, effects = []
  const calls = []
  const sandbox = { async confine(argv, policy) { calls.push(policy); return { argv: ['bwrap', '--tmpfs', '/tmp', '--', ...argv], enforcement: 'full' } } }
  const original = sandbox.confine
  const ctx = {
    on: (name, fn) => { handlers[name] = fn },
    inject: (_deps, fn) => fn({ sandbox, effect: (fn) => effects.push(fn()) }),
  }
  apply(ctx, { baseDir: mkdtempSync(join(tmpdir(), 'session-tmp-base-')), ...config })
  return { sandbox, original, handlers, dispose: () => effects.forEach((fn) => fn()) }
}

test('apply：工作区可写时换成对话目录，子代理和父会话同一个；只读模式原样；卸载后还原并删目录', linuxOnly, async () => {
  const h = fakeHost()
  h.handlers['session/event']({ id: 'sub', header: { parentSession: 'root' } }, { type: 'turn/start' })
  const root = await h.sandbox.confine(['ls'], { mode: 'workspace-write', sessionId: 'root' })
  const sub = await h.sandbox.confine(['ls'], { mode: 'workspace-write', sessionId: 'sub' })
  const dir = root.argv[2]
  assert.deepEqual(root.argv.slice(0, 4), ['bwrap', '--bind', dir, '/tmp'])
  assert.equal(sub.argv[2], dir)
  assert.ok(existsSync(dir))
  assert.deepEqual((await h.sandbox.confine(['ls'], { mode: 'read-only', sessionId: 'root' })).argv.slice(0, 3), ['bwrap', '--tmpfs', '/tmp'])
  h.dispose()
  assert.equal(h.sandbox.confine, h.original)
  assert.equal(existsSync(dir), false)
})

test('L2：真实 DSH 沙箱里，同一对话的两条命令共用 /tmp，别的对话看不到（本机宿主）', linuxOnly, async (t) => {
  const pnpm = join(homedir(), '.local/share/dsh-cli/node_modules/.pnpm')
  const pick = (prefix, sub) => {
    const dir = existsSync(pnpm) && readdirSync(pnpm).filter((d) => d.startsWith(prefix)).sort().at(-1)
    return dir && join(pnpm, dir, 'node_modules', sub, 'lib/index.js')
  }
  const cordisFile = pick('@deepseek-ai+cordis@', '@deepseek-ai/cordis')
  const localFile = pick('@deepseek-ai+dsh-sandbox-local@', '@deepseek-ai/dsh-sandbox-local')
  if (!cordisFile || !localFile || spawnSync('bwrap', ['--version']).status !== 0) return t.diagnostic('host dsh-cli or bwrap absent; skipped L2')
  const { Context } = await import(pathToFileURL(cordisFile).href)
  const { default: LocalSandboxProvider } = await import(pathToFileURL(localFile).href)
  const ctx = new Context()
  ctx.plugin(LocalSandboxProvider, {})
  const base = mkdtempSync(join(tmpdir(), 'session-tmp-l2-'))
  const scope = ctx.plugin({ name: 'session-tmp-test', apply: (c) => apply(c, { baseDir: base }) })
  await new Promise((r) => setTimeout(r, 50))
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'session-tmp-ws-'))
  const run = async (sessionId, command) => {
    const { argv } = await ctx.sandbox.confine(['bash', '-c', command], { mode: 'workspace-write', workspaceRoot, sessionId })
    return spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' })
  }
  assert.equal((await run('conv-A', 'echo saved > /tmp/note.txt')).status, 0)
  assert.equal((await run('conv-A', 'cat /tmp/note.txt')).stdout, 'saved\n')
  assert.notEqual((await run('conv-B', 'cat /tmp/note.txt')).status, 0)
  const marker = mkdtempSync(join(tmpdir(), 'host-only-'))
  assert.notEqual((await run('conv-A', `test -e ${marker}`)).status, 0)  // 宿主的 /tmp 仍然看不到
  await scope.dispose()
  await new Promise((r) => setTimeout(r, 20))
  assert.deepEqual(readdirSync(base), [])
})
