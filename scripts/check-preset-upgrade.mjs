import assert from 'node:assert/strict'
import {execFileSync,spawn} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync,rmSync,existsSync,symlinkSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {mkdtempSync} from 'node:fs'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {findHostPackage} from '../plugins/chat-answer-fix.mjs'
const hosts=process.argv.slice(2)
if(!hosts.length) throw new Error('Usage: npm run check:preset-upgrade -- /path/to/dsh [another/dsh]; requires full git history and a Linux/WSL DSH installation')
const repo=fileURLToPath(new URL('..',import.meta.url)),root=mkdtempSync(join(tmpdir(),'dsh-preset-upgrade-'))
const [packed]=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',root],{cwd:repo,encoding:'utf8'}))
const tarball=join(root,packed.filename)
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const results=[]
async function run(entry,label){
 const dir=join(root,label);if(existsSync(dir))rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});const plugin=join(dir,'plugin'),home=join(dir,'home'),profile=join(home,'.dsh/profiles/web'),cwd=join(dir,'workspace')
 mkdirSync(plugin,{recursive:true});mkdirSync(join(profile,'node_modules'),{recursive:true});mkdirSync(cwd,{recursive:true})
 const legacy=execFileSync('git',['archive','a907d95'],{cwd:repo});writeFileSync(join(dir,'baseline.tar'),legacy);execFileSync('tar',['-xf',join(dir,'baseline.tar'),'-C',plugin])
 const manifest={name:'upgrade-probe',private:true,dependencies:{'dsh-runtime-tuning':'link:'+plugin},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','dsh-runtime-tuning']}}}
 writeFileSync(join(profile,'package.json'),JSON.stringify(manifest));writeFileSync(join(profile,'cordis.yml'),'[]\n');symlinkSync(plugin,join(profile,'node_modules/dsh-runtime-tuning'),'dir')
 const llm=pathToFileURL(join(findHostPackage(entry,'dsh-llm'),'lib/index.js')).href
 const fixture=join(dir,'fixture.mjs');writeFileSync(fixture,`import {LlmAdapter} from '${llm}';export const inject=['llm'];class A extends LlmAdapter{listModels(){return Promise.resolve([{provider:'preset-probe',id:'fixed',name:'Preset probe'}])}async *stream(){const block={type:'text',text:'Preset upgrade verified.'};yield{type:'block-start',index:0,blockType:'text'};yield{type:'text-delta',index:0,text:block.text};yield{type:'block-end',index:0,block};yield{type:'finish',reason:{kind:'stop'}}}}export function apply(ctx){ctx.llm.registerAdapter(['preset-probe'],new A())}`)
 const overlay=`- id: runtime-tuning-preset-tuned\n  disabled: false\n- insert:\n    - id: preset-probe-fixture\n      name: ${fixture}\n`;writeFileSync(join(profile,'cordis.patch.yml'),overlay)
 const beforeManifest=readFileSync(join(profile,'package.json'),'utf8');let beforeOverlay
 let child,log='',api,url
 async function stop(){if(child?.exitCode===null){child.kill();await Promise.race([new Promise(r=>child.once('exit',r)),wait(3000)]);if(child.exitCode===null)child.kill('SIGKILL')}}
 async function start(stage){log='';child=spawn(entry,['web','--no-open','--port','0'],{env:{...process.env,HOME:home,DSH_HOME:join(home,'.dsh')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b)
  for(let i=0;i<150;i++){url=/dsh web: (http:\/\/[^\s]+)/.exec(log)?.[1];if(url)break;if(child.exitCode!==null)throw Error(log);await wait(100)}assert.ok(url,log)
  const origin=new URL(url).origin,login=await fetch(url,{redirect:'manual'}),cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')
  api=async(method,args={})=>{const j=await fetch(origin+'/api/'+method,{method:'POST',headers:{origin,cookie,'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'upgrade',method,payload:{args}})}).then(r=>r.json());assert.ok(j.result?.ok,JSON.stringify(j));return j.result.value}
  writeFileSync(join(dir,stage+'.log'),log.replace(/token=[^\s]+/g,'token=[redacted]'))
 }
 async function roster(){return (await api('agentPresets/list')).presets.find(p=>p.id==='tuned')}
 async function prompt(id,text){await api('session/prompt',{request:{sessionId:id,requestId:'upgrade-'+Date.now(),mode:'queue',content:[{type:'text',text}]}});for(let i=0;i<100;i++){const s=await api('session/state',{request:{sessionId:id}});if(!s.running)break;await wait(100)}const page=await api('session/page',{request:{address:{kind:'session',sessionId:id},maxMessages:5}});assert.ok(JSON.stringify(page).includes('Preset upgrade verified.'));assert.ok(!JSON.stringify(page).includes('preset/broken'))}
 try{
  await start('baseline');assert.ok(!(await roster()).broken);const {sessionId}=await api('session/create',{request:{cwd,agentPreset:'tuned'}});await api('session/selectModel',{request:{sessionId,provider:'preset-probe',model:'fixed'}});await prompt(sessionId,'Before upgrade');beforeOverlay=readFileSync(join(profile,'cordis.patch.yml'),'utf8');await stop()
  rmSync(plugin,{recursive:true,force:true});mkdirSync(plugin);writeFileSync(join(dir,'broken.tar'),execFileSync('git',['archive','c6449d2'],{cwd:repo}));execFileSync('tar',['-xf',join(dir,'broken.tar'),'-C',plugin]);await start('broken');const broken=await roster();assert.ok(broken.broken?.includes('@herenfor/dsh-tune'),JSON.stringify(broken));await stop()
  rmSync(plugin,{recursive:true,force:true});mkdirSync(plugin);execFileSync('tar',['-xzf',tarball,'--strip-components=1','-C',plugin]);await start('fixed');const fixed=await roster();assert.ok(fixed&&!fixed.broken,JSON.stringify(fixed));assert.equal(readFileSync(join(profile,'package.json'),'utf8'),beforeManifest);assert.equal(readFileSync(join(profile,'cordis.patch.yml'),'utf8'),beforeOverlay)
  await prompt(sessionId,'Continue the existing tuned session after upgrade');const existing=(await api('session/list',{_request:{}})).items.find(s=>s.sessionId===sessionId);assert.equal(existing.projections.values.agentPreset,'tuned')
  const fresh=await api('session/create',{request:{cwd,agentPreset:'tuned'}});await api('session/selectModel',{request:{sessionId:fresh.sessionId,provider:'preset-probe',model:'fixed'}});await prompt(fresh.sessionId,'New tuned session after upgrade')
  results.push({label,version:execFileSync(entry,['--version'],{encoding:'utf8'}).trim(),baselineAvailable:true,dev5Broken:broken.broken,fixedAvailable:!fixed.broken,oldSessionContinued:true,newSessionWorked:true,manifestAndSettingsUnchanged:true})
  writeFileSync(join(dir,'preview.json'),JSON.stringify({url,sessionId:fresh.sessionId}));

 }finally{await stop()}
}
try {
  for(const [index,entry] of hosts.entries()) await run(entry,'host-'+index)
  console.log(JSON.stringify(results,null,2))
} finally { rmSync(root,{recursive:true,force:true}) }
