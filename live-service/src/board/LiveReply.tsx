import {interviewLocally} from "./localModel";
import {useEffect,useRef,useState} from "react";
type Turn={role:string,text:string};
export default function LiveReply({mode,draft,save,back}:{mode:"chat"|"judgment",draft:Record<string,string>,save:(k:string,v:string)=>void,back:()=>void}){
 const historyKey="live-"+mode;
 const [log,L]=useState<Turn[]>(()=>{try{return JSON.parse(draft[historyKey]||"[]")}catch{return []}}),[msg,M]=useState(mode==="judgment"?(draft.correction||draft.issue||"I am considering a collaboration invitation."):(draft.composerDraft||"")),[busy,B]=useState(false),[error,E]=useState("");
 const ctrl=useRef<AbortController|null>(null);
 useEffect(()=>()=>ctrl.current?.abort(),[]);
 async function send(){if(busy||!msg.trim())return;B(true);E("");ctrl.current=new AbortController();try{const data=await interviewLocally({message:msg,history:log.slice(-6),action:"reply"},ctrl.current.signal);const next=[...log,{role:"user",text:msg},{role:"model",text:data.answer}];L(next);save(historyKey,JSON.stringify(next));M("");save("composerDraft","")}catch(e){if(!ctrl.current?.signal.aborted)E((e as Error).message)}finally{B(false)}}
 return <main className="apps-view livechat"><header className="chat-head"><button aria-label="Back" onClick={back}>←</button><strong>Mirror</strong></header><section className="chat-feed"><h1>{mode==="chat"?"Talk it through":"Check a judgment"}</h1><p>Messages are processed by the model on this device.</p>{log.map((t,i)=><article className={t.role} key={i}><small>{t.role==="model"?"LokaChat · your local model":"You"}</small><p>{t.text}</p></article>)}</section><div className="chat-compose"><textarea placeholder="Message LokaChat" aria-label="Message to your local model" onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing&&window.matchMedia("(pointer:fine)").matches){e.preventDefault();void send()}}} maxLength={2000} value={msg} onChange={e=>M(e.target.value)}/><button aria-label="Send" className="primary" disabled={!msg.trim()||busy} onClick={send}>{busy?"…":"↑"}</button></div>{error&&<p role="alert">{error}</p>}</main>
}
