// The product executes UI actions; the replaceable provider supplies judgments.
export const JUDGMENT_ACTIONS=['EXPAND','SHOW_PROBE','ASK_CONFIRMATION','SHOW_INFERENCE','OFFER_EXPERIMENT','HOLD'];
export function validateJudgment(output,request){
 if(!output||output.requestId!==request.requestId||!JUDGMENT_ACTIONS.includes(output.action?.type))throw Error('Invalid judgment action or stale request');
 if(typeof output.action.text!=='string'||output.action.text.length>300)throw Error('Invalid display text');
 if(!Array.isArray(output.evidenceIds)||output.evidenceIds.some(id=>!request.events.some(e=>e.id===id)))throw Error('Unknown evidence reference');
 if(output.action.type==='SHOW_PROBE'&&![0,1,2].includes(output.action.probeId))throw Error('Unknown content');
 if(output.action.type==='OFFER_EXPERIMENT'&&!request.context.confirmed)throw Error('User confirmation required');
 return output;
}
export function createJudgmentAdapter({judge,timeoutMs=6000}){return {async decide(request,{signal}={}){let timer;try{return validateJudgment(await Promise.race([judge(structuredClone(request),{signal}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Judgment timed out')),timeoutMs);})]),request);}finally{clearTimeout(timer);}}};}
export const demoJudge=async request=>{
 const e=request.events.at(-1),answers=request.events.filter(x=>['nod','swipe_right'].includes(x.signal)&&x.stage==='probe');
 let action={type:'HOLD',text:'先停在这里，不急着下结论。'};
 if(['gaze','smile','frown'].includes(e.signal))action={type:'EXPAND',text:e.signal==='frown'?'我先收起解释。只看这件事本身。':'这一点让你愿意再看一个不同情境吗？'};
 if(['next','swipe_left'].includes(e.signal))action={type:'SHOW_PROBE',probeId:(request.context.probeId+1)%3,text:'换一个情境，看看真正牵动你的是什么。'};
 if(['nod','swipe_right'].includes(e.signal)&&e.stage==='probe')action=new Set(answers.map(x=>x.contentId)).size>=2?{type:'SHOW_INFERENCE',text:'也许你在意的是：把一个属于自己的想法真正做出来，而不只是继续准备。'}:{type:'SHOW_PROBE',probeId:(request.context.probeId+1)%3,text:'换掉表面的故事，再试一次。'};
 if(['nod','swipe_right'].includes(e.signal)&&request.context.confirmed)action={type:'OFFER_EXPERIMENT',text:'先做出一个最小片段，再看这是否真的值得继续。'};
 return {requestId:request.requestId,provider:'demo-script',action,evidenceIds:request.events.filter(x=>['nod','swipe_right'].includes(x.signal)).map(x=>x.id)};
};
