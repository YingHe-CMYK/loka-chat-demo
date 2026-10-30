import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
export function openDatabase(path){
 const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS accounts (subject TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);return db;
}
export function createApp({db,identity,config,staticDir}){
 const app=express();app.disable('x-powered-by');if(config.trustProxyHops)app.set('trust proxy',config.trustProxyHops);
 app.use(helmet({contentSecurityPolicy:false,crossOriginEmbedderPolicy:false}));
 app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use('/api',rateLimit({windowMs:60000,limit:60,standardHeaders:'draft-8',legacyHeaders:false}));
 app.use(express.json({limit:'32kb'}));
 app.get('/api/health',(_req,res)=>res.json({ok:true,authenticationConfigured:!!identity,models:{judgment:false,prediction:false,adjudication:false}}));
 app.get('/api/config',(_req,res)=>res.json({appId:config.appId||'',clientId:config.clientId||'',ready:!!identity}));
 app.use('/api',async(req,res,next)=>{
  if(!identity)return res.status(503).json({error:'AUTH_NOT_CONFIGURED'});
  const m=/^Bearer (\S+)$/.exec(req.get('authorization')||'');if(!m)return res.status(401).json({error:'SIGN_IN_REQUIRED'});
  try{req.identity=await identity(m[1]);if(!req.identity?.subject)throw Error('Missing identity');next();}catch{return res.status(401).json({error:'SESSION_INVALID_OR_EXPIRED'});}
 });
 const account=subject=>db.prepare('SELECT username, created_at, updated_at FROM accounts WHERE subject=?').get(subject)||null;
 app.get('/api/me',(req,res)=>res.json({id:req.identity.subject,email:req.identity.email,profile:account(req.identity.subject),wallets:req.identity.wallets}));
 app.put('/api/me',(req,res)=>{
  // The verified subject owns the row. Body IDs, email and wallet addresses are never trusted.
  const name=typeof req.body?.username==='string'?req.body.username.normalize('NFKC').trim():'';
  if(!/^[\p{L}\p{N}][\p{L}\p{N}_. -]{1,23}$/u.test(name))return res.status(400).json({error:'USERNAME_INVALID'});
  const now=new Date().toISOString();try{db.prepare(`INSERT INTO accounts VALUES(?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET username=excluded.username,username_key=excluded.username_key,updated_at=excluded.updated_at`).run(req.identity.subject,name,name.toLowerCase(),now,now);}catch(e){if(String(e.message).includes('UNIQUE'))return res.status(409).json({error:'USERNAME_TAKEN'});throw e;}
  res.json({profile:account(req.identity.subject)});
 });
 // Reserved contracts, intentionally no fake responses or guessed upstream protocols.
 app.post('/api/models/:kind',(req,res)=>{
  if(!['judgment','prediction','adjudication'].includes(req.params.kind))return res.status(404).json({error:'MODEL_UNKNOWN'});
  res.status(501).json({error:'MODEL_NOT_CONNECTED',model:req.params.kind});
 });
 app.use('/api',(_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
 if(staticDir){app.use(express.static(resolve(staticDir),{index:'index.html'}));}
 app.use((err,_req,res,_next)=>{const status=err.status===413?413:err instanceof SyntaxError?400:500;res.status(status).json({error:status===500?'SERVER_ERROR':'INVALID_REQUEST'});});
 return app;
}
