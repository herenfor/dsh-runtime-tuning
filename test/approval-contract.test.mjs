import test from 'node:test'
import assert from 'node:assert/strict'
import {
  APPROVAL_POST_REWRITE_MISMATCH_CODE,
  APPROVAL_REASON_INVALID_CODE,
  APPROVAL_VIEW_SCHEMA_VERSION,
  MAX_APPROVAL_REASON_CODEPOINTS,
  adaptCuaQuestionRecord,
  adaptPluginManagerReason,
  adaptToolApprovalRecord,
  canonicalEqual,
  countCodepoints,
  formatApprovalPermissionText,
  isWideningMode,
  recordParameterRewrite,
  getParameterRewrites,
  serializeApprovalView,
  stripSandboxPrefix,
  validateApprovalReason,
  verifyPostRewriteParameters,
} from '../plugins/approval-contract.mjs'

test('reason validation enforces Unicode codepoint limits without modifying input', () => {
  const ascii160 = 'a'.repeat(160)
  const cjk160 = '测'.repeat(160)
  const astral160 = '测🚀'.repeat(80) // UTF-16 code units: 240, Unicode codepoint count: 160

  assert.equal(countCodepoints(astral160), 160)
  assert.deepEqual(validateApprovalReason(ascii160), { ok: true, reason: ascii160 })
  assert.deepEqual(validateApprovalReason(cjk160), { ok: true, reason: cjk160 })
  assert.deepEqual(validateApprovalReason(astral160), { ok: true, reason: astral160 })

  for (const tooLong of ['a'.repeat(161), '测'.repeat(161), astral160 + 'x', '测'.repeat(80) + '🚀'.repeat(81)]) {
    const res = validateApprovalReason(tooLong)
    assert.equal(res.ok, false)
    assert.equal(res.code, APPROVAL_REASON_INVALID_CODE)
    assert.equal(res.category, 'too_long')
    assert.equal(countCodepoints(tooLong), MAX_APPROVAL_REASON_CODEPOINTS + 1)
  }
})

test('reason validation rejects empty, multiline, markdown, placeholders, JSON args, and secrets', () => {
  const cases = [
    [undefined, 'empty'],
    ['', 'empty'],
    ['   \t ', 'empty'],
    ['First line\nSecond line', 'multiline'],
    ['Single sentence `npm test` needed', 'markdown'],
    ['```bash echo hi```', 'markdown'],
    ['~~~bash ls~~~', 'markdown'],
    ['TODO', 'placeholder'],
    ['🚀'.repeat(20), 'placeholder'],
    ['需要更高权限！', 'placeholder'],
    ['need higher permissions.', 'placeholder'],
    ['---', 'placeholder'],
    ['{"command":"npm publish","sandbox_permissions":"danger-full-access"}', 'serialized_args'],
    ['command: "curl https://x", sandbox_permissions: danger-full-access', 'serialized_args'],
    ['Use api key sk-' + 'x'.repeat(28) + ' to check account', 'credential'],
    ['Push with ghp_' + 'A'.repeat(30), 'credential'],
    ['-----BEGIN RSA PRIVATE KEY-----', 'credential'],
    ['Read diagnostics\nBearer ' + 'X'.repeat(40), 'credential'],
    ['Use `sk-' + 'x'.repeat(28) + '` to check', 'credential'],
    ['x'.repeat(180) + ' sk-' + 'x'.repeat(28), 'credential'],
  ]
  for (const [input, expectedCategory] of cases) {
    const res = validateApprovalReason(input)
    assert.equal(res.ok, false, `Expected invalid for ${JSON.stringify(input)}`)
    assert.equal(res.code, APPROVAL_REASON_INVALID_CODE)
    assert.equal(res.category, expectedCategory)
    assert.ok(!res.message.includes('ghp_'), 'must not echo credential token')
  }
})

test('plugin_manager deterministic adapter handles all 8 known actions with R5 safety disclosures and leaves unknown actions on native fallback', () => {
  const actions = [
    [{ action: 'list_plugins' }, /plugins|插件/],
    [{ action: 'list_bundles' }, /bundles|插件包/],
    [{ action: 'set_plugin', target: 'foo', enabled: true }, /(Enable plugin foo|启用插件 foo).*(persist across sessions|跨会话持久).*(outside the workspace sandbox|沙箱之外)/],
    [{ action: 'set_plugin', target: 'foo', enabled: false }, /(Disable plugin foo|停用插件 foo).*(persist across sessions|跨会话持久)/],
    [{ action: 'set_bundle', target: 'bar', enabled: true }, /(Enable bundle bar|启用插件包 bar).*(persist across sessions|跨会话持久)/],
    [{ action: 'set_bundle', target: 'bar', enabled: false }, /(Disable bundle bar|停用插件包 bar).*(persist across sessions|跨会话持久)/],
    [{ action: 'install_bundle', target: '@acme/tool', registry: 'https://reg.example' }, /@acme\/tool.*reg\.example.*(persist across sessions|跨会话持久).*(outside the workspace sandbox|沙箱之外)/],
    [{ action: 'install_bundle', target: '@acme/tool', approvedBuilds: ['sqlite', 'esbuild'] }, /(build scripts|构建脚本).*(sqlite, esbuild)/],
    [{ action: 'remove_bundle', target: '@acme/tool' }, /@acme\/tool.*(persist across sessions|跨会话持久)/],
    [{ action: 'list_version_exemptions' }, /exemptions|豁免/],
    [{ action: 'set_version_exemption', target: 'baz', runtimeVersion: '0.2.2-rc.3', enabled: true }, /(Grant|授予).*baz.*0\.2\.2-rc\.3.*(persist across sessions|跨会话持久).*(crashes and data loss|崩溃与数据丢失)/],
    [{ action: 'set_version_exemption', target: 'baz', runtimeVersion: '0.2.2-rc.3', enabled: false }, /(Revoke|撤销).*baz.*0\.2\.2-rc\.3.*(crashes and data loss|崩溃与数据丢失)/],
  ]
  for (const [args, pattern] of actions) {
    for (const locale of ['en-US', 'zh-CN']) {
      const res = adaptPluginManagerReason(args, locale)
      assert.equal(res.known, true)
      assert.match(res.reason, pattern)
      assert.ok(!res.reason.includes('{'), `must not dump JSON: ${res.reason}`)
    }
  }
  // Ensure serializeApprovalView retains registry, approvedBuilds, and runtimeVersion across locale projection
  const pmViewEn = serializeApprovalView(adaptToolApprovalRecord({
    snapshotId: 's-pm-1',
    generation: 1,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:pm:1',
    callId: 'pm',
    toolName: 'plugin_manager',
    phase: 'dispatched',
    reqReason: 'escalate sandbox to danger-full-access: plugin_manager {"action":"install_bundle","target":"@acme/tool","registry":"https://reg.example","approvedBuilds":["sqlite"]}. Profile changes persist across sessions; installed Host code runs outside the workspace sandbox.',
    args: { action: 'install_bundle', target: '@acme/tool', registry: 'https://reg.example', approvedBuilds: ['sqlite'] },
    requestedMode: 'danger-full-access',
    standingMode: 'workspace-write',
    locale: 'zh-CN',
  }), 'en-US')
  assert.match(pmViewEn.reason, /reg\.example/)
  assert.match(pmViewEn.reason, /persistently authorizes build scripts for packages: sqlite/)

  const unknown = adaptPluginManagerReason({ action: 'future_op', target: 'x' }, 'en')
  assert.equal(unknown.known, false)
  assert.equal(adaptToolApprovalRecord({
    snapshotId: 's-unk',
    generation: 99,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:pm:99',
    callId: 'pm',
    toolName: 'plugin_manager',
    phase: 'dispatched',
    reqReason: 'escalate sandbox to danger-full-access: plugin_manager {"action":"future_op"}',
    args: { action: 'future_op', target: 'x' },
    locale: 'en-US',
  }), null)
})

test('ApprovalView v2 serializer covers all categories, preserves CUA boundaries, and omits raw payloads', () => {
  // 1. Model escalation (bash/pwsh/write/edit/apply_patch)
  const bashView = serializeApprovalView(adaptToolApprovalRecord({
    snapshotId: 'snap-1',
    generation: 1,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:c1:1',
    callId: 'c1',
    toolName: 'bash',
    phase: 'dispatched',
    reqReason: 'escalate sandbox to danger-full-access: Run production migration outside sandbox',
    args: {
      command: 'psql "$DATABASE_URL" -f migrate.sql',
      sandbox_permissions: 'danger-full-access',
      justification: 'Run production migration outside sandbox',
    },
    requestedMode: 'danger-full-access',
    locale: 'en-US',
  }), 'en-US')

  assert.equal(bashView.schemaVersion, APPROVAL_VIEW_SCHEMA_VERSION)
  assert.equal(bashView.channel, 'tool-approval')
  assert.equal(bashView.reason, 'Run production migration outside sandbox')
  assert.equal(bashView.reasonSource, 'model')
  assert.deepEqual(bashView.permission, { kind: 'sandbox-escalation', requestedMode: 'danger-full-access', subjectName: 'bash', lifetime: 'call' })
  assert.equal('command' in bashView, false)
  assert.equal('raw' in bashView, false)
  assert.equal(stripSandboxPrefix('escalate sandbox to workspace-write: Update host config'), 'Update host config')

  // 2. Policy ask in prepare() keeps full localized risk notice without truncation
  const longRisk = 'Auto review flagged irreversible file overwrite across workspace dependencies and external state; verify target files before approving execution.'
  const policyView = serializeApprovalView(adaptToolApprovalRecord({
    snapshotId: 'snap-2',
    generation: 2,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:c1:2',
    callId: 'c1',
    toolName: 'run_code',
    phase: 'prepared',
    reqReason: longRisk,
    displayReason: { en: longRisk, zh: '自动审查提醒：该操作会跨工作区改动持久化文件，请确认后再放行。' },
    args: { code: 'secret_script()' },
    locale: 'zh-CN',
  }), 'zh-CN')
  assert.equal(policyView.reasonSource, 'policy')
  assert.equal(policyView.reason, '自动审查提醒：该操作会跨工作区改动持久化文件，请确认后再放行。')
  assert.equal(policyView.permission.kind, 'tool-confirmation')
  assert.equal('code' in policyView, false)
  assert.equal(formatApprovalPermissionText(policyView, 'zh-CN'), '需要确认执行（仅本次调用 · run_code）')

  // 3. CUA app-access with always vs without always & mouse-control: NO callId, NO allowed-once
  const cuaApp = serializeApprovalView(adaptCuaQuestionRecord({
    snapshotId: 'snap-3',
    generation: 3,
    sessionId: 'sess-1',
    requestKey: 'cua:sess-1:cua-app-access:3',
    question: {
      id: 'cua-app-access',
      question: 'Allow computer use to control Safari?',
      detail: 'Allows clicking inside Safari.',
      intent: {
        kind: 'approval',
        subject: { name: 'Safari', icon: 'data:image/png;base64,xxx' },
        approve: 'Allow for this session',
        reject: 'Deny',
        always: 'Always allow',
        display: {
          question: { en: 'Allow computer use to control Safari?', zh: '允许 Computer Use 控制应用 Safari？' },
          approve: { en: 'Allow for this session', zh: '本会话允许' },
        },
      },
    },
    locale: 'zh-CN',
  }), 'zh-CN')
  assert.equal(cuaApp.channel, 'cua-question')
  assert.equal('callId' in cuaApp, false)
  assert.equal(cuaApp.permission.kind, 'application-access')
  assert.equal(cuaApp.permission.lifetime, 'session')
  assert.deepEqual(cuaApp.choices.map((c) => c.lifetime), ['none', 'session', 'persistent'])
  assert.equal(formatApprovalPermissionText(cuaApp, 'zh-CN'), '申请在本会话控制应用「Safari」（可选择始终允许）')

  const cuaMouse = serializeApprovalView(adaptCuaQuestionRecord({
    snapshotId: 'snap-4',
    generation: 4,
    sessionId: 'sess-1',
    requestKey: 'cua:sess-1:cua-mouse-control:4',
    question: {
      id: 'cua-mouse-control',
      question: 'Allow agent to move your mouse pointer?',
      detail: 'Allowing moves your pointer to this target now. Later hovers move it only when the agent explicitly requests pointer movement. Your choice is remembered until you close the session or restart DSH.',
      intent: {
        kind: 'approval',
        approve: 'Allow for this session',
        reject: 'Deny',
      },
    },
    locale: 'en-US',
  }), 'en-US')
  assert.equal('callId' in cuaMouse, false)
  assert.equal(cuaMouse.choices.some((c) => c.lifetime === 'persistent'), false)
  assert.match(cuaMouse.reason, /moves your pointer to this target now/)
  assert.match(cuaMouse.reason, /until you close the session or restart DSH/)
  assert.equal(formatApprovalPermissionText(cuaMouse, 'en-US'), 'Control mouse pointer: moves immediately on allow · until closing session or restarting DSH')
})

test('R3: adaptToolApprovalRecord rejects third-party tools, mismatched reqReason, non-widening modes, and forces tool-confirmation on prepared policy asks', () => {
  // 1. Third-party tool claiming sandbox_permissions without official escalation contract -> null (native fallback)
  assert.equal(adaptToolApprovalRecord({
    snapshotId: 's-tp-1',
    generation: 1,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:tp1:1',
    callId: 'tp1',
    toolName: 'third_party_tool',
    phase: 'dispatched',
    reqReason: 'Third-party plugin asks custom confirmation',
    args: { sandbox_permissions: 'workspace-write', justification: 'spoofed escalation' },
    locale: 'en-US',
  }), null)

  // 2. Third-party tool in prepared phase -> null (native fallback)
  assert.equal(adaptToolApprovalRecord({
    snapshotId: 's-tp-2',
    generation: 2,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:tp2:2',
    callId: 'tp2',
    toolName: 'third_party_tool',
    phase: 'prepared',
    reqReason: 'Custom policy ask',
    args: {},
    locale: 'en-US',
  }), null)

  // 3. Official tool with mismatched reqReason (did not come from approveEscalation) -> null
  assert.equal(adaptToolApprovalRecord({
    snapshotId: 's-mm-1',
    generation: 3,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:m1:3',
    callId: 'm1',
    toolName: 'bash',
    phase: 'dispatched',
    reqReason: 'Allow custom non-escalation confirmation',
    args: { command: 'ls', sandbox_permissions: 'workspace-write', justification: 'List directory' },
    locale: 'en-US',
  }), null)

  // 4. Official tool when standingMode is already danger-full-access (not widening) -> null
  assert.equal(adaptToolApprovalRecord({
    snapshotId: 's-nw-1',
    generation: 4,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:nw1:4',
    callId: 'nw1',
    toolName: 'bash',
    phase: 'dispatched',
    reqReason: 'escalate sandbox to danger-full-access: Run command',
    args: { command: 'ls', sandbox_permissions: 'danger-full-access', justification: 'Run command' },
    standingMode: 'danger-full-access',
    locale: 'en-US',
  }), null)

  // 5. plugin_manager with unrelated reqReason -> null
  assert.equal(adaptToolApprovalRecord({
    snapshotId: 's-pm-mm',
    generation: 5,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:pmm:5',
    callId: 'pmm',
    toolName: 'plugin_manager',
    phase: 'dispatched',
    reqReason: 'Unrelated confirmation text',
    args: { action: 'list_plugins' },
    locale: 'en-US',
  }), null)

  // 6. Prepared policy ask on official tool ALWAYS forces tool-confirmation (never sandbox-escalation)
  const preparedOfficial = adaptToolApprovalRecord({
    snapshotId: 's-prep-off',
    generation: 6,
    sessionId: 'sess-1',
    requestKey: 'tool:sess-1:po:6',
    callId: 'po',
    toolName: 'bash',
    phase: 'prepared',
    reqReason: 'Policy confirmation before running command',
    args: { command: 'ls', sandbox_permissions: 'workspace-write', justification: 'Run check' },
    verifiedOfficial: true,
    locale: 'en-US',
  })
  assert.equal(preparedOfficial.permission.kind, 'tool-confirmation')
  assert.equal(preparedOfficial.reasonSource, 'policy')
})

test('post-rewrite verification allows legal wait-guard/session-tmp/fs-view rewrites and fails closed on tampering', () => {
  const exec = { token: Symbol('exec') }
  const approvedArgs = {
    command: 'curl -o /tmp/out.png https://example.com && ls',
    timeoutMs: 90000,
    file_path: '/tmp/out.png',
  }

  recordParameterRewrite(exec, {
    source: 'wait-guard',
    fields: ['timeoutMs'],
    before: { timeoutMs: 90000 },
    after: { timeoutMs: 30000 },
  })
  recordParameterRewrite(exec, {
    source: 'session-tmp',
    fields: ['file_path'],
    before: { file_path: '/tmp/out.png' },
    after: { file_path: '/tmp/dsh-session-tmp/s1/out.png' },
  })
  recordParameterRewrite(exec, {
    source: 'fs-view',
    fields: ['read-image-copy'],
    before: { file_path: '/tmp/dsh-session-tmp/s1/out.png' },
    after: { file_path: '/tmp/dsh-fs-view/123/out.jpg' },
  })

  const currentValidArgs = {
    command: 'curl -o /tmp/out.png https://example.com && ls',
    timeoutMs: 30000,
    file_path: '/tmp/dsh-fs-view/123/out.jpg',
  }
  assert.deepEqual(
    verifyPostRewriteParameters({
      approvedArgs,
      currentArgs: currentValidArgs,
      rewrites: getParameterRewrites(exec),
      approvedMode: 'workspace-write',
      currentMode: 'workspace-write',
      approvedSessionId: 's1',
      currentSessionId: 's1',
      aborted: false,
    }),
    { ok: true },
  )

  // Unrecorded command change fails closed
  const cmdTamper = verifyPostRewriteParameters({
    approvedArgs,
    currentArgs: { ...currentValidArgs, command: 'curl https://evil.example' },
    rewrites: getParameterRewrites(exec),
  })
  assert.equal(cmdTamper.ok, false)
  assert.equal(cmdTamper.code, APPROVAL_POST_REWRITE_MISMATCH_CODE)

  // Escalation mode drift fails closed
  const modeTamper = verifyPostRewriteParameters({
    approvedArgs,
    currentArgs: currentValidArgs,
    rewrites: getParameterRewrites(exec),
    approvedMode: 'workspace-write',
    currentMode: 'danger-full-access',
  })
  assert.equal(modeTamper.ok, false)
  assert.equal(modeTamper.code, APPROVAL_POST_REWRITE_MISMATCH_CODE)

  // Session binding drift fails closed
  const sessTamper = verifyPostRewriteParameters({
    approvedArgs,
    currentArgs: currentValidArgs,
    rewrites: getParameterRewrites(exec),
    approvedSessionId: 's1',
    currentSessionId: 's2',
  })
  assert.equal(sessTamper.ok, false)
  assert.equal(sessTamper.code, APPROVAL_POST_REWRITE_MISMATCH_CODE)

  // Aborted signal fails closed
  const abortTamper = verifyPostRewriteParameters({
    approvedArgs,
    currentArgs: currentValidArgs,
    rewrites: getParameterRewrites(exec),
    aborted: true,
  })
  assert.equal(abortTamper.ok, false)
  assert.equal(abortTamper.code, APPROVAL_POST_REWRITE_MISMATCH_CODE)

  assert.equal(isWideningMode('danger-full-access', 'workspace-write'), true)
  assert.equal(isWideningMode('workspace-write', 'workspace-write'), false)
  assert.equal(canonicalEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true)
})
