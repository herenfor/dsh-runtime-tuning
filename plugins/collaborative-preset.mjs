// Retain the running host's complete standard composition and declaration base URL.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { hostDirectory, hostImport } from './host-modules.mjs?v=0.2.24'
import { resolvePresetConfig } from './tool-use-prompt.mjs?v=0.2.24'

const { default: OfficialPreset } = await hostImport('dsh-agent-preset')
const { default: z } = await hostImport('schemastery')
const { entryListSchema } = await hostImport('cordis-plugin-include')
const { load } = createRequire(join(hostDirectory('dsh-agent-preset-registry'), 'package.json'))('js-yaml')

export function standardComposition() {
  const file = join(hostDirectory('dsh-web-app'), 'presets/standard.patch.yml')
  const rows = load(readFileSync(file, 'utf8'), { schema: entryListSchema })
  const declaration = rows.flatMap(row => row.insert ?? [row]).find(row => row.config?.id === 'standard')
  if (!Array.isArray(declaration?.config?.plugins)) throw new Error('The host standard preset has no supported composition')
  return { plugins: declaration.config.plugins, baseUrl: pathToFileURL(file).href }
}

export function buildCollaborativeConfig(config, official) {
  const source = config.plugins?.length ? config.plugins : official.plugins
  const adapted = resolvePresetConfig({ plugins: source }).plugins
  const ownSearch = row => row.name === new URL('./grep-enhanced.mjs', import.meta.url).href || /\/(?:dsh-tune|dsh-runtime-tuning)\/plugins\/grep-enhanced\.mjs$/.test(row.name)
  const ownCompaction = row => row.name === new URL('./compaction-effort.mjs', import.meta.url).href || /\/(?:dsh-tune|dsh-runtime-tuning)\/plugins\/compaction-effort\.mjs$/.test(row.name)
  const adaptRow = row => {
    if (row.id === 'tool-fs-search' && (row.name === '@deepseek-ai/dsh-tool-fs-search' || ownSearch(row))) {
      return { ...row, name: config.enhancedGrep !== false ? new URL('./grep-enhanced.mjs', import.meta.url).href : '@deepseek-ai/dsh-tool-fs-search' }
    }
    if (row.id === 'compaction-basic' && (row.name === '@deepseek-ai/dsh-compaction-basic' || ownCompaction(row))) {
      return { ...row, name: config.compactionEffort === true ? new URL('./compaction-effort.mjs', import.meta.url).href : '@deepseek-ai/dsh-compaction-basic' }
    }
    if (row.id === 'skill-filesystem') {
      if (!config.skillDirs?.length) return row // Preserve every official declaration and expression.
      const declared = row.config?.customSkillDirs
      if (declared !== undefined && !Array.isArray(declared)) throw new Error('Additional skillDirs require an array-valued customSkillDirs declaration')
      return { ...row, config: { ...row.config, customSkillDirs: [...(declared ?? []), ...config.skillDirs] } }
    }
    if (row.group === true && Array.isArray(row.config)) {
      return { ...row, config: row.config.map(adaptRow) }
    }
    return row
  }
  const plugins = adapted.map(adaptRow)
  const own = [
    ['collaboration-prompt', './collaboration-prompt.mjs', undefined],
    ['tool-use-prompt', './tool-use-prompt.mjs', undefined],
    ['tool-discovery', './tool-discovery.mjs', { mode: config.toolDiscovery ?? 'auto', presetId: config.id ?? 'collaborative' }],
  ]
  for (const [id, relative, childConfig] of own) {
    const index = plugins.findIndex(row => row.id === id)
    const row = { id, name: new URL(relative, import.meta.url).href, ...(childConfig ? { config: childConfig } : {}) }
    if (index < 0) plugins.push(row)
    else plugins[index] = row
  }
  return {
    id: config.id ?? 'collaborative', name: config.name ?? '协作',
    description: config.description ?? '理解目标、形成方案并完成任务；完整工具能力与按需发现',
    order: config.order ?? 2, plugins,
  }
}

export default class CollaborativePreset extends OfficialPreset {
  static Config = z.object({
    id: z.string().default('collaborative'), name: z.string().default('协作'),
    description: z.string(), order: z.number().default(2),
    toolDiscovery: z.union(['auto', 'on', 'off']).default('auto'),
    enhancedGrep: z.boolean().default(true),
    compactionEffort: z.boolean().default(false),
    skillDirs: z.array(z.string()).default([]), plugins: z.array(z.any()).default([]),
  })
  constructor(ctx, config) {
    const official = standardComposition()
    super(ctx.extend({ baseUrl: official.baseUrl }), buildCollaborativeConfig(config, official))
  }
}
