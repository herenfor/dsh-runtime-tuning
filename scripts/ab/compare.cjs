// A/B 对比：每个会话第一轮的耗时拆分、步数、工具、token、插件注入
const {execFileSync}=require('child_process'),fs=require('fs')
const S=__dirname
const row={}
for(const [arm,id] of [['A 官方',process.argv[2]],['B 调优',process.argv[3]]]){
  const f=execFileSync('sh',['-c',`ls -d ~/.dsh/sessions/*/session-${id}*/session.v4.jsonl.zstd`]).toString().trim()
  const l=execFileSync('node',[S+'/events.cjs',f],{maxBuffer:1e9,stdio:['ignore','pipe','ignore']}).toString().trim().split('\n').map(JSON.parse)
  const ts=l.find(e=>e.type==='turn/start'),te=l.find(e=>e.type==='turn/end')
  const end=te?.time??l.at(-1).time
  let stepStart=0,model=0,tool=0,steps=0,toolCalls=0,par=0,textSteps=0,inTok=0,outTok=0,cacheR=0,approval=0,asked={},retries=0,todo=null
  const tools={},inj={}
  for(const e of l){ if(e.time<ts.time||e.time>end)continue
    if(e.type==='step/start')stepStart=e.time
    if(e.type==='assistant/message'){steps++;model+=e.time-stepStart;stepStart=e.time
      const c=e.data.message.content,calls=c.filter(b=>b.type==='tool-call');toolCalls+=calls.length;if(calls.length>1)par++
      if(calls.length&&c.some(b=>b.type==='text'&&b.text.trim()))textSteps++
      for(const b of calls)tools[b.name]=(tools[b.name]||0)+1
      const u=e.data.usage??{};inTok+=u.inputTokens??0;outTok+=u.outputTokens??0;cacheR+=u.cacheReadTokens??0}
    if(e.type==='step/end')tool+=e.time-stepStart
    if(e.type==='approval/asked')asked[e.data.id]=e.time
    if(e.type==='approval/decided'&&asked[e.data.id])approval+=e.time-asked[e.data.id]
    if(e.type==='llm/retry')retries++
    if(e.type==='todo/write')todo=e.data.todos
    if(e.type==='user/message'){const k=e.data.source?.kind;if(k&&k.startsWith('dsh-'))inj[k]=(inj[k]||0)+1}
  }
  const m=(ms)=>(ms/6e4).toFixed(1)+' 分'
  row[arm]={'状态':te?JSON.stringify(te.data.reason.kind):'进行中','总时长':m(end-ts.time),'扣审批':m(end-ts.time-approval),'模型时间':m(model),'工具/等待':m(tool),
   '步数':steps,'工具调用':toolCalls,'并行步':par,'带汇报的工具步':textSteps,'输入token(含缓存)':inTok+cacheR,'缓存命中':(inTok+cacheR)?((100*cacheR/(inTok+cacheR)).toFixed(1)+'%'):'-','输出token':outTok,
   '重试':retries,'清单':todo?todo.filter(t=>t.status==='completed').length+'/'+todo.length:'-','注入':JSON.stringify(inj),
   '工具分布':Object.entries(tools).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>k+':'+v).join(' ')}
}
const keys=Object.keys(row['A 官方'])
console.log('| 指标 | A 官方 | B 调优 |\n|---|---|---|')
for(const k of keys)console.log(`| ${k} | ${row['A 官方'][k]} | ${row['B 调优'][k]} |`)
