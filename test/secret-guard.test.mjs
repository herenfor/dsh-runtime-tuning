import test from 'node:test'
import assert from 'node:assert/strict'
import { check, findSecret, isCredentialRequest, redactDecision, redactText } from '../plugins/secret-guard.mjs'

// 假令牌在运行时拼出来，源码里不出现像真令牌的字符串。
const PAT = 'github_pat_' + '11AAAAAAA0'.repeat(3) + '_' + 'b'.repeat(59)
const CLASSIC = 'ghp' + '_' + 'Z9'.repeat(18)
const GH_OAUTH = 'gho' + '_' + 'x'.repeat(36)
const API_KEY = 'sk' + '-' + '0123456789abcdef'.repeat(2)
const ask = (question, options = []) => ({ name: 'ask_user_question', arguments: { questions: [{ id: 'q', question, options }] } })

test('findSecret 只认格式明确的凭据', () => {
  assert.equal(findSecret(`token=${PAT}`), 'github-token')
  assert.equal(findSecret(`Authorization: token ${CLASSIC}`), 'github-token')
  assert.equal(findSecret(`oauth_token: ${GH_OAUTH}`), 'github-token')
  assert.equal(findSecret(`DEEPSEEK_API_KEY=${API_KEY}`), 'api-key')
  assert.equal(findSecret("grep -o 'github_pat_[A-Za-z0-9_]*' ~/.secrets"), undefined)
  assert.equal(findSecret('pip install scikit-learn; risk-assessment-framework-2026-x; ghp_short'), undefined)
  assert.equal(findSecret(undefined), undefined)
})

test('redactText 替换每一个凭据并计数', () => {
  const { text, count } = redactText(`a ${PAT} b ${CLASSIC} c ${API_KEY}`)
  assert.equal(count, 3)
  assert.equal(text, 'a [REDACTED:github-token] b [REDACTED:github-token] c [REDACTED:api-key]')
  assert.deepEqual(redactText('nothing here'), { text: 'nothing here', count: 0 })
})

test('向用户索要凭据的提问被拒，普通提问放行', () => {
  // 真实会话里的原话
  assert.equal(check(ask('请把你在 GitHub 生成的 Fine-grained PAT 粘贴到这里(以 github_pat_ 开头)。')).rule, 'ask-credential')
  assert.equal(check(ask('Please paste your DeepSeek API key here.')).rule, 'ask-credential')
  assert.equal(check(ask('需要访问仓库，请提供', [{ label: '令牌' }, { label: '跳过' }])).rule, 'ask-credential')
  assert.equal(check(ask('发行用 Windows 还是安卓先编译？', [{ label: 'Windows' }, { label: '安卓' }])), undefined)
  assert.equal(check(ask('token 用量超了，要不要继续？')), undefined)
  assert.equal(check(ask('请提供版本号')), undefined)
  assert.equal(check(ask('请把你在 GitHub 生成的 PAT 粘贴到这里'), { askGuard: false }), undefined)
})

test('参数里带完整令牌的调用被拒，不管是哪个工具', () => {
  assert.equal(check({ name: 'bash', arguments: { command: `curl -H "Authorization: token ${CLASSIC}" https://api.github.com/user` } }).rule, 'secret-in-call')
  assert.equal(check({ name: 'write', arguments: { path: '.env', content: `KEY=${API_KEY}` } }).label, 'api-key')
  assert.equal(check({ name: 'bash', arguments: { command: 'gh release upload v1 app.zip' } }), undefined)
  assert.equal(check({ name: 'bash', arguments: { command: `echo ${PAT}` } }, { callGuard: false }), undefined)
})

test('gh auth token 被拒，其他 gh 命令放行', () => {
  assert.equal(check({ name: 'bash', arguments: { command: 'TOKEN=$(gh auth token); curl -H "Authorization: token $TOKEN" x' } }).rule, 'gh-auth-token')
  assert.equal(check({ name: 'pwsh', arguments: { command: 'gh auth token' } }).rule, 'gh-auth-token')
  assert.equal(check({ name: 'bash', arguments: { command: 'gh auth status' } }), undefined)
  assert.equal(check({ name: 'bash', arguments: { command: 'gh api repos/o/r/releases' } }), undefined)
})

test('redactDecision 对模型最终看到的内容打码', () => {
  const result = { content: [{ type: 'text', text: `hosts:\n  oauth_token: ${GH_OAUTH}\n` }, { type: 'image', data: 'x' }] }
  const accepted = redactDecision({ kind: 'accept' }, result)
  assert.equal(accepted.count, 1)
  assert.equal(accepted.decision.content[0].text, 'hosts:\n  oauth_token: [REDACTED:github-token]\n')
  assert.equal(accepted.decision.content[1], result.content[1])
  // 下游（比如 spill 预览）已经换过内容时，打码换过之后的那一份
  const spilled = redactDecision({ kind: 'accept', content: [{ type: 'text', text: `preview ${PAT}` }] }, result)
  assert.equal(spilled.decision.content[0].text, 'preview [REDACTED:github-token]')
  const blocked = redactDecision({ kind: 'block', feedback: [{ type: 'text', text: `failed with ${API_KEY}` }] }, result)
  assert.equal(blocked.decision.feedback[0].text, 'failed with [REDACTED:api-key]')
  assert.equal(redactDecision({ kind: 'accept' }, { content: [{ type: 'text', text: 'clean' }] }), undefined)
  assert.equal(redactDecision({ kind: 'accept', value: {} }, result), undefined)
})
