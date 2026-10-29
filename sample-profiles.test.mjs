import assert from 'node:assert/strict';
import { freshJourney, step } from './loop-engine.js';
import { hypothesisCopy } from './hypothesis-copy.js';

const expected = { focus: 'health', direction: 'meaning', connection: 'connection' };
const guesses = new Set();
for (const [profileId, topic] of Object.entries(expected)) {
  let s = step(freshJourney(), 'sign-in');
  s = step(s, 'sample-read', { profileId });
  assert.equal(s.topic, topic);
  assert.equal(s.sampleProfileId, profileId);
  assert.ok(s.evidence.every(x => x.startsWith('Fictional')));
  guesses.add(hypothesisCopy(s));
  s = JSON.parse(JSON.stringify(s));
  s = step(s, 'right');
  s = step(s, 'right');
  assert.equal(s.stage, 'plan');
  s = step(s, 'council-start', { confirmed: true, mode: 'local' });
  for (let i = 0; i < 20 && s.stage === 'review'; i++) s = step(s, 'council-next');
  assert.equal(s.stage, 'result');
  assert.equal(s.results.at(-1).topic, topic);
  assert.equal(s.results.at(-1).sourceKind, 'sample');
  assert.equal(s.sampleProfileId, profileId);
}
assert.equal(guesses.size, 3);
const appSignals = new Set();
for (const profileId of Object.keys(expected)) {
  let s = step(freshJourney(), 'sign-in');
  s = step(s, 'app-preview-connect', { app: 'oura', profileId });
  s = step(s, 'use-app-preview', { app: 'oura' });
  assert.equal(s.sampleProfileId, profileId);
  assert.ok(s.evidence[0].includes(s.previewSignal));
  assert.ok(hypothesisCopy(s).includes(s.previewSignal));
  appSignals.add(s.previewSignal);
}
assert.equal(appSignals.size, 3);
let preview = step(freshJourney(), 'sign-in');
preview = step(preview, 'app-preview-connect', { app: 'oura', profileId: 'direction' });
preview = step(preview, 'sample-read', { profileId: preview.previewProfileId });
assert.equal(preview.sampleProfileId, 'direction');
assert.equal(preview.topic, 'meaning');
console.log('PASS: entering a sample after preview retains the same assigned profile');
let switched = step(freshJourney(), 'sign-in');
switched = step(switched, 'sample-read', { profileId: 'focus' });
switched = step(switched, 'right'); switched = step(switched, 'right');
switched = step(switched, 'council-start', { confirmed: true, mode: 'local' });
for (let i = 0; i < 20 && switched.stage === 'review'; i++) switched = step(switched, 'council-next');
const previousResult = switched.results[0].id;
switched.dailyFeedback = { '2026-10-28': { health: 'no' } };
switched.dailyDraft = 'A draft belonging to the first example';
switched = step(switched, 'sample-read', { profileId: 'direction', switchProfile: true });
assert.equal(switched.topic, 'meaning');
assert.equal(switched.dailyFeedback, undefined);
assert.equal(switched.dailyDraft, undefined);
assert.match(hypothesisCopy(switched), /example notes return/i);
assert.equal(switched.results[0].id, previousResult);
assert.equal(switched.undo, null);
assert.deepEqual(switched.dismissed, []);
switched = step(switched, 'open-result', { id: previousResult });
assert.equal(switched.sampleProfileId, 'focus');
assert.equal(switched.previewProfileId, 'focus');
assert.equal(switched.results.at(-1).topic, 'health');
assert.equal(switched.dailyFeedback['2026-10-28'].health, 'no');
assert.equal(switched.dailyDraft, 'A draft belonging to the first example');
console.log('PASS: changing examples presents a fresh guess and preserves saved results');
let separated=step(freshJourney(),'sign-in');
separated.dailyFeedback={'2026-10-27':{health:'yes'}};
separated=step(separated,'sample-read',{profileId:'focus'});
assert.equal(separated.dailyFeedback,undefined);
separated.dailyFeedback={'2026-10-28':{health:'no'}};
separated=step(separated,'local-read',{topic:'research',count:1,guess:'A real source',evidence:['Selected text']});
assert.equal(separated.dailyFeedback['2026-10-27'].health,'yes');
assert.equal(separated.dailyFeedback['2026-10-28'],undefined);
console.log('PASS: personal and example daily feedback remain separate');
console.log('PASS: three stable fictional profiles lead to distinct guesses and matching results');

const {rank}=await import("./loop-engine.js");let ranked=freshJourney();ranked.stage="welcome";ranked=step(ranked,"sample-read",{profileId:"focus"});const first=rank(ranked)[0].id;ranked.results.push({planId:first,sourceKind:"sample",sampleProfileId:"direction"});assert.equal(rank(ranked)[0].id,first,"another sample must not penalize this profile");ranked.results.push({planId:first,sourceKind:"sample",sampleProfileId:"focus"});assert.notEqual(rank(ranked)[0].id,first,"the current sample should avoid its own repeated plan");

let back=freshJourney();back.stage="welcome";back=step(back,"sample-read",{profileId:"direction"});const originalEvidence=back.evidence.slice();back=step(back,"navigate-back");back=step(back,"connect",{source:"sample"});assert.equal(back.topic,"meaning");assert.deepEqual(back.evidence,originalEvidence);back=step(back,"correct",{key:"budget"});assert.equal(rank(back)[0].topic,"meaning");

let freshDirection=freshJourney();freshDirection.stage='welcome';freshDirection=step(freshDirection,'sample-read',{profileId:'focus'});freshDirection=step(freshDirection,'left');assert.notEqual(freshDirection.topic,'health');assert.match(freshDirection.evidence[0],/not a note from this profile/);assert.doesNotMatch(hypothesisCopy(freshDirection),/You keep returning|You have thought/);console.log('PASS: switching directions does not attribute another example profile’s notes');

let appSwitch=freshJourney();appSwitch.stage='welcome';appSwitch=step(appSwitch,'sample-read',{profileId:'direction'});appSwitch=step(appSwitch,'app-preview-connect',{app:'oura',profileId:'direction'});appSwitch=step(appSwitch,'use-app-preview',{app:'oura'});assert.equal(appSwitch.previewFocus,'oura');appSwitch=step(appSwitch,'left');assert.equal(appSwitch.previewFocus,null);assert.ok(appSwitch.evidence[0].includes('new example direction')||appSwitch.topic==='meaning');appSwitch=step(appSwitch,'undo');assert.equal(appSwitch.previewFocus,'oura');console.log('PASS: leaving an app example clears its focus and undo restores it');

{
  let state=freshJourney();
  state.stage='welcome';
  state=step(state,'sample-read',{profileId:'focus'});
  state=step(state,'app-preview-connect',{app:'calendar',profileId:'focus'});
  state=step(state,'use-app-preview',{app:'calendar'});
  assert.equal(state.previewFocus,'calendar');
  state=step(state,'app-preview-disconnect',{app:'calendar'});
  assert.equal(state.previewApps.calendar,false);
  assert.equal(state.previewFocus,null);
  assert.ok(!state.evidence.some(x=>x.includes('Fictional calendar signal')));
  console.log('PASS: disconnect removes the example signal from discovery');
}

{
 let state=freshJourney();state.stage='welcome';
 state=step(state,'app-preview-connect',{app:'calendar',profileId:'connection'});
 state=step(state,'use-app-preview',{app:'calendar'});
 assert.equal(state.topic,'connection');assert.equal(state.weights.focus,0);
 assert.match(state.previewSignal,/unscheduled evening/);
 console.log('PASS: calendar preview follows the assigned profile without inventing a preference');
}
