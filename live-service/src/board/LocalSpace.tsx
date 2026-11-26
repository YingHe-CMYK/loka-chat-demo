import {localModels} from "./localModel";
import {useState} from "react";
import {active,connect,revoke,resume,workspaceName,supported} from "./folderSync";

type Entry={name:string;text:string;infer:boolean;train:boolean;session?:string;folder?:string};
export function records(raw:string|undefined):Entry[]{
 try{return JSON.parse(raw||"[]")}catch{return []}
}
export function endReflection(raw:string){return JSON.stringify(records(raw).map(row=>({...row,infer:false})))}
export function permitted(raw:string|undefined){return records(raw).filter(row=>row.folder===active()).map(({name,text})=>({name,text}))}

export default function LocalSpace({raw,save,reflect}:{openApps:()=>void;raw?:string;save:(value:string)=>void;reflect:()=>void}){
 const [models,setModels]=useState<string[]>([]);
 const [model,setModel]=useState(localStorage.getItem("loka-local-model")||"");
 const [modelError,setModelError]=useState("");
 async function findModels(){try{setModelError("");const names=await localModels();setModels(names);if(!names.length)throw Error("Download a local model in Ollama, then retry.");if(!names.includes(model)){setModel(names[0]);localStorage.setItem("loka-local-model",names[0])}}catch(error){setModelError("Cannot connect. Start Ollama locally and allow this LokaChat origin. "+(error as Error).message)}}
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const rows=records(raw).filter(row=>row.folder===active());
 const [train,setTrain]=useState(localStorage.getItem("loka-local-training")==="yes");
 async function authorize(){
  setBusy(true);setError("");
  try{await connect()}catch(error){if((error as Error).name!=="AbortError")setError((error as Error).message)}
  finally{setBusy(false)}
 }
 async function disconnect(){
  setBusy(true);
  try{await revoke();save("[]");localStorage.removeItem("loka-local-training");setTrain(false);setError("")}
  catch(error){setError((error as Error).message)}finally{setBusy(false)}
 }
 return <section className="local-access-panel">
  <h1>Get to know your Twin.</h1>
  <p className="local-lead">Let your Twin read a folder on this device.</p>
  {!active()?<div className="local-empty">
   <div className="folder-symbol" aria-hidden="true">⌑</div>
   <h2>Your files stay here.</h2>
   <p>Read-only access to the folder you choose. New and changed text files sync while this page is open.</p>
   <button className="primary" disabled={!supported||busy} onClick={authorize}>{busy?"Opening…":"Authorize folder"}</button>
   {!supported&&<p role="status">Open this link in Chrome or Edge on a computer to authorize a folder.</p>}
  </div>:<>
   <div className="local-connected"><strong>{workspaceName()}</strong><span>Read only · {rows.length} files</span><small role="status">{sessionStorage.getItem("loka-sync-status")||"Reading folder…"}</small>
   <div className="local-controls"><button disabled={busy} onClick={authorize}>Change folder</button><button disabled={busy} onClick={disconnect}>Disconnect</button></div>
   <button onClick={()=>void resume().catch(error=>setError(error.message))}>Restore permission</button></div>
   <details className="local-files"><summary>Preview files</summary>{rows.length?rows.map(row=><details key={row.name}><summary>{row.name}</summary><pre>{row.text}</pre></details>):<p>Waiting for supported text files. TXT, Markdown, CSV, JSON and logs are supported.</p>}</details>
   <div className="local-use"><strong>Use on this device</strong><p>Files are read and previewed locally. Your Twin uses the selected local model.</p><label><input type="checkbox" checked={train} onChange={e=>{setTrain(e.target.checked);localStorage.setItem("loka-local-training",e.target.checked?"yes":"no")}}/> Allow future local training</label><small>Permission only. Training has not started.</small></div>
   <div className="local-model"><strong>Local model</strong><button onClick={findModels}>Connect local model</button>{models.length>0&&<label>Model<select value={model} onChange={e=>{setModel(e.target.value);localStorage.setItem("loka-local-model",e.target.value)}}>{models.map(name=><option key={name}>{name}</option>)}</select></label>}{modelError&&<p role="alert">{modelError}</p>}<small>{model||"Ollama · 127.0.0.1:11434"}</small></div><button className="primary" onClick={reflect}>Open mirror</button><p className="local-note">Files, messages and inference stay on this device.</p>
  </>}
  {error&&<p role="alert">{error}</p>}
 </section>
}
