export function bodyIntent(signal,stage,paused=false){
 if(signal==='stop')return 'pause';
 if(signal==='resume'&&paused)return 'resume';
 if(paused)return null;
 if(['gaze','smile','frown'].includes(signal))return 'notice';
 if(['nod','resume','start'].includes(signal))return ['guess','plan'].includes(stage)?'right':stage==='result'?'helpful':null;
 if(signal==='next')return ['guess','plan'].includes(stage)?'left':stage==='result'?'unhelpful':null;
 if(signal==='free'&&['guess','plan'].includes(stage))return 'budget';
 return null;
}
export function bodyGuide(stage){return stage==='result'?'Nod: useful · Shake: not useful':stage==='review'?'Preparing · Say Stop to pause':stage==='welcome'?'Connect a source, then nod or shake':'Nod: continue · Shake: another';}
export function dispatchDirection(intent,stage,act,show){
 if(intent==='left'&&['guess','plan'].includes(stage)){act('left');return true;}
 if(intent==='right'&&stage==='guess'){act('right');return true;}
 if(intent==='right'&&stage==='plan'){show('delivery');return true;}
 return false;
}
