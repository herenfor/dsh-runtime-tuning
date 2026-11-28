// compaction-effort：保留同模型对话在 compaction 摘要调用时的 reasoningEffort。
// 官方 dsh-compaction-basic 的 summarizeWithLlm 在构造 GenerateOptions 时漏掉了 reasoningEffort，
// 导致主会话用 max 等非默认档位时，摘要请求回退到适配器默认档位（如 high）而 KV cache 全 miss。
// 本插件通过继承官方 BasicCompactionEngine，仅在单次 summarize 调用的局部作用域里向 ctx.llm.stream
// 补入有效 reasoningEffort：同模型继承最近一次有效请求头的档位，独立摘要模型保留各自默认或显式覆盖，
// 不改宿主 node_modules，不修改共享 ctx.llm.stream 或原型，并发多会话零串味。
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { findHostPackage } from './chat-answer-fix.mjs?v=0.2.24'
import { hostAnchors } from './host-modules.mjs?v=0.2.24'
import { createRecorder } from './log.mjs'

export const name = 'dsh-runtime-tuning-compaction-effort'

const defaultRecord = createRecorder('compaction-effort.log')
const nodeResolve = (from, request) => createRequire(from).resolve(request)
const DEFAULT_INJECT = ['llm', 'tokenMeter', 'sessions']
const INTERFACE_MISMATCH_WARNED = new Set()

const nonEmptyString = (value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined)
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

function validateOptionalEffort(value, label) {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`${label}.summarizationReasoningEffort must be a string`)
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function validateOptionalInherit(value, label) {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`${label}.inheritReasoningEffort must be a boolean`)
  return value
}

/** 拆出本插件扩展的档位配置与官方 BasicCompactionConfig；不修改入参，不向官方 validateKeys 传入未知字段。 */
export function partitionCompactionConfig(config = {}) {
  if (!isPlainObject(config)) {
    return {
      officialConfig: config,
      tuningConfig: Object.freeze({
        inheritReasoningEffort: true,
        summarizationReasoningEffort: undefined,
        modelPolicies: Object.freeze([]),
      }),
    }
  }

  const summarizationReasoningEffort = validateOptionalEffort(config.summarizationReasoningEffort, 'BasicCompactionConfig')
  const inheritReasoningEffort = validateOptionalInherit(config.inheritReasoningEffort, 'BasicCompactionConfig') ?? true

  const officialConfig = {}
  for (const [key, value] of Object.entries(config)) {
    if (key === 'summarizationReasoningEffort' || key === 'inheritReasoningEffort') continue
    officialConfig[key] = value
  }

  const policyTunings = []
  if (Array.isArray(config.modelPolicies)) {
    officialConfig.modelPolicies = config.modelPolicies.map((policy, index) => {
      if (!isPlainObject(policy)) return policy
      const label = `BasicCompactionConfig: modelPolicies[${index}]`
      const policyEffort = validateOptionalEffort(policy.summarizationReasoningEffort, label)
      const policyInherit = validateOptionalInherit(policy.inheritReasoningEffort, label)
      if (policyEffort !== undefined || policyInherit !== undefined) {
        policyTunings.push(Object.freeze({
          provider: policy.provider,
          model: policy.model,
          ...(policyEffort === undefined ? {} : { summarizationReasoningEffort: policyEffort }),
          ...(policyInherit === undefined ? {} : { inheritReasoningEffort: policyInherit }),
        }))
      }
      const cleaned = {}
      for (const [key, value] of Object.entries(policy)) {
        if (key === 'summarizationReasoningEffort' || key === 'inheritReasoningEffort') continue
        cleaned[key] = value
      }
      return cleaned
    })
  }

  return {
    officialConfig,
    tuningConfig: Object.freeze({
      inheritReasoningEffort,
      summarizationReasoningEffort,
      modelPolicies: Object.freeze(policyTunings),
    }),
  }
}

function normalizeTarget(provider, model) {
  const cleanProvider = nonEmptyString(provider)
  const cleanModel = nonEmptyString(model)
  if (cleanProvider === undefined || cleanModel === undefined) return undefined
  return { provider: cleanProvider, model: cleanModel }
}

function sameTarget(left, right) {
  return Boolean(left && right && left.provider === right.provider && left.model === right.model)
}

/** 按官方 resolveTargetPolicy 的精确 (provider, model) 规则合并生效中的摘要目标配置。 */
export function resolvePolicySummaryTarget(config, conversationTarget) {
  const override = conversationTarget && Array.isArray(config?.modelPolicies)
    ? config.modelPolicies.find((policy) => policy.provider === conversationTarget.provider && policy.model === conversationTarget.model)
    : undefined
  return {
    summarizationProvider: override?.summarizationProvider ?? config?.summarizationProvider ?? '',
    summarizationModel: override?.summarizationModel ?? config?.summarizationModel ?? '',
  }
}

/**
 * 解析单次摘要调用应当附带的 reasoningEffort。
 * 规则顺序：显式覆盖 > inheritReasoningEffort 开关 > 同 (provider, model) 判断 >
 * 最近一次有效请求头（或尚未落盘请求头时的 agent.options / model.current）> resolveModelInfo 支持性校验。
 */
export async function resolveSummaryEffort({ agent, llm, policy, tuningConfig, latestHeader, signal }) {
  const latestConfig = latestHeader ?? agent?.session?.requestHeader?.()?.config
  const latest = normalizeTarget(latestConfig?.provider, latestConfig?.model)
  const agentTarget = normalizeTarget(agent?.options?.provider, agent?.options?.model)
  const conversationTarget = latest ?? agentTarget

  const configured = normalizeTarget(policy?.summarizationProvider, policy?.summarizationModel)
  const summaryTarget = configured ?? latest ?? agentTarget

  const policyTuning = conversationTarget && Array.isArray(tuningConfig?.modelPolicies)
    ? tuningConfig.modelPolicies.find((entry) => entry.provider === conversationTarget.provider && entry.model === conversationTarget.model)
    : undefined
  const explicitEffort = policyTuning?.summarizationReasoningEffort ?? tuningConfig?.summarizationReasoningEffort
  const inheritEnabled = policyTuning?.inheritReasoningEffort ?? tuningConfig?.inheritReasoningEffort ?? true

  if (summaryTarget === undefined) {
    return { reasoningEffort: undefined, source: 'no-summary-target', summaryTarget, conversationTarget }
  }

  let candidate
  let candidateSource
  if (explicitEffort !== undefined) {
    candidate = explicitEffort
    candidateSource = policyTuning?.summarizationReasoningEffort !== undefined ? 'explicit-policy' : 'explicit'
  } else {
    if (!inheritEnabled) {
      return { reasoningEffort: undefined, source: 'inherit-disabled', summaryTarget, conversationTarget }
    }

    if (!sameTarget(summaryTarget, conversationTarget)) {
      return { reasoningEffort: undefined, source: 'independent-model', summaryTarget, conversationTarget }
    }

    if (latest !== undefined) {
      candidate = nonEmptyString(latestConfig?.reasoningEffort)
      candidateSource = 'request-header'
      if (candidate === undefined) {
        return { reasoningEffort: undefined, source: 'header-without-effort', summaryTarget, conversationTarget }
      }
    } else {
      const optionsEffort = nonEmptyString(agent?.options?.reasoningEffort)
      const selection = typeof agent?.model?.current === 'function' ? agent.model.current() : undefined
      const selectionTarget = normalizeTarget(selection?.provider, selection?.model)
      const selectionEffort = sameTarget(selectionTarget, summaryTarget) ? nonEmptyString(selection?.reasoningEffort) : undefined
      candidate = optionsEffort ?? selectionEffort
      candidateSource = optionsEffort !== undefined ? 'agent-options' : 'model-selection'
      if (candidate === undefined) {
        return { reasoningEffort: undefined, source: 'no-conversation-effort', summaryTarget, conversationTarget }
      }
    }
  }

  if (typeof llm?.resolveModelInfo === 'function') {
    let info
    try {
      info = await llm.resolveModelInfo(summaryTarget.provider, summaryTarget.model, signal)
    } catch (error) {
      if (signal?.aborted) throw error
      return {
        reasoningEffort: candidate,
        source: candidateSource,
        summaryTarget,
        conversationTarget,
        modelInfoUnavailable: true,
      }
    }
    if (!info || typeof info !== 'object') {
      return {
        reasoningEffort: candidate,
        source: candidateSource,
        summaryTarget,
        conversationTarget,
        modelInfoUnavailable: true,
      }
    }
    const rawEfforts = info.reasoning?.efforts
    const supportedEfforts = Array.isArray(rawEfforts)
      ? rawEfforts
          .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
          .filter((id) => typeof id === 'string' && id.length > 0)
      : []
    if (!supportedEfforts.includes(candidate)) {
      return {
        reasoningEffort: undefined,
        source: 'unsupported-effort',
        requestedFrom: candidateSource,
        reasonDetail: info.reasoning == null ? 'no-reasoning-metadata' : 'effort-not-listed',
        candidate,
        supportedEfforts,
        summaryTarget,
        conversationTarget,
      }
    }
  }

  return {
    reasoningEffort: candidate,
    source: candidateSource,
    summaryTarget,
    conversationTarget,
  }
}

function canProxyOverride(target, prop) {
  if (target === null || typeof target !== 'object') return false
  const desc = Object.getOwnPropertyDescriptor(target, prop)
  return desc === undefined || desc.configurable === true || desc.writable === true
}

function wrapLlmForCall(baseLlm, reasoningEffort) {
  const wrappedStream = (options) => {
    const shouldAttach =
      options !== null &&
      typeof options === 'object' &&
      options.reasoningEffort === undefined &&
      (options.purpose === undefined || options.purpose === 'compaction')
    return baseLlm.stream(shouldAttach ? { ...options, reasoningEffort } : options)
  }
  if (canProxyOverride(baseLlm, 'stream')) {
    return new Proxy(baseLlm, {
      get(target, prop) {
        if (prop === 'stream') return wrappedStream
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
  return { ...baseLlm, stream: wrappedStream }
}

function wrapCtxForCall(baseCtx, scopedLlm) {
  if (canProxyOverride(baseCtx, 'llm')) {
    return new Proxy(baseCtx, {
      get(target, prop) {
        if (prop === 'llm') return scopedLlm
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }
  return { ...baseCtx, llm: scopedLlm }
}

/** 仅为单次 summarize() 调用生成只读上下文包装，避免修改共享 ctx/llm/原型。 */
export function createScopedSummarizeReceiver(engine, reasoningEffort) {
  if (reasoningEffort === undefined) return engine
  const scopedLlm = wrapLlmForCall(engine.ctx.llm, reasoningEffort)
  const scopedCtx = wrapCtxForCall(engine.ctx, scopedLlm)
  return Object.create(engine, {
    ctx: { value: scopedCtx, writable: true, enumerable: true, configurable: true },
  })
}

function buildExtendedConfigSchema(OfficialEngine, z) {
  const baseSchema = OfficialEngine?.Config
  const baseDict = baseSchema?.dict
  if (!z || !baseDict) return baseSchema
  const effortSchema = z.string().description('Explicit reasoningEffort override for compaction summarization calls.')
  const inheritSchema = z.boolean().default(true).description('Inherit effective reasoningEffort from the conversation when compacting on the same provider/model.')
  const policyDict = baseDict.modelPolicies?.inner?.dict
  const modelPolicies = policyDict
    ? z.array(z.object({
        ...policyDict,
        summarizationReasoningEffort: effortSchema,
        inheritReasoningEffort: z.boolean(),
      }))
    : baseDict.modelPolicies
  return z.object({
    ...baseDict,
    ...(modelPolicies === undefined ? {} : { modelPolicies }),
    summarizationReasoningEffort: effortSchema,
    inheritReasoningEffort: inheritSchema,
  })
}

/** 从官方 BasicCompactionEngine 类派生保留 reasoningEffort 的包装引擎。 */
export function createCompactionEffortEngine(OfficialEngine, z, { record = defaultRecord } = {}) {
  if (typeof OfficialEngine !== 'function') throw new TypeError('OfficialEngine must be a constructor')
  const hasSummarizeHook = typeof OfficialEngine.prototype?.summarize === 'function'
  const extendedConfig = buildExtendedConfigSchema(OfficialEngine, z)

  if (!hasSummarizeHook) {
    return class CompactionEffortFallbackEngine extends OfficialEngine {
      static inject = OfficialEngine.inject ?? DEFAULT_INJECT
      static Config = extendedConfig
      constructor(ctx, config = {}) {
        const { officialConfig } = partitionCompactionConfig(config)
        super(ctx, officialConfig)
        if (!INTERFACE_MISMATCH_WARNED.has('missing-summarize')) {
          INTERFACE_MISMATCH_WARNED.add('missing-summarize')
          record({ event: 'interface-mismatch-fallback', reason: 'missing-summarize-hook' })
        }
      }
    }
  }

  return class CompactionEffortEngine extends OfficialEngine {
    static inject = OfficialEngine.inject ?? DEFAULT_INJECT
    static Config = extendedConfig
    tuningConfig

    constructor(ctx, config = {}) {
      const { officialConfig, tuningConfig } = partitionCompactionConfig(config)
      super(ctx, officialConfig)
      this.tuningConfig = tuningConfig
    }

    async summarize(input, agent, signal) {
      let resolution
      try {
        const latestHeader = agent?.session?.requestHeader?.()?.config
        const conversationTarget =
          normalizeTarget(latestHeader?.provider, latestHeader?.model) ??
          normalizeTarget(agent?.options?.provider, agent?.options?.model)
        const policy = resolvePolicySummaryTarget(this.config, conversationTarget)
        resolution = await resolveSummaryEffort({
          agent,
          llm: this.ctx?.llm,
          policy,
          tuningConfig: this.tuningConfig,
          latestHeader,
          signal,
        })
      } catch (error) {
        if (signal?.aborted) throw error
        record({ event: 'effort-resolve-fallback', error: String(error).slice(0, 300) })
        resolution = { reasoningEffort: undefined, source: 'resolve-error' }
      }

      if (resolution.reasoningEffort === undefined) {
        record({
          event: 'summarize-passthrough',
          source: resolution.source,
          provider: resolution.summaryTarget?.provider,
          model: resolution.summaryTarget?.model,
          ...(resolution.candidate === undefined ? {} : { droppedCandidate: resolution.candidate }),
          ...(resolution.requestedFrom === undefined ? {} : { requestedFrom: resolution.requestedFrom }),
          ...(resolution.reasonDetail === undefined ? {} : { reasonDetail: resolution.reasonDetail }),
        })
        return await OfficialEngine.prototype.summarize.call(this, input, agent, signal)
      }

      record({
        event: 'summarize-effort',
        source: resolution.source,
        reasoningEffort: resolution.reasoningEffort,
        provider: resolution.summaryTarget?.provider,
        model: resolution.summaryTarget?.model,
      })
      const scopedSelf = createScopedSummarizeReceiver(this, resolution.reasoningEffort)
      return await OfficialEngine.prototype.summarize.call(scopedSelf, input, agent, signal)
    }
  }
}

const packageEntryOf = (pkg) => {
  const dot = pkg.exports?.['.']
  if (typeof dot === 'string') return dot
  if (dot && typeof dot === 'object') return dot.default ?? dot.import ?? pkg.main ?? './lib/index.js'
  return pkg.main ?? './lib/index.js'
}

/** 定位运行中 DSH 对应的官方 @deepseek-ai/dsh-compaction-basic 入口目录与文件。 */
export function resolveOfficialCompactionLocation(
  entryScript = process.argv[1],
  fs = { realpathSync, readdirSync, existsSync, readFileSync },
  resolve = nodeResolve,
) {
  let directory
  let primaryError
  if (entryScript) {
    try {
      directory = findHostPackage(entryScript, 'dsh-compaction-basic', fs, resolve)
    } catch (error) {
      primaryError = error
    }
  }
  if (directory === undefined) {
    try {
      const resolvedPkgJson = fs.realpathSync(resolve(import.meta.url, '@deepseek-ai/dsh-compaction-basic/package.json'))
      directory = dirname(resolvedPkgJson)
    } catch (fallbackError) {
      throw primaryError ?? fallbackError
    }
  }
  const pkg = JSON.parse(fs.readFileSync(join(directory, 'package.json'), 'utf8'))
  const entryFile = join(directory, packageEntryOf(pkg))
  return { directory, entryFile, version: pkg.version }
}

/** 加载宿主里的官方 BasicCompactionEngine 与匹配的 schemastery。 */
export async function loadOfficialCompaction(entryScript = process.argv[1], deps) {
  const location = resolveOfficialCompactionLocation(entryScript, deps?.fs, deps?.resolve)
  const mod = await import(pathToFileURL(location.entryFile).href)
  const Engine = mod.BasicCompactionEngine ?? mod.default
  if (typeof Engine !== 'function') {
    throw new Error(`@deepseek-ai/dsh-compaction-basic (${location.version}) does not export BasicCompactionEngine`)
  }
  let z
  try {
    z = createRequire(location.entryFile)('@deepseek-ai/schemastery')
  } catch {}
  return { ...location, Engine, z }
}

let hostEngineClass
let hostLoadError
try {
  const host = await loadOfficialCompaction(hostAnchors())
  hostEngineClass = createCompactionEffortEngine(host.Engine, host.z)
} catch (error) {
  hostLoadError = error
}

class UnavailableCompactionEffortEngine {
  static inject = DEFAULT_INJECT
  constructor() {
    throw hostLoadError ?? new Error('dsh-runtime-tuning compaction-effort: failed to load host @deepseek-ai/dsh-compaction-basic')
  }
}

export const Config = hostEngineClass?.Config
export const inject = hostEngineClass?.inject ?? DEFAULT_INJECT
export default hostEngineClass ?? UnavailableCompactionEffortEngine
