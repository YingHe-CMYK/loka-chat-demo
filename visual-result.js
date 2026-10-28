import {esc,icon,button} from './miro-ui-kit.js';

// The three lenses share navigation but produce different visual objects.
export const resultRoutes={
 health:[
  {key:'rhythm',label:'Treatment',title:'Start with a treatment review.',sub:'Your result',focus:'Review',steps:[],action:''},
  {key:'cost',label:'Cost',title:'See the full cost.',sub:'Your result',focus:'Cost',steps:[],action:''},
  {key:'questions',label:'Visit',title:'Bring three questions to your clinician.',sub:'Your result',focus:'Visit',steps:[],action:''}],
 meaning:[
  {key:'try',label:'Explore',title:'A different way to see this choice.',sub:'Three symbolic lenses, one decision.',focus:'Possibility',steps:[['What stays','Name what you do not want to lose.'],['What pulls you','Name the direction you keep returning to.'],['One trial','Try once without deciding your future.']],action:'Turn the first card'},
  {key:'keep',label:'Keep a way back',title:'Change can leave a way back.',sub:'Keep stability and exploration in view.',focus:'Room',steps:[['Anchor','Keep one condition that matters.'],['Opening','Try one small, low-cost move.'],['Return','Stop if it does not fit.']],action:'Turn the first card'}],
 research:[{key:'map',label:'Next test',title:'A question worth testing.',sub:'From your local documents',focus:'Research',steps:[['Source','One selected file'],['Question','One focused hypothesis'],['Next move','One small test']],action:'Reveal the next step'}],
 connection:[
  {key:'gentle',label:'Gentle start',title:'Start with one line.',sub:'Preview a message before sending.',focus:'Opening',steps:[['Opening','I thought of you and would like to catch up.'],['Space','No rush—reply when it works for you.'],['Time','Agree on a time only if they want to.']],action:'Preview the message'},
  {key:'meet',label:'Meet',title:'Make “sometime” concrete.',sub:'A topic and time you can edit.',focus:'Meet',steps:[['Topic','Choose one thing you want to talk about.'],['Two times','Pick times that work for you.'],['Reply','Nothing is sent without you.']],action:'Preview the invitation'}]

};

export function chosenRoute(result){const routes=resultRoutes[result.topic]||resultRoutes.health;const alternate=['health-budget','meaning-budget','connection-focus'].includes(result.planId);return routes.find(x=>x.key===result.visualRoute)||routes[alternate?1:0];}
const place=(title,detail,i,done)=>`<div class="scene-place ${i<done?'revealed':''}"><span>0${i+1}</span><b>${esc(title)}</b><small>${i<done?esc(detail):'Tap below to reveal'}</small></div>`;

function healthScene(route){
 const cost=route.key==='cost',visit=route.key==='questions';
 const main=cost?'<span class="health-result-kicker">TOTAL COST</span><strong>See the monthly cost.<br>Then decide.</strong><p>Visits · Treatment · Follow-up · Supplements</p>':visit?'<span class="health-result-kicker">FOR YOUR VISIT</span><strong>Ask three questions.</strong><p>Fit · Use · Follow-up</p>':'<span class="health-result-kicker">THIS WEEK</span><strong>Review first.<br>Then plan treatment.</strong><p>No prescription is connected, so there is no medication schedule yet.</p>';
 const cells=cost?['Start','Monthly','Exit']:visit?['Which option fits me?','How is it used?','When do I follow up?']:['01  Gather medicines and supplements','02  Bring them to a treatment review','03  Add the prescription to your week'];
 return `<section class="health-result ${esc(route.key)}"><div class="health-result-art" aria-hidden="true"><i></i><b></b></div><div class="health-result-main">${main}</div><div class="health-result-steps">${cells.map(x=>`<div>${esc(x)}</div>`).join('')}</div></section>`;
}

function healthSchedule(r){
 const a=r.schedule,set=Boolean(a?.day&&a?.time);
 if(!set)return healthScene({key:'rhythm'});
 return `<section class="health-result scheduled"><div class="health-result-art" aria-hidden="true"><i></i><b></b></div><div class="health-result-main"><span class="health-result-kicker">YOUR WEEK</span><strong>${esc(a.day)}<br>${esc(a.time)}</strong><p>${esc(a.name)} · Reminder from your entered prescription</p></div><div class="health-result-steps"><div>Added to your week</div>${a.oralName&&a.oralTime?`<div>${esc(a.oralName)} · daily ${esc(a.oralTime)}</div>`:''}</div></section>`;
}

function healthAction(r){const set=Boolean(r.schedule?.day&&r.schedule?.time);return `<details class="health-result-details"><summary>${set?'Edit schedule':'Add your prescription to the week'}</summary><p>Reminders use only the prescription you enter. Loka Chat does not infer medication timing from a wearable.</p><label for="med-name">Prescription name</label><input id="med-name" maxlength="60" value="${esc(r.schedule?.name||'')}" placeholder="Name on prescription"><label for="med-day">Day</label><select id="med-day"><option value="">Choose a day</option>${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<option value="${x}" ${r.schedule?.day===x?'selected':''}>${x}</option>`).join('')}</select><label for="med-time">Reminder time</label><input id="med-time" type="time" value="${esc(r.schedule?.time||'')}"><button data-action="save-health-schedule" class="primary full">Add to schedule</button></details>`;}

function meaningScene(route,done){return `<section class="scene-hero meaning-scene"><div class="scene-topline"><span>INNER / REFLECTION</span><span>SYMBOLIC LENS</span></div><div class="meaning-halo" aria-hidden="true"></div><div class="meaning-spread" aria-label="Three cards that open one by one">${route.steps.map(([title],i)=>`<div class="meaning-tile tile-${i+1} ${i<done?'open':''}"><span>0${i+1}</span><i aria-hidden="true"></i><b>${i<done?esc(title):' · · · '}</b></div>`).join('')}</div><p class="meaning-caption">${done?esc(route.steps[done-1][1]):'Keep · Reach · Try'}</p></section><p class="scene-verification meaning-note">Symbolic reflection only. No fate claim or mental-health assessment.</p>`;}

function connectionScene(route,done){const meet=route.key==='meet';return `<section class="scene-hero connection-scene"><div class="scene-topline"><span>BETWEEN / TWO PEOPLE</span><span>PRIVATE PREVIEW</span></div><div class="connection-line" aria-hidden="true"><div class="person-dot">You</div><i></i><div class="person-dot other">Friend</div></div><div class="message-preview ${done?'shown':''}"><span>UNSENT MESSAGE</span><p>${done?esc(meet?'I thought of you. Could we find a time to talk?':'I thought of you and would like to catch up sometime.'):'See what an opening might sound like.'}</p></div><div class="connection-options"><span class="${done>1?'visible':''}">Leave room to reply</span><span class="${done>2?'visible':''}">Agree on time together</span></div><div class="not-sent-mark">${icon('shield')} No message sent · No profile shared</div></section>`;}

function researchScene(r){const claim=r.sourceFocus?`Test whether ${r.sourceFocus.replace(/[.!?]+$/,'')}.`:'Define one testable claim from your documents.';return `<section class="health-result research"><div class="health-result-art" aria-hidden="true"><i></i><b></b></div><div class="health-result-main"><span class="health-result-kicker">FROM YOUR MAC</span><strong>${esc(claim)}</strong><p>${esc(r.sourceExcerpt||'Your selected note')}</p></div><div class="health-result-steps"><div>1 · Set a baseline</div><div>2 · Run one controlled comparison</div><div>3 · Decide what the result changes</div></div></section>`;}

export function visualResult(r){const routes=resultRoutes[r.topic]||resultRoutes.health,route=chosenRoute(r),active=r.visualStarted===route.key,done=active?r.visualDone||0:0;
 const health=r.topic==='health';
 const scene=health?(route.key==='rhythm'&&r.schedule?healthSchedule(r):healthScene(route)):r.topic==='research'?researchScene(r):r.topic==='meaning'?meaningScene(route,done):connectionScene(route,done);
 const next=health||r.topic==='research'||done>=3?'':button(active?'result-step':'result-begin',active?`${r.topic==='meaning'?'Turn next card':'See next step'} ${icon('arrow')}`:`${esc(route.action)} ${icon('arrow')}`,'primary full');
 return `<div class="outcome ${esc(r.topic)}"><div class="outcome-heading"><span>04 / YOUR RESULT</span></div>${health||r.topic==='research'?'':`<h1 class="scene-headline">${esc(route.title)}</h1><p class="scene-subline">${esc(route.sub)}</p>`}${scene}${r.topic==='research'?'':`<div class="route-tabs" role="group" aria-label="Change result view">${routes.map(x=>`<button data-action="result-route" data-route="${x.key}" aria-pressed="${x.key===route.key}">${esc(x.label)}</button>`).join('')}</div>`}${health&&route.key==='rhythm'?healthAction(r):''}${next}${health?`<details class="result-provenance"><summary>Why this result</summary><p>${r.sourceKind==='local'?`Based on a local document: ${esc(r.sourceTitle||'selected file')}.`:'Based on a fictional researcher sample.'} No prescription or medical record is connected. This is not personal medical advice.</p></details>`:r.topic==='research'?'<details class="result-provenance"><summary>Source</summary><p>Based on local documents and your reply. No experiment has been run.</p></details>':`<p class="outcome-note">${r.topic==='meaning'?'Symbolic reflection · No psychological or fate claim':'Message preview · Not sent'}</p>`}</div>`;
}
