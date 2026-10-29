// secret-guard：不让令牌进入模型的上下文。
// 真实会话里，模型用 ask_user_question 让用户把 GitHub 令牌贴进对话，之后把它抄进了 73 条命令、74 条回复；
// 令牌一旦进入上下文，每次请求都会发给模型服务商，也会永久留在会话记录里。这里分三道：
// - 拒绝向用户索要凭据的提问（timed 模式下回答以插话送进来，打码管不到，只能在问之前拦）；
// - 拒绝参数里带完整令牌的工具调用，以及 `gh auth token`：GitHub 操作直接用已经登录好的 gh；
// - 工具结果交给模型之前，把其中的令牌打码。
// 日志只记录规则、工具和打码次数，从不记录令牌本身。
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-secret-guard'
export const inject = ['systemPrompt']

const DEFAULTS = { askGuard: true, callGuard: true, redact: true }
const record = createRecorder('secret-guard.log')

// 只认格式明确的凭据，避免误伤普通文本。
const SECRET_PATTERNS = [
  { label: 'github-token', re: /\bgithub_pat_[A-Za-z0-9_]{22,}/g },
  { label: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  { label: 'api-key', re: /\bsk-[A-Za-z0-9_-]{20,}/g },
]

/** 文本里第一个凭据的类型；没有返回 undefined。 */
export function findSecret(text) {
  if (typeof text !== 'string') return undefined
  for (const { label, re } of SECRET_PATTERNS) { re.lastIndex = 0; if (re.test(text)) return label }
  return undefined
}

/** 把文本里的凭据替换成 [REDACTED:类型]，返回新文本和替换次数。 */
export function redactText(text) {
  let count = 0
  for (const { label, re } of SECRET_PATTERNS) text = text.replace(re, () => { count += 1; return `[REDACTED:${label}]` })
  return { text, count }
}

const CREDENTIAL = /github_pat_|\bgh[pousr]_|\bPAT\b|personal access token|access token|api[ _-]?key|secret key|password|passphrase|令牌|密钥|密码|口令|\btoken\b/i
const SOLICIT = /粘贴|贴到|贴给|贴进|发给我|发我|提供|输入|填写|告诉我|paste|provide|enter|share|send|type in/i

/** ask_user_question 的参数是否在向用户索要凭据。 */
export function isCredentialRequest(args) {
  const text = JSON.stringify(args?.questions ?? [])
  return CREDENTIAL.test(text) && SOLICIT.test(text)
}

const GH_AUTH_TOKEN = /(?:^|[\s;&|(`$])gh\s+auth\s+token\b/

/** 返回拒绝理由；放行时返回 undefined。 */
export function check(exec, config = DEFAULTS) {
  const c = { ...DEFAULTS, ...config }
  const args = exec.arguments ?? {}
  if (c.askGuard && exec.name === 'ask_user_question' && isCredentialRequest(args)) return {
    rule: 'ask-credential',
    reason: 'dsh-secret-guard: do not ask the user to paste a token, password or API key. Anything they type into the conversation stays in the context and the session log. ' +
      'For GitHub, use the gh CLI, which is already authenticated; if it is not, ask the user to run `gh auth login` themselves and tell you when it is done. ' +
      'If you were not asking for a credential, rephrase the question.',
  }
  if (!c.callGuard) return undefined
  const label = findSecret(JSON.stringify(args))
  if (label !== undefined) return {
    rule: 'secret-in-call', label,
    reason: `dsh-secret-guard: this ${exec.name} call contains a literal ${label}. Never write credentials into commands, files or messages. ` +
      'For GitHub, use gh (gh api, gh release, gh repo …), which authenticates on its own; other tools should read credentials from their own config or environment.',
  }
  if ((exec.name === 'bash' || exec.name === 'pwsh') && typeof args.command === 'string' && GH_AUTH_TOKEN.test(args.command)) return {
    rule: 'gh-auth-token',
    reason: 'dsh-secret-guard: do not extract the token with `gh auth token`. Call gh directly instead (for raw API requests use `gh api`), so the token never appears in a command or its output.',
  }
  return undefined
}

/** 把一组内容块里的凭据打码；没有需要改的返回 undefined。 */
export function redactContent(content) {
  if (!Array.isArray(content)) return undefined
  let total = 0
  const next = content.map((block) => {
    if (block?.type !== 'text' || typeof block.text !== 'string') return block
    const { text, count } = redactText(block.text)
    total += count
    return count > 0 ? { ...block, text } : block
  })
  return total > 0 ? { content: next, count: total } : undefined
}

/** 对 post-execute 的最终决定打码：accept 的内容和 block 的反馈都处理。 */
export function redactDecision(decision, result) {
  if (decision.kind === 'block') {
    const r = redactContent(decision.feedback)
    return r === undefined ? undefined : { decision: { ...decision, feedback: r.content }, count: r.count }
  }
  if (decision.kind !== 'accept' || Object.hasOwn(decision, 'value')) return undefined
  const r = redactContent(decision.content ?? result.content)
  return r === undefined ? undefined : { decision: { ...decision, content: r.content }, count: r.count }
}

const PROMPT = 'Never ask the user for tokens, passwords or API keys, and never write one into a command, file or message. ' +
  'For GitHub, use the gh CLI, which is already authenticated. Credentials that appear in tool output are shown as [REDACTED:…].'

export function apply(ctx, config = {}) {
  const c = { ...DEFAULTS, ...config }
  record({ event: 'loaded', config: c })

  ctx.on('tools/pre-execute', (exec, next) => {
    let verdict
    try { verdict = check(exec, c) } catch (error) { record({ event: 'check-failed', error: String(error).slice(0, 300) }) }
    if (verdict === undefined) return next()
    record({ event: 'denied', rule: verdict.rule, label: verdict.label, tool: exec.name, session: exec.agent?.session?.id })
    return Promise.resolve({ kind: 'deny', reason: verdict.reason })
  })

  // prepend：最先进入、最后返回，打码的是所有下游处理（比如 spill 预览）之后模型真正看到的内容。
  if (c.redact) ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next()
    try {
      const r = redactDecision(decision, result)
      if (r === undefined) return decision
      record({ event: 'redacted', tool: exec.name, count: r.count, session: exec.agent?.session?.id })
      return r.decision
    } catch (error) {
      record({ event: 'redact-failed', tool: exec.name, error: String(error).slice(0, 300) })
      return decision
    }
  }, { prepend: true })

  try {
    ctx.systemPrompt.section({ name: 'dsh-secret-guard', order: ctx.systemPrompt.getSectionOrder('TOOL_JOBS') + 2, text: PROMPT })
  } catch (error) {
    record({ event: 'prompt-section-failed', error: String(error).slice(0, 300) })
  }
}
