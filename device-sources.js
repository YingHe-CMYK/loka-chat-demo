// Browser-visible facts are not evidence of a person's health, interests, schedule, or relationships.
export const appSources=[
 {name:'Calendar',scope:'Upcoming availability after separate permission',access:'iOS calendar permission',status:'Not connected'},
 {name:'Health',scope:'Selected metrics after separate permission',access:'HealthKit permission',status:'Not connected'},
 {name:'Oura',scope:'Sleep and activity trends after account connection',access:'Oura authorization',status:'Not connected'},
 {name:'Notes / chat',scope:'Only items you explicitly choose to share',access:'Share sheet or service connection',status:'Not connected'},
 {name:'Camera / microphone',scope:'Immediate gestures and speech only when enabled',access:'Separate device permission',status:'Off'}
];
export const sampleEvidence={
 health:['Fictional note: “Ask about weight-management medication and supplements.”','Fictional calendar: continuous research blocks on Tuesday through Thursday.','Fictional list: two supplements saved; no prescription connected.'],
 meaning:['Fictional note: “Should I leave my research direction?”','Fictional saved item about tarot and choice.'],
 connection:['Fictional note: “I want to reconnect with an old friend.”','Fictional calendar: an unscheduled meeting idea.']
};
export function browserFacts({language,timeZone,localEvents=[]}={}){
 const names={'accept-invite':'Accepted invitation',register:'Created local profile',feedback:'Rated a result',signal:'Body response'};
 const actions=localEvents.map(e=>names[e.type]).filter(Boolean).slice(-3);
 return [
  {source:'Current browser',label:'Interface language',value:String(language||'Unknown'),inference:'Does not reveal interests or identity'},
  {source:'Current browser',label:'Time zone',value:String(timeZone||'Unknown'),inference:'Does not reveal schedule'},
  {source:'Loka Chat local',label:'Recent actions',value:actions.length?actions.join(' → '):'No responses yet',inference:'Only actions inside Loka Chat'}
 ];
}
export function deviceEvidence(facts){return facts.map(f=>`${f.source} · ${f.label}: ${f.value}`);}
