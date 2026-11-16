import test from 'node:test'
import assert from 'node:assert/strict'
import { DiscoverySelection, admittedView, discoveryExecutor, rankTools, fingerprint } from '../plugins/tool-discovery.mjs'
const tool = (name, description = '', parameters = {}) => ({ name, description, parameters })
const catalog = [tool('read'), tool('tool_search'), tool('schedule_create', 'Create a reminder'), tool('schedule_list', 'List existing schedules'), tool('mcp_github_search', 'Search repository issues')]

test('purpose search supports Chinese and exact names, and never guesses an unknown exact name', () => {
  assert.ok(rankTools(catalog, '安排定时任务').some(t => t.name === 'schedule_create'))
  assert.equal(rankTools(catalog, '仓库提交')[0].name, 'mcp_github_search')
  assert.deepEqual(rankTools(catalog, 'select:schedule_list,read').map(t => t.name), ['schedule_list', 'read'])
  assert.throws(() => rankTools(catalog, 'select:schedule_list,missing'), /unavailable/)
  assert.deepEqual(rankTools(catalog, 'xyzzynothing'), [])
  assert.throws(() => rankTools(catalog, 'x', 100), /limit/)
})

test('activation is isolated, atomic, persisted, and invalidated when the schema changes', () => {
  const writes = []
  const a = new DiscoverySelection({ mode: 'on', persist: rows => writes.push(rows) }), b = new DiscoverySelection({ mode: 'on' })
  a.routeSupported = b.routeSupported = true
  assert.deepEqual(a.describe(catalog).map(t => t.name), ['read', 'tool_search'])
  b.describe(catalog)
  assert.throws(() => a.search('select:schedule_list,missing', 5), /unavailable/)
  assert.equal(writes.length, 0)
  a.search('select:schedule_list', 5)
  assert.equal(writes.length, 1)
  assert.ok(a.describe(catalog).some(t => t.name === 'schedule_list'))
  assert.ok(!b.describe(catalog).some(t => t.name === 'schedule_list'))
  const restored = new DiscoverySelection({ mode: 'on', saved: writes[0] }); restored.routeSupported = true
  assert.ok(restored.describe(catalog).some(t => t.name === 'schedule_list'))
  const changed = catalog.map(t => t.name === 'schedule_list' ? { ...t, parameters: { different: true } } : t)
  assert.ok(!restored.describe(changed).some(t => t.name === 'schedule_list'))
  assert.ok(!restored.describe(catalog.filter(t => t.name !== 'schedule_list')).some(t => t.name === 'schedule_list'))
})

test('cancelled or failed persistence does not commit activation', () => {
  const a = new DiscoverySelection({ mode: 'on', persist: () => { throw Error('disk failure') } }); a.routeSupported = true; a.describe(catalog)
  assert.throws(() => a.search('select:schedule_list', 5), /disk failure/)
  assert.equal(a.loaded.size, 0)
  assert.throws(() => a.search('select:schedule_list', 5, AbortSignal.abort()), /abort/i)
})

test('off, small catalogs, unsupported routes and unknown tool families retain full native capability', () => {
  for (const a of [new DiscoverySelection({ mode: 'off' }), new DiscoverySelection({ mode: 'on' }), new DiscoverySelection({ mode: 'auto' })]) {
    if (a.mode !== 'on') a.routeSupported = true
    assert.equal(a.describe(catalog).length, catalog.length)
  }
  const a = new DiscoverySelection({ mode: 'on' }); a.routeSupported = true
  assert.equal(a.describe([tool('custom_critical_control'), tool('update_goal')]).length, 2)
  assert.notEqual(fingerprint(tool('x')), fingerprint(tool('x', '', { a: true })))
})

test('a native batch freezes visible names and never admits another agent or a removed original tool', () => {
  const agent = {}, other = {}, names = new Set(['read'])
  const live = new Map([['read', tool('read')], ['schedule_list', tool('schedule_list')]])
  const view = admittedView({ toolSet: { view: () => live } }, names, agent)
  names.add('schedule_list')
  assert.deepEqual([...view.view(agent).keys()], ['read'])
  assert.equal(view.view(other).size, 0)
  live.delete('read')
  assert.equal(view.view(agent).size, 0)
})

test('non-model native invocations are preserved and executing steps refresh their own official catalog', () => {
  const agent = {}, other = {}, invocations = []
  const delegate = { describe: defs => defs, execute: input => { invocations.push(input); return input } }
  const selection = new DiscoverySelection({ mode: 'on' }); selection.routeSupported = true
  const executor = discoveryExecutor(delegate, selection, agent)
  const outside = { agent, calls: [] }
  assert.equal(executor.execute(outside), outside)
  const foreign = { agent: other, toolSet: { view: () => new Map() }, calls: [] }
  assert.equal(executor.execute(foreign), foreign)
  executor.describe([tool('read'), tool('schedule_list')])
  const current = { agent, toolSet: { view: () => new Map([['read', tool('read')]]) }, calls: [] }
  const execution = executor.execute(current)
  assert.deepEqual([...execution.toolSet.view(agent).keys()], ['read'])
  assert.throws(() => selection.search('select:schedule_list'), /unavailable/)
})
