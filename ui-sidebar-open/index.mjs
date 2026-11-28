import { hostImport } from '../plugins/host-modules.mjs?v=0.2.24'
import { createRecorder } from '../plugins/log.mjs'
import {
  SIDEBAR_OPEN_PROMPT,
  SIDEBAR_OPEN_TOOL,
  createSidebarOpenToolDefinition,
} from '../plugins/sidebar-open.mjs'

const { defineTool, ToolArgsError } = await hostImport('dsh-tools')
const { FsError } = await hostImport('dsh-fs')
const record = createRecorder('sidebar-open.log')

export const name = 'dsh-runtime-tuning-sidebar-open'
export const inject = ['tools', 'fs', 'systemPrompt', 'workingDirectory']

const DEFAULTS = { enabled: true }

/** Register the `open_sidebar` tool and concise guidance for user-facing agents. */
export function apply(ctx, config = {}) {
  const c = { ...DEFAULTS, ...config }
  if (!c.enabled) return
  try {
    ctx.tools.register(createSidebarOpenToolDefinition({
      fs: ctx.fs,
      workingDirectory: ctx.workingDirectory,
      defineTool,
      ToolArgsError,
      FsError,
    }))
    ctx.systemPrompt.section({
      name: 'dsh-runtime-tuning-sidebar-open',
      order: ctx.systemPrompt.getSectionOrder('DELIVERABLE_FILE_REFERENCES') + 1,
      text: ({ scope, agent } = {}) => {
        if (ctx.tools.get(SIDEBAR_OPEN_TOOL, scope) === undefined) return ''
        if ((agent?.session?.header?.delegationDepth ?? 0) > 0) return ''
        return SIDEBAR_OPEN_PROMPT
      },
    })
    record({ event: 'loaded' })
  } catch (error) {
    record({ event: 'register-failed', error: String(error).slice(0, 300) })
  }
}
