import {chosenRoute,resultRoutes} from './visual-result.js?v=stage1-69';
import {makeRun,advance} from './council-sim.js';
import {utility,economy,governanceReview} from './loop-frameworks.js';
import {initialLens,nextLens,nextNeed} from './need-discovery.js?v=stage1-69';
import {sampleEvidence,deviceEvidence} from './device-sources.js?v=stage1-69';
export const topics={health:{label:'身体与生活',guess:'也许你想找的，是一个不必反复研究、又能稳妥推进的身体管理办法。',evidence:['笔记里提到了减重咨询','清单里留着几种补剂','日程里标记了连续工作的时段']},meaning:{label:'另一个角度',guess:'也许你想借一个不同的角度，看清这次犹豫究竟卡在哪里。',evidence:['笔记里提到了塔罗与选择','留下了关于稳定和改变的问题']},connection:{label:'人与关系',guess:'也许你缺的不是一个开场白，而是一个不用马上解释很多的开场。',evidence:['笔记提到想联系一位朋友','记录中有一次尚未安排的见面']},research:{label:'Research',guess:'Is this the research question on your mind right now?',evidence:[]}};
export const plans=[
{id:'health-focus',topic:'health',title:'Fit treatment into your week.',subtitle:'Use your own prescription to place reminders.',tags:['focus','private'],cost:0,deliver:'One-week treatment view',body:'Organize existing medicines and supplements, then bring them to a clinician. No treatment time is inferred from a wearable.'},
{id:'health-budget',topic:'health',title:'See the full cost of treatment.',subtitle:'Compare the start, monthly, and exit costs.',tags:['budget','private'],cost:0,deliver:'Treatment cost view',body:'Consultation, treatment, follow-up, supplements, and exit costs are shown together. No prices are invented.'},
{id:'health-review',topic:'health',title:'Prepare for a treatment review.',subtitle:'Three focused questions for your clinician.',tags:['depth','focus'],cost:3,deliver:'Visit questions',body:'Ask about suitability, use, and follow-up. This is not a diagnosis or prescription.'},
{id:'meaning-reflect',topic:'meaning',title:'See this choice from another angle.',subtitle:'A symbolic three-card reflection.',tags:['private','depth'],cost:0,deliver:'Reflection cards',body:'Separate what to keep, what to move toward, and one small trial. No fate claim.'},
{id:'meaning-budget',topic:'meaning',title:'Try a low-cost path.',subtitle:'Keep a way back while exploring.',tags:['budget','focus'],cost:0,deliver:'Low-cost reflection',body:'Choose one reversible trial. Keep the conditions that matter to you.'},
{id:'connection-private',topic:'connection',title:'Start with one line.',subtitle:'Preview a message before sending.',tags:['private','budget'],cost:0,deliver:'Unsent message preview',body:'A private draft only. No contact has been read or messaged.'},
{id:'connection-focus',topic:'connection',title:'Make a meeting concrete.',subtitle:'Preview a topic and two times.',tags:['focus','depth'],cost:0,deliver:'Unsent meeting preview',body:'You choose the topic and times. Nothing is sent.'},
{id:'research-focus',topic:'research',title:'Map the question behind your work.',subtitle:'Turn the selected file into a testable question.',tags:['focus','depth'],cost:0,deliver:'Research direction',body:'One focused claim, a baseline, a controlled comparison, and a result that could change your mind. No experiment has been run.'}];
export const fresh=()=>({stage:'welcome',topic:'health',index:0,needDepth:0,weights:{focus:0,budget:0,private:0,depth:0},affinity:{health:0,meaning:0,connection:0,research:0},visits:{health:0,meaning:0,connection:0,research:0},signals:[],dismissed:[],events:[],seq:0,balance:12,cap:0,paused:false,results:[],source:'demo',evidence:[],undo:null,notice:'',ledger:[],run:null});
export const freshJourney=()=>({...fresh(),stage:'invite',source:'none',deviceFacts:[],invitation:{code:'LOKA-ML-01',cohort:'ML researcher',accepted:false},profile:null});
const clone=x=>JSON.parse(JSON.stringify(x));
export function rank(s){return plans.filter(p=>p.topic===s.topic&&!s.dismissed.includes(p.id)&&economy.eligible(p,s)).map(p=>({...p,score:p.tags.reduce((n,k)=>n+(s.weights[k]||0),0)+(s.affinity[p.topic]||0)-.1*p.cost-((s.results||[]).some(r=>r.planId===p.id)?5:0)})).sort((a,b)=>b.score-a.score);}
export function current(s){return rank(s)[0]||null;}
function event(s,type,data){s.events.push({id:++s.seq,type,...data,time:Date.now()});s.events=s.events.slice(-100);}
export function step(input,type,data={}){let s=clone(input);s.notice='';
 if(type==='open-daily'){if(s.stage!=='daily')s.dailyReturnStage=s.stage;if(data.day&&s.dailyDay!==data.day){s.dailyDay=data.day;s.dailyTab='health';s.dailyReady=false;}s.stage='daily';s.dailyTab=s.dailyTab||'health';s.undo=null;event(s,type,{effect:'Opened daily check-in'});return s;}
 if(type==='daily-tab'&&s.stage==='daily'){if(['health','meaning','connection'].includes(data.tab))s.dailyTab=data.tab;return s;}
 if(type==='remove-bazi'&&s.stage==='daily'){delete s.baziPillars;event(s,type,{effect:'Four pillars removed from this browser'});return s;}
 if(type==='save-bazi'&&s.stage==='daily'&&Array.isArray(data.pillars)&&data.pillars.length===4){s.baziPillars=data.pillars;s.dailyTab='meaning';event(s,type,{effect:'Four user-provided pillars saved locally'});return s;}
 if(type==='daily-swipe'&&s.stage==='daily'&&['yes','no'].includes(data.value)){s.undo={stage:'daily',dailyTab:s.dailyTab,dailyReady:!!s.dailyReady,dailyFeedback:clone(s.dailyFeedback||{})};s.dailyFeedback=s.dailyFeedback||{};s.dailyFeedback[data.day]={...(s.dailyFeedback[data.day]||{}),[s.dailyTab]:data.value};const order=['health','meaning','connection'],index=order.indexOf(s.dailyTab);if(index<2){s.dailyTab=order[index+1];s.dailyReady=false;}else s.dailyReady=data.value==='yes';event(s,type,{effect:'Daily response saved; the next view is available'});return s;}
 if(type==='daily-feedback'&&s.stage==='daily'&&['yes','no'].includes(data.value)){s.dailyFeedback=s.dailyFeedback||{};s.dailyFeedback[data.day]={...(s.dailyFeedback[data.day]||{}),[s.dailyTab]:data.value};event(s,type,{effect:'Member responded to daily prompt'});return s;}
 if(type==='daily-continue'&&s.stage==='daily'){const prior=s.dailyReturnStage||'welcome';s.stage=prior==='daily'?'welcome':prior;if(s.stage==='result')return step(s,'next');if(['local','app','sample'].includes(s.source)&&s.stage!=='guess')return step(s,'continue-explore');return s;}
 if(type==='navigate-back') {if(s.stage==='result'){s.topic=s.results.at(-1)?.topic||s.topic;s.dismissed=[];}const previous={daily:s.dailyReturnStage||'welcome',register:'invite',welcome:'invite','source-result':'welcome',guess:'source-result',plan:'guess',result:'plan'}[s.stage];if(previous){s.stage=previous;event(s,type,{effect:'Returned to previous screen; earlier responses retained'});}return s;}
 if(type==='sign-out'){s.signedOut=true;return s;}
 if(type==='sign-in'){s.signedOut=false;if(!s.profile){s.profile={name:String(data.name||'Guest').slice(0,24),cohort:'ML researcher',localDemo:true};s.invitation={code:'LOKA-ML-01',cohort:'ML researcher',accepted:true};s.stage='welcome';}return s;}
 if(type==='continue-explore'){s.signedOut=false;s.undo=null;if(s.stage==='result'&&s.source!=='none')return step(s,'next');if(['sample','local','app'].includes(s.source)&&s.topic!=='general'){s.stage='guess';s.discoveryDepth=0;s.index++;s.dismissed=[];event(s,type,{effect:'Continue discovery with existing sources'});return s;}s.stage='welcome';s.discoveryDepth=0;s.deepChoice=null;event(s,type,{effect:'Choose a source to continue discovery'});return s;}
 if(type==='start-new-goal'){s.stage='welcome';s.signedOut=false;s.source='none';s.manualGoal=false;s.sourceGoal=false;s.previewFocus=null;s.index=0;s.discoveryDepth=0;s.deepChoice=null;s.localGuess='';s.dismissed=[];s.undo=null;event(s,type,{effect:'Start another goal; previous results retained'});return s;}
 if(type==='open-result'){const i=s.results.findIndex(r=>r.id===data.id);if(i<0)return s;const result=s.results.splice(i,1)[0];s.results.push(result);s.topic=result.topic;const goalAllowed=!result.goalIsInput&&result.sourceKind!=='manual'||(s.confirmedMemories||[]).some(m=>m.kind==='goal'&&m.value===result.sourceFocus);s.source=goalAllowed?(result.sourceKind==='manual'?'local':result.sourceKind||s.source):'none';s.manualGoal=goalAllowed&&result.sourceKind==='manual';s.sourceGoal=goalAllowed&&!!result.goalIsInput&&!s.manualGoal;s.localFocus=goalAllowed?result.sourceFocus||'':'';s.localTitle=result.sourceTitle||'';s.localExcerpt=result.sourceExcerpt||'';s.evidence=goalAllowed&&Array.isArray(result.sourceEvidence)?result.sourceEvidence.slice():[];s.localGuess=s.manualGoal&&s.localFocus?`Your goal: “${s.localFocus}”. Would a focused plan help you move forward?`:'';s.stage='result';s.undo=null;event(s,type,{effect:'Opened a saved result'});return s;}
 if(type==='agree-v1'){s.agreement={version:'1',acceptedAt:Date.now()};return s;}
 if(type==='manual-goal'&&s.stage==='welcome'){const goal=String(data.goal||'').trim().slice(0,500);if(!goal)return s;s.source='local';s.manualGoal=true;s.sourceGoal=false;s.previewFocus=null;s.localRole='Your goal';s.localTopic='research';s.localFocus=goal;s.localGuess=`Your goal: “${goal}”. Would a focused plan help you move forward?`;s.localTitle='Goal you entered';s.localCount=1;s.localInventory={discovered:1,read:1};s.evidence=[`Goal you entered: ${goal}`];s.deviceFacts=[{label:'Source',value:'Goal entered by you'}];s.confirmedMemories=[...(s.confirmedMemories||[]).filter(m=>m.kind!=='goal'),{id:'goal',kind:'goal',value:goal,source:'entered',at:Date.now()}];s.stage='source-result';event(s,type,{effect:'Goal entered by member; no model training'});return s;}
 if(type==='source-goal'&&s.stage==='source-result'&&['local','app'].includes(s.source)){const goal=String(data.goal||'').trim().slice(0,500);if(!goal)return s;if(!s.sourceGoal)s.sourceBeforeGoal={localGuess:s.localGuess,localFocus:s.localFocus,localTopic:s.localTopic,topic:s.topic,evidence:[...(s.evidence||[])]};s.previewFocus=null;s.sourceGoal=true;s.localFocus=goal;s.localTopic='research';s.topic='research';s.index=0;s.localGuess=`Your goal: “${goal}”. Would a focused plan help you move forward?`;s.evidence=[...(s.evidence||[]).slice(0,3),`Goal entered by you: ${goal}`];s.confirmedMemories=[...(s.confirmedMemories||[]).filter(m=>m.id!=='goal'),{id:'goal',kind:'goal',value:goal,source:'entered',at:Date.now()}];event(s,type,{effect:'Member added a goal to selected sources'});return s;}
 if(type==='save-work-plan'&&s.stage==='result'){const r=s.results.at(-1);if(r?.topic==='research'&&Array.isArray(data.steps)&&data.steps.length>=3&&data.steps.length<=7&&data.steps.every(x=>x.action&&/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&x.finish)){const old=r.workPlan||{};const first=!old.saved;const prediction=first?String(data.prediction||'').trim().slice(0,300):old.prediction||'';r.workPlan={...old,steps:data.steps,saved:true,savedAt:Date.now(),prediction:prediction||null,predictionAt:first&&prediction?Date.now():old.predictionAt||null};event(s,type,{effect:'Plan confirmed by member; expectation recorded separately from outcome'});}return s;}
 if(type==='delete-memory'){const m=(s.confirmedMemories||[]).find(x=>x.id===data.id);if(!m)return s;s.confirmedMemories=s.confirmedMemories.filter(x=>x.id!==data.id);if(m.kind==='goal'&&s.manualGoal){s.manualGoal=false;s.localFocus='';s.localGuess='';s.evidence=[];s.localTitle='';s.source='none';if(['source-result','guess','plan'].includes(s.stage))s.stage='welcome';}if(m.kind==='goal'&&s.sourceGoal){const prior=s.sourceBeforeGoal||{};Object.assign(s,{localGuess:prior.localGuess||'',localFocus:prior.localFocus||'',localTopic:prior.localTopic||'general',topic:prior.topic||'general',evidence:prior.evidence||[],sourceGoal:false,sourceBeforeGoal:null});if(['guess','plan'].includes(s.stage))s.stage='source-result';}if(m.kind==='preference'){s.weights[m.key]=0;if(m.key==='budget')s.cap=0;}s.undo=null;event(s,type,{effect:'Removed confirmed memory from future context'});return s;}

 if(type==='save-review'&&s.stage==='result'){const r=s.results.at(-1);if(r?.workPlan?.saved&&['completed','partial','not-completed'].includes(data.outcome)){r.workPlan.outcome=data.outcome;r.workPlan.note=String(data.note||'').slice(0,500);r.workPlan.reviewedAt=Date.now();event(s,type,{effect:'Actual outcome reported by member'});}return s;}
 if(type==='sample-read'&&s.stage==='welcome'){s.manualGoal=false;s.previewFocus=null;s.source='sample';s.stage='guess';s.topic='health';s.index=0;s.discoveryDepth=0;s.localRole='ML researcher';s.localGuess='The example notes link treatment decisions with uninterrupted research time. Is protecting your focus the real priority?';s.evidence=sampleEvidence.health;s.deviceFacts=[{label:'Research notes',value:'Treatment questions and supplements'},{label:'Calendar',value:'Three extended research blocks'}];return s;}
 if(type==='membership'){s.membership=data.plan==='plus'?'plus':'free';event(s,type,{effect:'Example subscription selection; no payment'});return s;}
 if(type==='recover-plans'&&s.stage==='plan'){s.dismissed=[];s.stage='guess';s.index++;return s;}
 if(type==='app-preview-connect'){s.previewApps={...s.previewApps,[data.app]:true};return s;}
 if(type==='app-preview-disconnect'){s.previewApps={...s.previewApps,[data.app]:false};return s;}
 if(type==='use-app-preview'){if(!s.previewApps?.[data.app])return s;s.manualGoal=false;s.source='sample';s.topic='health';s.stage='guess';s.previewFocus=data.app;s.previewFocusIndex=s.index;s.evidence=[...sampleEvidence.health,`Fictional ${data.app} signal; not read from your account`];s.weights.focus+=1;return s;}
 if(type==='reset')return freshJourney();
 if(type==='accept-invite'&&s.stage==='invite'){s.invitation={...s.invitation,accepted:true};s.stage='register';event(s,type,{effect:'接受演示邀请；尚未创建账号或分享资料'});return s;}
 if(type==='register'&&s.stage==='register'&&s.invitation?.accepted){const name=String(data.name||'').trim().slice(0,24);if(!name){s.notice='Enter a name for this experience.';return s;}s.profile={name,cohort:s.invitation.cohort,localDemo:true};s.stage='welcome';event(s,type,{effect:'创建仅存于本机浏览器的演示身份；未注册真实账号'});return s;}
 if(type==='device-scan'&&s.stage==='welcome'){s.deviceFacts=Array.isArray(data.facts)?data.facts.slice(0,8):[];s.stage='scanning';event(s,type,{effect:'只读取当前浏览器可见的信息与 Miro 本机记录；没有读取其他 App'});return s;}
 if(type==='scan-complete'&&s.stage==='scanning'){s.stage='source-result';event(s,type,{effect:'设备线索已展示；这些信息不足以推断健康、日程或兴趣'});return s;}
 if(['local-read','app-read'].includes(type)&&s.stage!=='invite'&&s.stage!=='register'){
  s.manualGoal=false;s.sourceGoal=false;s.previewFocus=null;s.source=type==='app-read'?'app':'local';s.appName=type==='app-read'?String(data.app||'Connected app').slice(0,50):null;s.stage='source-result';s.deviceFacts=(data.facts||[]).slice(0,4);s.localRole=String(data.role||'').slice(0,100);s.localTopic=data.topic||'general';s.localGuess=String(data.guess||'').slice(0,240);s.localTitle=String(data.titles?.[0]||'').slice(0,80);s.localExcerpt=String(data.excerpt||'').slice(0,160);s.localFocus=String(data.focus||'').slice(0,100);s.localCount=Number(data.count)||0;s.localInventory=data.inventory||null;s.evidence=(data.evidence||[]).slice(0,4);if(s.localTopic!=='general'){s.topic=s.localTopic;s.index=0;s.discoveryDepth=0;s.stage='guess';}
  event(s,type,{effect:type==='app-read'?`Read ${s.localCount} items from ${s.appName} with separate authorization; stored only short clues`:`Read ${s.localCount} user-selected local text files in the browser; stored only source names and a first hypothesis`});return s;
 }
 if(type==='undo'){if(!s.undo)return s;const before=s.undo;s={...s,...before,undo:null};event(s,type,{effect:'撤回上一选择对排序的影响'});return s;}
 if(type==='pause'){s.paused=true;event(s,type,{effect:'停止接收探索输入'});return s;}
 if(type==='resume'){s.paused=false;return s;}
 if(s.paused)return s;
 if(type==='council-start'&&s.stage==='plan'){
  const p=current(s);if(!p)return s;
  const run=makeRun(p,s,data.mode||'model',data.scenario||'normal');
  if(!data.confirmed){s.notice='Confirm this run’s example budget first.';return s;}
  if(run.total>s.balance){s.notice='Example balance is too low. Choose local mode.';return s;}
  s.run=run;s.stage='review';s.undo=null;
  event(s,type,{effect:`确认本次模拟上限 ${run.total} QB；不改写日常预算设置`});return s;
 }
 if(type==='council-next'&&s.stage==='review'){
  if(!s.run||s.run.status!=='running')return s;
  const {run,row}=advance(s.run);s.run=run;
  if(row){s.ledger=s.ledger||[];s.ledger.push(row);s.balance=Math.round((s.balance-row.cost)*1000)/1000;}
  if(run.status==='completed'){
   if(!utility.complete(run.plan)){s.run.status='failed';s.notice='The result did not meet the delivery check.';return s;}
   s.results.push({...run.plan,...(run.plan.topic==='research'?{workPlan:{prediction:null,predictionAt:null,outcome:null,steps:[{action:s.deepChoice==='space'?'Reserve an uninterrupted work block':s.deepChoice==='clarity'?'Write the decision you need to make':'Clarify the outcome and scope',date:'',finish:s.deepChoice==='space'?'A work block is reserved':s.deepChoice==='clarity'?'The decision is stated in one sentence':'A clear outcome is written'},{action:s.deepChoice==='clarity'?'Compare two possible directions':'Make a first working draft',date:'',finish:s.deepChoice==='clarity'?'Two options and trade-offs are written':'A first version exists'},{action:'Review and revise',date:'',finish:'The draft is ready to share or use'}]}}:{}),cost:run.spent,id:run.id,planId:run.plan.id,sourceEvidence:(s.evidence||[]).slice(0,4),goalIsInput:!!(s.manualGoal||s.sourceGoal),sourceKind:s.manualGoal?'manual':s.source,sourceTitle:['local','app'].includes(s.source)?s.localTitle:null,sourceExcerpt:['local','app'].includes(s.source)?s.localExcerpt:null,sourceFocus:['local','app'].includes(s.source)?s.localFocus:null,body:run.plan.body+'\n\n执行范围：仅本人可见的本地材料；未外发。',created:Date.now()});
   s.stage='result';event(s,'council-delivery',{cost:run.spent,effect:'三席投票完成，按通过的议案生成本地材料'});
  }return s;
 }
 if(type==='council-veto'&&s.stage==='review'&&s.run?.status==='running'){
  s.run.status='vetoed';event(s,type,{effect:'本人否决：取消未执行调用，已模拟发生的明细保留'});return s;
 }
 if(type==='council-return'&&s.stage==='review'&&s.run?.status!=='running'){s.stage='plan';return s;}
 if(type==='connect'&&['welcome','source-result'].includes(s.stage)){
  const source=data.source||'demo';s.stage='guess';s.discoveryDepth=0;s.deepChoice=null;s.source=source;
  s.topic=['local','app'].includes(source)?s.localTopic:source==='device'?'general':source==='sample'?'health':data.topic||initialLens(topics);
  s.evidence=['local','app'].includes(source)?s.evidence:source==='device'?deviceEvidence(s.deviceFacts||[]):source==='sample'?sampleEvidence[s.topic]:data.evidence||topics[s.topic].evidence;
  event(s,type,{effect:source==='device'?'只基于当前浏览器与 Miro 内的真实动作提出交互偏好猜测；没有私人需求证据':source==='sample'?'使用明确标注为虚构的 ML 研究员样本，不能当作本人资料':`示例线索优先指向${topics[s.topic].label}`});return s;
 }
 if(type==='budget'){s.cap=Math.max(0,Math.min(12,Number(data.cap)||0));event(s,type,{effect:`方案费用上限变为 ${s.cap} QB`});return s;}
 if(type==='revoke'){const balance=s.balance,ledger=s.ledger||[];s={...fresh(),source:'none',profile:s.profile,invitation:s.invitation};s.balance=balance;s.ledger=ledger;s.notice='Sources and local learning removed. Example balance kept.';return s;}
 if(['correct','left','right','feedback','next'].includes(type))s.undo={stage:s.stage,topic:s.topic,index:s.index,discoveryDepth:s.discoveryDepth||0,deepChoice:s.deepChoice||null,cap:s.cap,weights:clone(s.weights),affinity:clone(s.affinity),visits:clone(s.visits||{}),dismissed:[...s.dismissed],evidence:[...s.evidence]};
 if(type==='signal'){
  if(!['gaze','smile','frown'].includes(data.signal)||!['guess','plan'].includes(s.stage))return s;
  s.signals=s.signals||[];
  if(s.signals.at(-1)?.signal===data.signal&&s.signals.at(-1)?.topic===s.topic)return s;
  s.signals.push({topic:s.topic,signal:data.signal});s.signals=s.signals.slice(-12);
  event(s,type,{signal:data.signal,effect:'记录对当前内容的反应线索，不判断情绪或替本人确认'});return s;
 }
 if(type==='correct'){if(!(data.key in s.weights))return s;s.weights[data.key]+=4;const labels={focus:'Protect work time',budget:'Avoid spending',private:'Keep this private',depth:'Explore in more depth'};s.confirmedMemories=[...(s.confirmedMemories||[]).filter(m=>m.id!=='preference-'+data.key),{id:'preference-'+data.key,kind:'preference',key:data.key,value:labels[data.key],source:'your correction',at:Date.now()}];if(s.topic==='general'){s.stage='source-result';s.interactionPreference=`明确偏好：${data.key}`;event(s,type,{key:data.key,effect:'记录交互偏好；没有据此推断个人健康或关系'});return s;}if(data.key==='budget')s.cap=0;s.stage='plan';s.dismissed=[];event(s,type,{key:data.key,effect:'重排方案，优先考虑你的明确纠正'});return s;}
 if(['left','right','correct'].includes(type))s.dailyGreeting=false;
 if(type==='left'){
  if(s.stage==='guess'&&s.topic==='general'){s.stage='source-result';event(s,type,{effect:'收下否定反馈；现有设备线索不足以换成私人需求判断'});}
  else if(s.stage==='guess'&&s.discoveryDepth){if(s.discoveryDepth===1){s.discoveryDepth=2;event(s,type,{effect:'The first deeper hypothesis did not fit; offering an alternative'});}else{s.discoveryDepth=0;s.index++;event(s,type,{effect:'Neither deeper hypothesis fit; returning to the original direction'});}}
  else if(s.stage==='guess'){s.affinity[s.topic]-=1;if(!['local','app'].includes(s.source))s.topic=nextLens(s);s.index++;s.evidence=['demo','sample'].includes(s.source)?sampleEvidence[s.topic]||topics[s.topic].evidence:(s.evidence||[]);event(s,type,{effect:'撤下当前猜测，按探索记录换一个方向；不解释为永久厌恶'});}
  else if(s.stage==='plan'){const p=current(s);if(p)s.dismissed.push(p.id);event(s,type,{effect:'只换帮助方式，保留探索方向'});}
  return s;
 }
 if(type==='right'&&s.stage==='guess'){if(s.topic==='general'){s.interactionPreference='愿意让镜子主动猜测';s.stage='source-result';event(s,type,{effect:'仅记住交互方式偏好；未生成健康、意义或关系判断'});return s;}if(!s.discoveryDepth){s.discoveryDepth=1;event(s,type,{effect:'The member recognized the direction; exploring the underlying need'});return s;}s.deepChoice=s.discoveryDepth===1?'space':'clarity';s.weights[s.deepChoice==='space'?'focus':'depth']+=2;s.confirmedMemories=[...(s.confirmedMemories||[]).filter(m=>m.id!=='discovery-priority'),{id:'discovery-priority',kind:'preference',key:s.deepChoice==='space'?'focus':'depth',value:s.deepChoice==='space'?'Make room to act':'Find clarity before acting',source:'your response',at:Date.now()}];s.affinity[s.topic]=(s.affinity[s.topic]||0)+1;s.visits=s.visits||{};s.visits[s.topic]=(s.visits[s.topic]||0)+1;s.stage='plan';event(s,type,{effect:'将这一方向列为待探索假设，不确认为心理事实'});return s;}
 if(type==='deliver'&&s.stage==='plan'){
  const p=current(s);if(!p)return s;
  const governance=governanceReview(s,p,data);
  if(!governance.allow){s.notice='Confirm this example limit. A nod or swipe never charges you.';return s;}
  if(!utility.complete(p)){s.notice='Delivery check failed. No charge.';return s;}
  s.balance-=p.cost;s.results.push({...p,id:p.id+'-'+(s.seq+1),planId:p.id,created:Date.now()});s.stage='result';s.undo=null;event(s,type,{planId:p.id,cost:p.cost,governance,utility:utility.id,effect:'本地生成可保存的草稿，未联系外部服务'});return s;
 }
 if(type==='save-reflection'&&s.stage==='result'){const r=s.results.at(-1);if(r?.topic==='meaning'&&Array.isArray(data.notes)){const key=chosenRoute(r).key;r.reflectionNotes={...(r.reflectionNotes||{}),[key]:data.notes.slice(0,3).map(x=>String(x||'').trim().slice(0,300))};event(s,type,{effect:'Private reflection saved locally'});}return s;}
 if(type==='save-cost-view'&&s.stage==='result'){const r=s.results.at(-1);if(r?.topic==='health'){const v=['start','monthly','exit'].map(k=>Number(data[k]));const months=Number(data.months);if(v.every(x=>Number.isFinite(x)&&x>=0&&x<=10000000)&&Number.isInteger(months)&&months>=1&&months<=120){r.costInputs={start:v[0],monthly:v[1],exit:v[2],months,total:Math.round((v[0]+v[1]*months+v[2])*100)/100};event(s,type,{effect:'Member entered and saved a private cost comparison'});}}return s;}
 if(type==='save-connection-draft'&&s.stage==='result'){const r=s.results.at(-1);if(r?.topic==='connection'){r.connectionDraft=String(data.text||'').trim().slice(0,500);event(s,type,{effect:'Private draft saved locally; nothing sent'});}return s;}
 if(type==='save-health-schedule'&&s.stage==='result'){
  const r=s.results.at(-1),day=String(data.day||''),time=String(data.time||''),name=String(data.name||'').trim().slice(0,60),oralName=String(data.oralName||'').trim().slice(0,60),oralTime=String(data.oralTime||''),oralCondition=String(data.oralCondition||'').trim().slice(0,80);
  if(r?.topic!=='health'||!['周一','周二','周三','周四','周五','周六','周日','Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(day)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!name){s.notice='Enter a prescription name, day, and reminder time.';return s;}
  if(oralTime&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(oralTime)){s.notice='Check the oral medication reminder time.';return s;}
  r.schedule={name,day,time,oralName,oralTime,oralCondition};event(s,type,{effect:'仅保存本人录入的医嘱提醒时间；未验证处方或计算疗效'});return s;
 }
 if(s.stage==='result'&&['result-route','result-begin','result-step'].includes(type)){
  const r=s.results.at(-1);if(!r)return s;
  if(type==='result-route'){
   if(!(resultRoutes[r.topic]||resultRoutes.health).some(x=>x.key===data.route))return s;
   if(chosenRoute(r).key===data.route)return s;
   r.visualRoute=data.route;r.visualStarted=null;r.visualDone=0;
  }else if(type==='result-begin'){r.visualStarted=chosenRoute(r).key;r.visualDone=1;}
  else if(r.visualStarted===chosenRoute(r).key)r.visualDone=Math.min(3,(r.visualDone||0)+1);
  event(s,type,{effect:'本人选择或标记行动路径；未执行外部任务'});return s;
 }
 if(type==='feedback'&&s.stage==='result'){
  const p=s.results.at(-1);if(!p||p.feedback)return s;
  p.feedback=data.useful?'useful':'not-useful';for(const k of p.tags)s.weights[k]+=data.useful?2:-2;
  s.affinity[p.topic]=(s.affinity[p.topic]||0)+(data.useful?1:-1);
  event(s,type,{useful:data.useful,effect:'将实际交付反馈用于后续方案排序'});s.undo=null;return s;
 }
 if(type==='next'&&s.stage==='result'){if(s.source==='none'){s.stage='welcome';s.index=0;event(s,type,{effect:'A new source is needed to continue'});return s;}const n=['local','app'].includes(s.source)?{topic:s.topic,depth:true,reason:'Continue from the member-provided source without inventing another interest'}:nextNeed(s);s.topic=n.topic;s.needDepth=n.depth?(s.needDepth||0)+1:0;s.evidence=['demo','sample'].includes(s.source)?sampleEvidence[s.topic]||topics[s.topic].evidence:(s.evidence||[]);s.stage='guess';s.discoveryDepth=0;s.dismissed=[];s.index++;event(s,type,{effect:n.reason});return s;}
 return s;
}
