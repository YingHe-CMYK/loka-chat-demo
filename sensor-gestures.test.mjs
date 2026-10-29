import assert from 'node:assert/strict';
import {GestureInterpreter,speechCommand} from './sensor-gestures.js';
import {bodyIntent} from './body-controls.js';
const base={pitch:0,yaw:0,eyeX:0,eyeY:0,blink:0,smile:0,brow:0};
const calibrated=()=>{const g=new GestureInterpreter();for(let i=0;i<20;i++)g.consume(base,i*100);return g;};
{
 const g=calibrated();g.consume({...base,pitch:.16},2100);
 assert.equal(g.consume(base,2300).event,'nod');
 assert.equal(bodyIntent('nod','guess'),'right');
 assert.notEqual(g.consume({...base,pitch:.16},2400).event,'nod');
}
{
 const g=calibrated();g.consume({...base,yaw:.17},2100);
 assert.equal(g.consume({...base,yaw:-.17},2300).event,'next');
 assert.equal(bodyIntent('next','guess'),'left');
}
{
 const g=calibrated();g.consume({...base,pitch:.16},2100);g.consume(null,2200);
 assert.notEqual(g.consume(base,2400).event,'nod');
 assert.equal(speechCommand('Continue'),'resume');
 assert.equal(bodyIntent(speechCommand('Continue'),'guess'),'right');
 assert.equal(speechCommand('Do not continue'),null);
 assert.equal(bodyIntent('resume','guess',true),'resume');
}
console.log('PASS: synthetic nod, shake, lost face, voice command and cooldown');
