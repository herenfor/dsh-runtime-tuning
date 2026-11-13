// Read-only, in-memory metadata for the existing approval channel. Never answers it.
import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { findHostPackage } from './chat-answer-fix.mjs'
import { findSecret } from './secret-guard.mjs'
import { createRecorder } from './log.mjs'
export const name = 'dsh-runtime-tuning-approval-info'
export const inject = ['tools', 'approval', 'typert', 'sessionController']
const record = createRecorder('approval-info.log')
const TOOLS = new Set(['bash', 'pwsh', 'edit', 'write'])
const MODES = new Set(['workspace-write', 'danger-full-access'])
export const PROMPT = 'When requesting sandbox escalation, use the existing sandbox_permissions and justification fields together. State the concrete action and why wider access is needed. Your justification is your request, not a runtime-verified fact. Never invent verified paths or claim permission is limited to a file when requesting full access. Prefer edit/write for direct text changes so the approval can show a replacement fragment. If approval-info rejects a malformed reason, correct it once; do not repeatedly retry an unchanged operation.'

export function validateReason(exec) {
  if (!TOOLS.has(exec.name)) return undefined
  const a = exec.arguments ?? {}
  if (a.sandbox_permissions === undefined && a.justification === undefined) return undefined
  if (!MODES.has(a.sandbox_permissions)) return 'sandbox_permissions must be workspace-write or danger-full-access, paired with justification.'
  if (typeof a.justification !== 'string' || !a.justification.trim()) return 'Provide justification: the concrete action and why wider access is needed.'
  if (a.justification.length > 1200) return 'Keep justification within 1200 characters; do not paste a script into the reason.'
  if (/^(?:todo|tbd|test|reason|justification|n\/a|需要提权|需要更高权限|需要权限|提权|测试|申请权限|need (?:higher )?permissions?|requires? (?:higher )?permissions?)[.!。！\s]*$/i.test(a.justification.trim())) return 'Replace the placeholder reason with the concrete action and why wider access is needed.'
  if (findSecret(a.justification)) return 'Remove credentials from justification; never paste a secret into an approval reason.'
}


// One correction per operation in a turn. callId is deliberately excluded.
export class ReasonGuard {
  turns = new WeakMap()
  reset(session) { this.turns.delete(session) }
  check(exec) {
    if (!TOOLS.has(exec.name)) return undefined
    const error = validateReason(exec)
    const session = exec.agent?.session
    if (!session) return error
    const { justification: _reason, ...operation } = exec.arguments ?? {}
    const key = createHash('sha256').update(exec.name + JSON.stringify(operation, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value)).digest('hex')
    let failures = this.turns.get(session)
    if (!failures) { failures = new Map(); this.turns.set(session, failures) }
    const count = failures.get(key) ?? 0
    if (count >= 2) return 'This operation exhausted its one correction in this turn. Stop requesting it and explain the failure to the user.'
    if (error) failures.set(key, count + 1)
    return error
  }
}

export function makeSnapshot(exec, req, generation) {
  const args = exec.arguments
  if (!TOOLS.has(exec.name) || !args || typeof args !== 'object' || req.toolName !== exec.name) return null
  if (!MODES.has(args.sandbox_permissions) || typeof args.justification !== 'string') return null
  // Match the known native escalation construction using parameters already captured.
  // Never infer a permission mode from human-readable reason/displayReason strings.
  if (req.reason !== `escalate sandbox to ${args.sandbox_permissions}: ${args.justification}`) return null
  const raw = JSON.stringify(args)
  if (raw.length > 65536 || findSecret(raw)) return null
  // The requested mode is a tool argument, not an independently verified grant.
  return Object.freeze({ schemaVersion: 1, snapshotId: randomUUID(), generation,
    sessionId: exec.agent.session.id, agentId: exec.agent.id, callId: exec.callId,
    toolName: exec.name, capturePhase: 'approval/request:live-execution',
    purpose: typeof args.justification === 'string' ? args.justification : '',
    requestedMode: MODES.has(args.sandbox_permissions) ? args.sandbox_permissions : 'unknown',
    command: typeof args.command === 'string' ? args.command : null,
    filePath: typeof args.file_path === 'string' ? args.file_path : null,
    // No session cwd or targetKey is presented as a resolved executing path.
    workdir: typeof args.workdir === 'string' ? args.workdir : null,
    edit: exec.name === 'edit' && typeof args.old_string === 'string' && typeof args.new_string === 'string'
      ? Object.freeze({ before: args.old_string, after: args.new_string }) : null,
    replaceAll: args.replace_all === true, raw })
}

export class ApprovalSnapshots {
  active = new Map()
  pending = new Map()
  generation = 0
  track(exec) { if (exec.agent && exec.callId) this.active.set(exec.token, exec) }
  untrack(exec) { this.active.delete(exec.token) }
  begin(req) {
    const matches = [...this.active.values()].filter(e => e.agent === req.agent && e.callId === req.callId && e.name === req.toolName && !e.signal?.aborted)
    if (!req.callId || req.signal?.aborted || matches.length !== 1) return () => {}
    const value = makeSnapshot(matches[0], req, ++this.generation)
    if (!value) return () => {}
    const entry = { value, signal: req.signal }
    this.pending.set(value.snapshotId, entry)
    const remove = () => this.pending.delete(value.snapshotId)
    req.signal?.addEventListener('abort', remove, { once: true })
    return () => { req.signal?.removeEventListener('abort', remove); remove() }
  }
  read(request) {
    if (!request || typeof request.sessionId !== 'string' || typeof request.callId !== 'string' || request.sessionId.length > 512 || request.callId.length > 512) throw new TypeError('invalid approval read request')
    const matches = [...this.pending.values()].filter(e => !e.signal?.aborted && e.value.sessionId === request.sessionId && e.value.callId === request.callId)
    if (matches.length !== 1) return null
    const value = matches[0].value
    if (request.snapshotId !== undefined && request.snapshotId !== value.snapshotId) return null
    return value
  }
  clear() { this.pending.clear(); this.active.clear() }
}

export function supportsApproval(ctx, exec) {
  if (!TOOLS.has(exec.name)) return false
  try {
    const properties = ctx.tools.get(exec.name, exec.agent, exec.toolSet)?.parameters?.properties
    return properties?.justification?.type === 'string' && Array.isArray(properties?.sandbox_permissions?.enum)
      && [...MODES].every(mode => properties.sandbox_permissions.enum.includes(mode))
  } catch { return false }
}

export async function apply(ctx) {
  const snapshots = new ApprovalSnapshots()
  const guard = new ReasonGuard()
  // Host-provided protocol preserves the same Cordis/Service realm as the running DSH.
  const protocol = await import(pathToFileURL(join(findHostPackage(process.argv[1], 'dsh-typert-protocol'), 'lib/index.js')).href)
  class ApprovalInfo extends protocol.TypertRemoteService {
    constructor(scope) { super(scope, 'runtimeTuningApproval') }
    read(request) { return snapshots.read(request) }
  }
  const initializers = []
  protocol.Remote({ resources: { session: request => request.sessionId } })(ApprovalInfo.prototype.read,
    { name: 'read', kind: 'method', static: false, private: false, addInitializer: f => initializers.push(f) })
  const service = new ApprovalInfo(ctx)
  for (const initialize of initializers) initialize.call(service)
  const codec = (name, parse) => ({ mode: 'strict', typeSymbol: name, create: () => ({ parse }) })
  ctx.typert.register({ package: '@herenfor/dsh-tune/approval-info', face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: [{
    id: '@herenfor/dsh-tune/approval-info/read', service: 'runtimeTuningApproval', namespace: 'runtimeTuningApproval', method: 'read', invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: codec('ApprovalRead', value => {
      if (!value || typeof value.sessionId !== 'string' || typeof value.callId !== 'string' || (value.snapshotId !== undefined && typeof value.snapshotId !== 'string')) throw new TypeError('invalid approval read')
      return { sessionId: value.sessionId, callId: value.callId, ...(typeof value.snapshotId === 'string' ? { snapshotId: value.snapshotId } : {}) }
    }) }], result: codec('ApprovalSnapshot', value => value),
  }] })
  ctx.on('tools/pre-execute', (exec, next) => {
    const error = supportsApproval(ctx, exec) ? guard.check(exec) : undefined
    if (error) return Promise.resolve({ kind: 'deny', reason: 'approval-info: ' + error + ' Correct this request once; do not loop on the same operation.' })
    return next()
  }, { prepend: true })
  ctx.on('tools/execute', async (exec, next) => {
    if (supportsApproval(ctx, exec)) snapshots.track(exec)
    try { return await next() } finally { snapshots.untrack(exec) }
  }, { prepend: true })
  ctx.on('tools/result', exec => snapshots.untrack(exec))
  ctx.on('session/event', (session, event) => { if (event.type === 'turn/start' || event.type === 'turn/end') guard.reset(session) })
  ctx.on('approval/request', async (req, next) => {
    let dispose = () => {}
    try { dispose = snapshots.begin(req) } catch { record({ event: 'snapshot-unavailable', tool: req.toolName }) }
    try { return await next() } finally { dispose() }
  }, { prepend: true })
  ctx.effect(() => () => snapshots.clear())
  ctx.inject(['systemPrompt'], scope => scope.systemPrompt.section({ name: 'runtime-tuning:approval', order: 90, text: PROMPT }))
  record({ event: 'loaded', schemaVersion: 1 })
}
