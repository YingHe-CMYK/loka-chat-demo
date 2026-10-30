import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createApp,openDatabase} from '../server/app.mjs';
import {createIdentity} from '../server/privy.mjs';
import {verifyAccessToken} from '@privy-io/node';
import {generateKeyPairSync,sign} from 'node:crypto';
async function serve(options,fn){const server=createApp(options).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;try{await fn(async(path,token,method='GET',body)=>{const r=await fetch(base+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};});}finally{await new Promise(r=>server.close(r));}}
test('real SDK verifies signatures, expiry and application audience',async()=>{
 assert.equal(typeof createIdentity('id','secret'),'function');
 const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),pem=publicKey.export({type:'spki',format:'pem'});
 const token=(overrides={})=>{const h=Buffer.from(JSON.stringify({alg:'ES256',typ:'JWT'})).toString('base64url');const p=Buffer.from(JSON.stringify({iss:'privy.io',aud:'test-app',sub:'did:privy:test',sid:'session',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+60,...overrides})).toString('base64url');return `${h}.${p}.${sign('sha256',Buffer.from(h+'.'+p),{key:privateKey,dsaEncoding:'ieee-p1363'}).toString('base64url')}`;};
 const verify=t=>verifyAccessToken({access_token:t,app_id:'test-app',verification_key:pem});
 assert.equal((await verify(token())).user_id,'did:privy:test');await assert.rejects(()=>verify(token({aud:'wrong'})));await assert.rejects(()=>verify(token({exp:1})));await assert.rejects(()=>verify(token().slice(0,-12)+'AAAAAAAAAAAA'));
});
test('server-owned identity, uniqueness, restart persistence and unavailable models',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'loka-api-')),path=join(dir,'test.sqlite');let db=openDatabase(path);
 const identity=async token=>{if(!['alice','bob'].includes(token))throw Error('bad token');return {subject:token,email:token+'@example.com',wallets:[{address:'verified-'+token}]};};
 try{await serve({db,identity,config:{appId:'public-id'}},async req=>{
 assert.equal((await req('/api/me')).status,401);assert.equal((await req('/api/me','bad')).status,401);
 assert.equal((await req('/api/me','alice','PUT',{username:'A'})).status,400);
 assert.equal((await req('/api/me','alice','PUT',{username:'Alice',subject:'bob',email:'attacker@example.com',wallets:[]})).status,200);
 const a=await req('/api/me','alice');assert.equal(a.body.id,'alice');assert.equal(a.body.email,'alice@example.com');assert.equal(a.body.wallets[0].address,'verified-alice');
 assert.equal((await req('/api/me','bob')).body.profile,null);assert.equal((await req('/api/me','bob','PUT',{username:'alice'})).status,409);
 for(const kind of ['judgment','prediction','adjudication'])assert.equal((await req('/api/models/'+kind,'alice','POST',{})).status,501);
 assert.equal((await req('/api/config')).body.appId,'public-id');assert.equal((await req('/api/config')).body.appSecret,undefined);
 });db.close();db=openDatabase(path);await serve({db,identity,config:{}},async req=>assert.equal((await req('/api/me','alice')).body.profile.username,'Alice'));
 await serve({db,identity:null,config:{}},async req=>{assert.equal((await req('/api/config')).body.ready,false);assert.equal((await req('/api/me','alice')).status,503);});
 }finally{db.close();rmSync(dir,{recursive:true});}
});
