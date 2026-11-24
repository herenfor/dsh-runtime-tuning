import { hostImport } from '../plugins/host-modules.mjs'
import { createRecorder } from '../plugins/log.mjs'
import {
  DEFAULT_COMMIT_LIMIT,
  MAX_COMMIT_LIMIT,
  MIN_COMMIT_LIMIT,
  WORKTREE_RPC_CHANNEL,
  createWorktreeHttpHandler,
  createWorktreeRpcHandler,
  createWorktreeService,
} from '../plugins/worktree-core.mjs'

const { default: z } = await hostImport('schemastery')
const record = createRecorder('worktree.log')

export const name = 'dsh-runtime-tuning-worktree'

export const Config = z.object({
  enabled: z.boolean()
    .default(true)
    .description(
      '启用只读 Worktree 树可视化与一键切换右侧栏面板（一期只读，无写盘操作）。 / ' +
      'Enable the read-only Git worktree tree visualizer and workspace switcher tab in the right sidebar.',
    ),
  defaultCommitLimit: z.natural()
    .min(MIN_COMMIT_LIMIT)
    .max(MAX_COMMIT_LIMIT)
    .default(DEFAULT_COMMIT_LIMIT)
    .description(
      '按需切换到「Worktree + Commit 分叉图」视图时默认拉取的近期提交条数（5~50）。 / ' +
      'Default number of recent commits fetched on demand when switching to the Commit Fork DAG view (5-50).',
    ),
})

/** Register the read-only `/dsh-tune-worktree` authenticated prefix route on Host. */
export function apply(ctx, config = {}) {
  if (config.enabled === false) return
  ctx.inject(['connection', 'webServer'], (rpcCtx) => {
    const getSvc = (key) => (typeof ctx.get === 'function' ? ctx.get(key) : ctx[key])
    const service = createWorktreeService({
      defaultCommitLimit: config.defaultCommitLimit ?? DEFAULT_COMMIT_LIMIT,
      getWorkspaceRegistry: () => getSvc('workspaceRegistry'),
      getLiveAgents: () => getSvc('agents')?.list?.() ?? [],
      getSessionCwd: (session) => getSvc('workingDirectory')?.get?.(session) ?? session?.header?.cwd ?? null,
      querySessionActivity: async (sessionId) => {
        if (typeof ctx.waterfall !== 'function') return []
        return ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([]))
      },
    })
    const rpcHandler = createWorktreeRpcHandler(service)
    const httpHandler = createWorktreeHttpHandler({
      rpcHandler,
      admit: (req) => rpcCtx.connection.admit(req),
      channel: WORKTREE_RPC_CHANNEL,
    })
    try {
      const dispose = rpcCtx.webServer.register({
        kind: 'prefix',
        path: WORKTREE_RPC_CHANNEL,
        handler: httpHandler,
      })
      if (typeof rpcCtx.effect === 'function') {
        rpcCtx.effect(() => dispose, 'dsh-runtime-tuning-worktree: rpc route')
      }
      record({ event: 'loaded', channel: WORKTREE_RPC_CHANNEL })
    } catch (error) {
      record({ event: 'register-failed', error: String(error).slice(0, 300) })
      throw error
    }
  })
}
