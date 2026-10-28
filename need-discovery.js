// The visible mirror reflects reversible hypotheses, never diagnoses or personality facts.
export const lenses={
 general:{name:'Interaction',motive:'Agency',cue:'Your selected files',thought:'I can ask about what you chose to share.',contrast:'A file alone cannot explain what matters to you.',probe:'Ask one grounded question'},
 research:{name:'Research',motive:'Focus',cue:'Your selected research file',thought:'This may be the question taking most of your attention.',contrast:'Your reply decides whether to follow it.',probe:'Map one testable next step'},
 health:{name:'Health',motive:'Agency',cue:'Your selected health note',thought:'You may be looking for a way to fit treatment into daily life.',contrast:'Does the result matter most, or the routine around it?',probe:'Compare treatment goals with your week'},
 meaning:{name:'Meaning',motive:'Change',cue:'Your selected note',thought:'You may be returning to a choice you have not made yet.',contrast:'Is the answer unclear, or is taking the step difficult?',probe:'Separate what you keep from what you change'},
 connection:{name:'Connection',motive:'Understanding',cue:'Your selected note',thought:'You may want a conversation that does not require explaining everything again.',contrast:'Is this about seeing someone, or feeling understood?',probe:'Try one opening line'}
};
export const lensOrder=['health','meaning','connection'];
export function initialLens(topicEvidence){return lensOrder.slice().sort((a,b)=>(topicEvidence[b]?.evidence?.length||0)-(topicEvidence[a]?.evidence?.length||0)||lensOrder.indexOf(a)-lensOrder.indexOf(b))[0];}
export function lensScore(s,k){const w=s.weights||{},v=s.visits||{};
 const preference=k==='health'?.6*(w.focus||0):k==='meaning'?.7*(w.depth||0)+.3*(w.private||0):.7*(w.budget||0)+.4*(w.focus||0);
 return (s.affinity?.[k]||0)+preference-4*(v[k]||0);
}
export function nextLens(s){const current=s.topic;return lensOrder.filter(k=>k!==current).sort((a,b)=>lensScore(s,b)-lensScore(s,a)||lensOrder.indexOf(a)-lensOrder.indexOf(b))[0]||current;}
export function nextNeed(s){const last=s.results?.at(-1),visits=s.visits?.[s.topic]||0;if(last?.feedback!=='not-useful'&&visits<2)return {topic:s.topic,depth:true,reason:'先沿刚才的需要追问一层；这仍是假设，可以随时纠正'};const topic=nextLens(s);return {topic,depth:false,reason:last?.feedback==='not-useful'?'刚才的办法没有贴近你；我会重新解释线索，尝试更符合你回应的方向':'我会结合你的回应和还没解释清楚的线索，提出新的需要假设'};}
export function nextLensReason(s,k){if(k==='connection'&&(s.weights?.budget||0)>0)return '你说过想控制花费，我先探索不靠消费的人际连接';if(k==='meaning'&&((s.weights?.depth||0)>0||(s.weights?.private||0)>0))return '你希望更深入或先私下探索，我先换一个看意义的角度';return '换一面试试，避免只从一个场景理解你';}
export function mirrorReading(s){const l=lenses[s.topic]||lenses.general,signals=s.signals||[],confirmed=s.stage==='plan'||(s.visits?.[s.topic]||0)>0;
 const seen=Object.keys(s.visits||{}).filter(k=>(s.visits[k]||0)>0);
 const bridge=seen.includes('health')&&seen.includes('meaning')?'Both choices seem connected to keeping room for your own decisions.':seen.includes('health')&&seen.includes('connection')?'Both health and connection may involve not carrying every decision alone.':seen.includes('meaning')&&seen.includes('connection')?'You may be seeking a place where you feel understood.':'';
 const reaction=signals.some(x=>x.topic===s.topic)?'I noticed your reaction to this card. It is only a clue.':s.needDepth?'Your last response gave me a reason to ask one level deeper.':s.source==='local'?'This comes from a file you selected.':s.source==='device'?'This is based only on what you did inside Loka Chat.':'This is a fictional example.';
 const correction=s.weights?.budget>0?'You asked to avoid spending.':s.weights?.private>0?'You asked to keep this private.':s.weights?.focus>0?'You asked to protect work time.':s.weights?.depth>0?'You asked me to go deeper.':'';
 return {...l,reaction,correction,confirmed,bridge:seen.length>=2?bridge:''};
}
export function lensProgress(s){return lensOrder.map(k=>({key:k,name:lenses[k].name,motive:lenses[k].motive,active:k===s.topic,visited:(s.visits?.[k]||0)>0}));}
