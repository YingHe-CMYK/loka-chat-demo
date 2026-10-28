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
