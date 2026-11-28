// Approval metadata & validation middleware for DSH runtime tuning.
// Uses concise plain-text reasons when available, otherwise preserves native approval,
// multi-channel schema v2 read snapshots (tool escalation, plugin_manager, PTC,
// prepare-phase policy ask, and CUA questions), and pre-side-effect parameter verification.
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findHostPackage } from './chat-answer-fix.mjs'
import { hostAnchors, hostImport } from './host-modules.mjs'
import { createRecorder } from './log.mjs'
import {
  APPROVAL_POST_REWRITE_MISMATCH_CODE,
  APPROVAL_REASON_INVALID_CODE,
  APPROVAL_VIEW_SCHEMA_VERSION,
  CUA_APPROVAL_QUESTION_IDS,
  OFFICIAL_ESCALATABLE_TOOLS,
  adaptCuaQuestionRecord,
  adaptToolApprovalRecord,
  canonicalClone,
  getParameterRewrites,
  isKnownOfficialToolName,
  isWideningMode,
  serializeApprovalView,
  validateApprovalReason,
  verifyPostRewriteParameters,
} from './approval-contract.mjs'

export const name = 'dsh-runtime-tuning-approval-info'
export const inject = ['tools', 'approval', 'typert', 'sessionController']

const record = createRecorder('approval-info.log')

/** Tools supporting model-supplied `sandbox_permissions` + `justification`. */
const ESCALATABLE_TOOLS = OFFICIAL_ESCALATABLE_TOOLS
const KNOWN_PLUGIN_MANAGER_CORE_ACTIONS = ['install_bundle', 'set_plugin', 'set_bundle', 'set_version_exemption']
const MODES = new Set(['workspace-write', 'danger-full-access'])
const CHANNELS = new Set(['tool-approval', 'cua-question'])

export const PROMPT = [
  'When requesting sandbox escalation with `sandbox_permissions` and `justification`, keep `justification` to one short plain-text sentence (at most 160 characters) explaining the action and why wider access is needed.',
  'Never include line breaks, markdown code fences or inline backticks, placeholder words, serialized JSON arguments, or credentials/secrets in `justification`.',
  'Your `justification` is your stated intent, not a runtime-verified path or grant.',
  'Reason formatting improves presentation only; it does not grant or deny permission. Native approval and argument checks still apply. Never retry a user rejection to work around it.',
].join(' ')

class FallbackHarnessError extends Error {
  constructor(message, code, options) {
    super(message, options)
    this.code = code
    this.name = 'HarnessError'
  }
}

async function resolveHarnessErrorClass(entryOrAnchors = process.argv[1]) {
  try {
    const dir = findHostPackage(entryOrAnchors, 'dsh-error')
    const mod = await import(pathToFileURL(join(dir, 'lib/index.js')).href)
    if (typeof mod.HarnessError === 'function') return mod.HarnessError
  } catch {}
  return FallbackHarnessError
}

function readOptionalService(ctx, key) {
  if (!ctx || typeof ctx !== 'object') return undefined
  if (typeof ctx.get === 'function') {
    try {
      const svc = ctx.get(key)
      if (svc !== undefined) return svc
    } catch {}
  }
  try {
    return ctx[key]
  } catch {
    return undefined
  }
}

/**
 * Determine whether a session tracks an isolated sandbox mode via `session/event`
 * or Host `sandboxPolicy`.
 */
function resolveStandingMode(ctx, exec, sessionModes, roots) {
  const session = exec?.agent?.session
  const sessionId = session?.id
  try {
    const policySvc = ctx.get?.('sandboxPolicy')
    if (policySvc && typeof policySvc.resolve === 'function') {
      const resolved = policySvc.resolve(exec?.agent ? { session } : {})
      if (typeof resolved?.mode === 'string') return resolved.mode
    }
  } catch {}
  if (typeof sessionId === 'string') {
    if (sessionModes.has(sessionId)) return sessionModes.get(sessionId)
    const rootId = roots.get(sessionId)
    if (rootId && sessionModes.has(rootId)) return sessionModes.get(rootId)
  }
  return undefined
}

function resolveEffectiveApprovalPolicy(ctx, exec, policyOverrides) {
  const session = exec?.agent?.session
  try {
    if (ctx.approval && typeof ctx.approval.effectivePolicy === 'function' && session) {
      return ctx.approval.effectivePolicy(session)
    }
  } catch {}
  const sessionId = session?.id
  if (typeof sessionId === 'string' && policyOverrides.has(sessionId)) {
    return policyOverrides.get(sessionId)
  }
  return ctx.approval?.config?.policy ?? 'ask'
}

function resolvePtcRuntime(ctx, exec) {
  return readOptionalService(exec?.agent?.ctx, 'ptcRuntime') ?? readOptionalService(ctx, 'ptcRuntime')
}

function isPtcRunCodeActive(ctx, exec) {
  if (!exec || exec.name !== 'run_code' || exec.parent !== undefined) return false
  // Official PTC reserves `run_code` outside `ctx.tools`. A registered `run_code` tool is non-PTC.
  try {
    if (ctx?.tools?.get?.('run_code', exec.agent, exec.toolSet) !== undefined) return false
  } catch {}
  try {
    if (typeof ctx?.tools?.selectExecutor === 'function') {
      const executor = ctx.tools.selectExecutor(exec.agent)
      if (executor && executor.constructor?.name === 'NativeToolExecutor') return false
    }
  } catch {}
  return resolvePtcRuntime(ctx, exec) !== undefined
}

/**
 * Check whether an execution's tool contract accepts `sandbox_permissions` + `justification`.
 */
export function supportsApproval(ctx, exec) {
  if (!exec || !ESCALATABLE_TOOLS.has(exec.name)) return false
  if (exec.name === 'run_code') {
    if (!isPtcRunCodeActive(ctx, exec)) return false
    const ptcRuntime = resolvePtcRuntime(ctx, exec)
    return typeof ptcRuntime?.sandboxMode === 'string' && ptcRuntime.sandboxMode.length > 0
  }
  try {
    const def = ctx.tools?.get?.(exec.name, exec.agent, exec.toolSet)
    if (!def) return false
    const props = def.parameters?.properties
    return props?.justification?.type === 'string'
      && Array.isArray(props?.sandbox_permissions?.enum)
      && [...MODES].every((mode) => props.sandbox_permissions.enum.includes(mode))
  } catch {
    return false
  }
}

/**
 * Verify that an active tool invocation matches an authentic official DSH tool
 * contract before rendering a simplified view; unrecognized/third-party tools return false.
 */
export function verifyOfficialToolContract(ctx, exec, phase) {
  if (!exec || !isKnownOfficialToolName(exec.name)) return false
  if (exec.name === 'run_code') {
    return phase === 'prepared' ? isPtcRunCodeActive(ctx, exec) : supportsApproval(ctx, exec)
  }
  let def
  try {
    def = ctx?.tools?.get?.(exec.name, exec.agent, exec.toolSet)
  } catch {
    return false
  }
  if (!def || typeof def.parameters !== 'object' || def.parameters === null) return false
  const props = def.parameters.properties
  if (phase === 'prepared') {
    return typeof props === 'object' && props !== null
  }
  if (exec.name === 'plugin_manager') {
    const actionEnum = props?.action?.enum
    return Array.isArray(actionEnum) && KNOWN_PLUGIN_MANAGER_CORE_ACTIONS.every((a) => actionEnum.includes(a))
  }
  if (!supportsApproval(ctx, exec)) return false
  if (exec.name === 'bash' || exec.name === 'pwsh') return props?.command?.type === 'string'
  if (exec.name === 'write') return props?.file_path?.type === 'string' && props?.content?.type === 'string'
  if (exec.name === 'edit') return props?.file_path?.type === 'string' && props?.old_string?.type === 'string'
  if (exec.name === 'apply_patch') return props?.input?.type === 'string'
  return false
}

/**
 * Validate `runtimeTuningApproval/read` RPC arguments strictly.
 * @param {unknown} value - Incoming request object.
 * @returns {object} Sanitized request object.
 */
export function parseApprovalReadRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('invalid approval read request')
  }
  const { sessionId, channel, callId, cuaId, subjectName, snapshotId, locale } = value
  if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 512) {
    throw new TypeError('invalid approval read request: sessionId')
  }
  if (channel !== undefined && !CHANNELS.has(channel)) {
    throw new TypeError('invalid approval read request: channel')
  }
  if (callId !== undefined && (typeof callId !== 'string' || !callId || callId.length > 512)) {
    throw new TypeError('invalid approval read request: callId')
  }
  if (cuaId !== undefined && !CUA_APPROVAL_QUESTION_IDS.has(cuaId)) {
    throw new TypeError('invalid approval read request: cuaId')
  }
  if (subjectName !== undefined && (typeof subjectName !== 'string' || subjectName.length > 512)) {
    throw new TypeError('invalid approval read request: subjectName')
  }
  if (snapshotId !== undefined && (typeof snapshotId !== 'string' || !snapshotId || snapshotId.length > 512)) {
    throw new TypeError('invalid approval read request: snapshotId')
  }
  if (locale !== undefined && (typeof locale !== 'string' || locale.length > 64)) {
    throw new TypeError('invalid approval read request: locale')
  }
  if (callId === undefined && cuaId === undefined && channel !== 'cua-question') {
    throw new TypeError('invalid approval read request: callId or cuaId required')
  }
  return {
    sessionId,
    ...(channel !== undefined ? { channel } : {}),
    ...(callId !== undefined ? { callId } : {}),
    ...(cuaId !== undefined ? { cuaId } : {}),
    ...(subjectName !== undefined ? { subjectName } : {}),
    ...(snapshotId !== undefined ? { snapshotId } : {}),
    ...(locale !== undefined ? { locale } : {}),
  }
}

/**
 * Check a model-provided escalation reason before host approval opens.
 * Cosmetic failures select native presentation; only credential disclosure is blocked.
 * Returns a skipped result when no model escalation reason validation applies
 * (e.g., non-escalating calls, repeating mode, `never` policy, or missing approver),
 * preserving official Host error paths cleanly.
 */
export function checkModelReasonRequest({
  ctx,
  exec,
  standingMode,
  effectivePolicy,
}) {
  if (!exec || !ESCALATABLE_TOOLS.has(exec.name)) return { ok: true, skipped: true }
  const args = exec.arguments
  if (!args || typeof args !== 'object' || Array.isArray(args)) return { ok: true, skipped: true }

  const rawMode = args.sandbox_permissions
  const hasMode = rawMode !== undefined
  const rawJust = args.justification
  const trimmedEmptyNoMode = !hasMode && (rawJust === undefined || (typeof rawJust === 'string' && rawJust.trim() === ''))
  if (trimmedEmptyNoMode) return { ok: true, skipped: true }

  // Let official host checks handle unavailable approval service, `'never'` policy,
  // missing/non-paired mode arguments, or non-widening mode errors directly.
  if (ctx?.approval === undefined) return { ok: true, skipped: true }
  if (effectivePolicy === 'never') return { ok: true, skipped: true }
  if (!MODES.has(rawMode)) return { ok: true, skipped: true }
  if (standingMode !== undefined && !isWideningMode(rawMode, standingMode)) {
    return { ok: true, skipped: true }
  }
  if (!supportsApproval(ctx, exec)) return { ok: true, skipped: true }

  const verdict = validateApprovalReason(rawJust)
  if (verdict.ok) return { ok: true, reason: verdict.reason }
  if (verdict.category !== 'credential') {
    // Do not change arguments, invent a reason, retry the tool, or answer approval.
    // The adapter independently checks the actual reason at approval time and
    // leaves malformed/long reasons to the current official card and tool checks.
    return { ok: true, fallback: true, category: verdict.category }
  }
  return {
    ok: false,
    code: APPROVAL_REASON_INVALID_CODE,
    category: verdict.category,
    message: `approval-info: ${verdict.message} Remove the credential and use the tool's authenticated configuration or environment instead.`,
  }
}

/**
 * In-memory coordinator tracking active pipeline executions and pending
 * approval prompts across tool approvals (`prepared` & `dispatched`) and CUA questions.
 */
export class ApprovalSnapshots {
  /** @type {Map<symbol, object>} */
  active = new Map()
  /** @type {Map<string, { record: object, signal?: AbortSignal, execState?: object, disposeAbort: () => void }>} */
  pending = new Map()
  generation = 0

  trackPrepared(exec, standingMode) {
    if (!exec || typeof exec.token !== 'symbol') return null
    const existing = this.active.get(exec.token)
    if (existing) return existing
    const state = {
      token: exec.token,
      exec,
      agent: exec.agent,
      sessionId: exec.agent?.session?.id,
      agentId: exec.agent?.id,
      callId: exec.callId,
      toolName: exec.name,
      phase: 'prepared',
      standingMode,
      prepareApproved: false,
      prepareApprovedArgs: undefined,
      prepareApprovedMode: undefined,
      prepareRewriteBaseline: 0,
      postRewriteViolation: undefined,
    }
    this.active.set(exec.token, state)
    return state
  }

  enterDispatch(exec, standingMode) {
    if (!exec || typeof exec.token !== 'symbol') return null
    let state = this.active.get(exec.token)
    if (!state) {
      state = this.trackPrepared(exec, standingMode)
    }
    state.phase = 'dispatched'
    if (standingMode !== undefined) state.standingMode = standingMode
    return state
  }

  untrack(exec) {
    if (!exec || typeof exec.token !== 'symbol') return
    this.active.delete(exec.token)
  }

  matchExecution(req) {
    if (!req?.agent || !req.callId || !req.toolName || req.signal?.aborted) return null
    const matches = [...this.active.values()].filter((entry) => (
      entry.agent === req.agent
      && entry.callId === req.callId
      && entry.toolName === req.toolName
      && !entry.exec.signal?.aborted
    ))
    return matches.length === 1 ? matches[0] : null
  }

  beginToolApproval(req, { ctx, locale, standingMode } = {}) {
    if (req?.signal?.aborted) return { entry: null, guard: null, dispose: () => {} }
    const state = this.matchExecution(req)
    const sessionId = req?.agent?.session?.id
    if (!state || typeof sessionId !== 'string') return { entry: null, guard: null, dispose: () => {} }

    const approvedArgsSnapshot = canonicalClone(state.exec.arguments)
    const rewriteBaseline = getParameterRewrites(state.exec).length
    const modeSnapshot = standingMode ?? state.standingMode
    const guard = {
      execState: state,
      approvedArgsSnapshot,
      approvedModeSnapshot: modeSnapshot,
      approvedSessionId: sessionId,
      rewriteBaseline,
    }

    const snapshotId = randomUUID()
    const generation = ++this.generation
    const requestKey = `tool:${sessionId}:${req.callId}:${generation}`
    const requestedMode = typeof state.exec.arguments?.sandbox_permissions === 'string'
      ? state.exec.arguments.sandbox_permissions
      : (req.toolName === 'plugin_manager' ? 'danger-full-access' : undefined)
    const verifiedOfficial = ctx ? verifyOfficialToolContract(ctx, state.exec, state.phase) : undefined

    const viewRecord = adaptToolApprovalRecord({
      snapshotId,
      generation,
      sessionId,
      requestKey,
      callId: req.callId,
      toolName: req.toolName,
      phase: state.phase,
      reqReason: req.reason,
      displayReason: req.displayReason,
      args: state.exec.arguments,
      requestedMode,
      standingMode: modeSnapshot,
      verifiedOfficial,
      locale,
    })
    if (!viewRecord) return { entry: null, guard, dispose: () => {} }

    const remove = () => {
      const stored = this.pending.get(snapshotId)
      if (!stored) return
      stored.disposeAbort()
      this.pending.delete(snapshotId)
    }
    const onAbort = () => remove()
    req.signal?.addEventListener('abort', onAbort, { once: true })

    const entry = {
      record: viewRecord,
      signal: req.signal,
      ...guard,
      disposeAbort: () => req.signal?.removeEventListener('abort', onAbort),
    }
    this.pending.set(snapshotId, entry)
    return { entry, guard, dispose: remove }
  }

  beginCuaQuestion(req, { locale } = {}) {
    if (!req || req.signal?.aborted || !req.agent?.session?.id) {
      return { entry: null, dispose: () => {} }
    }
    if (req.agent.origin === 'subagent') {
      return { entry: null, dispose: () => {} }
    }
    if (!Array.isArray(req.questions) || req.questions.length !== 1) {
      return { entry: null, dispose: () => {} }
    }
    const question = req.questions[0]
    if (!CUA_APPROVAL_QUESTION_IDS.has(question?.id) || question?.intent?.kind !== 'approval') {
      return { entry: null, dispose: () => {} }
    }

    const sessionId = req.agent.session.id
    const snapshotId = randomUUID()
    const generation = ++this.generation
    const requestKey = `cua:${sessionId}:${question.id}:${generation}`
    const viewRecord = adaptCuaQuestionRecord({
      snapshotId,
      generation,
      sessionId,
      requestKey,
      question,
      locale,
    })
    if (!viewRecord) return { entry: null, dispose: () => {} }

    const remove = () => {
      const stored = this.pending.get(snapshotId)
      if (!stored) return
      stored.disposeAbort()
      this.pending.delete(snapshotId)
    }
    const onAbort = () => remove()
    req.signal?.addEventListener('abort', onAbort, { once: true })

    const entry = {
      record: viewRecord,
      signal: req.signal,
      execState: undefined,
      disposeAbort: () => req.signal?.removeEventListener('abort', onAbort),
    }
    this.pending.set(snapshotId, entry)
    return { entry, dispose: remove }
  }

  read(request) {
    const parsed = parseApprovalReadRequest(request)
    const matches = [...this.pending.values()].filter((entry) => {
      if (entry.signal?.aborted) return false
      const r = entry.record
      if (r.sessionId !== parsed.sessionId) return false
      if (parsed.channel !== undefined && r.channel !== parsed.channel) return false
      if (parsed.callId !== undefined && r.callId !== parsed.callId) return false
      if (parsed.cuaId !== undefined && r._cuaId !== parsed.cuaId) return false
      if (parsed.subjectName !== undefined && r.permission?.subjectName !== parsed.subjectName) return false
      // Guard against CUA records accidentally matching tool queries without channel:
      if (parsed.callId === undefined && parsed.cuaId !== undefined && r.channel !== 'cua-question') return false
      return true
    })
    if (matches.length !== 1) return null
    const matched = matches[0].record
    if (parsed.snapshotId !== undefined && parsed.snapshotId !== matched.snapshotId) return null
    return serializeApprovalView(matched, parsed.locale) ?? null
  }

  clear() {
    for (const entry of this.pending.values()) entry.disposeAbort()
    this.pending.clear()
    this.active.clear()
  }
}

function registerPinnedHook(ctx, eventName, listener, options = {}) {
  const hooks = ctx.events?._hooks
  const dispose = ctx.on(eventName, listener, options)
  let hookEntry
  if (hooks && Array.isArray(hooks[eventName])) {
    const arr = hooks[eventName]
    hookEntry = options.prepend ? arr[0] : arr[arr.length - 1]
  }
  return { hookEntry, dispose }
}

function moveHookToEdge(hooks, entry, edge) {
  if (!Array.isArray(hooks) || !entry) return
  const index = hooks.indexOf(entry)
  if (index < 0) return
  if (edge === 'head' && index !== 0) {
    hooks.splice(index, 1)
    hooks.unshift(entry)
  } else if (edge === 'tail' && index !== hooks.length - 1) {
    hooks.splice(index, 1)
    hooks.push(entry)
  }
}

function wrapToolsExecutable(ctx, verifyBoundaryIntegrity) {
  const tools = ctx?.tools
  if (!tools || typeof tools.executable !== 'function') return () => {}
  const hadOwn = Object.prototype.hasOwnProperty.call(tools, 'executable')
  const ownDesc = hadOwn ? Object.getOwnPropertyDescriptor(tools, 'executable') : undefined
  if (ownDesc && !ownDesc.configurable && !ownDesc.writable) return () => {}

  const origExecutable = tools.executable
  const wrappedExecutable = function (toolName, scope, toolSet) {
    const def = origExecutable.call(this, toolName, scope, toolSet)
    if (!def || typeof def.execute !== 'function') return def
    const execDesc = Object.getOwnPropertyDescriptor(def, 'execute')
    const canProxy = !execDesc || execDesc.configurable || execDesc.writable
    const wrappedExecute = async (args, exec) => {
      verifyBoundaryIntegrity(exec, args)
      return Reflect.apply(def.execute, def, [args, exec])
    }
    if (canProxy) {
      return new Proxy(def, {
        get(target, prop) {
          if (prop === 'execute') return wrappedExecute
          return Reflect.get(target, prop, target)
        },
      })
    }
    return Object.assign(Object.create(Object.getPrototypeOf(def)), def, { execute: wrappedExecute })
  }

  try {
    tools.executable = wrappedExecutable
  } catch {
    return () => {}
  }

  return () => {
    try {
      if (tools.executable !== wrappedExecutable) return
      if (hadOwn && ownDesc) {
        Object.defineProperty(tools, 'executable', ownDesc)
      } else {
        delete tools.executable
      }
    } catch {}
  }
}

export async function mountApprovalHooks(ctx, { snapshots = new ApprovalSnapshots(), HarnessErrorClass } = {}) {
  const sessionModes = new Map()
  const policyOverrides = new Map()
  const sessionRoots = new Map()
  HarnessErrorClass ??= await resolveHarnessErrorClass()

  const recordRoot = (session) => {
    const id = session?.id
    if (typeof id !== 'string') return
    let root = id
    const seen = new Set()
    let current = session?.header?.parentSession
    while (typeof current === 'string' && current !== root && !seen.has(current)) {
      seen.add(current)
      root = current
      current = sessionRoots.get(current)
    }
    if (root !== id) sessionRoots.set(id, root)
  }

  const verifyBoundaryIntegrity = (exec, explicitArgs) => {
    const state = snapshots.active.get(exec?.token)
    if (!state?.prepareApproved) return
    const rewrites = getParameterRewrites(exec).slice(state.prepareRewriteBaseline)
    const currentMode = resolveStandingMode(ctx, exec, sessionModes, sessionRoots)
    const currentSessionId = exec.agent?.session?.id
    const aborted = Boolean(exec.signal?.aborted)

    const checkExecArgs = verifyPostRewriteParameters({
      approvedArgs: state.prepareApprovedArgs,
      currentArgs: exec.arguments,
      rewrites,
      approvedMode: state.prepareApprovedMode,
      currentMode,
      approvedSessionId: state.sessionId,
      currentSessionId,
      aborted,
    })
    const checkExplicitArgs = (explicitArgs !== undefined && explicitArgs !== exec.arguments)
      ? verifyPostRewriteParameters({
        approvedArgs: state.prepareApprovedArgs,
        currentArgs: explicitArgs,
        rewrites,
        approvedMode: state.prepareApprovedMode,
        currentMode,
        approvedSessionId: state.sessionId,
        currentSessionId,
        aborted,
      })
      : { ok: true }
    const check = !checkExecArgs.ok ? checkExecArgs : checkExplicitArgs
    if (!check.ok) {
      state.postRewriteViolation = check
      record({ event: 'post-rewrite-mismatch', phase: 'prepared->dispatched', code: check.code, tool: exec.name, session: state.sessionId })
      throw new HarnessErrorClass(check.message, APPROVAL_POST_REWRITE_MISMATCH_CODE)
    }
  }

  ctx.on('session/event', (session, event) => {
    recordRoot(session)
    const sessionId = session?.id
    if (typeof sessionId !== 'string') return
    if (event?.type === 'sandbox/mode' && typeof event.data?.mode === 'string') {
      sessionModes.set(sessionId, event.data.mode)
    }
    if (event?.type === 'approval/policy' && typeof event.data?.policy === 'string') {
      policyOverrides.set(sessionId, event.data.policy)
    }
  })

  // Outermost pre-execute hook: establish prepared-phase tracking without overriding security/policy hooks.
  const prepareTrackHook = registerPinnedHook(ctx, 'tools/pre-execute', (exec, next) => {
    const mode = resolveStandingMode(ctx, exec, sessionModes, sessionRoots)
    snapshots.trackPrepared(exec, mode)
    return next()
  }, { prepend: true })

  // Outer dispatch hook: transition phase to dispatched and check reason safety
  // after all pre-execute security guards, policy asks, and tool checkGuards have already passed.
  const outerExecHook = registerPinnedHook(ctx, 'tools/execute', async (exec, next) => {
    const standingMode = resolveStandingMode(ctx, exec, sessionModes, sessionRoots)
    const state = snapshots.enterDispatch(exec, standingMode)
    const reasonCheck = checkModelReasonRequest({
      ctx,
      exec,
      standingMode,
      effectivePolicy: resolveEffectiveApprovalPolicy(ctx, exec, policyOverrides),
    })
    if (!reasonCheck.ok) {
      record({ event: 'reason-rejected', code: reasonCheck.code, category: reasonCheck.category, tool: exec.name, session: exec.agent?.session?.id })
      snapshots.untrack(exec)
      throw new HarnessErrorClass(reasonCheck.message, reasonCheck.code)
    }
    if (reasonCheck.fallback) {
      record({ event: 'reason-native-fallback', category: reasonCheck.category, tool: exec.name, session: exec.agent?.session?.id })
    }
    try {
      return await next()
    } catch (error) {
      if (state?.postRewriteViolation) {
        throw new HarnessErrorClass(state.postRewriteViolation.message, state.postRewriteViolation.code, { cause: error })
      }
      throw error
    } finally {
      snapshots.untrack(exec)
    }
  }, { prepend: true })

  // Innermost dispatch hook (pinned last even across late/reloaded plugins) + tools.executable Proxy:
  // verify any execution previously approved during `prepare()` suffered zero illegal mutations.
  const boundaryExecHook = registerPinnedHook(ctx, 'tools/execute', async (exec, next) => {
    verifyBoundaryIntegrity(exec)
    return next()
  })

  ctx.on('tools/result', (exec) => snapshots.untrack(exec))

  const approvalReqHook = registerPinnedHook(ctx, 'approval/request', async (req, next) => {
    const standingMode = resolveStandingMode(ctx, { agent: req?.agent }, sessionModes, sessionRoots)
    const activeLocale = readOptionalService(ctx, 'locale')?.getSnapshot?.()?.active
    let began = { entry: null, guard: null, dispose: () => {} }
    try {
      began = snapshots.beginToolApproval(req, { ctx, locale: activeLocale, standingMode })
    } catch (error) {
      record({
        event: 'snapshot-unavailable',
        channel: 'tool-approval',
        tool: req?.toolName,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    try {
      const outcome = await next()
      const target = began.guard ?? began.entry
      if (outcome === 'allowed-once' && target?.execState) {
        const execState = target.execState
        if (execState.phase === 'prepared') {
          const rewrites = getParameterRewrites(execState.exec).slice(target.rewriteBaseline)
          const check = verifyPostRewriteParameters({
            approvedArgs: target.approvedArgsSnapshot,
            currentArgs: execState.exec.arguments,
            rewrites,
            approvedMode: target.approvedModeSnapshot,
            currentMode: resolveStandingMode(ctx, execState.exec, sessionModes, sessionRoots),
            approvedSessionId: target.approvedSessionId,
            currentSessionId: execState.exec.agent?.session?.id,
            aborted: Boolean(req.signal?.aborted || execState.exec.signal?.aborted),
          })
          if (!check.ok) {
            execState.postRewriteViolation = check
            record({ event: 'post-rewrite-mismatch', phase: 'prepared', code: check.code, tool: req.toolName, session: target.approvedSessionId })
            throw new HarnessErrorClass(check.message, check.code)
          }
          execState.prepareApproved = true
          execState.prepareApprovedArgs = canonicalClone(execState.exec.arguments)
          execState.prepareApprovedMode = resolveStandingMode(ctx, execState.exec, sessionModes, sessionRoots)
          execState.prepareRewriteBaseline = getParameterRewrites(execState.exec).length
        } else {
          const rewrites = getParameterRewrites(execState.exec).slice(target.rewriteBaseline)
          const check = verifyPostRewriteParameters({
            approvedArgs: target.approvedArgsSnapshot,
            currentArgs: execState.exec.arguments,
            rewrites,
            approvedMode: target.approvedModeSnapshot,
            currentMode: resolveStandingMode(ctx, execState.exec, sessionModes, sessionRoots),
            approvedSessionId: target.approvedSessionId,
            currentSessionId: execState.exec.agent?.session?.id,
            aborted: Boolean(req.signal?.aborted || execState.exec.signal?.aborted),
          })
          if (!check.ok) {
            execState.postRewriteViolation = check
            record({ event: 'post-rewrite-mismatch', phase: 'dispatched', code: check.code, tool: req.toolName, session: target.approvedSessionId })
            throw new HarnessErrorClass(check.message, check.code)
          }
        }
      }
      return outcome
    } finally {
      began.dispose()
    }
  }, { prepend: true })

  const cuaReqHook = registerPinnedHook(ctx, 'user-questions/request', async (req, next) => {
    const activeLocale = readOptionalService(ctx, 'locale')?.getSnapshot?.()?.active
    let began = { entry: null, dispose: () => {} }
    try {
      began = snapshots.beginCuaQuestion(req, { locale: activeLocale })
    } catch (error) {
      record({
        event: 'snapshot-unavailable',
        channel: 'cua-question',
        error: error instanceof Error ? error.message : String(error),
      })
    }
    try {
      return await next()
    } finally {
      began.dispose()
    }
  }, { prepend: true })

  // Keep head/tail invariants across late or reloaded plugin registrations in Cordis.
  const hookTable = ctx.events?._hooks
  if (hookTable && typeof ctx.on === 'function') {
    ctx.on('internal/dispatch', (_type, eventName) => {
      const hooks = hookTable[eventName]
      if (!Array.isArray(hooks)) return
      if (eventName === 'tools/execute') {
        moveHookToEdge(hooks, outerExecHook.hookEntry, 'head')
        moveHookToEdge(hooks, boundaryExecHook.hookEntry, 'tail')
      } else if (eventName === 'tools/pre-execute') {
        moveHookToEdge(hooks, prepareTrackHook.hookEntry, 'head')
      } else if (eventName === 'approval/request') {
        moveHookToEdge(hooks, approvalReqHook.hookEntry, 'head')
      } else if (eventName === 'user-questions/request') {
        moveHookToEdge(hooks, cuaReqHook.hookEntry, 'head')
      }
    })
  }

  const restoreExecutable = wrapToolsExecutable(ctx, verifyBoundaryIntegrity)

  ctx.effect(() => () => {
    restoreExecutable()
    snapshots.clear()
    sessionModes.clear()
    policyOverrides.clear()
    sessionRoots.clear()
  })

  ctx.inject(['systemPrompt'], (scope) => scope.systemPrompt.section({ name: 'runtime-tuning:approval', order: 90, text: PROMPT }))
  return snapshots
}

export async function apply(ctx) {
  const snapshots = new ApprovalSnapshots()
  const anchors = hostAnchors(ctx)
  const HarnessErrorClass = await resolveHarnessErrorClass(anchors)

  if (ctx.typert && typeof ctx.typert.register === 'function') {
    const protocol = await hostImport('dsh-typert-protocol', anchors)
    class ApprovalInfo extends protocol.TypertRemoteService {
      constructor(scope) { super(scope, 'runtimeTuningApproval') }
      read(request) { return snapshots.read(request) }
    }
    const initializers = []
    protocol.Remote({ resources: { session: (request) => request.sessionId } })(
      ApprovalInfo.prototype.read,
      { name: 'read', kind: 'method', static: false, private: false, addInitializer: (f) => initializers.push(f) },
    )
    const service = new ApprovalInfo(ctx)
    for (const initialize of initializers) initialize.call(service)
    const codec = (codecName, parse) => ({ mode: 'strict', typeSymbol: codecName, create: () => ({ parse }) })
    ctx.typert.register({
      package: '@herenfor/dsh-tune/approval-info',
      face: 'host',
      schemas: [],
      model: { services: [], events: [], objects: [] },
      invocations: [{
        id: '@herenfor/dsh-tune/approval-info/read',
        service: 'runtimeTuningApproval',
        namespace: 'runtimeTuningApproval',
        method: 'read',
        invocation: { kind: 'direct' },
        parameters: [{
          name: 'request',
          wire: 'request',
          source: 'json',
          codec: codec('ApprovalRead', parseApprovalReadRequest),
        }],
        result: codec('ApprovalView', (value) => value),
      }],
    })
  }

  await mountApprovalHooks(ctx, { snapshots, HarnessErrorClass })
  record({ event: 'loaded', schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION })
}
