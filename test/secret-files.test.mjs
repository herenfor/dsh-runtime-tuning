import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'secret-files-home-'))
const { apply, blockedTarget, candidatePaths, existingTargets, maskArgv, NOTE_TEXT } = await import('../plugins/secret-files.mjs')
const session = await import('../plugins/session-tmp.mjs')
const linuxOnly = { skip: process.platform !== 'linux' && 'bwrap is Linux-only' }

const BWRAP = ['bwrap', '--ro-bind', '/', '/', '--dev', '/dev', '--tmpfs', '/tmp', '--bind', '/ws', '/ws', '--', 'bash', '-c', 'x']
const targets = [{ path: '/h/.aws/credentials', dir: false }, { path: '/h/.config/gcloud', dir: true }]

test('bwrap：文件盖成说明、目录盖成只放说明的只读目录，都加在 -- 之前', () => {
  assert.deepEqual(maskArgv(BWRAP, targets, '/n/HIDDEN-BY-DSH.txt'), [
    ...BWRAP.slice(0, 11),
    '--ro-bind', '/n/HIDDEN-BY-DSH.txt', '/h/.aws/credentials',
    '--tmpfs', '/h/.config/gcloud', '--ro-bind', '/n/HIDDEN-BY-DSH.txt', '/h/.config/gcloud/HIDDEN-BY-DSH.txt', '--remount-ro', '/h/.config/gcloud',
    '--', 'bash', '-c', 'x',
  ])
})

test('Seatbelt：在规则末尾追加 deny file-read*；Landlock 和没有 -- 的参数认不出', () => {
  const argv = ['/usr/bin/sandbox-exec', '-p', '(version 1) (allow default) (deny file-write*)', '--', 'bash']
  const out = maskArgv(argv, targets)
  assert.equal(out[2], '(version 1) (allow default) (deny file-write*) (deny file-read* (literal "/h/.aws/credentials") (subpath "/h/.config/gcloud"))')
  assert.deepEqual(out.slice(3), ['--', 'bash'])
  assert.equal(maskArgv(['dsh-landlock', '--read-only', '/', '--', 'bash'], targets), undefined)
  assert.equal(maskArgv(['bwrap', '--ro-bind', '/', '/'], targets), undefined)
  assert.equal(maskArgv(BWRAP, []), undefined)
})

test('候选路径：默认三组，git 组要显式打开；WSL 下加上 Windows 用户目录；DSH_HOME 改过时跟着走', () => {
  const c = { groups: ['dsh', 'cloud', 'registry'], extraPaths: ['/opt/key.pem', 'relative/ignored'] }
  const paths = candidatePaths(c, { home: '/h', dshHome: '/d', wsl: true, windowsUsers: ['u'] })
  assert.ok(paths.includes('/d/.credentials.yaml'))
  assert.ok(paths.includes('/h/.aws/credentials'))
  assert.ok(paths.includes('/mnt/c/Users/u/AppData/Roaming/gcloud'))
  assert.ok(paths.includes('/opt/key.pem'))
  assert.ok(!paths.some((p) => p.includes('.ssh') || p.includes('gh/hosts') || p.includes('relative')))
  assert.ok(candidatePaths({ groups: ['git'], extraPaths: [] }, { home: '/h', wsl: false }).includes('/h/.ssh'))
})

test('只留存在的路径，解析软链接、去重，allowPaths 放行', () => {
  const home = mkdtempSync(join(tmpdir(), 'secret-files-t-'))
  mkdirSync(join(home, '.aws'))
  writeFileSync(join(home, '.aws/credentials'), 'k')
  mkdirSync(join(home, 'gcloud'))
  symlinkSync(join(home, 'gcloud'), join(home, 'link'))
  const got = existingTargets([join(home, '.aws/credentials'), join(home, 'gcloud'), join(home, 'link'), join(home, 'missing')])
  assert.deepEqual(got, [{ path: join(home, '.aws/credentials'), dir: false }, { path: join(home, 'gcloud'), dir: true }])
  assert.deepEqual(existingTargets([join(home, '.aws/credentials')], [join(home, '.aws')]), [])
})

test('文件工具：读写遮挡的文件、目录里的文件、搜上级目录都拦；glob 和别的路径不拦', () => {
  const exec = (name, args) => ({ name, arguments: args, agent: { session: { header: { cwd: '/h/proj' } } } })
  const real = (p) => p
  assert.equal(blockedTarget(exec('read', { file_path: '/h/.aws/credentials' }), targets, real), targets[0])
  assert.equal(blockedTarget(exec('read', { file_path: '../.config/gcloud/creds.db' }), targets, real), targets[1])
  assert.equal(blockedTarget(exec('write', { file_path: '/h/.config/gcloud/new' }), targets, real), targets[1])
  assert.equal(blockedTarget(exec('grep', { pattern: 'x', path: '/h' }), targets, real), targets[0])
  assert.equal(blockedTarget(exec('grep', { pattern: 'x' }), targets, real), undefined)
  assert.equal(blockedTarget(exec('glob', { pattern: '**', path: '/h' }), targets, real), undefined)
  assert.equal(blockedTarget(exec('read', { file_path: 'src/a.ts' }), targets, real), undefined)
})

test('L2：真实 DSH 沙箱 + bwrap，和 session-tmp 一起装：凭据读不到、别的文件照常、/tmp 照常共用（本机宿主）', linuxOnly, async (t) => {
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
  const root = mkdtempSync(join(homedir(), '.secret-files-l2-'))
  try {
    writeFileSync(join(root, 'key'), 'SECRET-FILE')
    mkdirSync(join(root, 'vault'))
    writeFileSync(join(root, 'vault/token'), 'SECRET-DIR')
    writeFileSync(join(root, 'plain'), 'visible\n')
    const ctx = new Context()
    ctx.plugin(LocalSandboxProvider, {})
    ctx.plugin({ name: 'session-tmp-test', apply: (c) => session.apply(c, { baseDir: mkdtempSync(join(tmpdir(), 'secret-files-tmp-')) }) })
    ctx.plugin({ name: 'secret-files-test', apply: (c) => apply(c, { groups: [], extraPaths: [join(root, 'key'), join(root, 'vault')] }) })
    await new Promise((r) => setTimeout(r, 50))
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'secret-files-ws-'))
    const run = async (command) => {
      const { argv } = await ctx.sandbox.confine(['bash', '-c', command], { mode: 'workspace-write', workspaceRoot, sessionId: 's' })
      return spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' })
    }
    const r = await run(`set -e; cat ${root}/key; ls -A ${root}/vault; cat ${root}/plain; echo t > /tmp/t; touch ${root}/vault/x 2>/dev/null || echo ro`)
    assert.equal(r.status, 0, r.stderr)
    assert.equal(r.stdout, `${NOTE_TEXT}HIDDEN-BY-DSH.txt\nvisible\nro\n`)
    assert.equal((await run('cat /tmp/t')).stdout, 't\n')
  } finally {
    spawnSync('rm', ['-rf', root])
  }
})
