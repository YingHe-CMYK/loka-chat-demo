import { calibrationSQL, parseCalibrationExample, isCalibrationId, formatCalibrationExample } from '../src/domain/calibration-dataset.mjs';
import {deepseek} from './deepseek.mjs';
import {connectionApi,connectionCallback} from './connections.mjs';
import {previewModel} from "./gemini.mjs";
import {initialWorkspace, transition} from '../src/domain/workspace.mjs';
import {createIdentity} from '../server/privy.mjs';

function json(data, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}

export async function api(request, env, path, identityFactory = createIdentity) {
  if(path==='/api/deepseek')return deepseek(request,env);
  if(path==="/api/preview/model")return json({error:"CLOUD_INFERENCE_DISABLED",message:"Use the local model on this device. Do not send source files here."},410);
  if(path.startsWith('/api/connections/callback/'))return connectionCallback(request,env);
  const ready = Boolean(env.PRIVY_APP_ID && env.PRIVY_APP_SECRET);
  if (path === '/api/config' && request.method === 'GET') {
    return json({ready, appId: env.PRIVY_APP_ID || '', clientId: env.PRIVY_CLIENT_ID || ''});
  }
  if (path === '/api/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT subject FROM accounts LIMIT 0').all();
    return json({ok: true, authenticationConfigured: ready, models: {judgment:false, prediction:false, adjudication:false}});
  }
  if (!ready) return json({error:'AUTH_NOT_CONFIGURED'},503);
  const token = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '')?.[1];
  if (!token) return json({error:'SIGN_IN_REQUIRED'},401);
  if (env.AUTH_LIMIT && !(await env.AUTH_LIMIT.limit({key:request.headers.get('CF-Connecting-IP') || 'unknown'})).success) return json({error:'TOO_MANY_REQUESTS'},429);
  let user;
  try { user = await identityFactory(env.PRIVY_APP_ID,env.PRIVY_APP_SECRET)(token); }
  catch { return json({error:'SESSION_INVALID_OR_EXPIRED'},401); }
  if(path==='/api/connections'||path.startsWith('/api/connections/')){const profile=await env.DB.prepare('SELECT subject FROM accounts WHERE subject=?').bind(user.subject).first();if(!profile)return json({error:'PROFILE_REQUIRED'},409);return connectionApi(request,env,user)}
  if((path==='/api/points'||path==='/api/qb') && request.method==='GET'){
    const profile=await env.DB.prepare('SELECT subject FROM accounts WHERE subject=?').bind(user.subject).first();
    if(!profile)return json({error:'PROFILE_REQUIRED'},409);
    await env.DB.prepare('INSERT OR IGNORE INTO qb_accounts(owner,account_id,created_at) VALUES(?,?,?)').bind(user.subject,'qb_'+crypto.randomUUID(),new Date().toISOString()).run();
    const account=await env.DB.prepare('SELECT account_id,created_at FROM qb_accounts WHERE owner=?').bind(user.subject).first();
    const balance=await env.DB.prepare('SELECT COALESCE(SUM(amount_minor),0) AS balance_minor FROM qb_entries WHERE owner=?').bind(user.subject).first();
    const entries=await env.DB.prepare('SELECT id,amount_minor,kind,reference,created_at FROM qb_entries WHERE owner=? ORDER BY created_at DESC LIMIT 100').bind(user.subject).all();
    return json({account,...balance,currency:'LP',scale:100,entries:entries.results,topupEnabled:false});
  }
  if (path === '/api/workspace' || path === '/api/workspace/commands' || path === '/api/workspace/export') {
    const account=await env.DB.prepare('SELECT subject FROM accounts WHERE subject=?').bind(user.subject).first();
    if(!account)return json({error:'PROFILE_REQUIRED'},409);
    const now=new Date().toISOString();
    await env.DB.prepare('INSERT OR IGNORE INTO workspaces(owner,revision,document,updated_at) VALUES(?,0,?,?)').bind(user.subject,JSON.stringify(initialWorkspace()),now).run();
    const row=await env.DB.prepare('SELECT revision,document FROM workspaces WHERE owner=?').bind(user.subject).first();
    const workspace=JSON.parse(row.document);
    if(request.method==='GET' && path==='/api/workspace/export')return json({exportedAt:now,owner:user.subject,workspace});
    if(request.method==='GET' && path==='/api/workspace')return json({workspace});
    if(request.method!=='POST'||path!=='/api/workspace/commands')return json({error:'METHOD_NOT_ALLOWED'},405);
    const reader=request.body?.getReader();if(!reader)return json({error:'INVALID_REQUEST'},400);
    let bytes=0;const chunks=[];
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>32768){await reader.cancel();return json({error:'INVALID_REQUEST'},413);}chunks.push(value);}
    let body;try{body=await new Response(new Blob(chunks)).json();}catch{return json({error:'INVALID_REQUEST'},400);}
    if(workspace.processed.includes(body?.command?.id))return json({workspace});
    if(body.revision!==row.revision)return json({error:'STATE_CONFLICT'},409);
    let next;try{next=transition(workspace,body.command);}catch(e){return json({error:e.message},e.message==='SERVICE_NOT_CONNECTED'?501:400);}
    if(JSON.stringify(next).length>500000)return json({error:'WORKSPACE_LIMIT'},413);
    const result=await env.DB.prepare('UPDATE workspaces SET document=?,revision=?,updated_at=? WHERE owner=? AND revision=?').bind(JSON.stringify(next),next.revision,now,user.subject,row.revision).run();
    if(!result.meta.changes)return json({error:'STATE_CONFLICT'},409);
    return json({workspace:next});
  }
  if (path === '/api/companion/calibration-examples') {
    const method = request.method;
    if (!['GET','POST','DELETE'].includes(method)) return json({error:'METHOD_NOT_ALLOWED'},405);
    let body;
    if (method !== 'GET') {
      const reader = request.body?.getReader();
      if (!reader) return json({error:'INVALID_EXAMPLE'},400);
      let size = 0;
      const chunks = [];
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8192) { await reader.cancel(); return json({error:'INVALID_EXAMPLE'},413); }
        chunks.push(value);
      }
      try { body = await new Response(new Blob(chunks)).json(); }
      catch { return json({error:'INVALID_EXAMPLE'},400); }
    }
    const twinId = method === 'GET' ? new URL(request.url).searchParams.get('twinId') : body?.twinId;
    if (typeof twinId !== 'string') return json({error:'TWIN_MISMATCH'},409);
    const twin = await env.DB.prepare('SELECT ai_id FROM companions WHERE owner=? AND ai_id=?').bind(user.subject,twinId).first();
    if (!twin) return json({error:'TWIN_MISMATCH'},409);
    if (method === 'GET') {
      const {results} = await env.DB.prepare(calibrationSQL.list).bind(user.subject,twinId).all();
      return json({examples:results.map(formatCalibrationExample)});
    }
    if (method === 'DELETE') {
      if (!isCalibrationId(body?.id)) return json({error:'INVALID_EXAMPLE'},400);
      await env.DB.prepare(calibrationSQL.remove).bind(user.subject,twinId,body.id).run();
      return json({removed:true});
    }
    const sample = parseCalibrationExample(body);
    if (!sample) return json({error:'INVALID_EXAMPLE'},400);
    await env.DB.prepare(calibrationSQL.save).bind(sample.id,JSON.stringify(sample.example),new Date().toISOString(),user.subject,twinId).run();
    return json({id:sample.id,saved:true});
  }
  if (path === '/api/companion') {
    const account=await env.DB.prepare('SELECT subject FROM accounts WHERE subject=?').bind(user.subject).first();
    if(!account)return json({error:'PROFILE_REQUIRED'},409);
    if(request.method==='PUT'){
      const reader=request.body?.getReader();if(!reader)return json({error:'INVALID_REQUEST'},400);
      let bytes=0;const chunks=[];
      for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();return json({error:'INVALID_REQUEST'},413);}chunks.push(value);}
      let body;try{body=await new Response(new Blob(chunks)).json();}catch{return json({error:'INVALID_REQUEST'},400);}
      const name=typeof body.name==='string'?body.name.normalize('NFKC').trim():'';
      if(!/^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,23}$/u.test(name))return json({error:'AI_NAME_INVALID'},400);
      const now=new Date().toISOString();
      if (body.twinId !== undefined) {
        const result = await env.DB.prepare('UPDATE companions SET name=?,updated_at=? WHERE owner=? AND ai_id=?')
          .bind(name,now,user.subject,typeof body.twinId === 'string' ? body.twinId : '').run();
        if (!result.meta.changes) return json({error:'TWIN_MISMATCH'},409);
      } else {
        await env.DB.prepare('INSERT INTO companions(owner,ai_id,name,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at').bind(user.subject,'miro_'+crypto.randomUUID(),name,now,now).run();
      }
    }else if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
    return json({companion:await env.DB.prepare('SELECT ai_id,name,appearance,created_at,updated_at FROM companions WHERE owner=?').bind(user.subject).first()});
  }
  if (path === '/api/me') {
    if (request.method === 'PUT') {
      if (!request.headers.get('content-type')?.includes('application/json')) return json({error:'INVALID_REQUEST'},415);
      const reader=request.body?.getReader();if(!reader)return json({error:'INVALID_REQUEST'},400);
      let bytes=0;const chunks=[];
      for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();return json({error:'INVALID_REQUEST'},413);}chunks.push(value);}
      let body;try { body=await new Response(new Blob(chunks)).json(); } catch { return json({error:'INVALID_REQUEST'},400); }
      const name=typeof body?.username==='string'?body.username.normalize('NFKC').trim():'';
      if(!/^[\p{L}\p{N}][\p{L}\p{N}_. -]{1,23}$/u.test(name))return json({error:'USERNAME_INVALID'},400);
      const now=new Date().toISOString();
      try { await env.DB.prepare('INSERT INTO accounts VALUES(?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET username=excluded.username,username_key=excluded.username_key,updated_at=excluded.updated_at').bind(user.subject,name,name.toLowerCase(),now,now).run(); }
      catch(e){if(String(e.message).includes('UNIQUE constraint failed: accounts.username_key'))return json({error:'USERNAME_TAKEN'},409);throw e;}
    } else if(request.method!=='GET')return json({error:'METHOD_NOT_ALLOWED'},405);
    const profile=await env.DB.prepare('SELECT username,created_at,updated_at FROM accounts WHERE subject=?').bind(user.subject).first();
    if(profile)await env.DB.prepare('INSERT OR IGNORE INTO qb_accounts(owner,account_id,created_at) VALUES(?,?,?)').bind(user.subject,'qb_'+crypto.randomUUID(),new Date().toISOString()).run();
    return json({id:user.subject,email:user.email,wallets:user.wallets,profile});
  }
  if(request.method==='POST' && /^\/api\/models\/(judgment|prediction|adjudication)$/.test(path))return json({error:'MODEL_NOT_CONNECTED',model:path.split('/').pop()},501);
  return json({error:'NOT_FOUND'},404);
}
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/mirror/'))return Response.redirect(new URL('/',request.url),302);
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{return await api(request,env,path);}catch{return json({error:'SERVICE_UNAVAILABLE'},503);}
}};
