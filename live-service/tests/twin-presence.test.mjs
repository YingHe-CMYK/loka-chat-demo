import test from 'node:test';import assert from 'node:assert/strict';import {phase,correctionText} from '../public/twin-presence/state.mjs';
test('owner control dominates live network and speech state',()=>{assert.equal(phase({takeover:true,busy:true,mode:'speak'}),'takeover');assert.equal(phase({busy:true}),'thinking');assert.equal(phase({correcting:true}),'correcting');assert.equal(phase({mode:'speak'}),'responding');assert.equal(phase(), 'listening');assert.equal(phase({mode:'wait'}),'waiting')});
test('correction carries owner words to backend with bounded scope',()=>{const t=correctionText('Ask about expectations first');assert.match(t,/Ask about expectations first/);assert.match(t,/next question and proposed action/);assert.match(t,/not an established global trait/)});

import { deliveryMode } from '../public/twin-presence/proactive.mjs';

test('Twin delivers only a pending result in its relevant work context', () => {
  const ready = { pending: true, visible: true, present: true, relevant: true };
  assert.equal(deliveryMode(ready), 'preview');
  for (const state of [{ editing: true }, { visible: false }, { present: false }, { relevant: false }]) {
    assert.equal(deliveryMode({ ...ready, ...state }), 'badge');
  }
  for (const state of [{ paused: true }, { configuring: true }, { pending: false }]) {
    assert.equal(deliveryMode({ ...ready, ...state }), 'quiet');
  }
});

test('quiet intervals respect local time and span midnight', async () => {
  const { isQuietTime } = await import('../public/twin-presence/proactive.mjs');
  const at = (hour, minute) => new Date(2026, 10, 25, hour, minute);
  assert.equal(isQuietTime('22:00', '07:00', at(22, 0)), true);
  assert.equal(isQuietTime('22:00', '07:00', at(2, 0)), true);
  assert.equal(isQuietTime('22:00', '07:00', at(7, 0)), false);
  assert.equal(isQuietTime('09:00', '10:00', at(9, 10)), true);
  assert.equal(isQuietTime('', '07:00', at(2, 0)), false);
});

test('local file comparison reports reordered, repeated and blank lines', async () => {
  const { changedLines } = await import('../public/twin-presence/proactive.mjs');
  assert.deepEqual(changedLines('A\nB\nZ', 'B\nA\nZ'), { start: 1, previousCount: 2, currentCount: 2, removed: 'A\nB', added: 'B\nA' });
  assert.deepEqual(changedLines('A\nZ', 'A\nA\nZ'), { start: 2, previousCount: 0, currentCount: 1, removed: '', added: 'A' });
  assert.deepEqual(changedLines('A\n\nZ', 'A\nZ'), { start: 2, previousCount: 1, currentCount: 0, removed: '', added: '' });
  const separated = changedLines('旧期限\n未改\n旧负责人', '新期限\n未改\n新负责人');
  assert.deepEqual(separated.sections.map(({ start, removed, added }) => [start, removed, added]),
    [[1, '旧期限', '新期限'], [3, '旧负责人', '新负责人']]);
  const withInsertion = changedLines('旧期限\n未改\n旧负责人', '新期限\n新增行\n未改\n新负责人');
  assert.deepEqual(withInsertion.sections.map(({ start, removed, added }) => [start, removed, added]),
    [[1, '旧期限', '新期限\n新增行'], [3, '旧负责人', '新负责人']]);
  assert.equal(withInsertion.sections[1].currentStart, 4);
});

test('camera requires a stable return and tolerates a brief lost face', async () => {
  const { createPresenceTracker } = await import('../public/twin-presence/camera-detector.mjs');
  const sample = createPresenceTracker();
  assert.deepEqual([true, false, true, true, true].map(sample), [false, false, false, false, true]);
  assert.deepEqual([false, false, true, false, false, false, false, false].map(sample), [true, true, true, true, true, true, true, false]);
});

test('ambient loudness requires sustained sound and a quiet recovery period', async () => {
  const { createLoudnessTracker } = await import('../public/twin-presence/ambient-audio.mjs');
  const track = createLoudnessTracker();
  assert.equal(track([0, 0]), 'unknown');
  assert.equal(track([0.2, -0.2]), 'unknown');
  assert.equal(track([0.2, -0.2]), 'loud');
  for (let i = 0; i < 4; i++) assert.equal(track([0, 0]), 'loud');
  assert.equal(track([0, 0]), 'quiet');
});
