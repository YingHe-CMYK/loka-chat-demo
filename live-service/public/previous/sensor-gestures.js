// Geometry-only gesture interpretation. No identity or emotion inference.
export class GestureInterpreter {
 constructor(){this.reset();}
 reset(){this.samples=[];this.base=null;this.motion=null;this.hold={};this.last=-Infinity;this.gazeAt=null;this.attentionSent=false;this.expression=null;}
 consume(f,now){
  if(!f){this.motion=null;this.gazeAt=null;this.attentionSent=false;this.hold={};return {status:'Keep one face centered in view'};}
  if(!this.base){
   this.samples.push(f);if(this.samples.length>20)this.samples.shift();
   const stable=this.samples.length===20&&['pitch','yaw'].every(k=>Math.max(...this.samples.map(x=>x[k]))-Math.min(...this.samples.map(x=>x[k]))<.12);
   if(stable){this.base={};for(const k of ['pitch','yaw','eyeX','eyeY'])this.base[k]=this.samples.reduce((a,x)=>a+x[k],0)/20;return {status:'Ready · Nod or shake naturally'};}
   return {status:'Look at the screen for two seconds · '+Math.round(this.samples.length/20*100)+'%'};
  }
  const p=f.pitch-this.base.pitch,y=f.yaw-this.base.yaw;
  const attentive=Math.abs(p)<.17&&Math.abs(y)<.20&&Math.abs(f.eyeX-this.base.eyeX)<.13&&Math.abs(f.eyeY-this.base.eyeY)<.10&&f.blink<.45;
  const emit=event=>{if(event==='nod'||event==='next')this.last=now;this.motion=null;this.gazeAt=null;return {event,status:({gaze:'Looking at the screen',nod:'Nod detected',next:'Head shake detected',smile:'Smile detected',frown:'Brow movement detected'})[event]};};
  if(now-this.last<1000)return {status:'Response received · Ready shortly'};
  if(this.motion&&now-this.motion.at>1700)this.motion=null;
  if(Math.abs(y)>.13&&Math.abs(p)<.20){
   if(this.motion?.axis==='yaw'&&Math.sign(y)!==this.motion.sign&&now-this.motion.at>100)return emit('next');
   if(!this.motion)this.motion={axis:'yaw',sign:Math.sign(y),at:now};
  }else if(Math.abs(p)>.11&&Math.abs(y)<.17&&!this.motion){this.motion={axis:'pitch',at:now};}
  if(this.motion?.axis==='pitch'&&Math.abs(p)<.06&&Math.abs(y)<.17&&now-this.motion.at>120)return emit('nod');
  // Expressions trigger presentation changes, never infer how the person feels.
  const expression=f.smile>.55?'smile':f.brow>.45?'frown':null;
  if(!expression){this.expression=null;this.hold.expression=null;}
  else if(attentive&&!this.motion&&expression!==this.expression){
   if(this.hold.expression?.name!==expression)this.hold.expression={name:expression,at:now};
   else if(now-this.hold.expression.at>550){this.expression=expression;return emit(expression);}
  }
  if(!attentive){this.gazeAt=null;this.attentionSent=false;}
  else if(!this.motion&&!expression&&!this.attentionSent){if(this.gazeAt===null)this.gazeAt=now;else if(now-this.gazeAt>1100){this.attentionSent=true;return emit('gaze');}}
  return {status:attentive?'Looking at the screen · Waiting for a response':'Looking away or moving'};
 }
}
export function frameFeatures(result){
 const l=result.faceLandmarks?.[0],m=result.facialTransformationMatrixes?.[0]?.data;
 if(!l||!m||result.faceLandmarks.length!==1||l.length<478)return null;
 const scores=Object.fromEntries((result.faceBlendshapes?.[0]?.categories||[]).map(x=>[x.categoryName,x.score]));
 const eye=(a,b,c)=>{const width=Math.hypot(l[a].x-l[b].x,l[a].y-l[b].y);return {x:(l[c].x-(l[a].x+l[b].x)/2)/width,y:(l[c].y-(l[a].y+l[b].y)/2)/width};};
 const left=eye(33,133,468),right=eye(362,263,473);
 return {pitch:Math.atan2(m[6],m[10]),yaw:Math.atan2(-m[2],Math.hypot(m[0],m[1])),eyeX:(left.x+right.x)/2,eyeY:(left.y+right.y)/2,blink:Math.max(scores.eyeBlinkLeft||0,scores.eyeBlinkRight||0),smile:((scores.mouthSmileLeft||0)+(scores.mouthSmileRight||0))/2,brow:((scores.browDownLeft||0)+(scores.browDownRight||0))/2};
}
export function speechCommand(text){
 const t=text.trim().toLowerCase().replace(/[，。！？、,.!?\s]/g,'');
 // Whole-utterance matching prevents negated or quoted partial commands executing.
 const commands={next:['换一个','换个方向','下一个','next','another','change'],free:['不要花钱','不想花钱','免费一点','只要免费的','free','nospending','donotspend'],start:['帮我安排','替我安排','开始安排','start'],save:['就这样','留下这个','保存安排','save'],stop:['停一下','停止','暂停','stop','pause'],resume:['继续','恢复','resume','continue'],gaze:['展开看看','展开','showme'],nod:['想看看','继续看看','是的','yes']};
 return Object.keys(commands).find(k=>commands[k].includes(t))||null;
}
