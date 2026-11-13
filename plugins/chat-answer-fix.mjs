// chat-answer-fix：带着工具调用结束的一轮，最后的正文也显示成回答。
// DSH 聊天界面（dsh-client-ui-chat）的 latestAnswer 只把"不带工具调用的最后一步"当作回答。
// 工具用 concludeTurn 直接结束一轮时（wait-guard 的 task_status 就会这样），正文会被收进折叠的步骤里，要点开才看得到。
// 官方仓库不收 issue 和 PR，所以做成插件：插件包把 ui-chat 这一行换成 ../ui-chat/index.mjs。
// 它沿用官方包名（另外 8 个界面插件按这个名字依赖它），服务端那一半原样转出官方的；
// 浏览器那一半是启动时从当前版本的官方 client.js 生成的副本，改两处：已结束的一轮不再因为带工具调用而不算回答；
// 显示设置的命名空间换成我们这一行的 id（见下面 SETTINGS_ANCHOR）；
// 已结束的一轮，最后一步只是 todo_write（todo-reminder 收尾时让模型补清单）时，往前取最近一段正文当回答（CLOSING_ANCHOR）。
// 找不到要改的那一行（官方改了实现），就原样复制官方文件，效果和没装一样。
import { cpSync, rmSync, existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRecorder } from './log.mjs'
import { patchPresentation } from './chat-presentation.mjs'

const record = createRecorder('chat-answer-fix.log')
export const UI_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'ui-chat')
// 0.2.2-rc.2 起官方 client.js 换成压缩写法：字符串用反引号、箭头函数去空格、语句省分号。
// 三处都按正则找，压缩前后的写法都能改；替换时沿用原文的引号，结果仍是合法 JS。
export const ANSWER_PATTERN = /return data\.blocks\.some\(\(?block\)?\s*=>\s*block\.kind\s*===\s*(["'`])tool-call\1\s*\)\s*\?\s*null\s*:\s*data/
export const ANSWER_REPLACEMENT = 'return data.blocks.some(block => block.kind === $1tool-call$1 && turn.status !== $1closed$1) ? null : data'
// latestAnswer 只看最后一步。收尾补清单那一步只有 todo_write、没有正文，不改的话整轮没有回答，总结被收进折叠里。
export const CLOSING_PATTERN = /const data\s*=\s*turn\.steps\.at\(-1\)\?\.data\.get\((["'`])assistant-step\1\)\s*;?/
export const CLOSING_REPLACEMENT = 'const last = turn.steps.at(-1)?.data.get("assistant-step"); ' +
  'const todoOnly = turn.status === "closed" && Array.isArray(last?.blocks) && last.blocks.some((block) => block.kind === "tool-call") && ' +
  'last.blocks.every((block) => block.kind === "reasoning" || (block.kind === "tool-call" && block.name === "todo_write") || (block.kind === "text" && block.text.trim() === "")); ' +
  'const data = (todoOnly ? turn.steps.slice(0, -1).reverse().map((step) => step.data.get("assistant-step")).find((step) => isFinalAssistant(step) && hasAssistantReplyContent(step.blocks)) : void 0) ?? last;'
// 浏览器那一半按 "ui-chat" 读写显示设置（transcriptView 等），可设置表单登记在正在运行的这一行 runtime-tuning-ui-chat 名下：
// 不改的话读到的是空配置（退回默认的 detailed），在界面上改了也存不下，重启又回到详细。
export const SETTINGS_PATTERN = /const CHAT_SETTINGS_NAMESPACE\s*=\s*(["'`])ui-chat\1/
export const SETTINGS_REPLACEMENT = 'const CHAT_SETTINGS_NAMESPACE = $1runtime-tuning-ui-chat$1'

const replaceOnce = (source, pattern, replacement) => {
  const matches = source.match(new RegExp(pattern.source, 'g'))
  if (matches === null || matches.length !== 1) return { text: source, done: false }
  return { text: source.replace(pattern, replacement), done: true }
}

/** 三处各自只在要改的那一行恰好出现一次时替换；patched 指回答判定那一处，closing 指收尾补清单那一处。 */
export function patchClient(source) {
  const answer = replaceOnce(source, ANSWER_PATTERN, ANSWER_REPLACEMENT)
  const settings = replaceOnce(answer.text, SETTINGS_PATTERN, SETTINGS_REPLACEMENT)
  const closing = replaceOnce(settings.text, CLOSING_PATTERN, CLOSING_REPLACEMENT)
  return { text: closing.text, patched: answer.done, settings: settings.done, closing: closing.done }
}

const nodeResolve = (from, request) => createRequire(from).resolve(request)

/** 正在运行的 dsh 用的那一份官方包：先按 Node 的模块解析从 dsh 入口找（npm、pnpm 等安装方式都适用），
 *  再找 dsh 旁边的链接，最后在 pnpm 仓库里找（多份时取与 dsh 同版本的）。 */
export function findHostPackage(entryScript, pkg, fs = { realpathSync, readdirSync, existsSync }, resolve = nodeResolve) {
  const bin = fs.realpathSync(entryScript)
  try { return dirname(fs.realpathSync(resolve(bin, `@deepseek-ai/${pkg}/package.json`))) } catch {}
  const scope = '/node_modules/@deepseek-ai/'
  const own = bin.lastIndexOf(scope)
  if (own >= 0) {
    const sibling = bin.slice(0, own + scope.length) + pkg
    if (fs.existsSync(sibling)) return fs.realpathSync(sibling)
  }
  const at = bin.indexOf('/.pnpm/')
  if (at < 0) throw new Error(`host is not a pnpm install; cannot locate ${pkg}`)
  const store = bin.slice(0, at + '/.pnpm'.length)
  let dirs = fs.readdirSync(store).filter((n) => n.startsWith(`@deepseek-ai+${pkg}@`))
  // 升级后新旧两份都在：DSH 的包同版本发布，取和正在运行的 dsh 同版本的那一份
  const version = /\/@deepseek-ai\+dsh@([^_/]+)/.exec(bin)?.[1]
  if (dirs.length > 1 && version !== undefined) dirs = dirs.filter((n) => n.startsWith(`@deepseek-ai+${pkg}@${version}_`) || n === `@deepseek-ai+${pkg}@${version}`)
  if (dirs.length !== 1) throw new Error(`expected one ${pkg} in the host store, found ${dirs.length}`)
  return join(store, dirs[0], 'node_modules/@deepseek-ai', pkg)
}

const entryOf = (exp, fallback) => (typeof exp === 'string' ? exp : exp?.default ?? exp?.import ?? fallback)

const writeIfChanged = (file, text) => {
  try { if (readFileSync(file, 'utf8') === text) return } catch {}
  writeFileSync(file, text)
}

/** 从官方包生成 ui-chat/ 下的 package.json 和 client.js；返回官方服务端入口和是否打上了补丁。 */
export function generate(officialDir, outDir = UI_DIR) {
  const pkg = JSON.parse(readFileSync(join(officialDir, 'package.json'), 'utf8'))
  const { text, patched, settings, closing } = patchClient(readFileSync(join(officialDir, entryOf(pkg.exports?.['./client'], './lib/client.js')), 'utf8'))
  const presentation = patchPresentation(text)
  writeIfChanged(join(outDir, 'client.js'), presentation.text)
  // The copied client still refers to official assets by package URL. Serve matching
  // assets from this generated provider too (the replacement owns that package id).
  let assets = false
  const assetExport = entryOf(pkg.exports?.['./assets/*'], './lib/assets/*')
  const assetDir = join(officialDir, assetExport.replace(/\*.*$/, ''))
  if (existsSync(assetDir)) {
    try {
      rmSync(join(outDir, 'assets'), { recursive: true, force: true })
      cpSync(assetDir, join(outDir, 'assets'), { recursive: true })
      assets = true
    } catch { record({ event: 'assets-unavailable', version: pkg.version }) }
  }
  writeIfChanged(join(outDir, 'package.json'), JSON.stringify({
    name: pkg.name, version: pkg.version, private: true, type: 'module',
    description: 'Generated by dsh-runtime-tuning chat-answer-fix from the running DSH; do not edit.',
    exports: { '.': './index.mjs', './client': './client.js', ...(assets ? { './assets/*': './assets/*' } : {}) },
    dsh: pkg.dsh,
  }, null, 2) + '\n')
  return { patched, settings, closing, tables: presentation.tables, approval: presentation.approval, assets, version: pkg.version, officialIndex: join(officialDir, entryOf(pkg.exports?.['.'], pkg.main ?? './lib/index.js')) }
}

let prepared
/** 每个进程只生成一次；wait-guard 也用它判断回答会不会被折叠。 */
export function prepareChatFix(entryScript = process.argv[1]) {
  if (prepared === undefined) {
    try {
      prepared = generate(findHostPackage(entryScript, 'dsh-client-ui-chat'))
      record({ event: prepared.patched ? 'patched' : 'unpatched', settings: prepared.settings, closing: prepared.closing, tables: prepared.tables, approval: prepared.approval, assets: prepared.assets, version: prepared.version })
    } catch (error) {
      prepared = { patched: false, error: String(error).slice(0, 300) }
      record({ event: 'failed', error: prepared.error })
    }
  }
  return prepared
}

/** 替身真的在用：补丁打上了，profile 里官方 ui-chat 停用、runtime-tuning-ui-chat 启用（用户可能按文档关掉了替换）。 */
export function chatFixActive(entries, patched) {
  if (!patched) return false
  let official, ours
  for (const entry of entries ?? []) {
    if (entry.options?.id === 'ui-chat') official = entry
    if (entry.options?.id === 'runtime-tuning-ui-chat') ours = entry
  }
  const off = (entry) => entry.disabled === true || entry.options?.disabled === true
  return ours !== undefined && !off(ours) && (official === undefined || off(official))
}
