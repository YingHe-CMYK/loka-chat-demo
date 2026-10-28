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
console.log('PASS: three stable fictional profiles lead to distinct guesses and matching results');
