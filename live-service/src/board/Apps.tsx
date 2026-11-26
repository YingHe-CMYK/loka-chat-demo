import {useState} from "react";
import {active} from "./folderSync";
import LocalSpace,{records} from "./LocalSpace";
import catalog from "./connectors.json";
export const apps=catalog.map(([name])=>name);
export function Apps({draft,save,go,back}:{draft:Record<string,string>,save:(k:string,v:string)=>void,go:(v:string)=>void,back:()=>void}){
 const [selected,set]=useState(""),[grant,G]=useState(""),[use,U]=useState(true);
 const [browse,B]=useState(false);
 const [localPage,showLocal]=useState(()=>location.hash==="#local-access");
 const localName="Local workspace";
 const tasks=[...catalog.slice(0,5),[localName,"Work with a local folder"]];
 const complete=(name:string)=>name===localName?Boolean(active()||records(draft.localRecords).length):draft["allowed:"+name]==="yes";
 const count=tasks.filter(([name])=>complete(name)).length;
 const item=catalog.find(([name])=>name===grant);
 function close(){grant?G(""):back()}
 return <main className="apps-view source-layout"><aside className="source-rail"><strong>LokaChat</strong><nav><button onClick={()=>go("home")}>Today</button><button onClick={()=>{B(false);showLocal(false);G("");set("")}} aria-current={!grant&&!browse?"page":undefined}>Sources</button><button onClick={()=>go("mirror")}>Mirror</button></nav></aside><div className="source-content"><header className="data-header"><strong>LokaChat</strong><button onClick={grant?close:()=>go("home")}>{grant?"‹ Back":"Today →"}</button></header>
 {grant?<><h1>Allow access to {grant}?</h1><p>Simulated authorization · Demo workspace</p><article><strong>{item?.[2]}</strong><p>{item?.[3]}</p><small>Read only. No real account is connected.</small></article><label><input type="checkbox" checked={use} onChange={e=>U(e.target.checked)}/> Include this sample when I ask Gemini</label><p>No training access is requested.</p><button className="primary" onClick={()=>{save("allowed:"+grant,"yes");save(grant+"Current judgment",use?"on":"off");set("");G("")}}>Allow sample access</button><button onClick={()=>G("")}>Cancel</button>{complete(grant)&&<button onClick={()=>{save("allowed:"+grant,"");set("");G("")}}>Disconnect</button>}</>:<>{localPage?<><button onClick={()=>{showLocal(false);set("")}}>← Getting started</button><LocalSpace openApps={()=>{showLocal(false);B(true)}} raw={draft.localRecords} save={v=>save("localRecords",v)} reflect={()=>go("judgment")}/></>:<section className="task-list"><header><h1>Getting started</h1><span>{count} of {tasks.length}</span></header><progress aria-label="Authorized tasks" value={count} max={tasks.length}/>{[...tasks,...(browse?catalog.slice(6):[])].map(([name,task])=>{
 const done=complete(name),chosen=name===selected;
 const icon=name.replaceAll(" ","");
 return <button key={name} className="task-row" aria-pressed={chosen} onClick={()=>set(name)}><span className={'task-mark '+(done?'done':'')}>{done?'✓':chosen?'●':''}</span><span className={done?"task-done":""}>{task}</span>{["Calendar","Gmail","Slack","Notion","GoogleDrive","GitHub"].includes(icon)?<img alt={name} src={'/source-icons/'+icon+'.svg'}/>:<span className="task-icon" aria-label={name}>{name===localName?'▰':name.slice(0,1)}</span>}</button>})}<button className="more-tasks" onClick={()=>{B(!browse);set("")}}>{browse?"Show fewer":"More connections"}</button></section>}{!selected&&catalog.some(([a])=>draft["allowed:"+a]==="yes"&&draft[a+"Current judgment"]==="on")&&<button className="primary" onClick={()=>go("judgment")}>Reflect on connected apps</button>}<div className="app-actions">{selected&&<button className="primary" onClick={()=>{if(selected===localName){showLocal(true);set("");return} U(draft[selected+"Current judgment"]==="on");G(selected)}}>Continue</button>}</div></>}
 </div></main>
}
