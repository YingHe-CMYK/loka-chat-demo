// Public scripted positions, responses and votes. Not real model reasoning or usage.
export const rate=Object.freeze({version:'demo-peer-rate-v2',model:'Mirror-Sim / scripted',input:1,output:2,unit:'QB / 1K tokens'});
export function quote(mode='model'){
 const specs=[...['A','B','C'].map(n=>[`议员 ${n}`,'提出独立观点',300,100]),...['A','B','C'].map(n=>[`议员 ${n}`,'回应讨论并投票',200,100]),['内容整理能力','生成交付材料',100,100]];
 return specs.map(([name,purpose,input,output],id)=>({id,name,purpose,model:mode==='model'?rate.model:'本地规则 / 模板',input:mode==='model'?input:0,output:mode==='model'?output:0,cost:mode==='model'?(input+2*output)/1000:0,rate:rate.version,tokenSource:mode==='model'?'预设模拟量，非真实计量':'无模型调用'}));
}
export function makeRun(plan,s,mode='model',scenario='normal'){
 const rows=quote(mode),total=rows.reduce((n,r)=>n+Math.round(r.cost*1000),0)/1000;
 return {id:'run-'+(s.seq+1),protocol:'peer-v2',mode,scenario,plan:JSON.parse(JSON.stringify(plan)),rows,total,status:'running',cursor:0,spent:0,decisions:[],votes:[],motion:null,tally:null,started:Date.now(),version:rate.version};
}
export function decision(run,index){
 const external=run.scenario==='external',health=run.plan.topic==='health',meaning=run.plan.topic==='meaning';
 const roles=['议员 A','议员 B','议员 C'];
 const constraint=health?'不包含诊断、用药建议或药效判断':meaning?'标明是象征性探索，不当作事实预测':'不推断对方意愿，也不声称已完成联系';
 const initial=external?[
  ['建议外发','我建议把准备材料交给服务方，减少用户下一步的操作。我的前提是有明确接收方和发送授权。'],
  ['建议暂缓','我反对现在发送。现有授权只支持本地处理，尚未指定接收方，不能把选择方向当作分享许可。'],
  ['提出替代方案','我建议先给用户一份本地草稿。外发应单独征得授权，不能与生成材料捆绑。']
 ]:[
  ['建议立即准备',`我建议现在生成「${run.plan.deliver}」，只给本人使用；它能把下一步变得具体。`],
  ['建议先补资料','我建议先补齐缺失信息，再生成材料。目前的线索不足，通用草稿可能让人误以为系统已了解全部情况。'],
  ['提出修订',`我建议允许先生成，但明确列出未知信息，${constraint}，且不对外发送。`]
 ];
 if(index<3)return {role:roles[index],phase:'独立发言',verdict:initial[index][0],text:initial[index][1],evidence:'三位议员使用同一任务、资料范围和权限信息；拥有相同提议与投票权。'};
 const i=index-3;
 const responses=external?[
  ['赞成','我听到了 B 的授权异议和 C 的替代方案，但仍认为外发更省事，保留对原议案的赞成票。此票不能替用户授权。'],
  ['反对','回应 A：省事不能补足授权。C 的本地方案可以另案讨论，本次外发议案应否决。'],
  ['反对','回应 A 与 B：我支持先交付本地材料，不支持本次外发。请将本地方案作为新议案。']
 ]:[
  ['赞成','接受 C 的修订，也回应 B 的担忧：在材料中列出未知项，避免把猜测写成事实。我赞成修订后的本地草稿议案。'],
  ['反对','C 的限制降低了风险，但没有消除信息不足的问题。我仍建议先补资料，保留反对票。'],
  ['赞成','听取 A 的推进理由和 B 的资料异议后，我支持有条件生成：列出未知项，限定本地用途。']
 ];
 return {role:roles[i],phase:'讨论回应与投票',verdict:responses[i][0],text:responses[i][1],evidence:'三人针对同一议案独立投票；无主持裁决票、无额外权重。',vote:responses[i][0]};
}
export function tallyVotes(votes,{external=false}={}){
 const yes=votes.filter(v=>v.vote==='赞成').length,no=votes.filter(v=>v.vote==='反对').length;
 const majority=yes>=2,authorized=!external;
 return {yes,no,abstain:votes.length-yes-no,majority,authorized,execute:majority&&authorized,rule:'三席等权，至少两票赞成；授权条件独立校验',reason:!majority?'议案未获多数赞成':!authorized?'多数赞成，但缺少用户授权，仍不执行':'多数通过，授权条件满足；按修订议案执行'};
}
export function advance(run){
 const r=JSON.parse(JSON.stringify(run));if(r.status!=='running')return {run:r,row:null};
 const row={...r.rows[r.cursor],runId:r.id,callId:r.id+'-'+r.cursor,status:'模拟已发生',at:Date.now()};
 if(r.cursor<6){const d=decision(r,r.cursor);r.decisions.push(d);if(d.vote)r.votes.push({role:d.role,vote:d.vote});}
 if(r.cursor===2)r.motion=r.scenario==='external'?'是否现在将材料发送给服务方（原议案）':`是否按修订条件生成「${r.plan.deliver}」：列出未知项，仅本人可见，不执行外部服务`;
 r.spent=Math.round((r.spent+row.cost)*1000)/1000;r.cursor++;
 if(r.cursor===6){r.tally=tallyVotes(r.votes,{external:r.scenario==='external'});if(!r.tally.execute)r.status='blocked';}
 if(r.cursor===7)r.status='completed';
 return {run:r,row};
}
