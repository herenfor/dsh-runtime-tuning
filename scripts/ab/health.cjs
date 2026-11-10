// 工具调用与审批结构的健康度：node health.cjs <idA> <idB> [turn=1]
const {execFileSync}=require('child_process')
const S=__dirname,turnNo=+(process.argv[4]||1),out={}
const READ=/^\s*(cd [^;&]+(&&|;)\s*)?(cat|head|tail|sed -n|grep|rg|find|ls|wc|nl)\b/
for(const [arm,id] of [['A 官方',process.argv[2]],['B 调优',process.argv[3]]]){
  const f=execFileSync('sh',['-c',`ls -d ~/.dsh/sessions/*/session-${id}*/session.v4.jsonl.zstd`]).toString().trim()
  const l=execFileSync('node',[S+'/events.cjs',f],{maxBuffer:1e9,stdio:['ignore','pipe','ignore']}).toString().trim().split('\n').map(JSON.parse).filter(e=>e.data?.turn===undefined||e.data.turn===turnNo)
  const calls=l.filter(e=>e.type==='tool/call'),res=l.filter(e=>e.type==='tool/result')
  let badArgs=0,noDesc=0,bashRead=0,dup=0,consec=0,prev='';const seen=new Set(),errBy={}
  for(const c of calls){let a;try{a=JSON.parse(c.data.arguments||'{}')}catch{badArgs++;continue}
    const key=c.data.name+JSON.stringify(a);if(seen.has(key))dup++;if(key===prev)consec++;seen.add(key);prev=key
    if(c.data.name==='bash'){if(!a.description)noDesc++;if(READ.test(a.command||''))bashRead++}}
  const name=Object.fromEntries(calls.map(c=>[c.data.callId,c.data.name]));let sandbox=0
  for(const r of res){if(!r.data.message.isError&&!r.data.error)continue;const n=name[r.data.message.toolCallId]||'?';errBy[n]=(errBy[n]||0)+1
    if(/sandbox/.test(r.data.message.content?.[0]?.text||''))sandbox++}
  const ask=l.filter(e=>e.type==='approval/asked'),dec=l.filter(e=>e.type==='approval/decided'),oc={}
  for(const d of dec)oc[d.data.outcome]=(oc[d.data.outcome]||0)+1
  const reasons=new Set(ask.map(a=>(a.data.reason||'').replace(/\s+/g,' ').slice(0,60)))
  const bashN=calls.filter(c=>c.data.name==='bash').length,errN=Object.values(errBy).reduce((a,b)=>a+b,0)
  out[arm]={'工具调用':calls.length,'参数 JSON 解析失败':badArgs,'工具报错':`${errN} (${(100*errN/Math.max(1,res.length)).toFixed(1)}%)`,'其中沙箱拒绝':sandbox,
   '报错分布':JSON.stringify(errBy),'完全重复的调用':dup,'连续重复':consec,'bash 当读文件用':`${bashRead}/${bashN}`,'bash 缺 description':noDesc,
   '审批次数':ask.length,'审批结果':JSON.stringify(oc),'不同审批理由':reasons.size,'审批/工具调用':(ask.length/Math.max(1,calls.length)).toFixed(2)}
}
const ks=Object.keys(Object.values(out)[0]),arms=Object.keys(out)
console.log('| 指标 | '+arms.join(' | ')+' |\n|---|'+arms.map(()=>'---|').join(''))
for(const k of ks)console.log(`| ${k} | `+arms.map(a=>out[a][k]).join(' | ')+' |')
