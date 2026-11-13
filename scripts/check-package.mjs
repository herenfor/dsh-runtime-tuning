// Verify the actual tarball outside the checkout, including resolution from a host profile.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'dsh-tune-package-'))
const npm = (args) => execFileSync('npm', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', temp]))
  const names = packed.files.map(f => f.path)
  for (const required of ['package.json', 'cordis.patch.yml', 'plugins/tool-use-prompt.mjs', 'plugins/log.mjs', 'ui-chat/index.mjs', 'README.md', 'LICENSE']) assert.ok(names.includes(required), required)
  for (const name of names) assert.ok(!/^(?:test|scripts|\.git|\.claude)\/|^ui-chat\/(?:client.js|package.json)$|\.tgz$/.test(name), `unexpected package file: ${name}`)
  npm(['install', '--prefix', temp, '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', '--offline', join(temp, packed.filename)])
  const fromHost = createRequire(join(temp, 'package.json'))
  const pkgFile = fromHost.resolve('@herenfor/dsh-tune/package.json')
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  assert.equal(pkg.name, '@herenfor/dsh-tune')
  assert.notEqual(pkg.private, true)
  const installed = dirname(pkgFile)
  const patch = readFileSync(join(installed, pkg.dsh.bundle.patch), 'utf8')
  for (const [, relative] of patch.matchAll(/name: (\.\/[^\s]+)/g)) assert.ok(existsSync(join(installed, relative)), relative)
  const [, prompt] = /name: '(@herenfor\/dsh-tune\/plugins\/tool-use-prompt.mjs)'/.exec(patch) ?? []
  assert.ok(prompt, 'preset uses the published package name')
  assert.ok(fromHost.resolve(prompt).startsWith(installed))
  // Import one standalone plugin through the same bare specifier used by the preset.
  const module = await import(fromHost.resolve(prompt))
  assert.equal(typeof module.apply, 'function')
  console.log(`Package OK: ${pkg.name}@${pkg.version}, ${names.length} files; offline install and preset resolution passed`)
} finally { rmSync(temp, { recursive: true, force: true }) }
