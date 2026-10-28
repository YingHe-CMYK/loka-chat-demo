import assert from 'node:assert/strict';
import {dispatchDirection} from './body-controls.js';
import {swipeDecision} from './miro-ui-kit.js';
import {quote} from './council-sim.js';
let called;dispatchDirection('right','plan',(type,data)=>called={type,data},()=>{throw Error('unexpected payment panel')});assert.deepEqual(called,{type:'council-start',data:{confirmed:true,mode:'local'}});assert.equal(quote('local').reduce((n,x)=>n+x.cost,0),0);
assert.equal(swipeDecision(100,10,320),'right');assert.equal(swipeDecision(-100,10,320),'left');assert.equal(swipeDecision(25,100,320),null);console.log('PASS: swipe direction and body-triggered plan use the zero-cost local path');
