/**
 * Pure approval contract validation, parameter rewrite provenance, and official
 * adapter builders shared across Host plugins. Zero Cordis or DOM runtime
 * side effects live in this module.
 *
 * @module @herenfor/dsh-tune/approval-contract
 */
import { formatApprovalPermissionText, resolveLocaleFamily } from './chat-presentation.mjs'

export { formatApprovalPermissionText, resolveLocaleFamily }

/** Schema version implemented by `runtimeTuningApproval/read`. */
export const APPROVAL_VIEW_SCHEMA_VERSION = 2

/** Maximum Unicode codepoint count accepted for model-supplied justifications. */
export const MAX_APPROVAL_REASON_CODEPOINTS = 160

/** Structured validation error code returned when a model reason fails policy. */
export const APPROVAL_REASON_INVALID_CODE = 'APPROVAL_REASON_INVALID'

/** Structured error code when post-rewrite verification detects unapproved tampering. */
export const APPROVAL_POST_REWRITE_MISMATCH_CODE = 'APPROVAL_POST_REWRITE_MISMATCH'

/** Official CUA question identifiers rendered through the unified approval card. */
export const CUA_APPROVAL_QUESTION_IDS = new Set(['cua-app-access', 'cua-mouse-control'])

/** Official DSH tools that support per-call sandbox escalation (`escalate sandbox to <mode>: <justification>`). */
export const OFFICIAL_ESCALATABLE_TOOLS = new Set([
  'bash',
  'pwsh',
  'write',
  'edit',
  'apply_patch',
  'run_code',
])

/** Official built-in DSH tool names recognized for prepared-phase policy confirmation adaptation. */
export const OFFICIAL_BUILTIN_TOOLS = new Set([
  ...OFFICIAL_ESCALATABLE_TOOLS,
  'plugin_manager',
  'read',
  'read_image',
  'glob',
  'grep',
  'str_replace_editor',
  'ask_user_question',
  'todo_write',
  'web_search',
  'web_fetch',
  'present',
  'office_render',
  'office_convert',
  'office_recalculate',
  'skill',
  'working_directory',
  'load_workspace_dependencies',
  'create_worktree',
  'job_output',
  'job_list',
  'job_kill',
  'terminal_open',
  'terminal_send',
  'terminal_read',
  'terminal_signal',
  'terminal_close',
  'terminal_list',
  'user_terminal_list',
  'user_terminal_read',
  'plugin_market',
  'subagent',
  'subagent_fork',
  'subagent_spawn',
  'list_subagent_models',
  'wait_agent',
  'list_agents',
  'send_message',
  'interrupt_agent',
  'workflow',
  'ralph',
  'get_goal',
  'create_goal',
  'update_goal',
  'schedule_create',
  'schedule_list',
  'schedule_view',
  'schedule_edit',
  'session_search',
  'session_event_search',
  'session_trace',
  'session_event_trace',
  'session_event_read',
  'list_mcp_resources',
  'list_mcp_resource_templates',
  'read_mcp_resource',
  'propose_action',
  'exit_plan_mode',
  'team_task_create',
  'team_task_list',
  'team_task_get',
  'team_task_update',
  'cordis_inspect_list',
  'cordis_inspect_query',
])

/** Check whether a tool name belongs to DSH's known built-in tool catalog. */
export function isKnownOfficialToolName(toolName) {
  return typeof toolName === 'string' && OFFICIAL_BUILTIN_TOOLS.has(toolName)
}

const KNOWN_PLUGIN_MANAGER_ACTIONS = new Set([
  'list_plugins',
  'list_bundles',
  'set_plugin',
  'set_bundle',
  'install_bundle',
  'remove_bundle',
  'list_version_exemptions',
  'set_version_exemption',
])

const SANDBOX_MODE_RANK = {
  'read-only': 1,
  'workspace-write': 2,
  'danger-full-access': 3,
}

const PLACEHOLDER_REASONS = new Set([
  'test',
  'testing',
  'placeholder',
  'todo',
  'tbd',
  'n/a',
  'na',
  'none',
  'null',
  'undefined',
  'reason',
  'justification',
  'permission',
  'needs permission',
  'need permission',
  'need higher permission',
  'need higher permissions',
  'requires permission',
  'requires higher permission',
  'requires higher permissions',
  'need access',
  'run command',
  'execute command',
  'escalate',
  'escalation',
  'test reason',
  'dummy',
  'xxx',
  '测试',
  '占位',
  '占位符',
  '无',
  '暂无',
  '原因',
  '说明',
  '理由',
  '需要权限',
  '需要更高权限',
  '需要提权',
  '提权',
  '申请权限',
  '需要越权',
  '越权执行',
  '执行命令',
])

const CREDENTIAL_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
  /\b(?:sk-(?:proj-|ant-|live-|test-)?[A-Za-z0-9_-]{16,})\b/,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
  /\bhf_[A-Za-z0-9]{20,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
  /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]\s*['"]?[^\s'"`,;}{)(]{8,}/i,
]

const SERIALIZED_ARGS_PATTERNS = [
  /"(?:command|file_path|old_string|new_string|content|sandbox_permissions|justification|run_in_background|code|approvedBuilds)"\s*:/,
  /\b(?:sandbox_permissions|old_string|new_string|run_in_background|approvedBuilds)\s*:/,
  /(?:^|,\s*)\b(?:command|file_path)\s*:\s*["'{]/,
  /\bplugin_manager\s*\{/,
]

const TOKEN_REWRITE_LOG = new WeakMap()
const EXEC_REWRITE_LOG = new WeakMap()

/**
 * Count exact Unicode codepoints (treating surrogate pairs and CJK characters as 1).
 * @param {string} value - Text to measure.
 * @returns {number} Unicode codepoint count.
 */
export function countCodepoints(value) {
  let count = 0
  for (const _char of value) count += 1
  return count
}

/**
 * Detect whether text contains credential or private-key samples without echoing them.
 * @param {string} value - Candidate justification text.
 * @returns {boolean} True when a credential pattern matches.
 */
export function hasCredentialSample(value) {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value))
}

/**
 * Validate whether a model-supplied justification satisfies single-paragraph
 * plain-text approval clarity rules. Never truncates or alters command inputs.
 * @param {unknown} rawReason - Raw `justification` value passed by the model.
 * @returns {{ ok: true, reason: string } | { ok: false, code: string, category: string, message: string }}
 */
export function validateApprovalReason(rawReason) {
  if (typeof rawReason !== 'string') {
    return invalidReason('empty', 'Justification must be a concise non-empty plain-text sentence explaining why elevated permission is needed.')
  }
  const reason = rawReason.trim()
  if (reason.length === 0) {
    return invalidReason('empty', 'Justification cannot be empty or whitespace only. Provide one short sentence explaining the purpose.')
  }
  // Check before cosmetic failures so markdown/newlines/length never mask a secret
  // and send it through the native presentation fallback.
  if (hasCredentialSample(reason)) {
    return invalidReason('credential', 'Justification must not include secrets, tokens, passwords, or private keys.')
  }
  if (/[\r\n]/.test(reason)) {
    return invalidReason('multiline', 'Justification must be a single paragraph with no line breaks (<= 160 characters).')
  }
  if (/```|~~~|`/.test(reason)) {
    return invalidReason('markdown', 'Justification must be plain text without markdown code fences or inline backticks.')
  }
  if (looksLikeSerializedArgs(reason)) {
    return invalidReason('serialized_args', 'Justification must be natural language, not serialized JSON or raw argument dumps.')
  }
  if (looksLikePlaceholder(reason)) {
    return invalidReason('placeholder', 'Justification cannot be a placeholder word; explain the concrete operation purpose.')
  }
  const codepoints = countCodepoints(reason)
  if (codepoints > MAX_APPROVAL_REASON_CODEPOINTS) {
    return invalidReason(
      'too_long',
      `Justification has ${codepoints} characters and exceeds the ${MAX_APPROVAL_REASON_CODEPOINTS}-character limit. Shorten it cleanly without code blocks.`,
    )
  }
  return { ok: true, reason }
}

function invalidReason(category, message) {
  return {
    ok: false,
    code: APPROVAL_REASON_INVALID_CODE,
    category,
    message,
  }
}

function looksLikeSerializedArgs(text) {
  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text)
      if (parsed !== null && typeof parsed === 'object') return true
    } catch {
      // Non-JSON text in brackets is checked by key pattern below.
    }
  }
  return SERIALIZED_ARGS_PATTERNS.some((pattern) => pattern.test(text))
}

function looksLikePlaceholder(text) {
  if (!/[\p{L}\p{N}]/u.test(text)) return true
  const normalized = text.toLowerCase().replace(/[\s.。!！?？…_-]+$/gu, '').replace(/^[\s.。!！?？…_-]+/gu, '')
  return PLACEHOLDER_REASONS.has(normalized)
}

/**
 * Determine whether `requestedMode` strictly widens `effectiveMode`.
 * @param {string | undefined} requestedMode - Requested sandbox mode.
 * @param {string | undefined} effectiveMode - Effective standing sandbox mode.
 * @returns {boolean} True when the request widens access beyond standing policy.
 */
export function isWideningMode(requestedMode, effectiveMode) {
  if (typeof requestedMode !== 'string') return false
  const reqRank = SANDBOX_MODE_RANK[requestedMode] ?? 0
  const effRank = SANDBOX_MODE_RANK[effectiveMode] ?? 0
  return reqRank > 0 && effRank > 0 && reqRank > effRank
}

/**
 * Canonicalize any JSON-compatible value with sorted object keys (omitting undefined
 * fields) so structural hashing and deep equality are order-independent.
 * @param {unknown} value - Input value.
 * @returns {unknown} Canonical detached value.
 */
export function canonicalClone(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : canonicalClone(item)))
  const out = {}
  const keys = Object.keys(value).sort()
  for (const key of keys) {
    const v = value[key]
    if (v === undefined) continue
    out[key] = canonicalClone(v)
  }
  return out
}

/**
 * Check deep canonical equality between two values.
 * @param {unknown} a - First value.
 * @param {unknown} b - Second value.
 * @returns {boolean} True when structurally identical after canonicalization.
 */
export function canonicalEqual(a, b) {
  return canonicalStringify(a) === canonicalStringify(b)
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalClone(value))
}

/**
 * Record a legal parameter rewrite performed by a repository plugin
 * (`wait-guard`, `session-tmp`, `fs-view`) on a live tool execution object.
 * @param {object} exec - Tool execution context (`exec.token` used when present).
 * @param {object} record - Rewrite descriptor `{ source, fields, before, after }`.
 */
export function recordParameterRewrite(exec, record) {
  if (!exec || typeof exec !== 'object') return
  const entry = canonicalClone({
    source: record.source,
    fields: Array.isArray(record.fields) ? record.fields : [],
    before: record.before ?? {},
    after: record.after ?? {},
    meta: record.meta,
  })
  const push = (map, key) => {
    let list = map.get(key)
    if (!list) {
      list = []
      map.set(key, list)
    }
    list.push(entry)
  }
  push(EXEC_REWRITE_LOG, exec)
  if (exec.token && typeof exec.token === 'symbol') {
    push(TOKEN_REWRITE_LOG, exec.token)
  }
}

/**
 * Retrieve recorded legal parameter rewrites for an execution context.
 * @param {object} exec - Tool execution context.
 * @returns {Array<{ source: string, fields: string[], before: Record<string, unknown>, after: Record<string, unknown> }>}
 */
export function getParameterRewrites(exec) {
  if (!exec || typeof exec !== 'object') return []
  if (exec.token && typeof exec.token === 'symbol') {
    const byTok = TOKEN_REWRITE_LOG.get(exec.token)
    if (byTok && byTok.length > 0) return byTok
  }
  return EXEC_REWRITE_LOG.get(exec) ?? []
}

const SESSION_TMP_ALLOWED_FIELDS = new Set(['file_path', 'path', 'workdir', 'paths', 'files', 'target', 'cwd'])
const WAIT_GUARD_ALLOWED_FIELDS = new Set(['timeoutMs', 'timeout', 'wait'])

/**
 * Verify that `currentArgs` equals `approvedArgs` modulo ONLY legitimate
 * recorded rewrites (`wait-guard`, `session-tmp`, `fs-view`), and that runtime
 * bindings (`mode`, `sessionId`, `aborted`) did not drift.
 * @param {object} params
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function verifyPostRewriteParameters({
  approvedArgs,
  currentArgs,
  rewrites = [],
  approvedMode,
  currentMode,
  approvedSessionId,
  currentSessionId,
  aborted = false,
}) {
  if (aborted) {
    return {
      ok: false,
      code: APPROVAL_POST_REWRITE_MISMATCH_CODE,
      message: 'Approval verification aborted because the execution signal is cancelled.',
    }
  }
  if (approvedSessionId !== undefined && currentSessionId !== undefined && approvedSessionId !== currentSessionId) {
    return {
      ok: false,
      code: APPROVAL_POST_REWRITE_MISMATCH_CODE,
      message: 'Approval rejected because session binding changed before execution.',
    }
  }
  if (approvedMode !== undefined && currentMode !== undefined && approvedMode !== currentMode) {
    return {
      ok: false,
      code: APPROVAL_POST_REWRITE_MISMATCH_CODE,
      message: `Approval rejected because sandbox mode changed from ${approvedMode} to ${currentMode} before execution.`,
    }
  }

  const expected = canonicalClone(approvedArgs ?? {})
  const actual = canonicalClone(currentArgs ?? {})

  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    if (!canonicalEqual(expected, actual)) {
      return {
        ok: false,
        code: APPROVAL_POST_REWRITE_MISMATCH_CODE,
        message: 'Tool arguments changed unexpectedly after approval.',
      }
    }
    return { ok: true }
  }

  for (const rw of rewrites) {
    const source = rw?.source
    const before = rw?.before ?? {}
    const after = rw?.after ?? {}
    const fields = Array.isArray(rw?.fields) ? rw.fields : []

    if (source === 'wait-guard') {
      for (const field of fields) {
        if (!WAIT_GUARD_ALLOWED_FIELDS.has(field)) {
          return mismatch(`Unexpected wait-guard rewrite on field "${field}".`)
        }
        if (!canonicalEqual(expected[field], before[field])) {
          return mismatch(`wait-guard rewrite provenance did not match approved "${field}".`)
        }
        const nextVal = after[field]
        if (field === 'wait') {
          if (before[field] !== true || nextVal !== false) {
            return mismatch('wait-guard rewrite on "wait" must only downgrade wait=true to wait=false.')
          }
          expected[field] = false
          continue
        }
        if (typeof nextVal !== 'number' || !Number.isFinite(nextVal) || nextVal <= 0) {
          return mismatch(`wait-guard rewrite produced invalid numeric timeout on "${field}".`)
        }
        expected[field] = nextVal
      }
      continue
    }

    if (source === 'session-tmp') {
      for (const field of fields) {
        if (!SESSION_TMP_ALLOWED_FIELDS.has(field)) {
          return mismatch(`Unexpected session-tmp rewrite on field "${field}".`)
        }
        if (!canonicalEqual(expected[field], before[field])) {
          return mismatch(`session-tmp rewrite provenance did not match approved "${field}".`)
        }
        expected[field] = canonicalClone(after[field])
      }
      continue
    }

    if (source === 'fs-view') {
      // fs-view records edit intent metadata or read_image copy retyping only;
      // only read-image-copy changes exec.arguments.file_path.
      for (const field of fields) {
        if (field === 'edit-intent') continue
        if (field === 'read-image-copy') {
          if (!canonicalEqual(expected.file_path, before.file_path) || typeof after.file_path !== 'string') {
            return mismatch('fs-view rewrite provenance did not match approved "file_path".')
          }
          expected.file_path = after.file_path
          continue
        }
        return mismatch(`Unexpected fs-view rewrite on field "${field}".`)
      }
      continue
    }

    return mismatch(`Unknown parameter rewrite source "${String(source)}".`)
  }

  if (!canonicalEqual(expected, actual)) {
    return mismatch('Tool parameters were modified outside legal plugin rewrites after approval.')
  }
  return { ok: true }
}

function mismatch(message) {
  return {
    ok: false,
    code: APPROVAL_POST_REWRITE_MISMATCH_CODE,
    message,
  }
}

/**
 * Resolve a requester-supplied localized map `{ en, zh?, ... }` into plain text
 * without truncating or stripping risk disclosures.
 * @param {Record<string, string> | undefined} map - Localized text map.
 * @param {string | undefined} locale - Preferred locale.
 * @param {string} [fallback] - Fallback string when map absent.
 * @returns {string | undefined}
 */
export function resolveLocalizedMap(map, locale, fallback) {
  if (!map || typeof map !== 'object') return fallback
  if (typeof locale === 'string') {
    const exact = map[locale]
    if (typeof exact === 'string' && exact.trim()) return exact.trim()
    const base = locale.toLowerCase().split(/[-_]/)[0]
    if (base && typeof map[base] === 'string' && map[base].trim()) return map[base].trim()
  }
  if (typeof map.en === 'string' && map.en.trim()) return map.en.trim()
  for (const val of Object.values(map)) {
    if (typeof val === 'string' && val.trim()) return val.trim()
  }
  return fallback
}

/**
 * Generate a deterministic human-readable approval reason for official `plugin_manager`
 * actions (`reasonSource: 'tool-adapter'`), keeping unknown actions on native fallback.
 * @param {Record<string, unknown> | undefined} args - `plugin_manager` tool arguments.
 * @param {string | undefined} locale - Target locale (`zh` / `en`).
 * @returns {{ known: boolean, reason: string, subjectName?: string }}
 */
export function adaptPluginManagerReason(args, locale) {
  const fam = resolveLocaleFamily(locale)
  const action = typeof args?.action === 'string' ? args.action : ''
  const target = typeof args?.target === 'string' && args.target.trim() ? args.target.trim() : undefined
  const enabled = args?.enabled
  const registry = typeof args?.registry === 'string' && args.registry.trim() ? args.registry.trim() : undefined
  const runtimeVersion = typeof args?.runtimeVersion === 'string' && args.runtimeVersion.trim() ? args.runtimeVersion.trim() : undefined
  const builds = Array.isArray(args?.approvedBuilds)
    ? args.approvedBuilds.map((pkg) => (typeof pkg === 'string' ? pkg.trim() : '')).filter(Boolean)
    : []

  if (!KNOWN_PLUGIN_MANAGER_ACTIONS.has(action)) {
    return {
      known: false,
      reason: fam === 'zh'
        ? `执行插件管理操作 ${action || 'plugin_manager'}${target ? `（${target}）` : ''}`
        : `Run plugin manager action ${action || 'plugin_manager'}${target ? ` (${target})` : ''}`,
      subjectName: target ?? 'plugin_manager',
    }
  }

  switch (action) {
    case 'list_plugins':
      return {
        known: true,
        reason: fam === 'zh'
          ? '查看当前配置文件的插件列表（读取 profile 配置）'
          : 'List plugins in the current profile (reads profile configuration)',
        subjectName: 'plugin_manager',
      }
    case 'list_bundles':
      return {
        known: true,
        reason: fam === 'zh'
          ? '查看当前配置文件的插件包列表（读取 profile 配置）'
          : 'List bundles in the current profile (reads profile configuration)',
        subjectName: 'plugin_manager',
      }
    case 'set_plugin': {
      const verbZh = enabled === false ? '停用' : '启用'
      const verbEn = enabled === false ? 'Disable' : 'Enable'
      return {
        known: true,
        reason: fam === 'zh'
          ? `${verbZh}插件 ${target ?? '（未指定目标）'}（配置文件更改跨会话持久生效；启用的宿主代码运行在工作区沙箱之外）`
          : `${verbEn} plugin ${target ?? '(unspecified)'} (profile changes persist across sessions; enabled Host code runs outside the workspace sandbox)`,
        subjectName: target ?? 'plugin_manager',
      }
    }
    case 'set_bundle': {
      const verbZh = enabled === false ? '停用' : '启用'
      const verbEn = enabled === false ? 'Disable' : 'Enable'
      return {
        known: true,
        reason: fam === 'zh'
          ? `${verbZh}插件包 ${target ?? '（未指定目标）'}（配置文件更改跨会话持久生效；启用的宿主代码运行在工作区沙箱之外）`
          : `${verbEn} bundle ${target ?? '(unspecified)'} (profile changes persist across sessions; enabled Host code runs outside the workspace sandbox)`,
        subjectName: target ?? 'plugin_manager',
      }
    }
    case 'install_bundle': {
      const regZh = registry ? `（源 ${registry}）` : ''
      const regEn = registry ? ` from registry ${registry}` : ''
      const buildsZh = builds.length > 0 ? `；并持久授予构建脚本执行权限：${builds.join(', ')}` : ''
      const buildsEn = builds.length > 0 ? `; persistently authorizes build scripts for packages: ${builds.join(', ')}` : ''
      return {
        known: true,
        reason: fam === 'zh'
          ? `安装插件包 ${target ?? '（未指定目标）'}${regZh}（配置文件更改跨会话持久生效；安装的宿主代码运行在工作区沙箱之外${buildsZh}）`
          : `Install bundle ${target ?? '(unspecified)'}${regEn} (profile changes persist across sessions; installed Host code runs outside the workspace sandbox${buildsEn})`,
        subjectName: target ?? 'plugin_manager',
      }
    }
    case 'remove_bundle':
      return {
        known: true,
        reason: fam === 'zh'
          ? `卸载插件包 ${target ?? '（未指定目标）'}（配置文件更改跨会话持久生效，影响该 profile 下所有会话）`
          : `Remove bundle ${target ?? '(unspecified)'} (profile changes persist across sessions for every session in this profile)`,
        subjectName: target ?? 'plugin_manager',
      }
    case 'list_version_exemptions':
      return {
        known: true,
        reason: fam === 'zh'
          ? '查看当前配置文件的插件版本兼容豁免列表（读取 profile 配置）'
          : 'List plugin version exemptions in the current profile (reads profile configuration)',
        subjectName: 'plugin_manager',
      }
    case 'set_version_exemption': {
      const verbZh = enabled === false ? '撤销' : '授予'
      const verbEn = enabled === false ? 'Revoke' : 'Grant'
      return {
        known: true,
        reason: fam === 'zh'
          ? `${verbZh}插件 ${target ?? '（未指定插件）'} 对运行时版本 ${runtimeVersion ?? '（未指定版本）'} 的兼容豁免（配置文件更改跨会话持久生效；风险：可能导致崩溃与数据丢失；宿主代码运行在工作区沙箱之外）`
          : `${verbEn} version exemption for ${target ?? '(unspecified)'} on runtime ${runtimeVersion ?? '(unspecified)'} (profile changes persist across sessions; risks crashes and data loss; Host code runs outside the workspace sandbox)`,
        subjectName: target ?? 'plugin_manager',
      }
    }
    default:
      return {
        known: false,
        reason: fam === 'zh' ? '执行插件管理操作' : 'Run plugin management operation',
        subjectName: 'plugin_manager',
      }
  }
}

/**
 * Strip the official `"escalate sandbox to <mode>: "` prefix from raw approval
 * reasons when an upstream caller already formatted it via `approveEscalation`.
 * @param {string | undefined} rawReason
 * @returns {string}
 */
export function stripSandboxPrefix(rawReason) {
  if (typeof rawReason !== 'string') return ''
  const trimmed = rawReason.trim()
  return trimmed.replace(/^escalate sandbox to (?:read-only|workspace-write|danger-full-access):\s*/i, '').trim()
}

/**
 * Adapt a Host `approval/request` call plus correlated pipeline state into an
 * internal normalized approval record used to materialize `ApprovalView` v2.
 * @param {object} input
 * @returns {object} Normalized approval record (without full command/script/edit body).
 */
export function adaptToolApprovalRecord({
  snapshotId,
  generation,
  sessionId,
  requestKey,
  callId,
  toolName,
  phase,
  reqReason,
  displayReason,
  args,
  requestedMode,
  standingMode,
  verifiedOfficial,
  locale,
}) {
  if (verifiedOfficial === false || !isKnownOfficialToolName(toolName)) {
    return null
  }

  const fam = resolveLocaleFamily(locale)
  const isPolicy = phase === 'prepared'
  const isPluginManager = toolName === 'plugin_manager'

  let reasonSource = 'model'
  let reason = ''
  let subjectName = toolName
  let permission

  if (isPolicy) {
    reasonSource = 'policy'
    const localized = resolveLocalizedMap(displayReason, locale)
    reason = localized || (typeof reqReason === 'string' && reqReason.trim()) || (fam === 'zh' ? `工具 ${toolName} 触发执行前策略审批` : `Policy review required before running ${toolName}`)
    permission = {
      kind: 'tool-confirmation',
      subjectName,
      lifetime: 'call',
    }
  } else if (isPluginManager) {
    reasonSource = 'tool-adapter'
    const pm = adaptPluginManagerReason(args, locale)
    if (!pm.known) return null
    const effMode = requestedMode ?? 'danger-full-access'
    if (effMode !== 'danger-full-access') return null
    if (args?.sandbox_permissions !== undefined && args.sandbox_permissions !== 'danger-full-access') return null
    if (standingMode !== undefined && !isWideningMode('danger-full-access', standingMode)) return null
    if (typeof reqReason !== 'string' || !reqReason.startsWith('escalate sandbox to danger-full-access: plugin_manager ')) {
      return null
    }
    if (displayReason && typeof displayReason === 'object' && typeof displayReason.en === 'string') {
      if (!displayReason.en.startsWith('Allow this operation with danger-full-access permissions: plugin_manager ')) {
        return null
      }
    }
    reason = pm.reason
    subjectName = pm.subjectName ?? 'plugin_manager'
    permission = {
      kind: 'sandbox-escalation',
      requestedMode: 'danger-full-access',
      subjectName,
      lifetime: 'call',
    }
  } else if (OFFICIAL_ESCALATABLE_TOOLS.has(toolName)) {
    reasonSource = 'model'
    const mode = args?.sandbox_permissions
    if (mode !== 'workspace-write' && mode !== 'danger-full-access') return null
    if (requestedMode !== undefined && requestedMode !== mode) return null
    if (standingMode !== undefined && !isWideningMode(mode, standingMode)) return null
    if (!validateApprovalReason(args?.justification).ok) return null

    const rawJust = args.justification.trim()
    const prefix = `escalate sandbox to ${mode}: `
    if (reqReason !== `${prefix}${args.justification}` && reqReason !== `${prefix}${rawJust}`) {
      return null
    }
    if (displayReason && typeof displayReason === 'object' && typeof displayReason.en === 'string') {
      const en1 = `Allow this operation with ${mode} permissions: ${args.justification}`
      const en2 = `Allow this operation with ${mode} permissions: ${rawJust}`
      if (displayReason.en !== en1 && displayReason.en !== en2) return null
    }
    reason = rawJust
    permission = {
      kind: 'sandbox-escalation',
      requestedMode: mode,
      subjectName,
      lifetime: 'call',
    }
  } else {
    return null
  }

  const choices = [
    { id: 'rejected', lifetime: 'none', label: fam === 'zh' ? '拒绝' : 'Reject' },
    { id: 'allowed-once', lifetime: 'call', label: fam === 'zh' ? '允许一次' : 'Allow once' },
  ]

  return {
    schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
    channel: 'tool-approval',
    snapshotId,
    generation,
    sessionId,
    requestKey,
    ...(callId === undefined ? {} : { callId }),
    reason,
    reasonSource,
    permission,
    choices,
    _localizedDisplayReason: displayReason,
    _rawReqReason: reqReason,
    _argsActionSummary: isPluginManager
      ? {
          action: args?.action,
          target: args?.target,
          enabled: args?.enabled,
          registry: args?.registry,
          approvedBuilds: Array.isArray(args?.approvedBuilds) ? [...args.approvedBuilds] : undefined,
          runtimeVersion: args?.runtimeVersion,
          acceptRisk: args?.acceptRisk,
        }
      : undefined,
    _modelJustification: reasonSource === 'model' ? reason : undefined,
  }
}

/**
 * Adapt a Host `user-questions/request` CUA approval item (`cua-app-access` or
 * `cua-mouse-control`) into an internal normalized approval record.
 * Never fabricates a `callId` or `'allowed-once'` lifetime.
 * @param {object} input
 * @returns {object | null} Normalized record, or null for non-CUA questions.
 */
export function adaptCuaQuestionRecord({
  snapshotId,
  generation,
  sessionId,
  requestKey,
  question,
  locale,
}) {
  if (!question || !CUA_APPROVAL_QUESTION_IDS.has(question.id) || question.intent?.kind !== 'approval') {
    return null
  }
  const fam = resolveLocaleFamily(locale)
  const intent = question.intent
  const isAppAccess = question.id === 'cua-app-access'
  const subjectName = intent.subject?.name

  const rawTitle = resolveLocalizedMap(intent.display?.question, locale, question.question)
  const rawDetail = resolveLocalizedMap(intent.display?.detail, locale, question.detail)
  const normalizedDetail = typeof rawDetail === 'string' ? rawDetail.replace(/\s+/g, ' ').trim() : ''

  let reason
  if (isAppAccess) {
    reason = rawTitle
      || (fam === 'zh' ? `允许 Computer Use 控制应用 ${subjectName ?? ''}`.trim() : `Allow computer use to control ${subjectName ?? 'this application'}`)
  } else {
    const baseTitle = rawTitle
      || (fam === 'zh' ? '允许智能体移动鼠标指针' : 'Allow agent to move your mouse pointer')
    const effectiveDetail = normalizedDetail || (fam === 'zh'
      ? '允许后，指针会立即移到目标位置；关闭会话或重启 DSH 前会记住本次选择。'
      : 'Allowing moves your pointer to this target now; your choice is remembered until closing the session or restarting DSH.')
    if (!effectiveDetail || baseTitle.includes(effectiveDetail)) {
      reason = baseTitle
    } else if (/[。.!?！？]$/.test(baseTitle)) {
      reason = `${baseTitle} ${effectiveDetail}`
    } else {
      reason = fam === 'zh' ? `${baseTitle}。${effectiveDetail}` : `${baseTitle}. ${effectiveDetail}`
    }
  }

  const approveLabel = resolveLocalizedMap(intent.display?.approve, locale, intent.approve)
    || (fam === 'zh' ? '本会话允许' : 'Allow for this session')

  const choices = [
    { id: 'reject', lifetime: 'none', label: fam === 'zh' ? '拒绝' : 'Deny' },
    { id: 'approve', lifetime: 'session', label: approveLabel },
  ]
  if (typeof intent.always === 'string' && intent.always.length > 0) {
    choices.push({
      id: 'always',
      lifetime: 'persistent',
      label: fam === 'zh' ? '始终允许' : 'Always allow',
    })
  }

  return {
    schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
    channel: 'cua-question',
    snapshotId,
    generation,
    sessionId,
    requestKey,
    // Intentionally omit callId for CUA questions.
    reason,
    reasonSource: 'tool-adapter',
    permission: {
      kind: isAppAccess ? 'application-access' : 'mouse-control',
      ...(subjectName ? { subjectName } : {}),
      lifetime: 'session',
    },
    choices,
    _cuaId: question.id,
    _cuaQuestion: question,
  }
}

/**
 * Project a stored internal record into the public `ApprovalView` v2 DTO
 * tailored to the caller's requested locale, strictly omitting raw command,
 * script, or edit payloads.
 * @param {object | undefined} record - Stored internal approval record.
 * @param {string | undefined} locale - Requested display locale.
 * @returns {object | undefined} Public `ApprovalView` v2 DTO.
 */
export function serializeApprovalView(record, locale) {
  if (!record) return undefined
  const fam = resolveLocaleFamily(locale)

  if (record.channel === 'cua-question') {
    const view = adaptCuaQuestionRecord({
      snapshotId: record.snapshotId,
      generation: record.generation,
      sessionId: record.sessionId,
      requestKey: record.requestKey,
      question: record._cuaQuestion,
      locale,
    })
    return stripPrivateFields(view)
  }

  let reason = record.reason
  if (record.reasonSource === 'policy') {
    reason = resolveLocalizedMap(record._localizedDisplayReason, locale, record._rawReqReason || record.reason) || record.reason
  } else if (record.reasonSource === 'tool-adapter' && record._argsActionSummary) {
    reason = adaptPluginManagerReason(record._argsActionSummary, locale).reason
  }

  const choices = [
    { id: 'rejected', lifetime: 'none', label: fam === 'zh' ? '拒绝' : 'Reject' },
    { id: 'allowed-once', lifetime: 'call', label: fam === 'zh' ? '允许一次' : 'Allow once' },
  ]

  return stripPrivateFields({
    ...record,
    reason,
    choices,
  })
}

function stripPrivateFields(record) {
  if (!record) return undefined
  const view = {
    schemaVersion: APPROVAL_VIEW_SCHEMA_VERSION,
    channel: record.channel,
    snapshotId: record.snapshotId,
    generation: record.generation,
    sessionId: record.sessionId,
    requestKey: record.requestKey,
    reason: record.reason,
    reasonSource: record.reasonSource,
    permission: { ...record.permission },
    choices: record.choices.map((c) => ({ ...c })),
  }
  if (record.callId !== undefined) view.callId = record.callId
  return view
}
