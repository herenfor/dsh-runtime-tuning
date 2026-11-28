import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  createCompactionEffortEngine,
  loadOfficialCompaction,
  partitionCompactionConfig,
  resolvePolicySummaryTarget,
  resolveSummaryEffort,
  createScopedSummarizeReceiver,
} from '../plugins/compaction-effort.mjs'
import { resolvePresetConfig } from '../plugins/tool-use-prompt.mjs'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function findHostDshBin() {
  const candidates = [
    process.env.DSH_BIN,
    join(homedir(), '.local/bin/dsh'),
    '/usr/local/bin/dsh',
    join(homedir(), '.local/share/dsh-cli/node_modules/@deepseek-ai/dsh/lib/bin.js'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

const HOST_DSH_BIN = findHostDshBin()
const skipWithoutHost = HOST_DSH_BIN === undefined ? 'host dsh binary absent' : false

async function loadHostModules(entryScript) {
  const compactionLocation = await loadOfficialCompaction(entryScript)
  const requireFromHost = createRequire(compactionLocation.entryFile)
  const importPkg = async (pkgName) => {
    const pkgJson = requireFromHost.resolve(`@deepseek-ai/${pkgName}/package.json`)
    const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'))
    const dot = pkg.exports?.['.']
    const rel = typeof dot === 'string' ? dot : dot?.default ?? dot?.import ?? pkg.main ?? './lib/index.js'
    return import(pathToFileURL(join(dirname(pkgJson), rel)).href)
  }
  const cordisPkgJson = requireFromHost.resolve('@deepseek-ai/cordis/package.json')
  const cordisPkg = JSON.parse(readFileSync(cordisPkgJson, 'utf8'))
  const cordisDot = cordisPkg.exports?.['.']
  const cordisRel = typeof cordisDot === 'string' ? cordisDot : cordisDot?.default ?? cordisDot?.import ?? './lib/index.js'
  const cordis = await import(pathToFileURL(join(dirname(cordisPkgJson), cordisRel)).href)
  const includePkgJson = requireFromHost.resolve('@deepseek-ai/cordis-plugin-include/package.json')
  const includePkg = JSON.parse(readFileSync(includePkgJson, 'utf8'))
  const includeDot = includePkg.exports?.['.']
  const includeRel = typeof includeDot === 'string' ? includeDot : includeDot?.default ?? includeDot?.import ?? './lib/index.js'
  const cordisInclude = await import(pathToFileURL(join(dirname(includePkgJson), includeRel)).href)

  return {
    compactionLocation,
    yaml: requireFromHost('js-yaml'),
    entryListSchema: cordisInclude.entryListSchema,
    cordis,
    compaction: await importPkg('dsh-compaction'),
    compactionBasic: await import(pathToFileURL(compactionLocation.entryFile).href),
    session: await importPkg('dsh-session'),
    tokenMeter: await importPkg('dsh-token-meter'),
    llm: await importPkg('dsh-llm'),
    llmDeepSeek: await importPkg('dsh-llm-deepseek'),
    llmDeepSeekApiKey: await importPkg('dsh-llm-deepseek-api-key'),
    jsonl: await importPkg('dsh-session-persistence-jsonl'),
    sessionProjection: await importPkg('dsh-session-projection'),
    preset: await importPkg('dsh-agent-preset'),
    presetRegistry: await importPkg('dsh-agent-preset-registry'),
    cordisLoader: await import(pathToFileURL(join(dirname(requireFromHost.resolve('@deepseek-ai/cordis-plugin-loader/package.json')), 'lib/index.js')).href),
  }
}

async function withMockAnthropicServer(handler, fn) {
  const requests = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8')
      const body = rawBody.length > 0 ? JSON.parse(rawBody) : undefined
      const reqRecord = { method: req.method, url: req.url, headers: req.headers, body }
      requests.push(reqRecord)
      Promise.resolve(handler(reqRecord, res, requests)).catch((error) => {
        if (!res.headersSent) res.writeHead(500)
        res.end(String(error))
      })
    })
  })
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen))
  const { port } = server.address()
  try {
    return await fn({ baseURL: `http://127.0.0.1:${port}/anthropic`, requests })
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose))
  }
}

function writeSseStop(res, { text = '## Primary Request and Intent\n- Preserve context.', thinking, inputTokens = 120, cacheRead = 100, cacheCreation = 20, outputTokens = 24, stopReason = 'end_turn' } = {}) {
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.write(`event: message_start\ndata: ${JSON.stringify({
    type: 'message_start',
    message: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: 'deepseek-flash',
      content: [],
      stop_reason: null,
      usage: {
        input_tokens: inputTokens,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheCreation,
        output_tokens: 0,
      },
    },
  })}\n\n`)
  let index = 0
  if (thinking !== undefined) {
    res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '' } })}\n\n`)
    res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking } })}\n\n`)
    res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index })}\n\n`)
    index += 1
  }
  if (text !== undefined) {
    res.write(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } })}\n\n`)
    res.write(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })}\n\n`)
    res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index })}\n\n`)
  }
  res.write(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: outputTokens } })}\n\n`)
  res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`)
  res.end()
}

// ── Unit tests (host-independent) ────────────────────────────────────────────

test('partitionCompactionConfig separates extension keys cleanly without mutating caller input', () => {
  const input = {
    thresholdRatio: 0.75,
    maxTokens: 4096,
    summarizationProvider: 'deepseek-account',
    summarizationModel: 'deepseek-flash',
    summarizationReasoningEffort: ' low ',
    inheritReasoningEffort: false,
    modelPolicies: [
      {
        provider: 'deepseek-account',
        model: 'deepseek-flash',
        maxTokens: 8192,
        summarizationReasoningEffort: 'max',
        inheritReasoningEffort: true,
      },
      {
        provider: 'other',
        model: 'm1',
        summarizationReasoningEffort: '   ',
      },
    ],
  }
  const snapshot = structuredClone(input)
  const { officialConfig, tuningConfig } = partitionCompactionConfig(input)
  assert.deepEqual(input, snapshot)
  assert.equal('summarizationReasoningEffort' in officialConfig, false)
  assert.equal('inheritReasoningEffort' in officialConfig, false)
  assert.equal('summarizationReasoningEffort' in officialConfig.modelPolicies[0], false)
  assert.equal('inheritReasoningEffort' in officialConfig.modelPolicies[0], false)
  assert.equal(officialConfig.thresholdRatio, 0.75)
  assert.equal(officialConfig.modelPolicies[0].maxTokens, 8192)
  assert.equal(tuningConfig.summarizationReasoningEffort, 'low')
  assert.equal(tuningConfig.inheritReasoningEffort, false)
  assert.equal(tuningConfig.modelPolicies.length, 1)
  assert.deepEqual(tuningConfig.modelPolicies[0], {
    provider: 'deepseek-account',
    model: 'deepseek-flash',
    summarizationReasoningEffort: 'max',
    inheritReasoningEffort: true,
  })

  assert.throws(() => partitionCompactionConfig({ summarizationReasoningEffort: 123 }), /must be a string/)
  assert.throws(() => partitionCompactionConfig({ inheritReasoningEffort: 'yes' }), /must be a boolean/)
  assert.throws(() => partitionCompactionConfig({ modelPolicies: [{ provider: 'p', model: 'm', inheritReasoningEffort: 0 }] }), /modelPolicies\[0\]/)
})

test('resolveSummaryEffort honors same-model inheritance, independent models, explicit overrides, and capabilities', async () => {
  const baseTuning = { inheritReasoningEffort: true, summarizationReasoningEffort: undefined, modelPolicies: [] }
  const dsLlm = {
    resolveModelInfo: async (provider, model) => (
      provider === 'deepseek-account' && model === 'deepseek-flash'
        ? { reasoning: { efforts: ['off', 'low', 'medium', 'high', 'max'], defaultEffort: 'high' } }
        : { reasoning: { efforts: ['low', 'high'], defaultEffort: 'low' } }
    ),
  }

  for (const level of ['max', 'high', 'medium', 'low', 'off']) {
    const res = await resolveSummaryEffort({
      agent: {
        session: { requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: level } }) },
        options: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'low' },
      },
      llm: dsLlm,
      policy: { summarizationProvider: '', summarizationModel: '' },
      tuningConfig: baseTuning,
    })
    assert.equal(res.reasoningEffort, level)
    assert.equal(res.source, 'request-header')
  }

  // Real DSH normalizeModelInfo returns efforts as { id, name }[] objects
  const objectEffortsLlm = {
    resolveModelInfo: async () => ({
      reasoning: {
        efforts: [
          { id: 'off', name: 'Off' },
          { id: 'low', name: 'Low' },
          { id: 'high', name: 'High' },
          { id: 'max', name: 'Max' },
        ],
        defaultEffort: 'high',
      },
    }),
  }
  const objectEffortRes = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' } }) },
      options: {},
    },
    llm: objectEffortsLlm,
    policy: { summarizationProvider: '', summarizationModel: '' },
    tuningConfig: baseTuning,
  })
  assert.equal(objectEffortRes.reasoningEffort, 'max')
  assert.equal(objectEffortRes.source, 'request-header')

  // Omitted reasoningEffort on requestHeader does not guess from stale options
  const headerWithoutEffort = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash' } }) },
      options: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' },
    },
    llm: dsLlm,
    policy: { summarizationProvider: '', summarizationModel: '' },
    tuningConfig: baseTuning,
  })
  assert.equal(headerWithoutEffort.reasoningEffort, undefined)
  assert.equal(headerWithoutEffort.source, 'header-without-effort')

  // No requestHeader yet falls back to agent.options / matching model selection
  const beforeHeader = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => undefined },
      options: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' },
    },
    llm: dsLlm,
    policy: { summarizationProvider: '', summarizationModel: '' },
    tuningConfig: baseTuning,
  })
  assert.equal(beforeHeader.reasoningEffort, 'max')
  assert.equal(beforeHeader.source, 'agent-options')

  // Independent summarization model never inherits conversation max
  const independent = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' } }) },
      options: {},
    },
    llm: dsLlm,
    policy: { summarizationProvider: 'other', summarizationModel: 'other-fast' },
    tuningConfig: baseTuning,
  })
  assert.equal(independent.reasoningEffort, undefined)
  assert.equal(independent.source, 'independent-model')

  // Explicit override takes precedence on both same-model and independent models
  const explicitIndependent = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' } }) },
      options: {},
    },
    llm: dsLlm,
    policy: { summarizationProvider: 'other', summarizationModel: 'other-fast' },
    tuningConfig: { inheritReasoningEffort: true, summarizationReasoningEffort: 'low', modelPolicies: [] },
  })
  assert.equal(explicitIndependent.reasoningEffort, 'low')
  assert.equal(explicitIndependent.source, 'explicit')

  // inheritReasoningEffort: false disables implicit inheritance unless explicit override exists
  const disabledInherit = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' } }) },
      options: {},
    },
    llm: dsLlm,
    policy: { summarizationProvider: '', summarizationModel: '' },
    tuningConfig: { inheritReasoningEffort: false, summarizationReasoningEffort: undefined, modelPolicies: [] },
  })
  assert.equal(disabledInherit.reasoningEffort, undefined)
  assert.equal(disabledInherit.source, 'inherit-disabled')

  // Unsupported candidate rejected by model info
  const unsupported = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'turbo-invalid' } }) },
      options: {},
    },
    llm: dsLlm,
    policy: { summarizationProvider: '', summarizationModel: '' },
    tuningConfig: baseTuning,
  })
  assert.equal(unsupported.reasoningEffort, undefined)
  assert.equal(unsupported.source, 'unsupported-effort')
  assert.equal(unsupported.requestedFrom, 'request-header')
  assert.equal(unsupported.reasonDetail, 'effort-not-listed')

  // Explicit summarizationReasoningEffort also goes through target model capability validation
  const explicitUnsupportedIndependent = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' } }) },
      options: {},
    },
    llm: dsLlm,
    policy: { summarizationProvider: 'other', summarizationModel: 'other-fast' },
    tuningConfig: { inheritReasoningEffort: true, summarizationReasoningEffort: 'max', modelPolicies: [] },
  })
  assert.equal(explicitUnsupportedIndependent.reasoningEffort, undefined)
  assert.equal(explicitUnsupportedIndependent.source, 'unsupported-effort')
  assert.equal(explicitUnsupportedIndependent.requestedFrom, 'explicit')
  assert.equal(explicitUnsupportedIndependent.reasonDetail, 'effort-not-listed')
  assert.deepEqual(explicitUnsupportedIndependent.supportedEfforts, ['low', 'high'])

  // Model metadata without reasoning capability drops both implicit and explicit efforts cleanly
  const noReasoningLlm = {
    resolveModelInfo: async (_provider, model) => ({ id: model, name: model }),
  }
  const implicitNoReasoning = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'plain', model: 'plain-chat', reasoningEffort: 'max' } }) },
      options: {},
    },
    llm: noReasoningLlm,
    policy: { summarizationProvider: '', summarizationModel: '' },
    tuningConfig: baseTuning,
  })
  assert.equal(implicitNoReasoning.reasoningEffort, undefined)
  assert.equal(implicitNoReasoning.source, 'unsupported-effort')
  assert.equal(implicitNoReasoning.requestedFrom, 'request-header')
  assert.equal(implicitNoReasoning.reasonDetail, 'no-reasoning-metadata')
  assert.deepEqual(implicitNoReasoning.supportedEfforts, [])

  const explicitNoReasoning = await resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'plain', model: 'plain-chat' } }) },
      options: {},
    },
    llm: noReasoningLlm,
    policy: { summarizationProvider: '', summarizationModel: '' },
    tuningConfig: {
      inheritReasoningEffort: false,
      summarizationReasoningEffort: 'low',
      modelPolicies: [{ provider: 'plain', model: 'plain-chat', summarizationReasoningEffort: 'high' }],
    },
  })
  assert.equal(explicitNoReasoning.reasoningEffort, undefined)
  assert.equal(explicitNoReasoning.source, 'unsupported-effort')
  assert.equal(explicitNoReasoning.requestedFrom, 'explicit-policy')
  assert.equal(explicitNoReasoning.reasonDetail, 'no-reasoning-metadata')
  assert.deepEqual(explicitNoReasoning.supportedEfforts, [])

  // Abort propagates cleanly during resolveModelInfo
  const ac = new AbortController()
  ac.abort(new Error('aborted by caller'))
  await assert.rejects(resolveSummaryEffort({
    agent: {
      session: { requestHeader: () => ({ config: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' } }) },
      options: {},
    },
    llm: { resolveModelInfo: async () => { throw new Error('network failed after abort') } },
    policy: { summarizationProvider: '', summarizationModel: '' },
    tuningConfig: baseTuning,
    signal: ac.signal,
  }), /network failed after abort/)
})

test('createCompactionEffortEngine handles frozen receivers and missing summarize hook safely', async () => {
  const logs = []
  class NoSummarizeOfficial {
    static inject = ['llm', 'tokenMeter', 'sessions']
    constructor(ctx, config) {
      this.ctx = ctx
      this.config = config
    }
  }
  const Fallback = createCompactionEffortEngine(NoSummarizeOfficial, undefined, { record: (e) => logs.push(e) })
  const fb = new Fallback({}, { maxTokens: 1000, summarizationReasoningEffort: 'max' })
  assert.equal(fb.config.maxTokens, 1000)
  assert.equal('summarizationReasoningEffort' in fb.config, false)
  assert.equal(logs[0]?.event, 'interface-mismatch-fallback')

  const seenOptions = []
  const frozenLlm = Object.freeze({
    stream(options) {
      seenOptions.push(options)
      return []
    },
  })
  const frozenCtx = Object.freeze({ llm: frozenLlm })
  const receiver = createScopedSummarizeReceiver({ ctx: frozenCtx }, 'max')
  receiver.ctx.llm.stream({ purpose: 'compaction', model: 'm1' })
  receiver.ctx.llm.stream({ purpose: 'other', model: 'm1' })
  assert.equal(seenOptions[0].reasoningEffort, 'max')
  assert.equal(seenOptions[1].reasoningEffort, undefined)
  assert.equal(frozenCtx.llm, frozenLlm)
})

test('resolvePresetConfig maps nested compaction-basic in tuned preset while preserving user settings and third-party plugins', () => {
  const patched = resolvePresetConfig({
    id: 'tuned',
    plugins: [
      { id: 'tool-use-prompt', name: '@herenfor/dsh-tune/plugins/tool-use-prompt.mjs' },
      {
        id: 'compaction',
        name: 'cordis:group',
        group: true,
        isolate: { compaction: true, toolResultPruner: true },
        config: [
          { id: 'compaction-basic', name: '@herenfor/dsh-tune/plugins/compaction-effort.mjs', config: { thresholdRatio: 0.7 } },
          { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
        ],
      },
    ],
  }, 'file:///pkg/plugins/tool-use-prompt.mjs')
  assert.equal(patched.plugins[0].name, 'file:///pkg/plugins/tool-use-prompt.mjs')
  assert.equal(patched.plugins[1].config[0].name, 'file:///pkg/plugins/compaction-effort.mjs')
  assert.deepEqual(patched.plugins[1].config[0].config, { thresholdRatio: 0.7 })

  // Legacy dsh-runtime-tuning alias upgrades cleanly, while official @deepseek-ai/dsh-compaction-basic stays default untouched
  const legacyCustom = resolvePresetConfig({
    id: 'tuned',
    plugins: [{
      id: 'compaction',
      name: 'cordis:group',
      group: true,
      config: [
        { id: 'compaction-basic', name: 'dsh-runtime-tuning/plugins/compaction-effort.mjs', disabled: false, config: { summarizationProvider: 'alt', summarizationModel: 'fast', maxTokens: 2048 } },
      ],
    }],
  }, 'file:///pkg/plugins/tool-use-prompt.mjs')
  assert.equal(legacyCustom.plugins[0].config[0].name, 'file:///pkg/plugins/compaction-effort.mjs')
  assert.equal(legacyCustom.plugins[0].config[0].config.summarizationProvider, 'alt')

  const officialDefault = resolvePresetConfig({
    id: 'tuned',
    plugins: [{
      id: 'compaction',
      name: 'cordis:group',
      group: true,
      config: [{ id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' }],
    }],
  }, 'file:///pkg/plugins/tool-use-prompt.mjs')
  assert.equal(officialDefault.plugins[0].config[0].name, '@deepseek-ai/dsh-compaction-basic')

  // Third-party custom compaction plugin is preserved untouched
  const custom = resolvePresetConfig({
    id: 'tuned',
    plugins: [{
      id: 'compaction',
      name: 'cordis:group',
      group: true,
      config: [{ id: 'compaction-basic', name: '@custom/compaction-engine' }],
    }],
  }, 'file:///pkg/plugins/tool-use-prompt.mjs')
  assert.equal(custom.plugins[0].config[0].name, '@custom/compaction-engine')
})

// ── Host L2 integration tests against real DSH packages ──────────────────────

function seedConversationTurn(session, llm, {
  provider = 'deepseek-official',
  model = 'deepseek-flash',
  reasoningEffort,
  adapterDefaults,
  userText = 'Inspect files and reproduce the KV cache miss during compaction summarization. '.repeat(25),
  assistantText = 'Verified request serialization, request header recording, and summary token budget. '.repeat(25),
} = {}) {
  session.append('turn/start', { turn: 1 })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('system/message', { turn: 1, step: 1, message: llm.createSystemMessage('System base prompt') }, { surfaceOp: 'append' })
  if (provider !== undefined) {
    const header = {
      config: {
        provider,
        model,
        ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      },
      ...(adapterDefaults && Object.keys(adapterDefaults).length > 0 ? { adapterDefaults } : {}),
    }
    session.append('request/header', { header, reason: 'initial', startsSeries: true })
  }
  session.append('user/message', llm.createUserMessage({ content: [{ type: 'text', text: userText }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  session.append('assistant/message', { turn: 1, step: 1, stream: [], message: llm.createAssistantMessage({ content: [{ type: 'text', text: assistantText }], source: { provider: provider ?? 'mock-ds', model } }) }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, outcome: 'completed' })
  session.append('turn/start', { turn: 2 })
  session.append('user/message', llm.createUserMessage({ content: [{ type: 'text', text: 'Latest follow-up kept in tail.' }], source: { kind: 'user' } }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 2, step: 1 })
  session.append('assistant/message', { turn: 2, step: 1, stream: [], message: llm.createAssistantMessage({ content: [{ type: 'text', text: 'Working on tail.' }], source: { provider: provider ?? 'mock-ds', model } }) }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 2, step: 1 })
  session.append('turn/end', { turn: 2, outcome: 'completed' })
}

function makeFakeAgent(session, options = {}, { modelSelection } = {}) {
  return {
    id: session.id,
    session,
    options,
    ...(modelSelection === undefined ? {} : { model: { current: () => modelSelection } }),
    runMaintenance: async (fn) => fn(new AbortController().signal),
  }
}

test('L2 host: DeepSeekAdapter wire effort parity across max, high, adapter default, omitted default, independent model, and explicit override', { skip: skipWithoutHost }, async () => {
  const host = await loadHostModules(HOST_DSH_BIN)
  const CompactionEffortEngine = createCompactionEffortEngine(host.compactionBasic.BasicCompactionEngine, host.compactionLocation.z)

  await withMockAnthropicServer((req, res) => {
    writeSseStop(res, {
      thinking: 'internal reasoning trace',
      text: '## Primary Request and Intent\n- Bug fixed.',
      inputTokens: 90,
      cacheRead: 85,
      cacheCreation: 5,
      outputTokens: 18,
    })
  }, async ({ baseURL, requests }) => {
    const createHarness = async (compactionConfig = {}, { defaultReasoningEffort, independentDefaultEffort = 'low' } = {}) => {
      const ctx = new host.cordis.Context()
      await ctx.plugin(host.llm.LlmRuntime)
      await ctx.plugin(host.session.SessionStore)
      await ctx.plugin(host.sessionProjection.SessionProjectionRegistry)
      await ctx.plugin(host.tokenMeter.TokenMeter)

      const makeProviderOpts = (effort) => () => {
        const connection = host.llmDeepSeek.resolveAdapterOptions({
          baseURL,
          ...(effort === undefined ? {} : { reasoningEffort: effort }),
          defaultContextWindow: 128000,
        })
        return { ...connection, offered: connection.models, refusals: new Map(), badges: new Map() }
      }

      const regDs = (provider, effort) => host.llmDeepSeek.registerDeepSeekProvider(ctx, provider, {
        providerName: provider,
        options: makeProviderOpts(effort),
        connect: async () => makeProviderOpts(effort)(),
        resolveAuth: async () => ({ headers: { 'x-api-key': 'test-key' } }),
        admit: () => {},
        discoverModels: async () => [],
      })
      regDs('deepseek-account', defaultReasoningEffort)
      regDs('alt-provider', independentDefaultEffort)

      // Spy GenerateOptions passed to ctx.llm.stream while preserving original stream behavior
      const capturedOptions = []
      const origStream = ctx.llm.stream.bind(ctx.llm)
      ctx.llm.stream = (options) => {
        capturedOptions.push(options)
        return origStream(options)
      }

      await ctx.plugin(CompactionEffortEngine, compactionConfig)
      return { ctx, capturedOptions }
    }

    // 1. max -> max & full summary/rawOutput/usage parity
    {
      requests.length = 0
      const { ctx, capturedOptions } = await createHarness({ auto: false })
      const session = ctx.sessions.create('l2-max')
      seedConversationTurn(session, host.llm, { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' })
      const agent = makeFakeAgent(session, { provider: 'deepseek-account', model: 'deepseek-flash' })
      const result = await ctx.compaction.compactNow(agent, new AbortController().signal)
      assert.ok(result)
      assert.equal(capturedOptions.length, 1)
      assert.equal(capturedOptions[0].reasoningEffort, 'max')
      assert.equal(capturedOptions[0].purpose, 'compaction')
      assert.equal(capturedOptions[0].sessionId, 'l2-max')
      assert.equal(requests.length, 1)
      assert.deepEqual(requests[0].body.output_config, { effort: 'max' })
      assert.deepEqual(requests[0].body.thinking, { type: 'enabled' })

      const summaryEv = session.eventAt(result.summarySeq)
      assert.equal(summaryEv.type, 'compaction/summary')
      assert.equal(summaryEv.data.rawOutput.some((b) => b.type === 'reasoning'), true)
      assert.equal(summaryEv.data.summary.some((b) => b.type === 'reasoning'), false)
      assert.deepEqual(summaryEv.data.usage?.inputTokens, 90)
      assert.equal(summaryEv.data.usage?.cacheReadTokens, 85)
      await ctx.fiber.dispose()
    }

    // 2. high -> high (never forced to max)
    {
      requests.length = 0
      const { ctx, capturedOptions } = await createHarness({ auto: false })
      const session = ctx.sessions.create('l2-high')
      seedConversationTurn(session, host.llm, { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' })
      const agent = makeFakeAgent(session, { provider: 'deepseek-account', model: 'deepseek-flash' })
      await ctx.compaction.compactNow(agent, new AbortController().signal)
      assert.equal(capturedOptions[0].reasoningEffort, 'high')
      assert.deepEqual(requests[0].body.output_config, { effort: 'high' })
      await ctx.fiber.dispose()
    }

    // 3. Adapter default 'max' resolved into request/header by prepareCall -> inherited as 'max'
    {
      requests.length = 0
      const { ctx, capturedOptions } = await createHarness({ auto: false }, { defaultReasoningEffort: 'max' })
      const prep = await ctx.llm.prepareCall({ provider: 'deepseek-account', model: 'deepseek-flash' })
      assert.equal(prep.config.reasoningEffort, 'max')
      assert.equal(prep.adapterDefaults.reasoningEffort, true)
      const session = ctx.sessions.create('l2-adapter-default')
      seedConversationTurn(session, host.llm, {
        provider: prep.config.provider,
        model: prep.config.model,
        reasoningEffort: prep.config.reasoningEffort,
        adapterDefaults: prep.adapterDefaults,
      })
      const agent = makeFakeAgent(session, { provider: 'deepseek-account', model: 'deepseek-flash' })
      await ctx.compaction.compactNow(agent, new AbortController().signal)
      assert.equal(capturedOptions[0].reasoningEffort, 'max')
      assert.deepEqual(requests[0].body.output_config, { effort: 'max' })
      await ctx.fiber.dispose()
    }

    // 4. Request header missing reasoningEffort & adapter omitting default -> keeps official default without forcing max
    {
      requests.length = 0
      const { ctx, capturedOptions } = await createHarness({ auto: false })
      const session = ctx.sessions.create('l2-no-header-effort')
      seedConversationTurn(session, host.llm, { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: undefined })
      const agent = makeFakeAgent(session, { provider: 'deepseek-account', model: 'deepseek-flash' })
      await ctx.compaction.compactNow(agent, new AbortController().signal)
      assert.equal(capturedOptions[0].reasoningEffort, undefined)
      // DeepSeek official fallback when omitted defaults to high
      assert.deepEqual(requests[0].body.output_config, { effort: 'high' })
      await ctx.fiber.dispose()
    }

    // 5. Independent summarizationProvider / summarizationModel preserves its own default ('low') and never receives 'max'
    {
      requests.length = 0
      const { ctx, capturedOptions } = await createHarness({
        auto: false,
        summarizationProvider: 'alt-provider',
        summarizationModel: 'deepseek-chat',
      }, { defaultReasoningEffort: 'max', independentDefaultEffort: 'low' })
      const session = ctx.sessions.create('l2-independent')
      seedConversationTurn(session, host.llm, { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' })
      const agent = makeFakeAgent(session, { provider: 'deepseek-account', model: 'deepseek-flash' })
      await ctx.compaction.compactNow(agent, new AbortController().signal)
      assert.equal(capturedOptions[0].provider, 'alt-provider')
      assert.equal(capturedOptions[0].model, 'deepseek-chat')
      assert.equal(capturedOptions[0].reasoningEffort, undefined)
      assert.deepEqual(requests[0].body.output_config, { effort: 'low' })
      await ctx.fiber.dispose()
    }

    // 6. Explicit summarizationReasoningEffort overrides implicit inheritance
    {
      requests.length = 0
      const { ctx, capturedOptions } = await createHarness({
        auto: false,
        summarizationReasoningEffort: 'low',
      })
      const session = ctx.sessions.create('l2-explicit-override')
      seedConversationTurn(session, host.llm, { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'max' })
      const agent = makeFakeAgent(session, { provider: 'deepseek-account', model: 'deepseek-flash' })
      await ctx.compaction.compactNow(agent, new AbortController().signal)
      assert.equal(capturedOptions[0].reasoningEffort, 'low')
      assert.deepEqual(requests[0].body.output_config, { effort: 'low' })
      await ctx.fiber.dispose()
    }
  })
})

test('L2 host: auto pressure, context-overflow, model-switch, concurrency, and failure/abort boundaries', { skip: skipWithoutHost }, async () => {
  const host = await loadHostModules(HOST_DSH_BIN)
  const CompactionEffortEngine = createCompactionEffortEngine(host.compactionBasic.BasicCompactionEngine, host.compactionLocation.z)

  const setupCtx = async (streamImpl, compactionConfig = {}) => {
    const ctx = new host.cordis.Context()
    await ctx.plugin(host.llm.LlmRuntime)
    await ctx.plugin(host.session.SessionStore)
    await ctx.plugin(host.sessionProjection.SessionProjectionRegistry)
    await ctx.plugin(host.tokenMeter.TokenMeter)

    ctx.llm.registerAdapter(['mock-ds'], new class extends host.llm.LlmAdapter {
      providerInfo() { return { id: 'mock-ds', name: 'Mock DS' } }
      async listModels() {
        return [
          {
            provider: 'mock-ds',
            id: 'main-model',
            name: 'main-model',
            context: { contextWindow: 1000 },
            defaultMaxTokens: 100,
            reasoning: {
              efforts: [
                { id: 'low', name: 'Low' },
                { id: 'high', name: 'High' },
                { id: 'max', name: 'Max' },
              ],
              defaultEffort: 'high',
            },
          },
          {
            provider: 'mock-ds',
            id: 'tiny-switch-model',
            name: 'tiny-switch-model',
            context: { contextWindow: 500 },
            defaultMaxTokens: 50,
            reasoning: {
              efforts: [
                { id: 'low', name: 'Low' },
                { id: 'high', name: 'High' },
              ],
              defaultEffort: 'high',
            },
          },
        ]
      }
      async resolveModel(_provider, modelId) {
        return (await this.listModels()).find((m) => m.id === modelId)
      }
      async prepareCall(_provider, modelId) {
        const model = await this.resolveModel('mock-ds', modelId)
        return { model, stream: (options) => streamImpl(options) }
      }
    }())

    await ctx.plugin(CompactionEffortEngine, { headroomTokens: 100, maxTokens: 100, retainTokens: 10, thresholdRatio: 0.5, ...compactionConfig })
    return ctx
  }

  const okStreamChunks = async function* (summary = '## Primary Request and Intent\n- Compact.') {
    yield { type: 'text-delta', text: summary }
    yield { type: 'usage', usage: { inputTokens: 40, outputTokens: 10 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }

  // Trigger paths: auto pressure (`agent/pre-step`), `context-overflow` (`agent/request-error`), model-switch (`agent/request`)
  {
    const seen = []
    const ctx = await setupCtx((options) => {
      seen.push({ sessionId: options.sessionId, model: options.model, reasoningEffort: options.reasoningEffort })
      return okStreamChunks()
    })

    const longText = 'word '.repeat(320)

    // Auto pressure (`agent/pre-step`)
    {
      const s = ctx.sessions.create('trigger-pressure')
      seedConversationTurn(s, host.llm, { provider: 'mock-ds', model: 'main-model', reasoningEffort: 'max', userText: longText, assistantText: longText })
      s.append('turn/start', { turn: 3 })
      const agent = makeFakeAgent(s, { provider: 'mock-ds', model: 'main-model' })
      await ctx.waterfall('agent/pre-step', { agent, signal: new AbortController().signal }, async () => {})
      assert.equal(seen.at(-1)?.sessionId, 'trigger-pressure')
      assert.equal(seen.at(-1)?.reasoningEffort, 'max')
    }

    // Context-overflow (`agent/request-error`)
    {
      const s = ctx.sessions.create('trigger-overflow')
      seedConversationTurn(s, host.llm, { provider: 'mock-ds', model: 'main-model', reasoningEffort: 'high', userText: longText, assistantText: longText })
      s.append('turn/start', { turn: 3 })
      const agent = makeFakeAgent(s, { provider: 'mock-ds', model: 'main-model' })
      const outcome = await ctx.waterfall('agent/request-error', {
        agent,
        failure: { code: host.llm.CONTEXT_WINDOW_EXCEEDED_CODE, message: 'too long' },
        signal: new AbortController().signal,
      }, async () => ({ kind: 'fail' }))
      assert.equal(outcome.kind, 'retry')
      assert.equal(seen.at(-1)?.sessionId, 'trigger-overflow')
      assert.equal(seen.at(-1)?.reasoningEffort, 'high')
    }

    // Model-switch (`agent/request` before updating header -> uses cached pre-switch model & effort)
    {
      const s = ctx.sessions.create('trigger-switch')
      seedConversationTurn(s, host.llm, { provider: 'mock-ds', model: 'main-model', reasoningEffort: 'max', userText: 'A '.repeat(300), assistantText: 'B '.repeat(300) })
      s.append('turn/start', { turn: 3 })
      const agent = makeFakeAgent(s, { provider: 'mock-ds', model: 'tiny-switch-model' })
      await ctx.waterfall('agent/request', { agent, signal: new AbortController().signal }, async () => ({ provider: 'mock-ds', model: 'tiny-switch-model', reasoningEffort: 'low' }))
      assert.equal(seen.at(-1)?.sessionId, 'trigger-switch')
      assert.equal(seen.at(-1)?.model, 'main-model')
      assert.equal(seen.at(-1)?.reasoningEffort, 'max')
    }

    await ctx.fiber.dispose()
  }

  // Concurrency isolation: two sessions with different reasoningEffort running in parallel without mutating shared llm.stream
  {
    const started = []
    let releaseFirst
    const gate = new Promise((resolveGate) => { releaseFirst = resolveGate })
    const resultsBySession = new Map()
    const ctx = await setupCtx(async function* (options) {
      resultsBySession.set(options.sessionId, options.reasoningEffort)
      started.push(options.sessionId)
      if (options.sessionId === 'conc-max') await gate
      yield { type: 'text-delta', text: `## Primary Request and Intent\n- Compacted ${options.sessionId}` }
      yield { type: 'usage', usage: { inputTokens: 30, outputTokens: 8 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }, { auto: false })

    const rawLlm = Object.getOwnPropertySymbols(ctx.reflect.store)
      .map((sym) => ctx.reflect.store[sym])
      .find((entry) => entry?.name === 'llm')?.value
    const originalStreamFn = rawLlm.stream
    const originalProtoStreamFn = host.llm.LlmRuntime.prototype.stream
    const sMax = ctx.sessions.create('conc-max')
    seedConversationTurn(sMax, host.llm, { provider: 'mock-ds', model: 'main-model', reasoningEffort: 'max' })
    const sLow = ctx.sessions.create('conc-low')
    seedConversationTurn(sLow, host.llm, { provider: 'mock-ds', model: 'main-model', reasoningEffort: 'low' })

    const pMax = ctx.compaction.compactNow(makeFakeAgent(sMax), new AbortController().signal)
    while (!started.includes('conc-max')) await new Promise((r) => setTimeout(r, 5))
    assert.equal(rawLlm.stream, originalStreamFn)
    assert.equal(host.llm.LlmRuntime.prototype.stream, originalProtoStreamFn)

    const pLow = ctx.compaction.compactNow(makeFakeAgent(sLow), new AbortController().signal)
    await pLow
    releaseFirst()
    await pMax

    assert.equal(rawLlm.stream, originalStreamFn)
    assert.equal(host.llm.LlmRuntime.prototype.stream, originalProtoStreamFn)
    assert.equal(resultsBySession.get('conc-max'), 'max')
    assert.equal(resultsBySession.get('conc-low'), 'low')
    await ctx.fiber.dispose()
  }

  // Failure & abort parity: empty summary, max-tokens truncation, and abort
  {
    let mode = 'empty'
    const ctx = await setupCtx(async function* (options) {
      assert.equal(options.reasoningEffort, 'max')
      if (mode === 'empty') {
        yield { type: 'reasoning-delta', text: 'only thinking, no text' }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } else if (mode === 'max-tokens') {
        yield { type: 'text-delta', text: '## Partial...' }
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
      } else if (mode === 'abort') {
        yield { type: 'text-delta', text: '## Half...' }
        await new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true }))
      }
    }, { auto: false })

    // empty summary
    {
      mode = 'empty'
      const s = ctx.sessions.create('fail-empty')
      seedConversationTurn(s, host.llm, { provider: 'mock-ds', model: 'main-model', reasoningEffort: 'max' })
      const beforeSeqs = [...s.surface.nodes]
      await assert.rejects(ctx.compaction.compactNow(makeFakeAgent(s), new AbortController().signal), (err) => err.code === 'summary')
      assert.deepEqual([...s.surface.nodes], beforeSeqs)
      assert.ok(s.eventAt(s.seq - 1).type === 'compaction/end' && s.eventAt(s.seq - 1).data.error !== undefined)
    }

    // max-tokens fail-closed
    {
      mode = 'max-tokens'
      const s = ctx.sessions.create('fail-max-tokens')
      seedConversationTurn(s, host.llm, { provider: 'mock-ds', model: 'main-model', reasoningEffort: 'max' })
      const beforeSeqs = [...s.surface.nodes]
      await assert.rejects(ctx.compaction.compactNow(makeFakeAgent(s), new AbortController().signal), (err) => err.cause?.code === 'MAX_TOKENS')
      assert.deepEqual([...s.surface.nodes], beforeSeqs)
    }

    // abort mid-stream
    {
      mode = 'abort'
      const s = ctx.sessions.create('fail-abort')
      seedConversationTurn(s, host.llm, { provider: 'mock-ds', model: 'main-model', reasoningEffort: 'max' })
      const ac = new AbortController()
      const p = ctx.compaction.compactNow(makeFakeAgent(s), ac.signal)
      setTimeout(() => ac.abort(new Error('user aborted')), 20)
      await assert.rejects(p)
      assert.equal(s.eventAt(s.seq - 1).type, 'compaction/end')
    }

    await ctx.fiber.dispose()
  }
})

test('L2 host: tuned preset mounts compaction-effort cleanly and preserves existing JSONL persisted sessions', { skip: skipWithoutHost }, async () => {
  const host = await loadHostModules(HOST_DSH_BIN)
  const tempRoot = mkdtempSync(join(tmpdir(), 'dsh-compaction-preset-'))
  try {
    const patchRows = host.yaml.load(readFileSync(join(REPO_ROOT, 'cordis.patch.yml'), 'utf8'), { schema: host.entryListSchema })
    const insertRow = patchRows.find((r) => Array.isArray(r.insert))
    const tunedRow = insertRow.insert.find((r) => r.id === 'runtime-tuning-preset-tuned')
    assert.ok(tunedRow, 'cordis.patch.yml contains runtime-tuning-preset-tuned')

    // Phase 1: create an existing persisted session using legacy raw compaction config semantics
    const sessionDir = join(tempRoot, 'sessions')
    const sessionId = 'persisted-tuned-max'
    {
      const ctx1 = new host.cordis.Context()
      await ctx1.plugin(host.session.SessionStore)
      await ctx1.plugin(host.jsonl, { root: sessionDir })
      const s1 = ctx1.sessions.create(sessionId)
      s1.append('agent-preset/selected', { agentPreset: 'tuned' })
      seedConversationTurn(s1, host.llm, { provider: 'mock-ds', model: 'main-model', reasoningEffort: 'max' })
      const handle1 = await ctx1.sessionPersistence.create(s1.header, { inheritedEventCount: s1.inheritedEventCount })
      await handle1.append(s1.snapshotEvents())
      await handle1.flush()
      await handle1.close()
      await ctx1.fiber.dispose()
    }

    // Phase 2: boot with tuned preset using RuntimeTuningPreset (resolving compaction-effort.mjs) + load persisted session
    const seen = []
    writeFileSync(join(tempRoot, 'cordis.yml'), '[]\n')
    const ctx2 = new host.cordis.Context({ baseDir: tempRoot })
    await ctx2.plugin(host.cordisLoader.Loader)
    ctx2.loader.builtins.group = host.cordisLoader.Group
    await ctx2.plugin(host.llm.LlmRuntime)
    await ctx2.plugin(host.session.SessionStore)
    await ctx2.plugin(host.jsonl, { root: sessionDir })
    await ctx2.plugin(host.sessionProjection.SessionProjectionRegistry)
    await ctx2.plugin(host.tokenMeter.TokenMeter)

    ctx2.llm.registerAdapter(['mock-ds'], new class extends host.llm.LlmAdapter {
      providerInfo() { return { id: 'mock-ds', name: 'Mock DS' } }
      async listModels() {
        return [{
          provider: 'mock-ds',
          id: 'main-model',
          name: 'main-model',
          context: { contextWindow: 128000 },
          defaultMaxTokens: 4096,
          reasoning: {
            efforts: [
              { id: 'low', name: 'Low' },
              { id: 'high', name: 'High' },
              { id: 'max', name: 'Max' },
            ],
            defaultEffort: 'high',
          },
        }]
      }
      async resolveModel(_provider, modelId) {
        return (await this.listModels()).find((m) => m.id === modelId)
      }
      async prepareCall(_provider, modelId) {
        const model = await this.resolveModel('mock-ds', modelId)
        return {
          model,
          stream: async function* (options) {
            seen.push(options)
            yield { type: 'text-delta', text: '## Primary Request and Intent\n- Resumed and compacted.' }
            yield { type: 'usage', usage: { inputTokens: 60, outputTokens: 12 } }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      }
    }())

    ctx2.provide('agents', {
      turnBoundaryOf: () => ({ openTurnStartSeq: null, lastTurn: 0 }),
    })
    ctx2.provide('systemPrompt', {
      getSectionOrder: () => 50,
      section: () => () => {},
    })
    ctx2.provide('commands', {
      register: () => () => {},
    })
    await ctx2.plugin(host.presetRegistry.AgentPresetRegistry, { default: 'tuned' })

    // Register tuned preset with stripped external/unrelated UI tool plugins so test exercises real compaction group cleanly
    const compactGroup = tunedRow.config.plugins.find((p) => p.id === 'compaction')
    assert.ok(compactGroup, 'tuned preset defines compaction group')
    const prevArgv1 = process.argv[1]
    process.argv[1] = HOST_DSH_BIN
    try {
      const tunedUrl = new URL('../plugins/tuned-preset.mjs?l2=1', import.meta.url).href
      const TunedPresetClass = (await import(tunedUrl)).default
      const freshCompactionEffortUrl = `${pathToFileURL(join(REPO_ROOT, 'plugins/compaction-effort.mjs')).href}?l2=1`

      const presetConfig = {
        id: 'tuned',
        name: '调优',
        description: tunedRow.config.description ?? 'Tuned',
        order: 2,
        plugins: [
          tunedRow.config.plugins.find((p) => p.id === 'tool-use-prompt'),
          {
            ...compactGroup,
            config: [
              { id: 'compaction-basic', name: freshCompactionEffortUrl },
            ],
          },
        ],
      }

      await ctx2.plugin(TunedPresetClass, presetConfig)
      await ctx2.fiber.await()
    } finally {
      process.argv[1] = prevArgv1
    }

    const list = await ctx2.agentPresets.list()
    const tunedEntry = list.find((p) => p.id === 'tuned')
    assert.ok(tunedEntry, 'tuned preset registered')
    assert.equal(tunedEntry.broken, undefined, tunedEntry.broken)

    const handle2 = await ctx2.sessionPersistence.open(sessionId, 'write')
    const coldRead = await handle2.read(0)
    const loadedSession = ctx2.sessions.prepare(sessionId, {
      seed: coldRead.events,
      meta: structuredClone(handle2.header),
      inheritedEventCount: handle2.inheritedEventCount,
      eventState: coldRead.eventState,
    })
    const unstoredSuffix = loadedSession.snapshotEvents().slice(coldRead.events.length)
    if (unstoredSuffix.length > 0) await handle2.append(unstoredSuffix)
    ctx2.sessions.enter(loadedSession)
    ctx2.sessions.announce(loadedSession)
    assert.equal(ctx2.agentPresets.presetForSession(loadedSession), 'tuned')

    // Join tuned preset scope like a resumed session and trigger compactNow
    const lease = await ctx2.agentPresets.acquireScope('tuned')
    try {
      const inspections = ctx2.agentPresets.inspectCompositions()
      assert.deepEqual(inspections[0]?.leakedServices, [])
      // Trigger compaction through the mounted CompactionEffortEngine in the preset's fiber store
      const compactionImpl = Object.getOwnPropertySymbols(ctx2.reflect.store)
        .map((sym) => ctx2.reflect.store[sym])
        .find((entry) => entry?.name === 'compaction')?.value
      assert.ok(compactionImpl instanceof host.compactionBasic.BasicCompactionEngine)
      const res = await compactionImpl.compactNow(makeFakeAgent(loadedSession, { provider: 'mock-ds', model: 'main-model' }), new AbortController().signal)
      assert.ok(res)
      assert.equal(seen.length, 1)
      assert.equal(seen[0].reasoningEffort, 'max')
    } finally {
      await lease[Symbol.asyncDispose]()
      await handle2.close()
    }

    await ctx2.fiber.dispose()
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
})

test('L2 host: real LlmRuntime validation drops unsupported implicit & explicit efforts without UNSUPPORTED_REASONING_EFFORT', { skip: skipWithoutHost }, async () => {
  const host = await loadHostModules(HOST_DSH_BIN)

  const runCase = async ({ modelInfo, sessionEffort, engineConfig }) => {
    const logs = []
    const CapturedEngine = createCompactionEffortEngine(
      host.compactionBasic.BasicCompactionEngine,
      host.compactionLocation.z,
      { record: (entry) => logs.push(entry) },
    )
    const ctx = new host.cordis.Context()
    await ctx.plugin(host.llm.LlmRuntime)
    await ctx.plugin(host.session.SessionStore)
    await ctx.plugin(host.sessionProjection.SessionProjectionRegistry)
    await ctx.plugin(host.tokenMeter.TokenMeter)

    const seenStreamOptions = []
    const origStream = ctx.llm.stream.bind(ctx.llm)
    ctx.llm.stream = (options) => {
      seenStreamOptions.push(options)
      return origStream(options)
    }

    ctx.llm.registerAdapter(['mock-cap'], new class extends host.llm.LlmAdapter {
      providerInfo() { return { id: 'mock-cap', name: 'Mock Capability Provider' } }
      async listModels() { return [modelInfo] }
      async resolveModel(_provider, modelId) {
        return modelId === modelInfo.id ? modelInfo : undefined
      }
      async prepareCall(_provider, modelId) {
        const model = await this.resolveModel('mock-cap', modelId)
        return {
          model,
          stream: async function* () {
            yield { type: 'text-delta', text: '## Primary Request and Intent\n- Compacted cleanly.' }
            yield { type: 'usage', usage: { inputTokens: 40, outputTokens: 10 } }
            yield { type: 'finish', reason: { kind: 'stop' } }
          },
        }
      }
    }())

    await ctx.plugin(CapturedEngine, { auto: false, ...engineConfig })
    const session = ctx.sessions.create(`l2-cap-${modelInfo.id}`)
    seedConversationTurn(session, host.llm, {
      provider: 'mock-cap',
      model: modelInfo.id,
      reasoningEffort: sessionEffort,
    })

    const res = await ctx.compaction.compactNow(
      makeFakeAgent(session, { provider: 'mock-cap', model: modelInfo.id }),
      new AbortController().signal,
    )
    await ctx.fiber.await()
    await ctx.fiber.dispose()
    return { res, seenStreamOptions, logs }
  }

  // Case A: model has no reasoning metadata, while stale request/header had reasoningEffort: 'max'
  const noReasoningCase = await runCase({
    modelInfo: { provider: 'mock-cap', id: 'plain-chat', name: 'Plain Chat', context: { contextWindow: 128000 }, defaultMaxTokens: 4096 },
    sessionEffort: 'max',
    engineConfig: {},
  })
  assert.ok(noReasoningCase.res)
  assert.equal(noReasoningCase.seenStreamOptions.length, 1)
  assert.equal(noReasoningCase.seenStreamOptions[0].reasoningEffort, undefined)
  assert.equal(noReasoningCase.logs.some((e) => e.event === 'summarize-passthrough' && e.source === 'unsupported-effort' && e.requestedFrom === 'request-header' && e.reasonDetail === 'no-reasoning-metadata'), true)

  // Case B: explicit summarizationReasoningEffort: 'max' on a model supporting only 'high'
  const explicitUnsupportedCase = await runCase({
    modelInfo: {
      provider: 'mock-cap',
      id: 'high-only',
      name: 'High Only',
      context: { contextWindow: 128000 },
      defaultMaxTokens: 4096,
      reasoning: { efforts: [{ id: 'high', name: 'High' }], defaultEffort: 'high' },
    },
    sessionEffort: 'high',
    engineConfig: { summarizationReasoningEffort: 'max' },
  })
  assert.ok(explicitUnsupportedCase.res)
  assert.equal(explicitUnsupportedCase.seenStreamOptions.length, 1)
  assert.equal(explicitUnsupportedCase.seenStreamOptions[0].reasoningEffort, undefined)
  assert.equal(explicitUnsupportedCase.logs.some((e) => e.event === 'summarize-passthrough' && e.source === 'unsupported-effort' && e.requestedFrom === 'explicit' && e.reasonDetail === 'effort-not-listed'), true)
})
