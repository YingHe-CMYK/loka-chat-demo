// Public OAuth client IDs only. Set these in connector-config.js for this deployment.
import {connectorConfig} from './connector-config.js';
const cfg=connectorConfig;
const loadScript=src=>new Promise((resolve,reject)=>{if(window.google?.accounts?.oauth2)return resolve();const script=document.createElement('script');script.src=src;script.async=true;script.onload=resolve;script.onerror=()=>reject(new Error('Authorization service could not load.'));document.head.append(script)});
const compact=value=>String(value||'').replace(/\s+/g,' ').trim().slice(0,110);
export function connectorReady(kind){return Boolean(kind==='calendar'?cfg.googleClientId:kind==='oura'?cfg.ouraClientId:false)}
export async function connectGoogleCalendar(){
 if(!cfg.googleClientId)throw new Error('Google Calendar is not configured for this build. You can import a calendar export now.');
 await loadScript('https://accounts.google.com/gsi/client');
 const token=await new Promise((resolve,reject)=>{const client=google.accounts.oauth2.initTokenClient({client_id:cfg.googleClientId,scope:'https://www.googleapis.com/auth/calendar.events.readonly',callback:r=>r.error?reject(new Error(r.error)):resolve(r.access_token)});client.requestAccessToken({prompt:'consent'});});
 try{
  const timeMin=new Date().toISOString(),timeMax=new Date(Date.now()+14*86400000).toISOString();
  const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=12&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`,{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok)throw new Error(`Calendar read failed (${response.status}).`);
  const items=(await response.json()).items||[];
  const events=items.filter(e=>e.status!=='cancelled').map(e=>({title:compact(e.summary||'Busy'),start:e.start?.dateTime||e.start?.date||''}));
  const lead=events.find(e=>e.title!=='Busy')||events[0];
  return {app:'Google Calendar',count:events.length,topic:lead?'research':'general',titles:['Google Calendar'],excerpt:lead?`${lead.title} · ${new Date(lead.start).toLocaleDateString()}`:'No upcoming events in the next 14 days',focus:'',guess:lead?`I found “${lead.title}” on your calendar. Is this one of the things shaping your next two weeks?`:'Your next two weeks have no visible calendar events. What is taking your attention outside your calendar?',facts:[{source:'Google Calendar',label:'Permission',value:'Upcoming events · read only'},{source:'Google Calendar',label:'Events found',value:String(events.length)},...(lead?[{source:'Google Calendar',label:'One event',value:lead.title}]:[])],evidence:lead?[`Google Calendar · ${lead.title} · ${lead.start}`]:['Google Calendar · no upcoming events in 14 days']};
 }finally{try{google.accounts.oauth2.revoke(token,()=>{})}catch{}}
}
export function beginOuraAuthorization(){
 if(!cfg.ouraClientId)throw new Error('Oura is not configured for this build. An Oura developer client ID is needed.');
 const state=crypto.randomUUID();sessionStorage.setItem('loka-oura-state',state);
 const url=new URL('https://cloud.ouraring.com/oauth/authorize');url.search=new URLSearchParams({response_type:'token',client_id:cfg.ouraClientId,redirect_uri:location.origin+location.pathname,scope:'daily',state}).toString();location.assign(url.href);
}
export async function finishOuraAuthorization(){
 const fragment=new URLSearchParams(location.hash.slice(1));if(!fragment.has('access_token')&&!fragment.has('error'))return null;
 const expected=sessionStorage.getItem('loka-oura-state');sessionStorage.removeItem('loka-oura-state');
 history.replaceState(null,'',location.pathname+location.search);
 if(fragment.has('error'))throw new Error('Oura authorization was declined.');
 if(!expected||fragment.get('state')!==expected)throw new Error('Oura authorization could not be verified.');
 const token=fragment.get('access_token');const start=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
 const response=await fetch(`https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=${start}`,{headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok)throw new Error(`Oura read failed (${response.status}).`);
 const days=(await response.json()).data||[];const latest=days.at(-1);
 const score=Number(latest?.score)||null;
 return {app:'Oura',count:days.length,topic:'health',titles:['Oura daily sleep'],excerpt:score?`Latest daily sleep score: ${score}`:'No recent daily sleep record',focus:'',guess:score?`Your latest Oura sleep score is ${score}. Is rest something you are actively trying to make room for?`:'Oura is connected, but I found no sleep summary for this week. What would you like me to notice instead?',facts:[{source:'Oura',label:'Permission',value:'Daily summaries · read only'},{source:'Oura',label:'Days returned',value:String(days.length)},...(score?[{source:'Oura',label:'Latest sleep score',value:String(score)}]:[])],evidence:[score?`Oura daily sleep · ${latest.day} · score ${score}`:'Oura daily sleep · no recent record']};
}
export async function readCalendarExport(file){
 const raw=(await file.text()).slice(0,1000000);
 if(!raw.includes('BEGIN:VCALENDAR'))throw new Error('This does not look like an .ics calendar export.');
 const unfolded=raw.replace(/\r?\n[ \t]/g,'');
 const events=[...unfolded.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].slice(0,30).map(match=>({title:compact((match[1].match(/^SUMMARY(?:;[^:\n]*)?:(.*)$/m)||[])[1]||'Busy'),start:(match[1].match(/^DTSTART(?:;[^:\n]*)?:(.*)$/m)||[])[1]||''}));
 const lead=events.find(e=>e.title!=='Busy')||events[0];
 return {app:'Calendar export',count:events.length,topic:lead?'research':'general',titles:[file.name],excerpt:lead?.title||'No events in selected export',focus:'',guess:lead?`Your calendar includes “${lead.title}”. Is this something you want me to understand better?`:'This calendar export has no readable events. What else should I look at?',facts:[{source:file.name,label:'Selected export',value:file.name},{source:file.name,label:'Events found',value:String(events.length)},...(lead?[{source:file.name,label:'One event',value:lead.title}]:[])],evidence:lead?[`User-selected calendar export · ${lead.title} · ${lead.start}`]:['User-selected calendar export · no readable events']};
}
