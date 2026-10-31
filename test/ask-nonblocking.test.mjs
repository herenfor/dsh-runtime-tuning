import test from 'node:test'
import assert from 'node:assert/strict'
import { findOfficialAskUser, isTopLevelAgent } from '../plugins/ask-nonblocking.mjs'

const store = '/x/node_modules/.pnpm'
const bin = `${store}/@deepseek-ai+dsh@0.2.1_abc/node_modules/@deepseek-ai/dsh/lib/bin.js`
// 没有 dsh 旁边的链接时（老的安装布局），只能扫 store
const resolve = async (p) => { if (p.endsWith('/dsh-tool-ask-user')) throw new Error('ENOENT'); return p }

test('用正在运行的 dsh 旁边链接的那一份，store 里留着旧版本也不影响', async () => {
  const linked = `${store}/@deepseek-ai+dsh-tool-ask-user@0.2.1-rc.5_new/node_modules/@deepseek-ai/dsh-tool-ask-user`
  const follow = async (p) => (p.endsWith('/dsh-tool-ask-user') ? linked : p)
  const read = async () => ['@deepseek-ai+dsh-tool-ask-user@0.2.1-rc.4_old', '@deepseek-ai+dsh-tool-ask-user@0.2.1-rc.5_new']
  assert.equal(await findOfficialAskUser(bin, read, follow), `${linked}/lib/index.js`)
})

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
