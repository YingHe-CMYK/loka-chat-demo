// Demo policy: choose what to show from available evidence and explicit responses.
// A hypothesis is not a factual conclusion, and no body signal approves an action.
export function nextPresentation(state){
 if(state.paused)return {kind:'hold',reason:'Exploration is paused.'};
 if(!state.source||state.source==='none'||state.topic==='general')return {kind:'more-context',reason:'The current information does not support a specific direction.'};
 if(state.stage==='result')return {kind:'outcome',reason:'Show the editable result and ask whether it helped.'};
 if(state.stage==='plan')return {kind:'offer',reason:'A direction was accepted; show a reversible way to act.'};
 if(state.stage!=='guess')return {kind:'hold',reason:'Wait until the current step is complete.'};
 if(!state.discoveryDepth)return {kind:'hypothesis',reason:'Offer a tentative direction based on the available source.'};
 return {kind:'probe',reason:'The first direction was accepted; test a more specific need.'};
}
export function afterAcceptance(state){const view=nextPresentation(state);if(view.kind==='more-context')return 'more-context';if(view.kind==='hypothesis')return state.source==='local'&&!state.correctionText&&(state.index||0)===0&&state.localDirectOffer&&state.localPlanHint?'offer':'probe';if(view.kind==='probe')return 'offer';return 'hold';}
