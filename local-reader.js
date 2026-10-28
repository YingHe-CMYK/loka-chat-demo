// Reads only a folder or files explicitly selected in the browser. No raw content is uploaded.
const groups=[
 {topic:'health',words:/减重|减肥|补剂|药物|注射|体重|glp.?1|semaglutide|tirzepatide|weight loss|supplement|prescription|injection|oura|sleep/ig},
 {topic:'meaning',words:/塔罗|八字|命理|方向|意义|转行|离开|选择|tarot|career change|meaning|purpose/ig},
 {topic:'connection',words:/朋友|关系|约见|联系|聊天|聚会|friend|relationship|meet up|reconnect/ig},
 {topic:'research',words:/论文|实验|模型|训练|研究|arxiv|paper|experiment|model|training|research|retrieval|benchmark|inference/ig}
];
// A cue is a question based on explicit words, not a personality or medical inference.
const cueRules=[
 {key:'life',re:/my family|with (?:my )?family|family time|my parents|my children|personal life|家人|父母|孩子|生活时间/i,probe:'Your notes mention life outside work. Is making more room for it part of what matters here?'},
 {key:'time',re:/deadline|due date|time pressure|calendar|schedule|时间不够|截止|日程|没时间/i,probe:'Your notes mention timing or deadlines. Is making uninterrupted time the harder part?'},
 {key:'uncertainty',re:/uncertain|unclear|trade.?off|which option|compar(?:e|ing|ison)|不确定|纠结|选择|比较/i,probe:'Your notes mention uncertainty or comparisons. Is choosing a direction the harder part?'},
 {key:'continuity',re:/unfinished|stuck|blocked|unfinished|反复|搁置|卡住|未完成/i,probe:'Your notes mention something unfinished or difficult to move forward. Is getting started the harder part?'},
 {key:'connection',re:/reconnect|reach out|conversation|message|联系|沟通|对话/i,probe:'Your notes mention contact or conversation. Is finding the right opening the harder part?'}
];
const supported=/\.(txt|md|markdown|csv|json|jsonl|ics|html|htm|log|yaml|yml|py|js|ts|ipynb|pdf|docx)$/i;
const ignored=/(^|\/)(\.git|node_modules|\.venv|venv|dist|build|__pycache__|Library|\.cache)(\/|$)/i;
const clean=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const safe=s=>clean(s).replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]').replace(/\b(?:sk-|ghp_|AIza)[A-Za-z0-9_-]{12,}\b/g,'[secret]').slice(0,150);
const base=s=>String(s||'').split('/').at(-1).slice(0,90);
let zipPromise;
async function zipLib(){if(window.JSZip)return window.JSZip;if(!zipPromise)zipPromise=new Promise((ok,no)=>{const s=document.createElement('script');s.src='./vendor/jszip.min.js';s.onload=()=>ok(window.JSZip);s.onerror=()=>no(Error('DOCX reader could not load'));document.head.append(s)});return zipPromise}
async function readDocx(file){const Zip=await zipLib(),zip=await Zip.loadAsync(await file.arrayBuffer());const xml=await zip.file('word/document.xml')?.async('string')||'';return xml.replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,' ')}
async function readPdf(file){const pdfjs=await import('./vendor/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='./vendor/pdf.worker.mjs';const pdf=await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;const parts=[];for(let i=1;i<=Math.min(pdf.numPages,12);i++){const page=await pdf.getPage(i),content=await page.getTextContent();parts.push(content.items.map(x=>x.str||'').join(' '))}return parts.join(' ')}
async function read(file){if(/\.docx$/i.test(file.name))return readDocx(file);if(/\.pdf$/i.test(file.name))return readPdf(file);return file.text()}
const checkAbort=signal=>{if(signal?.aborted)throw new DOMException('Reading stopped','AbortError')};
export async function filesFromDirectory(handle,onProgress=()=>{},{signal}={}){const out=[];async function walk(dir,path='',depth=0){if(depth>10||out.length>=10000)return;for await(const [name,item] of dir.entries()){checkAbort(signal);const relative=path?path+'/'+name:name;if(ignored.test(relative)||name.startsWith('.'))continue;if(item.kind==='directory'){await walk(item,relative,depth+1);continue}if(supported.test(name)){const file=await item.getFile();Object.defineProperty(file,'lokaPath',{value:relative});out.push(file);if(out.length%100===0)onProgress({discovered:out.length,path:relative});if(out.length>=10000)break}}}await walk(handle);return out}
export async function learnFromFiles(fileList,onProgress=()=>{},{signal}={}){
 const all=[...fileList],readable=all.filter(f=>supported.test(f.name)&&!ignored.test(f.lokaPath||f.webkitRelativePath||f.name));
 const candidates=readable.filter(f=>f.size<=8_000_000).sort((a,b)=>(b.lastModified||0)-(a.lastModified||0)).slice(0,3000);
 const records=[],types={};for(const f of readable){const kind=f.name.split('.').at(-1).toLowerCase();types[kind]=(types[kind]||0)+1}
 let cursor=0,completed=0,lastReported=0;
 async function worker(){while(cursor<candidates.length){checkAbort(signal);const file=candidates[cursor++];let raw='';try{raw=await read(file)}catch{completed++;continue}checkAbort(signal);const text=clean(raw).slice(0,160000);if(text){
  const points=Object.fromEntries(groups.map(k=>[k.topic,(text.match(k.words)||[]).length+(file.name.match(k.words)||[]).length*3]));
  const claim=text.match(/(?:test\s+whether|whether)\s+([^.!?]{8,95})/i);if(claim)points.research+=6;const first=groups.flatMap(k=>[...text.matchAll(k.words)]).sort((a,b)=>a.index-b.index)[0];const start=Math.max(0,(claim?.index??first?.index??0)-12);
  const cue=cueRules.find(x=>(x.key!=='life'||points.research>0)&&x.re.test(text));const cueMatch=cue?text.match(cue.re):null;const cueStart=Math.max(0,(cueMatch?.index||0)-45);records.push({name:base(file.name),path:file.lokaPath||file.webkitRelativePath||file.name,modified:file.lastModified||0,points,excerpt:safe(text.slice(start,start+200)),cue:cue?{key:cue.key,probe:cue.probe,excerpt:safe(text.slice(cueStart,cueStart+170))}:null});
 }completed++;if(completed-lastReported>=25||completed===candidates.length){lastReported=completed;onProgress({discovered:readable.length,read:completed,total:candidates.length,path:file.name});await new Promise(r=>setTimeout(r,0))}}}
 await Promise.all(Array.from({length:Math.min(8,candidates.length)},worker));
 if(!records.length)return {count:0,facts:[],evidence:[],topic:'general',guess:'',inventory:{discovered:readable.length,read:0,types}};
 const totals=Object.fromEntries(groups.map(k=>[k.topic,records.reduce((n,r)=>n+r.points[k.topic],0)]));const ordered=Object.entries(totals).sort((a,b)=>b[1]-a[1]);const topic=ordered[0][1]>0?ordered[0][0]:'general';
 const ranked=[...records].sort((a,b)=>(b.points[topic]||0)-(a.points[topic]||0)||b.modified-a.modified),top=ranked.slice(0,3),lead=top[0].name.replace(/\.[^.]+$/,'');
 const focus=(top[0].excerpt.match(/(?:test\s+whether|whether)\s+([^.!?]{8,95})/i)||[])[1]?.trim()||'';
 const groundedCue=topic==='general'?null:ranked.find(r=>r.points[topic]>0&&r.cue);const probe=groundedCue?.cue?.probe||'';
 const guesses={health:'Your selected material contains health-related terms. Is there a health decision you want to explore?',meaning:'Your selected material mentions questions of direction. Is there a choice you want to examine?',connection:'Your selected material mentions relationships or conversation. Is there a connection you want to revisit?',research:focus?`Your note asks whether ${focus}. Is this the question you want to test?`:'Your selected material discusses research. Is finding a useful next direction on your mind?',general:'I need more context before I can make a useful personal guess.'};

 const typesLabel=Object.entries(types).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,n])=>`${n} ${k.toUpperCase()}`).join(' · ');
 return {count:records.length,inventory:{discovered:readable.length,read:records.length,types},facts:[{source:'Selected folder',label:'Files found',value:String(readable.length)},{source:'Selected folder',label:'Files analyzed',value:String(records.length)},{source:'Selected folder',label:'Formats',value:typesLabel||'Documents'},{source:top[0].path,label:'Strongest clue',value:top[0].name}],evidence:[...(groundedCue?[`${groundedCue.path} · ${groundedCue.cue.excerpt}`]:[]),...top.filter(r=>r!==groundedCue).map(r=>`${r.path} · ${r.excerpt}`)].slice(0,3),topic,guess:guesses[topic],probe,probeKey:groundedCue?.cue?.key||'',focus,excerpt:top[0].excerpt,titles:top.map(r=>r.name)};
}
