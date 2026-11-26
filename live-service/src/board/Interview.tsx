
import {interviewLocally} from "./localModel";
import {permitted} from "./LocalSpace";
import {useEffect,useRef,useState} from "react";
type Turn={role:"user"|"model";text:string;stage?:Stage};
type Stage="ask"|"reflect"|"plan";
type Session={stage:Stage;turns:Turn[]};
const opening = "Let’s get to know you. Is there something you have been spending more time on lately?";
function beginInterview():Session {
 return {stage:"ask", turns:[{role:"model",text:opening}]};
}
export default function Interview({draft,save,back}:{draft:Record<string,string>;save:(key:string,value:string)=>void;back:()=>void}){
 const [session,setSession]=useState<Session>(()=>{try{const saved=JSON.parse(draft.interviewSession);return saved?.turns?.length?saved:beginInterview()}catch{return beginInterview()}});
 const started=useRef(false);
 const [drag,setDrag]=useState(0),[dragging,setDragging]=useState(false),[kept,setKept]=useState(false);
 const dragDistance=useRef(0),sending=useRef(false);
 const gesture=useRef<{x:number;y:number;id:number}|null>(null);
 const [correcting,setCorrecting]=useState(draft.interviewCorrecting==="yes"),[cameraError,setCameraError]=useState(""),[cameraOn,setCameraOn]=useState(false);
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null);
 useEffect(()=>()=>stream.current?.getTracks().forEach(t=>t.stop()),[]);
 async function toggleCamera(){
  if(stream.current){stream.current.getTracks().forEach(t=>t.stop());stream.current=null;setCameraOn(false);if(video.current)video.current.srcObject=null;setCameraError("");return;}
  try{setCameraOn(true);stream.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});if(video.current)video.current.srcObject=stream.current;setCameraError("");}catch{setCameraOn(false);setCameraError("Camera access is off. You can still reflect using the cards below.");}
 }
 const models=session.turns.filter(t=>t.role==="model");
 const current=models.at(-1)?.text||opening;
 const previousPlan=session.stage==="plan"?models.slice(0,-1).reverse().find(t=>t.stage==="plan"):undefined;
 function choose(v:"yes"|"no"){
  if(busy)return;
  dragDistance.current=0;setDrag(0);setDragging(false);
  if(v==="no"){setCorrecting(true);save("interviewCorrecting","yes");setKept(false);requestAnimationFrame(()=>field.current?.focus());return;}
  if(session.stage==="plan"){setKept(true);save("acceptedPlan",current);return;}
  void send("reply",session.stage==="reflect"?"Yes, that captures my experience. Keep learning about me: ask one grounded follow-up question, not a plan.":"Yes, that matches my experience.");
 }
 function finishGesture(){const distance=dragDistance.current;dragDistance.current=0;gesture.current=null;setDragging(false);setDrag(0);if(Math.abs(distance)>=72)choose(distance>0?"yes":"no");}

 const [input,setInput]=useState(draft.interviewDraft||""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const field=useRef<HTMLTextAreaElement>(null);
 const [retry,setRetry]=useState<null|{action:"reply"|"skip"|"confirm"|"correct";text:string}>(null);
 const end=useRef<HTMLDivElement>(null),request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{
  if(started.current||draft.interviewSession||!permitted(draft.localRecords).length)return;
  started.current=true;
  void send("reply","Start from my local records. Cite one file and ask one yes-or-no question about me. Do not invent a collaboration or propose a plan.");
 },[]);

 useEffect(()=>{const container=end.current?.parentElement;if(container)container.scrollTop=container.scrollHeight},[session]);
 async function send(action:"reply"|"skip"|"confirm"|"correct",text:string){
  if(sending.current||!text.trim())return;
  sending.current=true;
  setBusy(true);setError("");const controller=new AbortController();request.current=controller;
  try{
   const data=await interviewLocally({mode:"interview",action,history:session.turns,local:permitted(draft.localRecords),personalFeedback:JSON.parse(draft.twinFeedback||"[]"),message:text.trim()},controller.signal);
   const next:Session={stage:data.stage,turns:[...session.turns,...(text.startsWith("Start from my local records.")?[]:[{role:"user" as const,text:text.trim()}]),{role:"model",text:data.answer,stage:data.stage}]};
   if(action==="confirm"||action==="correct"||text.startsWith("Yes,")||text.startsWith("No.")){
    const feedback={statement:session.turns.at(-1)?.text||"",response:text.trim(),at:new Date().toISOString()};
    const past=JSON.parse(draft.twinFeedback||"[]");
    if(!past.some((entry:{statement:string;response:string})=>entry.statement===feedback.statement&&entry.response===feedback.response))save("twinFeedback",JSON.stringify([...past,feedback].slice(-100)));
   }
   save("interviewCorrecting","");setCorrecting(false);setKept(false);setSession(next);if(action==="confirm")save("twinConfirmed",String(Number(draft.twinConfirmed||0)+1));save("interviewSession",JSON.stringify(next));save("interviewDraft","");setInput("");setRetry(null);
  }catch(e){if(!controller.signal.aborted){setError((e as Error).message||"Could not reach your local model.");setRetry({action,text})}}finally{sending.current=false;if(!controller.signal.aborted)setBusy(false)}
 }
 const submit=()=>send(correcting||session.stage==="reflect"||session.stage==="plan"?"correct":"reply",input);
 const update=(v:string)=>{setInput(v);save("interviewDraft",v)};
 return <main className="apps-view interview-room simple-mirror">
 <header className="interview-bar"><button aria-label="Back to home" onClick={back}>←</button><div><strong>{draft.twinName||"Your Twin"}</strong><small>{({ask:"Mirror · Getting to know you",reflect:"Check understanding",plan:"Your plan"})[session.stage]}</small></div><button aria-pressed={cameraOn} aria-label={cameraOn?"Turn camera off":"Open camera"} onClick={toggleCamera}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="6" width="13" height="13" rx="3"/><path d="m16 10 5-3v11l-5-3"/></svg></button></header>
 {cameraOn&&<section className="mirror-surface" aria-label="Your mirror"><video ref={video} autoPlay muted playsInline/><span className="camera-label">Only visible on this device</span></section>}
 <section className="interview-history" aria-label="Conversation">
 {session.turns.slice(0,-1).map((t,i)=><div key={i} className={"simple-turn "+t.role}><p>{t.text}</p></div>)}
 <div className="twin-speaker">{draft.twinName||"Your Twin"}</div>
 <div className="floating-deck">
 <article className={"judgment-card swipe-card"+(dragging?" dragging":"")} key={current} tabIndex={0} aria-label="Judgment card. Swipe right to agree, left to correct. Or use arrow keys." aria-busy={busy} style={{transform:`translateX(${drag}px) rotate(${drag/22}deg)`}}
 onPointerDown={e=>{if(busy||sending.current||e.button!==0)return;dragDistance.current=0;gesture.current={x:e.clientX,y:e.clientY,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);setDragging(true);}}
 onPointerMove={e=>{const start=gesture.current;if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dy)>20&&Math.abs(dy)>Math.abs(dx)){gesture.current=null;dragDistance.current=0;setDragging(false);setDrag(0);return;}dragDistance.current=Math.max(-180,Math.min(180,dx));setDrag(dragDistance.current);}}
 onPointerUp={finishGesture} onPointerCancel={()=>{dragDistance.current=0;gesture.current=null;setDragging(false);setDrag(0)}}
 onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();choose(e.key==="ArrowRight"?"yes":"no");}}}>
 <span className={"swipe-verdict "+(drag>0?"agree":"revise")} style={{opacity:Math.min(Math.abs(drag)/72,1)}} aria-hidden="true">{drag>0?"That fits":"Not quite"}</span>
 <small className="card-kind">{correcting?"Let’s correct this":session.stage==="reflect"?"What I understand":session.stage==="plan"?"A possible next step":"A thought to check"}</small><p>{current}</p>
 {correcting&&<p className="inline-hint">What did I miss? Tell me below.</p>}
 {session.stage==="plan"&&<small className="inline-hint">{kept?"Saved · nothing executed":"Suggested next step · not executed"}</small>}
 </article></div>
 <div className="swipe-directions" aria-hidden="true"><span>← Not quite</span><span>{session.stage==="plan"?"Keep plan →":"That fits →"}</span></div>
 <div className="quiet-actions"><details><summary>Sources</summary><p>This is your Twin’s interpretation of this conversation and the local records you permitted.</p>{permitted(draft.localRecords).map((r:any,i:number)=><p key={i}>{r.name||r.path||"Local record"}</p>)}</details>{session.stage!=="plan"&&<button disabled={busy} onClick={()=>send("skip","Skip this question and reflect what you understand.")}>Skip</button>}</div>
 {previousPlan&&<details className="plan-comparison"><summary>Previous plan</summary><p>{previousPlan.text}</p></details>}
 {busy&&<p role="status">Thinking…</p>}{(error||cameraError)&&<div role="alert"><p>{error||cameraError}</p>{error&&retry&&<button onClick={()=>send(retry.action,retry.text)}>Try again</button>}</div>}<div ref={end}/></section>
 <footer className="simple-compose"><label className="sr-only" htmlFor="interview-reply">{correcting?"Your correction":"Message your Twin"}</label><div className="chat-compose"><textarea id="interview-reply" ref={field} disabled={busy} placeholder={correcting?"What did I miss?":"Message your Twin"} maxLength={2000} value={input} onChange={e=>update(e.target.value)}/><button aria-label="Send" className="primary" disabled={busy||!input.trim()} onClick={()=>void submit()}>↑</button></div><small>Local model · private to this device</small></footer></main>
}
