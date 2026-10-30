// Local contract adapted from the user's Feishu specification. No model calls here.
export const thresholds=Object.freeze({speak_direct:.93,speak_as_question:.60,worth_min:.50,locale_adjust:.03});
export function routeJudgment({confidence,worth,cold_start=false,locale='en',permission='allow'}){
 if(permission!=='allow')return {route:permission==='ask'?'ask_permission':'blocked',reason:'Code-enforced permission'};
 if(cold_start)return {route:'hold_for_letter',reason:'Calibration not complete'};
 if(!Number.isFinite(confidence)||confidence<0||confidence>1||!Number.isFinite(worth)||worth<0||worth>1)return {route:'hold_for_letter',reason:'No valid model judgment'};
 const adjust=locale.startsWith('zh')?thresholds.locale_adjust:0;
 if(worth<thresholds.worth_min||confidence<thresholds.speak_as_question+adjust)return {route:'hold_for_letter',reason:'Insufficient confidence or usefulness'};
 return {route:confidence>=thresholds.speak_direct+adjust?'assertion':'question',reason:'Configured threshold'};
}
export function traceFor(s){return {mode:'simulation',ontology_version:1,source:s.correctionText?'user_edited':'guessed',confirmed_by_user:false,correction_weight:s.correctionText?10:1,questions:[{id:'current-need',type:'noul',from:s.correctionText?'user_correction':'authorized_context'}],basis:[...(s.evidence||[])],note:s.correctionText||null,model_result:null,route:'question',settled:false};}
export function permissionFor(action,s){if(['transfer','asset_approval','send_message'].includes(action))return s.actionPolicy==='block'?'deny':'ask';if(action==='read_new_source')return 'ask';return 'allow';}
