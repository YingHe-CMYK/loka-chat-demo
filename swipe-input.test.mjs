import assert from 'node:assert/strict';
import { mountSwipe } from './miro-ui-kit.js';

globalThis.matchMedia = () => ({ matches: true });
const card = {
  classList: { remove() {}, add() {} },
  style: { removeProperty() {}, setProperty() {} },
  dataset: {}, isConnected: true, clientWidth: 320
};
let swipes = 0;
mountSwipe(card, () => swipes++);
let prevented = false;
card.onkeydown({ target: {}, key: 'ArrowRight', preventDefault() { prevented = true; } });
assert.equal(prevented, false, 'an arrow in a nested input must remain a cursor movement');
await new Promise(resolve => setTimeout(resolve, 5));
assert.equal(swipes, 0);
card.onkeydown({ target: card, key: 'ArrowRight', preventDefault() { prevented = true; } });
await new Promise(resolve => setTimeout(resolve, 5));
assert.equal(prevented, true);
assert.equal(swipes, 1, 'a focused card still supports keyboard swipe');
console.log('PASS: card arrow keys do not intercept nested form controls');
