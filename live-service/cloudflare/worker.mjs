import {createIdentity} from '../server/privy.mjs';

function json(data, status = 200) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
}

async function api(request, env, path) {
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
  try { user = await createIdentity(env.PRIVY_APP_ID,env.PRIVY_APP_SECRET)(token); }
  catch { return json({error:'SESSION_INVALID_OR_EXPIRED'},401); }
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
    return json({id:user.subject,email:user.email,wallets:user.wallets,profile});
  }
  if(request.method==='POST' && /^\/api\/models\/(judgment|prediction|adjudication)$/.test(path))return json({error:'MODEL_NOT_CONNECTED',model:path.split('/').pop()},501);
  return json({error:'NOT_FOUND'},404);
}
export default {async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(!path.startsWith('/api/'))return env.ASSETS.fetch(request);
  try{return await api(request,env,path);}catch{return json({error:'SERVICE_UNAVAILABLE'},503);}
}};
