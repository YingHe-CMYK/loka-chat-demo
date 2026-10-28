import {economyInitial,economyReduce} from './economy.js';
export const experiments={
 care:{title:'整理减重治疗的沟通问题',short:'治疗沟通',why:'本人确认希望先整理问题，不从身体数据推断治疗意愿。',a:'记录本人感受、发生时间与既有医生方案，留待本人核对',b:'把准备向医生询问的问题列出；不改变用药或注射计划',metric:'问题是否清楚、本人是否认可；不以 Oura 分数判断药效',constraint:'本卡不提供药物选择、剂量、补打、停药或因果诊断。身体记录与用药自述分开，不外发。',next:'由本人核对后，在正规就诊中与医生讨论。',cost:0},
 budget:{title:'让同一份算力，多回答对几题',short:'推理预算',why:'你确认优先比较单位计算成本的正确率。',a:'单候选 · 8192 token · 无 judge',b:'2→4 候选 · 每条1536 · 最多2次 judge ×1024',metric:'实际 GPU 时间相近时的正确率',constraint:'固定 Qwen3-8B、checkpoint、量化、题集、采样；计入 prefill、所有候选和 judge。',next:'先用小样本校准成本，再冻结两组预算。',cost:30},
 latency:{title:'先守住响应时间，再谈准确率',short:'延迟优先',why:'你否定了算力效率优先，明确把 P95 作为硬约束。',a:'2候选串行 · 同采样设置 · 无 judge',b:'2候选并发 · 同采样设置 · 无 judge',metric:'满足 P95 上限后的正确率与显存',constraint:'固定 Qwen3-8B、硬件、题集与并发负载；P95 上限由你填写，不能从身体信号推断。',next:'小样本比较调度，单独记录排队与端到端时延。',cost:30},
 nojudge:{title:'拿掉验证器，检验采样本身',short:'不用验证器',why:'你不信任模型 judge，因此移除验证器及其开销。',a:'固定4候选 · 每条1536 · 归一化投票',b:'先2候选 · 分歧才追加到4 · 同一投票规则',metric:'GPU 时间、正确率、追加采样率',constraint:'固定答案归一化和平票规则。所有候选计入成本；离线回放不等于在线提速。',next:'先定义分歧与平票，再测追加采样是否带来收益。',cost:30},
 transfer:{title:'研究知识迁移，不继续解题竞赛',short:'知识迁移',why:'你纠正了研究对象：要研究知识如何迁移，而非推理时分配算力。',a:'同 teacher/student · reverse-KL 训练',b:'同 teacher/student · forward-KL 训练',metric:'新事实掌握与未见组合的迁移表现',constraint:'固定 rollout 与训练预算；分开评估记忆和泛化。此方向需要训练，本 demo 不执行。',next:'先构建新事实 / 未见组合两组评测，再比较训练目标。',cost:30}
};
export const createMobile=()=>({v:4,tab:'today',stacks:{today:['home'],mirror:['candidate'],tasks:['tasks'],circle:['circle'],me:['me']},sheet:null,connected:false,oura:false,scopes:[true,true,true],connection:'idle',signal:'none',paused:null,branch:null,revision:0,notes:[],draft:'',saved:false,job:null,artifacts:[],shares:[],recipient:'林 · 推理效率',shareOK:false,inviteStage:'none',economy:economyInitial(),error:'',seq:0});
export const route=s=>s.stacks[s.tab].at(-1);
export function mobileReduce(s,e){
 let n=JSON.parse(JSON.stringify(s));const push=r=>{if(route(n)!==r)n.stacks[n.tab].push(r)};
 const money=ev=>{n.economy=economyReduce(n.economy,ev)};
 const release=()=>{if(n.job&&['running','paused'].includes(n.job.status)){money({type:'CANCEL'});n.job.status='cancelled'}};
 if(e.type==='RESET')return createMobile();
 if(e.type==='TAB'&&n.stacks[e.value]){if(n.tab===e.value)n.stacks[e.value]=[n.stacks[e.value][0]];n.tab=e.value;n.sheet=null;n.error='';return n}
 if(e.type==='BACK'){if(n.sheet)n.sheet=null;else if(n.stacks[n.tab].length>1)n.stacks[n.tab].pop();n.error='';return n}
 if(e.type==='OPEN'){push(e.value);n.error='';return n}
 if(e.type==='SHEET'){n.sheet=e.value;n.error='';n.shareOK=false;return n}
 if(e.type==='SAVE'){n.saved=!!e.value;return n}
 if(e.type==='STOP'){n.paused='manual';if(n.job?.status==='running')n.job.status='paused';n.sheet=null;return n}
 if(e.type==='RECONNECT'){if(n.paused==='lost'){n.paused='reconnected';n.signal='uncertain'}return n}
 if(e.type==='RESUME'){if(n.paused!=='lost'){n.paused=null;if(n.job?.status==='paused')n.job.status='running'}return n}
 if(n.paused&&!['CANCEL_JOB','FAIL_JOB','REVOKE'].includes(e.type))return s;
 if(e.type==='START'){push(n.connected?'candidate':'computer')}
 if(e.type==='SCOPE'){n.scopes[e.index]=!n.scopes[e.index]}
 if(e.type==='CONNECT'&&n.scopes.some(Boolean)&&n.connection!=='loading'){n.connection='loading';n.error=''}
 if(e.type==='CONTEXT_READY'&&n.connection==='loading'){n.connected=true;n.connection='ready';push('oura')}
 if(e.type==='CONNECT_FAIL'&&n.connection==='loading'){n.connection='error';n.error='演示连接中断，尚未建立上下文。可重试或返回。'}
 if(e.type==='OURA'){n.oura=e.value!=='skip';push('candidate')}
 if(e.type==='SIGNAL'&&['stable','changed','uncertain','disconnected'].includes(e.value)&&n.connected){n.signal=e.value;if(e.value==='disconnected'){n.paused='lost';if(n.job?.status==='running')n.job.status='paused'}else if(e.value!=='stable')push('reflection')}
 if(e.type==='DRAFT')n.draft=String(e.value).slice(0,240);
 if(e.type==='CHOOSE'&&n.connected&&experiments[e.value]){n.branch=e.value;n.revision++;n.notes.push(experiments[e.value].why);n.draft='';push('plan')}
 if(e.type==='CORRECT'){if(!n.draft.trim()){n.error='说一句这次更重要的事，也可以返回选择。';return n}let b=/迁移|知识|训练/.test(n.draft)?'transfer':/延迟|速度|快/.test(n.draft)?'latency':/judge|验证器|投票/.test(n.draft)?'nojudge':null;if(!b){n.error='这版演示还不能为这个目标生成可靠方案。请保留原话，或选择下面的研究方向；不会假装已经理解。';return n}n.branch=b;n.revision++;n.notes.push('你的纠正：'+n.draft);push('plan')}
 if(e.type==='KEEP'&&n.branch){if(!n.artifacts.some(a=>a.key==='draft-'+n.branch)){n.artifacts.push({id:++n.seq,key:'draft-'+n.branch,branch:n.branch,kind:n.branch==='care'?'私人沟通卡':'基础实验卡',title:experiments[n.branch].title})}n.tab='tasks';n.stacks.tasks=['tasks'];}
 if(e.type==='RESERVE'&&n.branch&&!['running','paused'].includes(n.job?.status)){money({type:'RESERVE',size:e.value,title:experiments[n.branch].title});if(n.economy.error){n.error=n.economy.error;return n}n.job={id:++n.seq,branch:n.branch,status:'running',step:0,size:e.value,cost:e.value==='small'?8:30};n.sheet=null;n.tab='tasks';n.stacks.tasks=['tasks','job'];n.error=''}
 if(e.type==='TICK'&&n.job?.status==='running'){n.job.step++;if(n.job.step>=3){money({type:'COMPLETE'});n.job.status='complete';n.artifacts.push({id:n.job.id,key:'job-'+n.job.id,branch:n.job.branch,kind:n.job.size==='small'?'两组对照稿':'完整实验设计包',title:experiments[n.job.branch].title})}}
 if(['CANCEL_JOB','FAIL_JOB'].includes(e.type)&&['running','paused'].includes(n.job?.status)){money({type:e.type==='FAIL_JOB'?'FAIL':'CANCEL'});n.job.status=e.type==='FAIL_JOB'?'failed':'cancelled';n.sheet=null;n.paused=null}
 if(e.type==='SUBSCRIBE'){money({type:'SUBSCRIBE'});n.sheet=null}
 if(e.type==='INVITE'){money({type:'INVITE'});if(n.inviteStage==='none')n.inviteStage='created';push('invite')}
 if(e.type==='INVITE_ACCEPT'&&n.inviteStage==='created')n.inviteStage='accepted';
 if(e.type==='INVITE_DONE'&&n.inviteStage==='accepted'){money({type:'FRIEND_DONE'});n.inviteStage='complete'}
 if(e.type==='ARTIFACT'){n.artifactId=Number(e.value);push('artifact')}
 if(e.type==='RECIPIENT')n.recipient=e.value;
 if(e.type==='SHARE_OK')n.shareOK=!!e.value;
 if(e.type==='SHARE'){const a=n.artifacts.find(a=>a.id===n.artifactId);if(!a||!n.shareOK){n.error='请确认仅分享选定的实验成品。';return n}const key=a.id+'-'+n.recipient;if(!n.shares.some(x=>x.key===key))n.shares.push({key,title:a.title,branch:a.branch,recipient:n.recipient});n.sheet=null;n.tab='circle';n.stacks.circle=['circle'];n.error=''}
 if(e.type==='REVOKE'){release();n.connected=false;n.oura=false;n.scopes=[true,true,true];n.branch=null;n.signal='none';n.notes=[];n.artifacts=[];n.shares=[];n.sheet=null;n.tab='today';n.stacks.today=['home'];n.connection='idle'}
 return n;
}
