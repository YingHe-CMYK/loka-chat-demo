import assert from 'node:assert/strict';
import {learnFromFiles} from './local-reader.js';
import {freshJourney,step,rank} from './loop-engine.js';
import {hypothesisCopy} from './hypothesis-copy.js';
import {visualResult} from './visual-result.js';
const legacySample={source:'sample',topic:'health',index:0,results:[],localGuess:'Your notes link treatment decisions with uninterrupted research time. Is protecting your focus the real priority?'};assert.match(hypothesisCopy(legacySample),/^The example notes/);console.log('PASS: older sample data is not described as the member’s own notes');
const a=new File(['Research model training experiment. The deadline for the paper is Friday.'], 'notes.txt');
const b=new File(['Research model experiment. I am comparing several baselines.'], 'other.txt');
const time=await learnFromFiles([a]);const choice=await learnFromFiles([b]);
assert.equal(time.topic,'research');assert.match(time.probe,/deadlines/);assert.match(time.evidence[0],/deadline/);assert.doesNotMatch(time.guess,/notes\.txt/);assert.match(choice.probe,/comparisons/);assert.notEqual(time.probe,choice.probe);
let s=freshJourney();s=step(s,'sign-in');s=step(s,'local-read',time);assert.equal(s.stage,'guess');s=step(s,'right');assert.match(hypothesisCopy(s),/deadlines/);s=step(s,'left');assert.doesNotMatch(hypothesisCopy(s),/deadlines/);
const general=await learnFromFiles([new File(['Shopping list: apples and pears.'],'list.txt')]);assert.equal(general.topic,'general');assert.equal(general.probe,'');console.log('PASS: selected source cues produce different, traceable questions');
const life=await learnFromFiles([new File(['Research model experiment. I want to spend evenings with family.'], 'journal.txt')]);assert.match(life.probe,/life outside work/);assert.match(life.evidence[0],/family/);console.log('PASS: cross-domain cue is grounded in the selected text');
let q=freshJourney();q=step(q,'sign-in');q=step(q,'local-read',choice);q=step(q,'right');q=step(q,'right');assert.equal(q.deepChoice,'clarity');assert.equal(q.stage,'plan');let t=freshJourney();t=step(t,'sign-in');t=step(t,'local-read',time);t=step(t,'right');t=step(t,'right');assert.equal(t.deepChoice,'space');console.log('PASS: different grounded needs lead to different plan priorities');
let z=freshJourney();z=step(z,'sign-in');z=step(z,'local-read',life);z=step(z,'right');assert.match(hypothesisCopy(z),/life outside work/);z=step(z,'right');assert.equal(z.deepNeed,'life-space');z=step(z,'council-start',{confirmed:true,mode:'local'});for(let i=0;i<20&&z.stage==='review';i++)z=step(z,'council-next');assert.equal(z.stage,'result');assert.equal(z.results.at(-1).deepNeed,'life-space');assert.match(z.results.at(-1).workPlan.steps[0].action,/life outside work/);assert.match(visualResult(z.results.at(-1)),/Protect time outside work/);console.log('PASS: accepted deeper life need changes the delivered plan');
let undo=freshJourney();undo=step(undo,'sign-in');undo=step(undo,'local-read',life);undo=step(undo,'right');undo=step(undo,'right');assert.equal(undo.deepNeed,'life-space');undo=step(undo,'undo');assert.equal(undo.deepNeed,null);assert.ok(!(undo.confirmedMemories||[]).some(x=>x.id==='discovery-priority'));console.log('PASS: undo retracts the accepted need and its saved preference');
const filenameOnly=await learnFromFiles([new File(['Apples, pears, and oranges.'],'research-model-health.txt')]);assert.equal(filenameOnly.topic,'general');assert.equal(filenameOnly.probe,'');console.log('PASS: a filename alone does not become a personal inference');
let unhelpful=step(z,'feedback',{useful:false});unhelpful=step(unhelpful,'next');assert.equal(unhelpful.needDepth,0);assert.doesNotMatch(hypothesisCopy(unhelpful),/protect time outside research/i);assert.equal(unhelpful.source,'local');console.log('PASS: unhelpful result changes the next question without inventing a new source');
z=step(z,'next');assert.equal(z.deepNeed,null);assert.equal(z.deepChoice,null);assert.match(hypothesisCopy(z),/protect time outside research/i);let alternate=step(z,'left');assert.doesNotMatch(hypothesisCopy(alternate),/protect time outside research/i);let forgotten=step(z,'delete-memory',{id:'discovery-priority'});assert.doesNotMatch(hypothesisCopy(forgotten),/protect time outside research/i);console.log('PASS: a confirmed need informs one follow-up, respects correction and removal');
let remembered=freshJourney();remembered=step(remembered,'sign-in');remembered=step(remembered,'local-read',life);remembered=step(remembered,'right');remembered=step(remembered,'right');assert.match(remembered.confirmedMemories.find(x=>x.id==='discovery-priority').value,/life outside work/);remembered=step(remembered,'delete-memory',{id:'discovery-priority'});assert.equal(remembered.deepNeed,null);assert.ok(!remembered.confirmedMemories.some(x=>x.id==='discovery-priority'));console.log('PASS: the accepted deeper need is visible and removable');
let past=freshJourney();past=step(past,'sign-in');past=step(past,'local-read',life);past=step(past,'right');past=step(past,'right');past=step(past,'council-start',{confirmed:true,mode:'local'});for(let i=0;i<20&&past.stage==='review';i++)past=step(past,'council-next');const pastId=past.results.at(-1).id;past=step(past,'delete-memory',{id:'discovery-priority'});past=step(past,'open-result',{id:pastId});assert.equal(past.deepNeed,null);assert.equal(past.results.at(-1).deepNeed,'life-space');console.log('PASS: a saved result does not restore a removed preference');
assert.equal(time.role,'Possible ML researcher');assert.equal(general.role,'');assert.equal(filenameOnly.role,'');console.log('PASS: role hypothesis requires content evidence, not a filename');
const {mirrorStage}=await import('./mirror-stage.js');const visible=mirrorStage('guess',null,hypothesisCopy(t),t);assert.match(visible,/Possible ML researcher/);assert.doesNotMatch(visible,/notes\.txt/);console.log('PASS: content-based role is visible without exposing a filename as identity');

let undoNext=structuredClone(past);undoNext.needDepth=2;undoNext.followUpIndex=17;undoNext.localGuess="Previous question";undoNext.previewFocus="oura";const beforeNext=structuredClone(undoNext);undoNext=step(undoNext,"next");undoNext=step(undoNext,"undo");for(const k of ["stage","needDepth","followUpIndex","localGuess","previewFocus"])assert.deepEqual(undoNext[k],beforeNext[k],k);

let mixed=freshJourney();mixed=step(mixed,"sign-in");mixed=step(mixed,"local-read",life);mixed=step(mixed,"right");mixed=step(mixed,"right");mixed=step(mixed,"correct",{key:"focus"});mixed=step(mixed,"correct",{key:"focus"});assert.equal(mixed.weights.focus,6);mixed=step(mixed,"delete-memory",{id:"preference-focus"});assert.equal(mixed.weights.focus,2);mixed=step(mixed,"delete-memory",{id:"discovery-priority"});assert.equal(mixed.weights.focus,0);

let budgetChange=freshJourney();budgetChange.stage="guess";budgetChange=step(budgetChange,"correct",{key:"budget"});assert.equal(budgetChange.cap,0);budgetChange=step(budgetChange,"budget",{cap:3});assert.equal(budgetChange.cap,3);assert.ok(!(budgetChange.confirmedMemories||[]).some(m=>m.id==="preference-budget"));assert.equal(budgetChange.weights.budget,0);

let recovery=freshJourney();recovery.stage="guess";recovery.source="sample";recovery=step(recovery,"right");recovery=step(recovery,"right");assert.equal(recovery.stage,"plan");while(rank(recovery).length)recovery=step(recovery,"left");recovery=step(recovery,"recover-plans");assert.equal(recovery.stage,"guess");assert.equal(recovery.discoveryDepth,0);assert.equal(recovery.deepChoice,null);

let free=freshJourney();free.stage='welcome';free=step(free,'sample-read',{profileId:'focus'});free=step(free,'correct-note',{text:'I miss making things with other people.'});assert.equal(free.stage,'guess');assert.equal(free.confirmedMemories.at(-1).value,'I miss making things with other people.');assert.ok(free.evidence[0].includes('I miss making things'));free=step(free,'undo');assert.ok(!free.correctionText);assert.ok(!free.confirmedMemories.some(m=>m.id==='correction-note'));console.log('PASS: free-form correction remains editable and reversible without pretending to interpret it');

{
 let state=freshJourney();state.stage='welcome';
 state=step(state,'sample-read',{profileId:'focus'});
 state=step(state,'correct-note',{text:'I miss making things with other people.'});
 state=step(state,'right');
 assert.match(hypothesisCopy(state),/I miss making things with other people/);
 console.log('PASS: the follow-up keeps the written correction in context');
}

{
 let state=freshJourney();state.stage='welcome';state=step(state,'sample-read',{profileId:'focus'});
 state=step(state,'correct-note',{text:'A private correction'});
 state=step(state,'right');state=step(state,'right');
 state=step(state,'council-start',{confirmed:true,mode:'local'});
 for(let i=0;i<20&&state.stage==='review';i++)state=step(state,'council-next');
 const id=state.results.at(-1).id;
 assert.ok(state.results.at(-1).sourceEvidence.some(x=>x.includes('A private correction')));
 state=step(state,'delete-memory',{id:'correction-note'});
 state=step(state,'open-result',{id});
 assert.ok(!state.evidence.some(x=>x.includes('A private correction')));
 assert.ok(!state.results.at(-1).sourceEvidence.some(x=>x.includes('A private correction')));
 console.log('PASS: deleting a correction also clears it from saved result context');
}

{
 let state=freshJourney();state.stage='welcome';state=step(state,'sample-read',{profileId:'focus'});
 state=step(state,'correct-note',{text:'I miss making things with other people.'});
 state=step(state,'right');const first=hypothesisCopy(state);
 state=step(state,'left');const alternative=hypothesisCopy(state);
 assert.notEqual(first,alternative);
 assert.match(alternative,/I miss making things with other people/);
 console.log('PASS: changing direction after a correction offers a different question');
}

{
 let state=freshJourney();state.stage='welcome';state=step(state,'sample-read',{profileId:'focus'});
 state=step(state,'correct-note',{text:'I miss making things with other people.'});
 state=step(state,'right');state=step(state,'right');
 assert.equal(state.stage,'plan');
 assert.equal(state.deepChoice,null);
 assert.ok(!(state.confirmedMemories||[]).some(m=>m.id==='discovery-priority'));
 console.log('PASS: accepting a correction follow-up does not invent a preference');
}
{
 const source=await learnFromFiles([new File(['I want to reconnect with a friend. An unfinished conversation has stopped me from reaching out.'],'note.txt')]);
 assert.equal(source.planHint,'connection-private');
 let state=step(freshJourney(),'sign-in');state=step(state,'local-read',source);assert.match(hypothesisCopy(state),/unfinished conversation/i);state=step(state,'right');assert.equal(state.stage,'plan');assert.equal(rank(state)[0].id,'connection-private');
 state=step(state,'undo');assert.equal(state.acceptedPlanId,null);state=step(state,'right');state=step(state,'correct',{key:'focus'});assert.equal(state.acceptedPlanId,null);
 console.log('PASS: combined clues guide the accepted plan and correction can override it');
}
{
 const examples=[
  ['Prescription injection schedule calendar. I am comparing options and uncertain about treatment costs.','health','health-budget'],
  ['My bazi notes: I am uncertain and comparing which option to choose for my career change.','meaning','meaning-reflect'],
  ['I want to reconnect with a friend. An unfinished conversation has stopped me from reaching out.','connection','connection-private']
 ];
 for(const [text,topic,plan] of examples){const source=await learnFromFiles([new File([text],'notes.txt')]);assert.equal(source.topic,topic);assert.equal(source.planHint,plan);let state=step(freshJourney(),'sign-in');state=step(state,'local-read',source);state=step(state,'right');if(state.stage==='guess')state=step(state,'right');assert.equal(state.stage,'plan');assert.equal(rank(state)[0].id,plan);}
 console.log('PASS: health, four pillars and relationship clues lead to their matched plans');
}
