const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function deepseek(request,env,fetcher=fetch){
 if(request.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'ORIGIN_REQUIRED'},403);
 if(!env.DEEPSEEK_API_KEY)return reply({error:'DeepSeek is not configured.'},503);
 if(!env.MODEL_LIMIT||!(await env.MODEL_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)return reply({error:'Too many requests. Try again in a minute.'},429);
 const reader=request.body?.getReader();if(!reader)return reply({error:'Invalid request.'},400);
 let size=0,chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16000){await reader.cancel();return reply({error:'Request too large.'},413)}chunks.push(value)}
 let body;try{body=await new Response(new Blob(chunks)).json()}catch{return reply({error:'Invalid JSON.'},400)}
 if(body.consent!==true)return reply({error:'Explicit cloud consent is required.'},400);
 if(!['interview','reflect','proposal','check'].includes(body.task)||!Array.isArray(body.messages)||body.messages.length>5||body.messages.some(m=>!['system','user'].includes(m.role)||typeof m.content!=='string')||JSON.stringify(body.messages).length>12000)return reply({error:'Invalid model request.'},400);
 try{
 const upstream=await fetcher('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.DEEPSEEK_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify({model:'deepseek-flash',thinking:{type:'disabled'},stream:false,max_tokens:body.task==='check'?1400:1000,response_format:{type:'json_object'},messages:[{role:'system',content:'Return a concise English JSON object for a personal Twin. Never claim an action was executed. Never invent facts or source quotes.'},...body.messages]})});
 if(!upstream.ok)return reply({error:upstream.status===402?'DeepSeek balance is insufficient.':upstream.status===401?'DeepSeek credentials were rejected.':upstream.status===429?'DeepSeek is busy. Retry shortly.':'DeepSeek request failed.',providerStatus:upstream.status},502);
 const result=await upstream.json(),content=result.choices?.[0]?.message?.content;
 if(typeof content!=='string'||content.length>20000)return reply({error:'DeepSeek returned an invalid response.'},502);
 return reply({message:{content},model:'deepseek-flash'});
 }catch{return reply({error:'DeepSeek could not be reached. Retry shortly.'},502)}
}
