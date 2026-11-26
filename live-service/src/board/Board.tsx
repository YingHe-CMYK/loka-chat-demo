import {get as readLocal,set as writeLocal} from "idb-keyval";
import Interview from "./Interview";
import TwinClaim from "./TwinClaim";
import {interviewLocally} from "./localModel";
import LocalSpace from "./LocalSpace";
import {active as connectedFolder} from "./folderSync";
import React,{useEffect,useRef,useState} from "react";
import {active,scan,merge} from "./folderSync";
import LiveReply from "./LiveReply";
import {permitted,endReflection} from "./LocalSpace";
import catalog from "./connectors.json";
import screens from "./screens.json";
import {readIdentity,establishIdentity} from "../domain/identity.mjs";
import "./board.css";
import Workspace from "./Workspace";

const key="loka-board-v1";
type Draft=Record<string,string>;
const fields:Record<string,Record<number,string>>={
  register:{313:"email",420:"username"},name:{437:"name"},context:{310:"about",476:"background"},
  current:{313:"issue",433:"quiet"},correction:{433:"correctionDraft"},"result-edit":{166:"editedResult"}
};
function readDraft():Draft{try{return JSON.parse(localStorage.getItem(key)||"{}")||{}}catch{return {}}}
function origin(){if(location.hash==="#claim-twin")return "claim-twin";return ["#mirror","#talk","#plan","#judgment","#correction","#revised"].includes(location.hash)?"conversation":["#local-access","#sources"].includes(location.hash)?"local-access":"home"}
function response(c:string){if(c==="Their goals are unclear")return "Ask what success means before agreeing to a trial.";if(c==="The source is outdated")return "Verify the current invitation before drafting an answer.";if(c==="Commitment, not time")return "Propose one trial with an explicit exit date.";return c?'Ask for agreement on this condition: '+c:"Compare the invitation with the time you have available."}
export default function Board(){
 const [id,setId]=useState(origin),[d,setD]=useState(readDraft),[error,setError]=useState(""),[code,setCode]=useState(""),[width,setWidth]=useState(window.innerWidth);
 const trail=useRef<string[]>([]),start=useRef(0),media=useRef<MediaStream|null>(null),video=useRef<HTMLVideoElement>(null);
 const latest=useRef(d);latest.current=d;
 const localRevision=useRef(0);
 useEffect(()=>{
  const revision=localRevision.current;
  void readLocal<string>("loka-local-records-v2").then(raw=>{
   if(raw&&localRevision.current===revision)setD(previous=>({...previous,localRecords:raw}));
  }).catch(()=>setError("Local storage could not be opened."));
 },[]);
 const [,syncTick]=useState(0);
 useEffect(()=>{
  let running=false,disposed=false;
  async function update(){
   if(running||disposed)return;running=true;
   try{await scan((id,rows)=>{
    if(disposed||id!==active())return;
    const raw=merge(latest.current.localRecords,id,rows);
    if(raw!==latest.current.localRecords)put("localRecords",raw);
    sessionStorage.setItem("loka-sync-status","Synced "+rows.length+" files · "+new Date().toLocaleTimeString());
   })}catch(e){sessionStorage.setItem("loka-sync-status",(e as Error).message)}
   finally{running=false;if(!disposed)syncTick(t=>t+1)}
  }
  const tick=()=>{syncTick(t=>t+1);void update()};
  const timer=setInterval(update,4500);window.addEventListener("loka-sync",tick);void update();
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener("loka-sync",tick)};
 },[]);
 const authorized=catalog.filter(([a])=>d["allowed:"+a]==="yes"&&d[a+"Current judgment"]==="on");
 const local=permitted(d.localRecords);
 const [priority,setPriority]=useState("");
 const [edit,setEdit]=useState("");
 const [priorPlan,setPriorPlan]=useState("");
 const [firstDone,setFirstDone]=useState(false);
 const signature=JSON.stringify([local,authorized.map(x=>x[0]),priority]);
 const [live,setLive]=useState<{key:string,text:string}|null>(null),[retry,setRetry]=useState(0);
 const modeling=["judgment","revised","plan"].includes(id)&&(authorized.length+local.length)>0;
 useEffect(()=>{if(!modeling)return;const controller=new AbortController();setLive(null);setError("");
 interviewLocally({action:id==="plan"?"confirm":"reply",local,message:"Use the authorized evidence. "+(id==="plan"?"Give a practical plan and deliverable.":"Propose one personal hypothesis.")+" Personal correction: "+(priority||"none")},controller.signal).then(v=>{if(!controller.signal.aborted)setLive({key:id+signature,text:v.answer})}).catch(e=>{if(!controller.signal.aborted)setError(e.message)});return()=>controller.abort()},[id,signature,retry]);
 const f=screens.find(x=>x.id===id)!;
 useEffect(()=>{const resize=()=>setWidth(window.innerWidth);window.addEventListener("resize",resize);document.documentElement.lang="en";return()=>window.removeEventListener("resize",resize)},[]);
 useEffect(()=>{if(video.current)video.current.srcObject=media.current;return()=>{if(id==="mirror-active"){media.current?.getTracks().forEach(t=>t.stop());media.current=null}}},[id]);
 function put(k:string,v:string){
  if(k==="localRecords"){localRevision.current++;void writeLocal("loka-local-records-v2",v).catch(()=>setError("Local records could not be saved."))}
  setD(previous=>{
   const next={...previous,[k]:v};
   const {localRecords,...preferences}=next;
   localStorage.setItem(key,JSON.stringify(preferences));
   return next;
  });
 }
 function leaveReflection(to:string){const active=["judgment","correction","revised","plan"];if(active.includes(id)&&!active.includes(to)){setPriorPlan("");setPriority("");setEdit("");setFirstDone(false);if(local.length)put("localRecords",endReflection(d.localRecords))}}
 function go(to:string){if(["welcome","register","verify","verify-error","identity","context","current","dilemmas","retelling"].includes(to))to="sources";leaveReflection(to);if(to!==id){trail.current.push(id);setId(to);history.replaceState(null,"","#"+(to==="conversation"?"talk":to))}setError("");document.querySelector(".h5-phone")?.scrollTo(0,0);window.scrollTo(0,0)}
 function back(to:string){const dest=trail.current.pop()||to;leaveReflection(dest);setId(dest);history.replaceState(null,"","#"+(dest==="conversation"?"talk":dest));setError("");document.querySelector(".h5-phone")?.scrollTo(0,0);window.scrollTo(0,0)}
 async function click(to:string,label:string,y:number){
 if(label==="Back"){back(to);return}
 if(id==="register"&&to==="verify"&&(!/^\S+@\S+\.\S+$/.test(d.email||"")||!d.username?.trim())){setError("Enter your email and username to continue.");return}
 if(id==="verify"&&to==="identity"){if(code!=="123456"){setError("Use the preview code 123456.");return}try{establishIdentity(localStorage,{email:d.email,username:d.username})}catch(e){setError((e as Error).message);return}}
 if(id==="context"&&y<450&&to==="dilemmas"){put("about",label==="Write my own"?"":label);return}
 if(id==="dilemmas"&&to==="dilemmas"){put("choice"+y,label);return}
 if(id==="correction"&&y<350){put("correctionDraft",label);return}
 if(id==="correction"&&to==="revised"){if(!d.correctionDraft?.trim()){setError("Choose or write a correction first.");return}put("correction",d.correctionDraft);put("editedResult","")}
 if(id==="revised"&&to==="judgment")put("correction","");
 if(id==="sources"&&to==="source-consent")put("source",label);
 if(id==="source-consent"&&to==="source-connected"){put("allowed:"+d.source,"yes")}
 if(to==="source-disconnected")put("allowed:"+d.source,"");
 if(to==="mirror-active"){try{media.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false})}catch{setError("Camera unavailable. Continue in text or try again.");return}}
 if(to==="result-copied"){try{await navigator.clipboard.writeText(d.editedResult||response(d.correction))}catch{setError("Copy unavailable. Open the draft to select the text.");return}}
 if(id==="conversation"&&to==="revised"&&d.message){put("correction",d.message);put("correctionDraft",d.message)}
 go(to)
 }
 if(id==="claim-twin")return <TwinClaim draft={d} save={put} back={()=>back("home")} enter={()=>go("home")}/>;
 if(id==="local-access")return <main className="apps-view twin-access"><header className="data-header"><button onClick={()=>back("home")}>←</button><strong>LokaChat</strong></header><LocalSpace raw={d.localRecords} save={v=>put("localRecords",v)} reflect={()=>go("conversation")} openApps={()=>go("sources")}/></main>;
 if(["sources","source-consent","source-detail","source-connected","source-disconnected"].includes(id))return <main className="apps-view twin-access"><header className="data-header"><button onClick={()=>back("home")}>←</button><strong>LokaChat</strong></header><LocalSpace raw={d.localRecords} save={v=>put("localRecords",v)} reflect={()=>go("conversation")} openApps={()=>go("home")}/></main>;
 if(id==="conversation")return <Interview draft={d} save={put} back={()=>back("home")}/>;
 if(["conversation","live-judgment","room-message"].includes(id))return <LiveReply key={id} mode={id==="live-judgment"?"judgment":"chat"} draft={d} save={put} back={()=>back("home")}/>;
 if(id==="home")return <main className="apps-view twin-home"><header className="data-header"><strong>LokaChat</strong><button onClick={()=>go(d.twinClaimed==="yes"?"claim-twin":"local-access")} aria-label={d.twinClaimed==="yes"?"Twin identity":"Manage local access"}>{d.twinClaimed==="yes"?"My Twin":"Local access"}</button></header><section><small>{d.twinClaimed==="yes"?"YOUR TWIN’S SPACE":"YOUR OWN TWIN"}</small><h1>{d.twinClaimed==="yes"?`${d.twinName} is here.`:"A Twin of your own."}</h1><p>{d.twinClaimed==="yes"?"Connect your experiences. Open the mirror. Keep getting to know each other.":"Give your Twin a name and a space to grow with you."}</p>{d.twinClaimed!=="yes"?<button className="primary" onClick={()=>go("claim-twin")}>Claim my Twin →</button>:<><button className="primary" onClick={()=>go(connectedFolder()?"conversation":"local-access")}>{connectedFolder()?"Open mirror":"Connect local information"}</button><button onClick={()=>go(connectedFolder()?"local-access":"conversation")}>{connectedFolder()?"Manage local access":"Talk first"}</button><small>Local Twin · this browser</small></>}</section>{d.twinClaimed==="yes"&&<form className="composer" onSubmit={e=>{e.preventDefault();put("interviewDraft",d.composerDraft||"");go("conversation")}}><input aria-label="Message your Twin" placeholder={`Talk to ${d.twinName}`} value={d.composerDraft||""} onChange={e=>put("composerDraft",e.target.value)}/><button aria-label="Send message" disabled={!d.composerDraft?.trim()}>↑</button></form>}</main>;
 if(["room","mirror","mirror-active","voice"].includes(id))return <Workspace key={id} id={id} go={go} back={()=>back("sources")} camera={()=>void click("mirror-active","Camera",0)} stream={media.current} error={error} save={put} start={d.composerDraft||""}/>;
 if(id==="drawer")return <main className="apps-view"><button onClick={()=>back("home")}>← Close</button><h1>Workspace</h1>{[["Today","home"],["Mirror","mirror"],["Sources","sources"],["History","history"],["Growth","growth"]].map(([n,to])=><button className="menu-row" key={to} onClick={()=>go(to)}>{n}<span>→</span></button>)}</main>;
 const evidence=<details><summary>View evidence ({local.length+authorized.length})</summary>{local.map(r=><p key={r.name}><strong>{r.name}</strong><br/>{r.text}</p>)}{authorized.map(([name,,,record])=><p key={name}><strong>{name}</strong><br/>{record}</p>)}</details>;
 function correct(){if(id==="plan"&&!priority&&live?.key===id+signature)setPriorPlan(live.text);setEdit(priority);go("correction")}
 if(id==="correction"&&(local.length||authorized.length))return <main className="apps-view reflection"><button onClick={()=>back("judgment")}>‹ Back</button><h1>What did I miss?</h1><label>Your correction<textarea autoFocus value={edit} maxLength={1200} placeholder="What matters first?" onChange={e=>setEdit(e.target.value)}/></label>{evidence}<button className="primary" disabled={!edit.trim()} onClick={()=>{setPriority(edit.trim());setFirstDone(false);go("revised")}}>Update reflection</button></main>;
 if(modeling)return <main className="apps-view reflection" onTouchStart={e=>start.current=e.touches[0].clientX} onTouchEnd={e=>{if(["judgment","plan"].includes(id)&&e.changedTouches[0].clientX-start.current< -70)correct()}}>
 <button onClick={()=>{if(id==="plan"&&!priority&&live?.key===id+signature)setPriorPlan(live.text);back("sources")}}>‹ Back</button><small>Mirror · Gemini</small><h1>{id==="plan"?"Your plan":id==="revised"?"Revised reflection":"A thought to check"}</h1>
 {priority&&<article className="priority"><small>{id==="plan"?"First step · in your words":"Your correction"}</small><p>{priority}</p>{id==="plan"&&<label><input type="checkbox" checked={firstDone} onChange={e=>setFirstDone(e.target.checked)}/> I’ve addressed this step</label>}</article>}
 {id!=="plan"||!priority||firstDone?<article aria-live="polite">{error|| (live?.key===id+signature?live.text:"Reading your selected records…")}</article>:<p>Check off your first step to see the follow-up.</p>}
 {id==="plan"&&priorPlan&&<details><summary>Compare with the original plan</summary><p>{priorPlan}</p></details>}{evidence}{error&&<button onClick={()=>setRetry(retry+1)}>Retry</button>}
 <button onClick={correct}>{id==="judgment"?"← Not quite":"Edit correction"}</button>
 <button className="primary" disabled={live?.key!==id+signature} onClick={()=>go(id==="plan"?"sources":"plan")}>{id==="plan"?"Finish reflection":"View plan →"}</button></main>;
 const scale=Math.min(width,430)/390,identity=readIdentity(localStorage);
 function value(v:string,y:number){
 if(id==="identity"&&v.startsWith("LOKA"))return (v.includes("P-")?identity?.personalId:identity?.aiId)?.slice(-16)||v;
 if(id==="retelling"&&y>200&&v.startsWith("Considering"))return [d.about,d.issue].filter(Boolean).join(" · ")||"No details shared yet.";
 if(id==="plan"&&y===358||id==="revised"&&v.startsWith("Try one")||id==="home"&&y===313&&d.correction)return response(d.correction);
 if(id==="revised"&&v.startsWith("“"))return d.correction||v;
 if(id==="result"&&v.startsWith("Thanks"))return d.editedResult||("Thanks for the invitation. "+response(d.correction));
 if(id==="source-consent"&&v==="Selected note")return d.source||v;
 if(id==="sources"&&v.startsWith("Disconnected")){const source=y<340?"Calendar":"Personal notes";if(d["allowed:"+source])return "Connected · selected sample only"}
 if(id==="conversation"&&v.startsWith("Time isn’t"))return d.message||"What would you like to clarify?";
 if(v==="Sample data · no live judgment model")return "Sample invitation · Gemini available in Mirror";
 return v}
 return <main className="board-shell"><section className="board-stage" aria-label={id} style={{width:390*scale,height:844*scale}}><div className="board-canvas" style={{transform:'scale('+scale+')'}} onTouchStart={e=>start.current=e.touches[0].clientX} onTouchEnd={e=>{const dx=e.changedTouches[0].clientX-start.current;if(id==="judgment"&&Math.abs(dx)>75)go(dx<0?"correction":"plan")}}>
 {f.nodes.map((n,i)=>{const style:React.CSSProperties={left:n.x,top:n.y,width:n.w};if(n.type==="rect")return <div key={i} className="board-shape" style={{...style,height:n.h,background:n.fill,borderRadius:n.r,border:'stroke' in n && n.stroke?'1px solid '+n.stroke:undefined}}/>;
 const v=n.value||"",field=fields[id]?.[n.y];if(field)return <input key={i} className="board-field" aria-label={field} style={{...style,width:Math.min(310,365-n.x)}} value={d[field]??(field==="name"?"Loka":field==="editedResult"?response(d.correction):"")} placeholder={v} onChange={e=>put(field,e.target.value)}/>;
 return <span key={i} className="board-text" style={{...style,fontSize:n.size,color:n.fill,fontWeight:n.weight}}>{value(v,n.y)}</span>})}
 {f.links.map((l,i)=><button key={i} aria-label={l.label} className={'board-hit '+((id==="dilemmas"&&d["choice"+l.y]===l.label||id==="correction"&&d.correctionDraft===l.label||id==="context"&&d.about===l.label)?"picked":"")} style={{left:l.x,top:l.y,width:l.w,height:l.h}} onClick={()=>void click(l.to,l.label,l.y)}/>)}
 {id==="verify"&&<input className="board-code" aria-label="Verification code" inputMode="numeric" maxLength={6} value={code} placeholder="000000" onChange={e=>setCode(e.target.value.replace(/\D/g,""))}/>}
 {id==="source-consent"&&<div className="board-permits">{["Current judgment","Future training"].map((t,i)=><label key={t}><input type="checkbox" checked={(d[d.source+t]??(i?"off":"on"))==="on"} onChange={e=>put(d.source+t,e.target.checked?"on":"off")}/>{t}</label>)}</div>}
 {id==="conversation"&&<input className="board-message" aria-label="Message" placeholder="In your own words" value={d.message||""} onChange={e=>put("message",e.target.value)}/>}
 {id==="mirror-active"&&<video ref={video} autoPlay muted playsInline className="board-video"/>}
 {["mirror","mirror-active","room"].includes(id)&&<button className="board-reflect" onClick={()=>go("judgment")}>Reflect on the invitation →</button>}
 {id==="judgment"&&<button className="board-live" onClick={()=>go("live-judgment")}>Check with Gemini →</button>}
 {error&&<div role="alert" className="board-error">{error}</div>}
 </div></section></main>
}
