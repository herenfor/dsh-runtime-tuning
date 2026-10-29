import test from 'node:test'
import assert from 'node:assert/strict'
import { findOfficialAskUser, isTopLevelAgent } from '../plugins/ask-nonblocking.mjs'

const store = '/x/node_modules/.pnpm'
const bin = `${store}/@deepseek-ai+dsh@0.2.1_abc/node_modules/@deepseek-ai/dsh/lib/bin.js`
const resolve = async (p) => p

test('在宿主 pnpm 仓库里找到唯一的官方 dsh-tool-ask-user', async () => {
  const read = async () => ['@deepseek-ai+dsh@0.2.1_abc', '@deepseek-ai+dsh-tool-ask-user@0.2.1_def', 'zod@3']
  assert.equal(await findOfficialAskUser(bin, read, resolve),
    `${store}/@deepseek-ai+dsh-tool-ask-user@0.2.1_def/node_modules/@deepseek-ai/dsh-tool-ask-user/lib/index.js`)
})

test('找不到或不止一份时报错，交给调用方保持阻塞版', async () => {
  await assert.rejects(findOfficialAskUser(bin, async () => [], resolve), /found 0/)
  await assert.rejects(findOfficialAskUser(bin, async () => ['@deepseek-ai+dsh-tool-ask-user@1', '@deepseek-ai+dsh-tool-ask-user@2'], resolve), /found 2/)
  await assert.rejects(findOfficialAskUser('/usr/lib/dsh/bin.js', async () => [], resolve), /not a pnpm install/)
})

test('只处理有 ctx 的顶层 agent', () => {
  assert.equal(isTopLevelAgent({ ctx: {}, session: { header: { delegationDepth: 0 } } }), true)
  assert.equal(isTopLevelAgent({ ctx: {}, session: { header: {} } }), true)
  assert.equal(isTopLevelAgent({ ctx: {}, session: { header: { delegationDepth: 1 } } }), false)
  assert.equal(isTopLevelAgent({ session: { header: {} } }), false)
})
