import { createHash } from 'node:crypto'
import { hostImport } from './host-modules.mjs'
import { createRecorder } from './log.mjs'

export const name = 'tool-discovery'
export const inject = ['tools', 'systemPrompt', 'llm']
const record = createRecorder('tool-discovery.log')
const RECORD = 'plugin:herenfor.dsh-tune/tool-discovery'
const INSTRUCTION = 'Use tool_search to find and load additional available capabilities when a task needs them. ' +
  'Search by purpose, or use query "select:tool_name,other_tool" for exact names. Loaded tools become callable in the NEXT step; ' +
  'do not call an unloaded tool alongside its discovery call. Search does not install plugins or grant permission. ' +
  'Use directly available tools without a discovery call when they already fit.'

// Goal and plan controls stay immediate: commands can activate them independently of model discovery.
const OPTIONAL = new Set(['workflow', 'schedule_create', 'schedule_edit', 'schedule_list', 'schedule_view'])
const SECTION_TOOLS = { 'tool:schedule': ['schedule_create', 'schedule_edit', 'schedule_list', 'schedule_view'] }
const ALIASES = { schedule: '定时 提醒 计划 时间 recurring reminder timer', workflow: '工作流 编排 批量 orchestration pipeline', browser: '浏览器 网页 浏览', github: '仓库 提交 issue pull request', search: '搜索 查找 检索', document: '文档', calendar: '日历 日程' }
export const fingerprint = tool => createHash('sha256').update(JSON.stringify([tool.name, tool.description, tool.parameters])).digest('hex')
export const isOptional = tool => OPTIONAL.has(tool.name) || /^mcp[_:]/.test(tool.name)
export class DiscoveryQueryError extends Error {}

export function rankTools(tools, query, limit = 5) {
  const raw = query.trim()
  if (!raw || raw.length > 1000) throw new DiscoveryQueryError('query must contain 1–1000 characters')
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new DiscoveryQueryError('limit must be an integer between 1 and 10')
  if (raw.startsWith('select:')) {
    const names = [...new Set(raw.slice(7).split(',').map(s => s.trim()))]
    if (!names.length || names.some(n => !n) || names.length > 10) throw new DiscoveryQueryError('select: needs 1–10 exact tool names')
    const byName = new Map(tools.map(tool => [tool.name, tool]))
    const missing = names.filter(n => !byName.has(n))
    if (missing.length) throw new DiscoveryQueryError(`Unknown or unavailable tools: ${missing.join(', ')}`)
    return names.map(n => byName.get(n))
  }
  const terms = raw.toLowerCase().match(/[a-z0-9_]+|[\p{Script=Han}]+/gu) ?? []
  const tokens = terms.flatMap(t => /\p{Script=Han}/u.test(t) ? [t, ...Array.from(t).slice(0, -1).map((_, i) => Array.from(t).slice(i, i + 2).join(''))] : [t]).slice(0, 32)
  return tools.map(tool => {
    const name = tool.name.toLowerCase()
    const extra = Object.entries(ALIASES).filter(([key]) => name.includes(key)).map(([, text]) => text).join(' ')
    const haystack = `${name} ${tool.description} ${JSON.stringify(tool.parameters)} ${extra}`.toLowerCase()
    const score = [...new Set(tokens)].reduce((sum, term) => sum + (name === term ? 10 : name.includes(term) ? 4 : haystack.includes(term) ? 1 : 0), 0)
    return { tool, score }
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name, 'en')).slice(0, limit).map(row => row.tool)
}

export class DiscoverySelection {
  constructor({ mode = 'auto', saved = [], persist = () => {} } = {}) {
    this.mode = mode
    this.loaded = new Map(saved.filter(row => Array.isArray(row) && row.length === 2 && row.every(s => typeof s === 'string')))
    this.persist = persist
    this.catalog = new Map()
    this.visible = new Set()
    this.routeSupported = false
    this.active = false
  }
  describe(definitions) {
    this.catalog = new Map(definitions.map(tool => [tool.name, tool]))
    const optional = definitions.filter(isOptional)
    const bytes = optional.reduce((n, tool) => n + Buffer.byteLength(JSON.stringify([tool.name, tool.description, tool.parameters])), 0)
    const overhead = Buffer.byteLength(INSTRUCTION + this.directory()) + 900
    this.active = this.routeSupported && this.mode !== 'off' && (this.mode === 'on' || bytes > overhead * 2)
    const selected = definitions.filter(tool => !this.active || !isOptional(tool) || this.loaded.get(tool.name) === fingerprint(tool))
    this.visible = new Set(selected.map(tool => tool.name))
    return selected
  }
  directory() {
    const rows = [...this.catalog.values()].filter(isOptional).sort((a, b) => a.name.localeCompare(b.name, 'en'))
    // A bounded directory, not full schemas; search covers the complete eligible catalog.
    const lines = rows.slice(0, 100).map(tool => `${tool.name}: ${String(tool.description).replace(/\s+/g, ' ').slice(0, 100)}`)
    return rows.length ? `Additional capabilities (use tool_search when needed):\n${lines.join('\n')}${rows.length > 100 ? `\n${rows.length - 100} more tools searchable by purpose.` : ''}` : ''
  }
  search(query, limit, signal) {
    signal?.throwIfAborted()
    const matches = rankTools([...this.catalog.values()].filter(tool => tool.name !== 'tool_search'), query, limit)
    const loaded = new Map(this.loaded)
    for (const tool of matches) loaded.set(tool.name, fingerprint(tool))
    // Keep only currently eligible definitions. Removed tools never revive through saved state.
    for (const key of loaded.keys()) if (!this.catalog.has(key)) loaded.delete(key)
    if (loaded.size > 1024) throw new Error('Tool discovery capacity reached; use a smaller configured catalog')
    signal?.throwIfAborted()
    const entries = [...loaded]
    this.persist(entries)
    this.loaded = loaded
    return { matches: matches.map(tool => ({ name: tool.name, description: tool.description.slice(0, 500) })), loaded: matches.map(tool => tool.name), available: this.catalog.size - 1, effective: 'next-step', complete: true }
  }
}

export function admittedView(input, visible, agent) {
  const names = new Set(visible)
  return {
    dispose() {}, // The official caller owns and releases input.toolSet.
    view(scope) {
      if (scope !== agent || !input.toolSet) return new Map()
      return new Map([...input.toolSet.view(scope)].filter(([name]) => names.has(name)))
    },
  }
}

export function discoveryExecutor(delegate, selection, agent) {
  return {
    describe(definitions) { return delegate.describe(selection.describe(definitions)) },
    execute(input) {
      // Host/service invocations outside a model step keep the official native contract.
      if (!input.toolSet || input.agent !== agent) return delegate.execute(input)
      // Inspector assemblies cannot publish a different catalog for an executing model batch.
      selection.describe([...input.toolSet.view(agent).values()])
      return delegate.execute({ ...input, toolSet: admittedView(input, selection.visible, agent) })
    },
  }
}

export async function apply(ctx, config = {}) {
  const mode = config.mode ?? 'auto'
  if (!['auto', 'on', 'off'].includes(mode)) throw new Error('tool-discovery mode must be auto, on, or off')
  let modules
  try { modules = await Promise.all([hostImport('dsh-tools'), hostImport('dsh-tool-executor-native'), hostImport('dsh-session')]) }
  catch (error) { record({ event: 'unsupported-host', fallback: 'full-native-tools', error: String(error).slice(0, 200) }); return }
  const [{ defineTool, ToolArgsError }, { NativeToolExecutor }, { appendPluginRecord }] = modules
  if (typeof defineTool !== 'function' || typeof ToolArgsError !== 'function' || typeof NativeToolExecutor !== 'function' || typeof appendPluginRecord !== 'function' || typeof ctx.tools.setExecutor !== 'function' || typeof ctx.systemPrompt.context !== 'function') {
    record({ event: 'unsupported-host', fallback: 'full-native-tools' })
    return
  }
  const installed = new WeakSet()
  ctx.on('agent/created', ({ agent }) => {
    if (installed.has(agent)) return
    // The preset scope filters this listener; also check the declared identity.
    if (agent.ctx.get('agentPresets')?.composedPreset(agent.ctx) !== (config.presetId ?? 'collaborative')) return
    installed.add(agent)
    if ((agent.session.header.delegationDepth ?? 0) > 0) {
      // A child must not inherit an executor closure bound to its parent's admission state.
      agent.ctx.plugin({ name: 'discovery-child-native', inject: ['tools'], apply(child) {
        if (child.tools.get('tool_search', agent)) child.tools.restrict({ deny: ['tool_search'] })
        child.tools.setExecutor(new NativeToolExecutor(child))
      } })
      return
    }
    agent.ctx.plugin({
      name: 'discovery-agent', inject: ['tools', 'systemPrompt', 'llm'],
      apply(child) {
        const saved = agent.session.snapshotEvents().filter(e => e.type === RECORD && e.ignorable === true).at(-1)?.data
        const selection = new DiscoverySelection({ mode, saved: saved?.version === 1 && Array.isArray(saved.loaded) ? saved.loaded.slice(0, 1024) : [],
          persist: loaded => appendPluginRecord(agent.session, RECORD, { version: 1, loaded }),
        })
        const delegate = new NativeToolExecutor(child)
        child.tools.register(defineTool({
          name: 'tool_search',
          description: 'Find and load additional available tools by purpose, or query "select:name,other_name". Newly loaded tools are callable in the NEXT step. Does not install tools or grant permissions.',
          parameters: { query: { type: 'string', required: true, description: 'Purpose keywords, or select: followed by exact comma-separated tool names.' }, limit: { type: 'integer', description: 'Maximum keyword matches, 1–10; default 5.' } },
          output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
          isConcurrencySafe: () => false,
          execute: (args, exec) => {
            try { return selection.search(args.query, args.limit ?? 5, exec.signal) }
            catch (error) { exec.signal.throwIfAborted(); if (error instanceof DiscoveryQueryError) throw new ToolArgsError([error.message]); throw error }
          },
        }), { when: async ({ modelSelection, signal }) => {
          try {
            const info = await child.llm.resolveModelInfo(modelSelection.provider, modelSelection.model, signal)
            selection.routeSupported = info?.toolUpdate === 'addition-only' || info?.toolUpdate === 'in-history'
          } catch (error) { signal.throwIfAborted(); selection.routeSupported = false; record({ event: 'route-fallback', error: String(error).slice(0, 200) }) }
          return true
        } })
        child.systemPrompt.section({ name: 'dsh-runtime-tuning-tool-discovery', order: child.systemPrompt.getSectionOrder('TOOL_JOBS') + 3, text: INSTRUCTION })
        child.systemPrompt.context({ name: 'tool-discovery-catalog', order: 9500, interpolate: false, text: () => selection.active ? selection.directory() : '' })
        child.on('system-prompt/assemble', async (_assembly, context, next) => {
          const result = await next()
          if (context.agent !== agent || !selection.active) return result
          return { ...result, sections: result.sections.filter(section => !SECTION_TOOLS[section.name]?.every(name => !selection.visible.has(name))) }
        })
        // Last synchronous initialization action. Earlier failures roll back without masking the inherited executor.
        child.tools.setExecutor(discoveryExecutor(delegate, selection, agent))
        record({ event: 'installed', mode })
      },
    })
  })
}
