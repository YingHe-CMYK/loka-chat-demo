import { calibrationSQL, parseCalibrationExample, isCalibrationId, formatCalibrationExample } from '../src/domain/calibration-dataset.mjs';
import express from 'express';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const companionSchema = readFileSync(new URL('../cloudflare/migrations/0002_miro.sql', import.meta.url), 'utf8');
const pointsSchema = readFileSync(new URL('../cloudflare/migrations/0005_qb_accounts.sql', import.meta.url), 'utf8');
const calibrationSchema = readFileSync(new URL('../cloudflare/migrations/0006_calibration_examples.sql', import.meta.url), 'utf8');
export function openDatabase(path){
 const db=new DatabaseSync(path);db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS accounts (subject TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);db.exec(companionSchema);db.exec(pointsSchema);db.exec(calibrationSchema);return db;
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
 const ensurePoints = subject => db.prepare('INSERT OR IGNORE INTO qb_accounts(owner,account_id,created_at) VALUES(?,?,?)')
  .run(subject, 'qb_' + randomUUID(), new Date().toISOString());
 app.get(['/api/points', '/api/qb'], (req, res) => {
  const {subject} = req.identity;
  if (!account(subject)) return res.status(409).json({error:'PROFILE_REQUIRED'});
  ensurePoints(subject);
  const pointsAccount = db.prepare('SELECT account_id,created_at FROM qb_accounts WHERE owner=?').get(subject);
  const balance = db.prepare('SELECT COALESCE(SUM(amount_minor),0) AS balance_minor FROM qb_entries WHERE owner=?').get(subject);
  const entries = db.prepare('SELECT id,amount_minor,kind,reference,created_at FROM qb_entries WHERE owner=? ORDER BY created_at DESC LIMIT 100').all(subject);
  return res.json({account:pointsAccount,...balance,currency:'LP',scale:100,entries,topupEnabled:false});
 });
 app.get('/api/me',(req,res)=>res.json({id:req.identity.subject,email:req.identity.email,profile:account(req.identity.subject),wallets:req.identity.wallets}));
 app.put('/api/me',(req,res)=>{
  // The verified subject owns the row. Body IDs, email and wallet addresses are never trusted.
  const name=typeof req.body?.username==='string'?req.body.username.normalize('NFKC').trim():'';
  if(!/^[\p{L}\p{N}][\p{L}\p{N}_. -]{1,23}$/u.test(name))return res.status(400).json({error:'USERNAME_INVALID'});
  const now=new Date().toISOString();try{db.prepare(`INSERT INTO accounts VALUES(?,?,?,?,?) ON CONFLICT(subject) DO UPDATE SET username=excluded.username,username_key=excluded.username_key,updated_at=excluded.updated_at`).run(req.identity.subject,name,name.toLowerCase(),now,now);}catch(e){if(String(e.message).includes('UNIQUE'))return res.status(409).json({error:'USERNAME_TAKEN'});throw e;}
  ensurePoints(req.identity.subject);
  res.json({profile:account(req.identity.subject)});
 });
 const companion = subject => db.prepare('SELECT ai_id,name,appearance,created_at,updated_at FROM companions WHERE owner=?').get(subject) || null;
 app.get('/api/companion', (req, res) => {
  const {subject} = req.identity;
  if (!account(subject)) return res.status(409).json({error:'PROFILE_REQUIRED'});
  return res.json({companion:companion(subject)});
 });
 app.all('/api/companion/calibration-examples', (req,res)=>{
  const {subject} = req.identity;
  const twin = companion(subject);
  const twinId = req.method === 'GET' ? req.query.twinId : req.body?.twinId;
  if (!twin || twinId !== twin.ai_id) return res.status(409).json({error:'TWIN_MISMATCH'});
  if (req.method === 'GET') return res.json({examples:db.prepare(calibrationSQL.list).all(subject,twinId).map(formatCalibrationExample)});
  if (req.method === 'DELETE') {
   if (!isCalibrationId(req.body?.id)) return res.status(400).json({error:'INVALID_EXAMPLE'});
   db.prepare(calibrationSQL.remove).run(subject,twinId,req.body.id);
   return res.json({removed:true});
  }
  if (req.method !== 'POST') return res.status(405).json({error:'METHOD_NOT_ALLOWED'});
  const sample = parseCalibrationExample(req.body);
  if (!sample) return res.status(400).json({error:'INVALID_EXAMPLE'});
  db.prepare(calibrationSQL.save).run(sample.id,JSON.stringify(sample.example),new Date().toISOString(),subject,twinId);
  return res.json({id:sample.id,saved:true});
 });
 app.put('/api/companion', (req, res) => {
  const {subject} = req.identity;
  if (!account(subject)) return res.status(409).json({error:'PROFILE_REQUIRED'});
  const name = typeof req.body?.name === 'string' ? req.body.name.normalize('NFKC').trim() : '';
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,23}$/u.test(name)) return res.status(400).json({error:'AI_NAME_INVALID'});
  const now = new Date().toISOString();
  if (req.body?.twinId !== undefined) {
    const result = db.prepare('UPDATE companions SET name=?,updated_at=? WHERE owner=? AND ai_id=?')
      .run(name,now,subject,typeof req.body.twinId === 'string' ? req.body.twinId : '');
    if (!result.changes) return res.status(409).json({error:'TWIN_MISMATCH'});
    return res.json({companion:companion(subject)});
  }
  db.prepare(`INSERT INTO companions(owner,ai_id,name,created_at,updated_at) VALUES(?,?,?,?,?)
   ON CONFLICT(owner) DO UPDATE SET name=excluded.name,updated_at=excluded.updated_at`)
   .run(subject, 'miro_' + randomUUID(), name, now, now);
  return res.json({companion:companion(subject)});
 });
 // Reserved contracts, intentionally no fake responses or guessed upstream protocols.
 app.post('/api/models/:kind',(req,res)=>{
  if(!['judgment','prediction','adjudication'].includes(req.params.kind))return res.status(404).json({error:'MODEL_UNKNOWN'});
  res.status(501).json({error:'MODEL_NOT_CONNECTED',model:req.params.kind});
 });
 app.use('/api',(_req,res)=>res.status(404).json({error:'NOT_FOUND'}));
 if(staticDir){
  const directory=resolve(staticDir);
  app.use(express.static(directory,{index:'index.html'}));
  app.get(['/twin-workspace', '/twin'],(_req,res)=>res.sendFile(resolve(directory,'index.html')));
 }
 app.use((err,_req,res,_next)=>{const status=err.status===413?413:err instanceof SyntaxError?400:500;res.status(status).json({error:status===500?'SERVER_ERROR':'INVALID_REQUEST'});});
 return app;
}
