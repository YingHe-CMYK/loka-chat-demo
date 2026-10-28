import assert from 'node:assert/strict';
import {freshJourney,step} from './loop-engine.js';
import {visualResult} from './visual-result.js';
let s=freshJourney();s.stage='result';s.results=[{id:'cost',topic:'health',planId:'health-budget'}];
s=step(s,'save-cost-view',{start:'100',monthly:'20',exit:'50',months:'12'});
assert.equal(s.results[0].costInputs.total,390);assert.match(visualResult(s.results[0]),/390/);
s=step(s,'save-cost-view',{start:'-1',monthly:'20',exit:'50',months:'12'});assert.equal(s.results[0].costInputs.total,390);
s.results=[{id:'reflection',topic:'meaning',planId:'meaning-reflect'}];s=step(s,'result-begin');assert.equal(s.results[0].visualDone,1);
s=step(s,'save-reflection',{notes:['Keep my independence','Learn something new','']});assert.match(visualResult(s.results[0]),/Keep my independence/);
s.results=[{id:'connection',topic:'connection',planId:'connection-private',visualStarted:'gentle',visualDone:1}];s=step(s,'save-connection-draft',{text:'A unique private draft'});assert.match(visualResult(s.results[0]),/A unique private draft/);
console.log('PASS: cost view, first reveal, reflection and private draft');

const emptyDraft=visualResult({topic:"connection",planId:"connection-private",connectionDraft:"",visualStarted:"gentle",visualDone:1});assert.match(emptyDraft,/<textarea id="connection-draft" maxlength="500"><\/textarea>/);assert.doesNotMatch(emptyDraft,/I thought of you and would like to catch up sometime/);

const appHealth=visualResult({topic:"health",planId:"health-focus",sourceKind:"app",schedule:{name:"Example",day:"Mon",time:"09:00"}});assert.match(appHealth,/Based on the connected source/);assert.match(appHealth,/entered by you and has not been verified/);assert.doesNotMatch(appHealth,/fictional researcher sample/);

s.results=[{id:"switch",topic:"connection",planId:"connection-focus"}];s=step(s,"result-begin");s=step(s,"result-step");s=step(s,"result-route",{route:"gentle"});assert.equal(s.results[0].visualDone,0);s=step(s,"result-route",{route:"meet"});assert.equal(s.results[0].visualDone,2);assert.match(visualResult(s.results[0]),/Your private draft/);

let revealed={topic:"meaning",planId:"meaning-reflect",visualStarted:"try",visualDone:3};const allInsights=visualResult(revealed);assert.match(allInsights,/Name what you do not want to lose/);assert.match(allInsights,/Name the direction you keep returning to/);assert.match(allInsights,/Try once without deciding your future/);

let schedule=freshJourney();schedule.stage='result';schedule.results=[{id:'schedule',topic:'health',planId:'health-focus',schedule:{name:'Old',day:'Mon',time:'09:00'},scheduleDraft:{name:'New',day:'Tue',time:'10:30'}}];let pending=visualResult(schedule.results[0]);assert.match(pending,/value="New"/);assert.match(pending,/Draft not yet added to the week/);assert.equal(schedule.results[0].schedule.name,'Old');schedule=step(schedule,'save-health-schedule',{name:'New',day:'Tue',time:'10:30'});assert.equal(schedule.results[0].schedule.name,'New');assert.equal(schedule.results[0].scheduleDraft,undefined);assert.match(visualResult(schedule.results[0]),/class="schedule-pending" role="status" hidden/);console.log('PASS: schedule edits remain drafts until explicitly applied');
