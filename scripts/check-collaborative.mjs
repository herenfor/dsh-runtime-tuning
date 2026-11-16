// Real Host + deterministic offline adapter. Never touches the user's DSH profile or model account.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { findHostPackage } from '../plugins/chat-answer-fix.mjs'
const entry = process.argv[2] ?? join(homedir(), '.local/bin/dsh')
const output = process.argv[3]
const root = await mkdtemp(join(tmpdir(), 'dsh-collaborative-check-'))
const home = join(root, 'home'), profile = join(home, '.dsh/profiles/web'), cwd = join(root, 'workspace')
const repo = fileURLToPath(new URL('..', import.meta.url)), fixture = join(root, 'fixture.mjs'), capture = join(root, 'calls.jsonl')
const delay = ms => new Promise(r => setTimeout(r, ms))
let child, log = '', api, loginUrl
await mkdir(join(profile, 'node_modules'), { recursive: true }); await mkdir(cwd, { recursive: true })
if (output) await mkdir(output, { recursive: true })
await symlink(repo, join(profile, 'node_modules/dsh-runtime-tuning'), 'dir')
await writeFile(join(profile, 'package.json'), JSON.stringify({ private: true, dependencies: { 'dsh-runtime-tuning': 'link:' + repo }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-runtime-tuning'] } } }))
await writeFile(join(profile, 'cordis.yml'), '[]\n')
await writeFile(join(profile, 'cordis.patch.yml'), `- id: runtime-tuning-preset-collaborative\n  config:\n    id: collaborative\n    name: 协作\n    toolDiscovery: on\n- insert:\n    - id: collaborative-test-fixture\n      name: ${fixture}\n`)
await writeFile(join(cwd, 'long.txt'), 'before\n' + '中'.repeat(3000) + 'needle' + '😀'.repeat(500) + '\nafter\n')
await writeFile(join(cwd, 'a:b\n c.txt'), 'needle needle\nnext\n')
await writeFile(fixture, `import assert from 'node:assert/strict';
import {appendFileSync} from 'node:fs';
import {LlmAdapter} from ${JSON.stringify(pathToFileURL(join(findHostPackage(entry, 'dsh-llm'), 'lib/index.js')).href)};
export const inject=['llm'];
const workspace=${JSON.stringify(cwd)};
class Adapter extends LlmAdapter {
 phase=0;
 listModels(){return Promise.resolve([{provider:'collaborative-test',id:'offline',name:'Offline integration'}])}
 resolveModel(provider,id){return Promise.resolve({provider,id,name:id,toolUpdate:'addition-only',systemPromptUpdate:'in-history',context:{contextWindow:1000000}})}
 async *stream(options){
  const body=JSON.stringify(options.messages), names=(options.tools??[]).map(t=>t.name);
  const main=options.messages.some(m=>m.role==='system'&&JSON.stringify(m.content).includes('You are an AI agent powered by DeepSeek Harness.'));
  if(main&&body.includes('CHILD_PROBE')&&!body.includes('Work with the user toward their intended outcome')){
   assert.ok(names.includes('schedule_create'),'child retains complete native tools');
   assert.ok(!names.includes('tool_search'),'child does not inherit parent discovery closure');
   appendFileSync(${JSON.stringify(capture)},JSON.stringify({child:true,names})+'\\n');
   const block={type:'text',text:'Child native execution verified.'};yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text:block.text};yield{type:'block-end',index:0,block};yield{type:'finish',reason:{kind:'stop'}};return;
  }
  let calls=[];
  if(main){
   appendFileSync(${JSON.stringify(capture)},JSON.stringify({phase:this.phase,names,messages:options.messages})+'\\n');
   assert.ok(body.includes('Work with the user toward their intended outcome'));
   assert.ok(body.includes('dsh-doc'),'official skill catalog retained');
   for(const name of ['create_goal','update_goal','subagent_fork','grep','skill'])assert.ok(names.includes(name),name);
   if(body.includes('RESUME_PROBE')){assert.ok(names.includes('schedule_list'),'discovery survives restart')}
   else if(body.includes('FRESH_PROBE')){assert.ok(!names.includes('schedule_list'),'new session isolated')}
   else if(this.phase===0){
    assert.ok(names.includes('tool_search')); assert.ok(!names.includes('schedule_list'));
    calls=[['tool_search',{query:'select:schedule_list'}],['schedule_list',{}]];
   }else if(this.phase===1){
    assert.ok(names.includes('schedule_list')); assert.ok(options.messages.some(m=>m.role==='tool'&&m.isError&&JSON.stringify(m.content).includes('unknown tool')),'same-step unoffered tool rejected');
    calls=[['schedule_list',{}],['bash',{command:'pwd',description:'Exercise workspace sandbox before absolute file searches'}],['subagent',{name:'compatibility-child',description:'Verify child native tools',prompt:'CHILD_PROBE: Reply only OK.'}]];
   }else if(this.phase===2){
    calls=[['grep',{pattern:'needle',path:workspace+'/long.txt',context:1}],['grep',{pattern:'needle',path:workspace,output_mode:'files_with_matches'}],['grep',{pattern:'needle',path:workspace,output_mode:'count'}],['grep',{pattern:'needle\\\\nnext',path:workspace,multiline:true,only_matching:true}],['grep',{pattern:'needle',path:workspace+'/long.txt',output_mode:'count'}],['read',{file_path:workspace+'/long.txt'}]];
   }else{
    assert.ok(options.messages.filter(m=>m.role==='tool').slice(-6).every(m=>!m.isError),'all actual grep calls and absolute workspace read succeed');
    assert.ok(body.includes('needle'),'actual grep content');assert.ok(body.includes('preview truncated'),'long line truthfully truncated');
    assert.ok(body.includes('non-overlapping regex matches'),'count mode');
   }
   this.phase++;
  }
  if(calls.length){
   for(const [i,[name,args]] of calls.entries()){
    const block={type:'tool-call',id:'offline-'+this.phase+'-'+i,name,arguments:JSON.stringify(args)};
    yield{type:'block-start',index:i,blockType:'tool-call'};
    yield{type:'tool-call-delta',index:i,id:block.id,name,argumentsDelta:block.arguments};
    yield{type:'block-end',index:i,block};
   }
   yield{type:'finish',reason:{kind:'tool-calls'}};
  }else{
   const block={type:'text',text:main?'Collaborative integration verified.':'Offline integration'};
   yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text:block.text};yield{type:'block-end',index:0,block};yield{type:'finish',reason:{kind:'stop'}};
  }
 }
}
export function apply(ctx){ctx.llm.registerAdapter(['collaborative-test'],new Adapter());
 ${output ? `ctx.on('session/event',(session,event)=>{if(event.type==='turn/end')appendFileSync(${JSON.stringify(join(output, 'sessions.jsonl'))},JSON.stringify({sessionId:session.id,header:session.header,events:session.snapshotEvents()})+'\\n')})` : ''}
}
`)

async function stop() {
 if (child?.exitCode === null) {
  child.kill(); await Promise.race([new Promise(r => child.once('exit', r)), delay(3000)])
  if (child.exitCode === null) { child.kill('SIGKILL'); await new Promise(r => child.once('exit', r)) }
 }
}
async function start() {
 log = ''; child = spawn(entry, ['web', '--no-open', '--port', '0'], { env: { ...process.env, HOME: home, DSH_HOME: join(home, '.dsh') }, stdio: ['ignore', 'pipe', 'pipe'] })
 child.stdout.on('data', b => { log += b }); child.stderr.on('data', b => { log += b })
 loginUrl = undefined
 for (let i = 0; i < 150; i++) {
  loginUrl = /dsh web: (http:\/\/[^\s]+)/.exec(log)?.[1]
  if (loginUrl) break
  if (child.exitCode !== null) throw Error(log.replace(/token=[^\s]+/g, 'token=[redacted]'))
  await delay(100)
 }
 assert.ok(loginUrl, 'Host failed to start')
 const origin = new URL(loginUrl).origin, response = await fetch(loginUrl, { redirect: 'manual' })
 const cookie = response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
 api = async (method, args = {}) => {
  const j = await fetch(origin + '/api/' + method, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'client-request', rpcId: 'collaborative-check', method, payload: { args } }) }).then(r => r.json())
  assert.ok(j.result?.ok, JSON.stringify(j)); return j.result.value
 }
}
async function create() {
 const { sessionId } = await api('session/create', { request: { cwd, agentPreset: 'collaborative' } })
 await api('session/selectModel', { request: { sessionId, provider: 'collaborative-test', model: 'offline' } })
 return sessionId
}
async function prompt(sessionId, text) {
 await api('session/prompt', { request: { sessionId, requestId: 'test-' + Date.now(), mode: 'queue', content: [{ type: 'text', text }] } })
 let done = false
 for (let i = 0; i < 200; i++) { if (!(await api('session/state', { request: { sessionId } })).running) { done = true; break }; await delay(100) }
 assert.ok(done, 'Offline turn timed out')
 const page = await api('session/page', { request: { address: { kind: 'session', sessionId }, maxMessages: 30 } })
 assert.ok(JSON.stringify(page).includes('Collaborative integration verified.'), JSON.stringify(page).slice(-5000))
}
try {
 await start()
 const roster = await api('agentPresets/list')
 const preset = roster.presets.find(p => p.id === 'collaborative'); assert.ok(preset && !preset.broken, JSON.stringify(roster))
 assert.equal(roster.presets.find(p=>p.isDefault)?.id,'standard','installing the new preset keeps the official default')
 const manifest = await readFile(join(profile, 'package.json'), 'utf8')
 const sessionId = await create()
 await prompt(sessionId, 'Run the offline integration checks.')
 // Selecting a model intentionally writes the official agent-default-model setting.
 const settings = await readFile(join(profile, 'cordis.patch.yml'), 'utf8')
 await stop(); await start()
 await prompt(sessionId, 'RESUME_PROBE: continue the existing session.')
 const fresh = await create(); await prompt(fresh, 'FRESH_PROBE: verify a new session.')
 assert.equal(await readFile(join(profile, 'package.json'), 'utf8'), manifest)
 assert.equal(await readFile(join(profile, 'cordis.patch.yml'), 'utf8'), settings)
 if (process.env.DSH_COLLABORATIVE_BROWSER_HOOK) {
  const { capture: browserCapture } = await import(pathToFileURL(process.env.DSH_COLLABORATIVE_BROWSER_HOOK).href)
  await browserCapture({ loginUrl, out: output, sessionId })
 }
 const calls = (await readFile(capture, 'utf8')).trim().split('\n').map(JSON.parse)
 assert.ok(calls.some(call=>call.child),'actual child completed its native tool checks')
 const result = { preset: 'collaborative', plugin: JSON.parse(await readFile(join(repo, 'package.json'))).version, dsh: JSON.parse(await readFile(join(findHostPackage(entry, 'dsh'), 'package.json'))).version, paidApiCalls: 0,
  checks: { officialDefaultPreserved: true, fullOfficialCapabilities: true, officialSkillCatalog: true, discoveryAndNextStepCall: true, sameStepUnloadedCallRejected: true, actualGrepModes: true, absoluteWorkspacePathsAfterBash: true, childNativeTools: true, sessionRestart: true, freshSessionIsolation: true, userSettingsUnchanged: true }, mainRequests: calls.filter(c=>!c.child).length }
 if (output) { await mkdir(output, { recursive: true }); await writeFile(join(output, 'integration.json'), JSON.stringify(result, null, 2) + '\n'); await writeFile(join(output, 'requests.jsonl'), calls.map(c => JSON.stringify(c)).join('\n') + '\n') }
 console.log(JSON.stringify(result, null, 2))
} catch (error) {
 if (output) { await mkdir(output, { recursive: true }); await writeFile(join(output, 'failure.log'), log.replace(/token=[^\s]+/g, 'token=[redacted]')); try { await writeFile(join(output, 'failure-requests.jsonl'), await readFile(capture)) } catch {} }
 throw error
} finally { await stop(); await rm(root, { recursive: true, force: true }) }
