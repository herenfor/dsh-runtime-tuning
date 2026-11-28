import { randomUUID } from 'node:crypto'
import { hostImport } from '../plugins/host-modules.mjs?v=0.2.24'
import { createRecorder } from '../plugins/log.mjs'
import { createWorktreeHttpHandler } from '../plugins/worktree-core.mjs'
import {
  CREATE_WORKTREE_PROMPT,
  CREATE_WORKTREE_TOOL,
  DEFAULT_PATH_TEMPLATE,
  WORKTREE_MANAGE_RPC_CHANNEL,
  createSessionWorktreeStager,
  createWorktreeManageRpcHandler,
  createWorktreeManageService,
  createWorktreeToolDefinition,
  deriveAutoBranchName,
} from '../plugins/worktree-manage-core.mjs'

const { default: z } = await hostImport('schemastery')
const { defineTool, ToolArgsError } = await hostImport('dsh-tools')
const { SessionLogOffset, buildForkSeed } = await hostImport('dsh-session')
const { installModelSelection } = await hostImport('dsh-agent')
const record = createRecorder('worktree-manage.log')

export const name = 'dsh-runtime-tuning-worktree-manage'

export const Config = z.object({
  enabled: z.boolean()
    .default(true)
    .description(
      '启用 Worktree 管理能力（新建/Fork 会话、双门禁删除与 prune 清理）。 / ' +
      'Enable Git worktree management (create, fork session, dual-gated safe delete, and prune).',
    ),
  pathTemplate: z.string()
    .default(DEFAULT_PATH_TEMPLATE)
    .description(
      '新建派生 Worktree 的目录模板（支持 <repo> 与 <slug> 占位符）。 / ' +
      'Path template for newly created worktrees (supports <repo> and <slug>).',
    ),
  enableAgentTool: z.boolean()
    .default(true)
    .description(
      '向顶层 Agent 暴露只增不删的 create_worktree 工具。 / ' +
      'Expose the non-destructive create_worktree tool to top-level agents.',
    ),
})

function latestCompletedPrefixBoundary(events) {
  let lastTurnEnd
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]?.type === 'turn/end') {
      lastTurnEnd = events[i]
      break
    }
  }
  if (lastTurnEnd === undefined) return undefined
  let boundary = lastTurnEnd.seq
  for (const next of events.slice(boundary + 1)) {
    if (next.type === 'turn/start' || (next.type === 'user/message' && next.surfaceOp === 'append') || next.type === 'agent/inbox/spliced') {
      break
    }
    boundary = next.seq
  }
  return boundary
}

/** Fork a source DSH session prefix directly into a newly created worktree workspace. */
export async function forkSessionToWorktree(ctx, { sourceSessionId, workspace }) {
  const getSvc = (key) => (typeof ctx.get === 'function' ? ctx.get(key) : ctx[key])
  const sessionQuery = getSvc('sessionQuery')
  const agents = getSvc('agents')
  const agentDefaultModel = getSvc('agentDefaultModel')
  if (!sessionQuery || !agents || !agentDefaultModel) {
    return { warning: 'Host session fork services unavailable; created blank workspace instead' }
  }

  const rawSid = String(sourceSessionId).replace(/^wsl:/, '')
  const observed = await sessionQuery.observeSession(rawSid)
  try {
    const boundary = latestCompletedPrefixBoundary(observed.events || [])
    if (boundary === undefined || observed.events?.[boundary]?.seq !== boundary) {
      return { warning: 'Source session has no completed turn to fork yet; created blank workspace instead' }
    }
    const seed = buildForkSeed(observed.events, boundary)
    const agentPresets = getSvc('agentPresets')
    const requestedPreset = observed.projections?.values?.agentPreset
    let agentPreset
    let setup = (agentCtx) => { installModelSelection(agentCtx) }
    if (agentPresets) {
      const resolved = await agentPresets.resolve(requestedPreset)
      agentPreset = resolved.id
      setup = async (agentCtx) => {
        installModelSelection(agentCtx)
        await agentPresets.mount(agentCtx, agentPreset)
      }
    }

    const childId = `session-${randomUUID()}`
    const { provider, model } = agentDefaultModel.currentSelection()
    await agents.create({
      sessionId: childId,
      seed,
      inheritedEventCount: SessionLogOffset(boundary + 1),
      meta: {
        cwd: workspace.path,
        isSeeded: true,
        ...(agentPreset === undefined ? {} : { agentPreset }),
      },
      agentOptions: { provider, model },
      setup,
    })
    await workspace.attachSession(childId)
    return { sessionId: childId }
  } finally {
    observed?.[Symbol.dispose]?.()
  }
}

function extractPromptText(message) {
  if (!message) return ''
  if (typeof message.content === 'string') return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
      .filter(Boolean)
      .join(' ')
  }
  if (typeof message.text === 'string') return message.text
  return ''
}

/** Register Phase-2 worktree management RPC channel, staged session hooks, and optional `create_worktree` agent tool. */
export function apply(ctx, config = {}) {
  if (config.enabled === false) return

  const getSvc = (key) => (typeof ctx.get === 'function' ? ctx.get(key) : ctx[key])
  const defaultPathTemplate = typeof config.pathTemplate === 'string' && config.pathTemplate.trim()
    ? config.pathTemplate.trim()
    : DEFAULT_PATH_TEMPLATE
  const enableAgentTool = config.enableAgentTool !== false

  const stager = createSessionWorktreeStager()
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => () => { stager.dispose() }, 'dsh-runtime-tuning-worktree-manage: stager')
  }

  const service = createWorktreeManageService({
    defaultPathTemplate,
    enableAgentTool,
    getWorkspaceRegistry: () => getSvc('workspaceRegistry'),
    getLiveAgents: () => getSvc('agents')?.list?.() ?? [],
    getSessionCwd: (session) => getSvc('workingDirectory')?.get?.(session) ?? session?.header?.cwd ?? null,
    querySessionActivity: async (sessionId) => {
      if (typeof ctx.waterfall !== 'function') return []
      return ctx.waterfall('workspace/session-activity', { sessionId }, () => Promise.resolve([]))
    },
    forkSessionToWorktree: ({ sourceSessionId, workspace }) => forkSessionToWorktree(ctx, { sourceSessionId, workspace }),
  })

  ctx.inject(['connection', 'webServer'], (rpcCtx) => {
    const rpcHandler = createWorktreeManageRpcHandler(service, { stager })
    const httpHandler = createWorktreeHttpHandler({
      rpcHandler,
      admit: (req) => rpcCtx.connection.admit(req),
      channel: WORKTREE_MANAGE_RPC_CHANNEL,
    })
    try {
      const dispose = rpcCtx.webServer.register({
        kind: 'prefix',
        path: WORKTREE_MANAGE_RPC_CHANNEL,
        handler: httpHandler,
      })
      if (typeof rpcCtx.effect === 'function') {
        rpcCtx.effect(() => dispose, 'dsh-runtime-tuning-worktree-manage: rpc route')
      }
      record({ event: 'loaded', channel: WORKTREE_MANAGE_RPC_CHANNEL })
    } catch (error) {
      record({ event: 'register-failed', error: String(error).slice(0, 300) })
      throw error
    }
  })

  ctx.inject(['agents', 'workingDirectory'], (hookCtx) => {
    if (typeof hookCtx.on !== 'function') return
    const sessionSid = (agent) => String(agent?.session?.id ?? agent?.session?.header?.id ?? '').replace(/^wsl:/, '')

    const attemptStageCreation = async ({ agent, sid, stage, promptText, signal, sourceTag }) => {
      const branchName = stage.branch || deriveAutoBranchName(promptText, sid)
      stager.setCreating(sid, branchName)
      const created = await service.create(
        {
          path: stage.path,
          branch: branchName,
          baseRef: stage.baseRef || undefined,
          sessionMode: 'none',
        },
        signal,
      )
      await hookCtx.workingDirectory.set(agent, created.worktreePath, signal)
      stager.setCreated(sid, { worktreePath: created.worktreePath, branch: created.branch })
      record({ event: sourceTag, sessionId: sid, branch: created.branch, path: created.worktreePath })
    }

    hookCtx.on('agent/inbox/inserted', ({ agent, message }) => {
      if ((agent?.session?.header?.delegationDepth ?? 0) > 0) return
      const sid = sessionSid(agent)
      const current = stager.get(sid)
      if (!current || current.status !== 'staged') return
      try {
        const task = agent.runMaintenance(async (signal) => {
          await Promise.resolve()
          while (!signal?.aborted) {
            const latest = stager.get(sid)
            if (!latest || (latest.status !== 'staged' && latest.status !== 'creating')) return
            try {
              await attemptStageCreation({
                agent,
                sid,
                stage: latest,
                promptText: extractPromptText(message),
                signal,
                sourceTag: 'stage-entered',
              })
              return
            } catch (err) {
              if (signal?.aborted) throw err
              const msg = err?.message || String(err)
              stager.setError(sid, msg)
              record({ event: 'stage-failed', sessionId: sid, error: msg.slice(0, 300) })
              const decision = await stager.waitDecision(sid, signal)
              if (decision !== 'retry') return
            }
          }
        })
        task?.catch?.(() => {})
      } catch (err) {
        record({ event: 'stage-maintenance-skipped', sessionId: sid, error: String(err).slice(0, 200) })
      }
    })

    hookCtx.on('agent/pre-step', async ({ agent, messages, step, signal }, next) => {
      if ((agent?.session?.header?.delegationDepth ?? 0) > 0) return next()
      const sid = sessionSid(agent)
      const latest = stager.get(sid)
      if (step === 1 && latest) {
        if (latest.status === 'error') {
          return { kind: 'reject' }
        }
        if (latest.status === 'staged') {
          try {
            await attemptStageCreation({
              agent,
              sid,
              stage: latest,
              promptText: extractPromptText(messages?.[0]),
              signal,
              sourceTag: 'stage-entered-prestep',
            })
          } catch (err) {
            const msg = err?.message || String(err)
            stager.setError(sid, msg)
            record({ event: 'stage-failed-prestep', sessionId: sid, error: msg.slice(0, 300) })
            return { kind: 'reject' }
          }
        }
      }
      const decision = await next()
      if (!decision || decision.kind === 'reject' || !Array.isArray(decision.messages) || decision.messages.length === 0) {
        return decision
      }
      if (step === 1 && stager.get(sid)?.status === 'created') {
        const nextStep = agent?.inbox?.nextStep || []
        const notices = nextStep.filter((m) => m?.source?.kind === 'working-directory')
        for (const notice of notices) agent.inbox?.remove?.(notice.id)
        if (notices.length > 0) {
          return { ...decision, messages: [...decision.messages, ...notices] }
        }
      }
      return decision
    })

    hookCtx.on('agent/disposed', ({ agent }) => {
      const sid = sessionSid(agent)
      if (sid) stager.clear(sid)
    })
  })

  if (enableAgentTool) {
    ctx.inject(['tools', 'systemPrompt', 'workingDirectory'], (toolCtx) => {
      try {
        toolCtx.tools.register(createWorktreeToolDefinition({
          defineTool,
          ToolArgsError,
          service,
          workingDirectory: toolCtx.workingDirectory,
        }))
        toolCtx.systemPrompt.section({
          name: 'dsh-runtime-tuning-worktree-manage',
          order: toolCtx.systemPrompt.getSectionOrder('DELIVERABLE_FILE_REFERENCES') + 2,
          text: ({ scope, agent } = {}) => {
            if (toolCtx.tools.get(CREATE_WORKTREE_TOOL, scope) === undefined) return ''
            if ((agent?.session?.header?.delegationDepth ?? 0) > 0) return ''
            return CREATE_WORKTREE_PROMPT
          },
        })
        record({ event: 'tool-registered', tool: CREATE_WORKTREE_TOOL })
      } catch (error) {
        record({ event: 'tool-register-failed', error: String(error).slice(0, 300) })
      }
    })
  }
}
