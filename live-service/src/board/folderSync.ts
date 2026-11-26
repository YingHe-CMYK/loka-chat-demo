import {get,set,del} from "idb-keyval";
import {records} from "./LocalSpace";
const key="loka-sync-folder";
const cache=new Map<string,{modified:number;size:number;text:string}>();
type Dir=FileSystemDirectoryHandle & {values():AsyncIterable<Dir|FileSystemFileHandle>,queryPermission():Promise<string>,requestPermission(opts:{mode:"read"}):Promise<string>};
type Picker=()=>Promise<Dir>;
export const supported=typeof (window as Window & {showDirectoryPicker?:Picker}).showDirectoryPicker==="function";
export const active=()=>localStorage.getItem(key);
export async function connect(){
 const folder=await (window as unknown as {showDirectoryPicker:Picker}).showDirectoryPicker();
 const previous=active();
 const id=crypto.randomUUID();
 localStorage.setItem(key+"-name",folder.name);
 await set(key+id,folder);
 localStorage.setItem(key,id);
 if(previous)await del(key+previous);
 sessionStorage.setItem("loka-sync-status","Reading folder…");
 window.dispatchEvent(new Event("loka-sync"));
}
export const workspaceName=()=>localStorage.getItem(key+"-name")||"Local folder";
export async function resume(){
 const id=active();
 if(!id)throw Error("No connected workspace.");
 const handle=await get<Dir>(key+id);
 if(!handle||await handle.requestPermission({mode:"read"})!=="granted")throw Error("Folder access was not granted.");
 window.dispatchEvent(new Event("loka-sync"));
}
export async function revoke(){
 const id=active();cache.clear();localStorage.removeItem(key);localStorage.removeItem(key+"-name");
 sessionStorage.removeItem("loka-sync-status");
 window.dispatchEvent(new Event("loka-sync"));
 if(id)await del(key+id);
}
export async function scan(apply:(id:string,rows:{name:string,text:string}[])=>void){
 const id=active();if(!id)return;
 const dir=await get<Dir>(key+id);
 if(!dir||await dir.queryPermission()!=="granted")throw Error("Permission expired. Reconnect the folder.");
 const rows:{name:string,text:string}[]=[];let size=0,total=0;
 const seen=new Set<string>();
 async function walk(folder:Dir,path:string){
  for await(const entry of folder.values()){
   if(id!==active())return;
   if(entry.name.startsWith(".")||entry.name==="node_modules")continue;
   const name=path+"/"+entry.name;
   if(entry.kind==="directory"){await walk(entry,name);continue}
   if(!/\.(txt|md|csv|json|jsonl|log)$/i.test(name))continue;
   const file=await entry.getFile();if(file.size>1000000)continue;
   const cacheKey=id+":"+name;seen.add(cacheKey);
   const previous=cache.get(cacheKey);
   const text=previous?.modified===file.lastModified&&previous.size===file.size?previous.text:await file.text();
   cache.set(cacheKey,{modified:file.lastModified,size:file.size,text});
   if(!text.trim())continue;
   total+=text.length;
   if(++size>5000||total>20000000)throw Error("This folder exceeds the current 5,000-file / 20 MB text limit.");
   rows.push({name,text});
  }
 }
 await walk(dir,dir.name);
 if(id===active()){for(const name of cache.keys())if(!seen.has(name))cache.delete(name);apply(id,rows)}
}
export function merge(raw:string,id:string,rows:{name:string,text:string}[]){
 const prev=records(raw),other:typeof prev=[];
 const next=[...other,...rows.map(row=>prev.find(r=>r.folder===id&&r.name===row.name&&r.text===row.text)||{...row,folder:id,infer:false,train:false})];
 if(next.length>5000||next.reduce((n,r)=>n+r.text.length,0)>20000000)throw Error("Workspace full. Remove records or choose a smaller folder.");
 return JSON.stringify(next);
}
