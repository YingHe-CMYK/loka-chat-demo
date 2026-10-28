import assert from 'node:assert/strict';
import { freshJourney, step } from './loop-engine.js';

let state = freshJourney();
state = step(state, 'sign-in');
state = step(state, 'agree-v1');
state = step(state, 'device-scan', { facts: [
  { label: 'Interface language', value: 'en-US' },
  { label: 'Time zone', value: 'America/Los_Angeles' }
] });
assert.equal(state.stage, 'scanning');
state = step(state, 'scan-complete');
assert.equal(state.source, 'device');
assert.equal(state.stage, 'source-result');
assert.deepEqual(state.evidence, []);
assert.ok(!state.localGuess);
state = step(state, 'sample-read');
assert.equal(state.source, 'sample');
assert.equal(state.stage, 'guess');
state = step(state, 'right');
state = step(state, 'right');
assert.equal(state.stage, 'plan');
state = step(state, 'council-start', { confirmed: true, mode: 'local' });
for (let i = 0; i < 20 && state.stage === 'review'; i++) state = step(state, 'council-next');
assert.equal(state.stage, 'result');
assert.equal(state.results.at(-1).sourceKind, 'sample');
assert.equal(state.results.at(-1).cost, 0);
console.log('PASS: no-file device consent, explicit sample, discovery and local result');
let direct = step(freshJourney(), 'sign-in');
direct = step(direct, 'device-scan', { facts: [{ label: 'Interface language', value: 'en-US' }], autoProfile: 'connection' });
direct = step(direct, 'scan-complete');
assert.equal(direct.deviceConsent, true);
assert.equal(direct.source, 'sample');
assert.equal(direct.stage, 'guess');
assert.equal(direct.topic, 'connection');
assert.equal(direct.browserContext[0].value, 'en-US');
assert.ok(direct.evidence.every(x => x.startsWith('Fictional')));
console.log('PASS: consent leads directly to a clearly fictional assigned guess without files');
