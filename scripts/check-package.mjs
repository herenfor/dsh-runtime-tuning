// Verify the actual tarball outside the checkout, including resolution from a host profile.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import assert from 'node:assert/strict'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'dsh-tune-package-'))
const npm = (args) => execFileSync('npm', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', temp]))
  const names = packed.files.map(f => f.path)
  for (const required of ['package.json', 'cordis.patch.yml', 'plugins/tool-use-prompt.mjs', 'plugins/tuned-preset.mjs', 'plugins/collaborative-preset.mjs', 'plugins/collaboration-prompt.mjs', 'plugins/tool-discovery.mjs', 'plugins/grep-enhanced.mjs', 'plugins/grep-engine.mjs', 'plugins/host-modules.mjs', 'plugins/log.mjs', 'ui-chat/index.mjs', 'README.md', 'LICENSE']) assert.ok(names.includes(required), required)
  for (const name of names) assert.ok(!/^(?:test|scripts|\.git|\.claude)\/|^ui-chat\/(?:assets\/|client.js$|package.json$)|\.tgz$/.test(name), `unexpected package file: ${name}`)
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
  // Import the installed prompt module, then verify its runtime self-reference stays inside this installation.
  const module = await import(fromHost.resolve(prompt))
  assert.equal(typeof module.apply, 'function')
  const [, compaction] = /name: '(@herenfor\/dsh-tune\/plugins\/compaction-effort.mjs)'/.exec(patch) ?? []
  assert.ok(compaction, 'preset uses the published compaction-effort module')
  assert.ok(fromHost.resolve(compaction).startsWith(installed))
  const compactionMod = await import(fromHost.resolve(compaction))
  assert.equal(typeof compactionMod.createCompactionEffortEngine, 'function')
  const config = module.resolvePresetConfig({
    id: 'tuned',
    plugins: [
      { id: 'tool-use-prompt', name: prompt },
      {
        id: 'compaction',
        name: 'cordis:group',
        group: true,
        config: [{ id: 'compaction-basic', name: compaction }],
      },
    ],
  })
  assert.equal(fileURLToPath(config.plugins[0].name), fromHost.resolve(prompt))
  assert.equal(fileURLToPath(config.plugins[1].config[0].name), fromHost.resolve(compaction))
  const host = process.env.DSH_BIN ?? join(homedir(), '.local/bin/dsh')
  if (existsSync(host)) {
    const old = process.argv[1]; process.argv[1] = host
    try {
      const collaborative = await import(fromHost.resolve('@herenfor/dsh-tune/plugins/collaborative-preset.mjs'))
      const composed = collaborative.buildCollaborativeConfig({}, collaborative.standardComposition())
      for (const id of ['collaboration-prompt', 'tool-discovery', 'tool-use-prompt', 'tool-fs-search']) {
        const url = composed.plugins.find(row => row.id === id).name
        assert.ok(fileURLToPath(url).startsWith(installed), `installed collaborative child ${id}`)
      }
    } finally { process.argv[1] = old }
  }
  console.log(`Package OK: ${pkg.name}@${pkg.version}, ${names.length} files; offline install and preset resolution passed`)
} finally { rmSync(temp, { recursive: true, force: true }) }
