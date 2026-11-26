import './twin-workspace/workspace.css';
import CloudSources from './CloudSources';
import {useEffect,useRef,useState} from 'react';
import {PrivyProvider,usePrivy,useLoginWithEmail,useLoginWithOAuth} from '@privy-io/react-auth';
import './identity.css';
type Config={ready:boolean;appId:string;clientId:string};
function workspaceReturnPath() {
 const query = new URLSearchParams(location.search);
 if (query.get('view') !== 'trades') return '/twin-workspace';
 const target = new URL(query.get('return') === 'twin' ? '/twin' : '/twin-workspace?view=trades', location.origin);
 if (query.get('initiative') === '1') target.searchParams.set('initiative', '1');
 return target.pathname + target.search;
}

function IdentityFlow(){
 const {ready,authenticated,getAccessToken,logout}=usePrivy();const {sendCode,loginWithCode}=useLoginWithEmail();
 const {initOAuth}=useLoginWithOAuth({onError:()=>setError(guidedTrade?'Google sign-in was not completed. Try again or use an email code.':'Google sign-in was not completed. Try again or use an email code.')});
 const [qb,setQb]=useState<any>(null);
 const loadedSession=useRef(false);
 const guidedTrade = new URLSearchParams(location.search).get('view') === 'trades';
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[step,setStep]=useState('email'),[username,setUsername]=useState(''),[twin,setTwin]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[account,setAccount]=useState<any>(null),[companion,setCompanion]=useState<any>(null);const lock=useRef(false);
 async function api(path:string,method='GET',body?:unknown,signal?:AbortSignal){const token=await getAccessToken();if(!token)throw Error('Sign in again to continue.');const r=await fetch(path,{method,signal,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const data=await r.json();if(!r.ok)throw Error(data.error||'Service unavailable. Please retry.');return data}
 function openWorkspace(name?: string, setupTwin = false, twinId?: string) {
   try {
     if (name) sessionStorage.setItem('loka.twin-workspace:name', name);
     else sessionStorage.removeItem('loka.twin-workspace:name');
     if (twinId) sessionStorage.setItem('loka.twin-workspace:id', twinId);
     else sessionStorage.removeItem('loka.twin-workspace:id');
   } catch {
     // The workspace also works without browser storage.
   }
   const target = new URL(workspaceReturnPath(), location.origin);
   if (setupTwin && guidedTrade) target.searchParams.set('setup', 'appearance');
   location.assign(target.pathname + target.search);
 }
 async function returnToWorkspace() {
   let twin: { name?: string; ai_id?: string } | undefined;
   try {
     twin = (await api('/api/companion', 'GET', undefined, AbortSignal.timeout(2500))).companion;
   } catch {
     // An unavailable account name must not block the local workbench.
   }
   openWorkspace(twin?.name, false, twin?.ai_id);
 }
 async function refresh(){
   const account=await api('/api/me');
   setAccount(account);
   setUsername(account.profile?.username||'');
   if(!account.profile){
     setStep(guidedTrade ? 'twin' : 'profile');
     return;
   }
   const query=new URLSearchParams(location.search);
   if(query.has('qb')){
     setQb(null);
     setStep('qb');
     setQb(await api('/api/points'));
     return;
   }
   if(query.has('connect')){
     setStep('connections');
     return;
   }
   const result=await api('/api/companion');
   setCompanion(result.companion);
   setTwin(result.companion?.name||'');
   setStep('twin');
 }
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await fn()}catch(e){setError(e instanceof Error?e.message:'Could not complete this step.')}finally{lock.current=false;setBusy(false)}}
 useEffect(()=>{
   if(!authenticated){
     loadedSession.current=false;
     return;
   }
   if(!ready||busy||loadedSession.current)return;
   loadedSession.current=true;
   void run(refresh);
 },[ready,authenticated,busy]);

 return <main className="identity-panel" data-trade-signin={guidedTrade || undefined}>
 <a className="identity-return" href={guidedTrade ? workspaceReturnPath() : '/design'}>← LokaChat</a>
 <small>{guidedTrade ? 'Twin' : 'ACCOUNT & TWIN'}</small><h1>{guidedTrade ? ({email:'Continue with email',code:'Enter the code from your email',profile:'What should I call you?',twin:'Name your Twin'} as Record<string,string>)[step] : step==='email'?'Your own Twin starts here.':step==='code'?'Verify your email.':step==='profile'?'Your account identity.':step==='connections'?'Your connected sources.':'Meet your own Twin.'}</h1>
 {guidedTrade && !authenticated && <p className="identity-context">{step === 'code' ? <>Code sent to <strong>{email}</strong>.</> : 'Use your email so you can come back to your Twin.'}</p>}
 {authenticated&&step==='qb'&&<section><h2>Your Loka Points</h2><p>{qb?(qb.balance_minor/qb.scale).toFixed(2)+' LP':error?'Balance unavailable.':'Loading balance…'}</p><h3>Activity</h3>{qb?.entries?.length?qb.entries.map((e:any)=><p key={e.id}>{e.kind}: {(e.amount_minor/qb.scale).toFixed(2)} LP · {e.created_at}</p>):<p>No transactions yet.</p>}<p>Points cannot be purchased, transferred or redeemed for cash.</p><button type="button" disabled={busy} onClick={()=>void run(returnToWorkspace)}>Open Twin workspace</button></section>}
 {authenticated&&step==='connections'&&<CloudSources api={api} owner={account?.id||''}/>}
 {error&&<p role="alert">{error}</p>}
 {!authenticated && (step === 'email' || step === 'code') && <>
   <form className="identity-dialogue-form" onSubmit={e => {
     e.preventDefault();
     void run(async () => {
       if (step === 'email') { await sendCode({ email }); setStep('code'); }
       else await loginWithCode({ code });
     });
   }}>
     <div className="identity-composer">
       <label htmlFor="identity-email-code">{step === 'email' ? 'Email' : 'Verification code'}</label>
       <div className="identity-composer-row">
         <input id="identity-email-code" key={step} required type={step === 'email' ? 'email' : 'text'}
           inputMode={step === 'email' ? 'email' : 'numeric'} autoComplete={step === 'email' ? 'email' : 'one-time-code'}
           placeholder={step === 'email' ? 'you@example.com' : 'Enter code'}
           value={step === 'email' ? email : code} onChange={e => step === 'email' ? setEmail(e.target.value) : setCode(e.target.value)} />
         <button className="identity-send" disabled={!ready || busy} type="submit"
           aria-label={step === 'email' ? 'Send verification code' : 'Verify and continue'}
           title={step === 'email' ? 'Send verification code' : 'Verify and continue'}>
           {guidedTrade ? <span aria-hidden="true">{busy ? '…' : '↑'}</span> : busy ? 'Please wait…' : step === 'email' ? 'Send verification code' : 'Verify and continue'}
         </button>
       </div>
     </div>
   </form>
   <div className="identity-utilities">
     {step === 'code' ? <>
       <button type="button" disabled={busy} onClick={() => { setCode(''); setStep('email'); }}>Change email</button>
       <button type="button" disabled={busy} onClick={() => void run(() => sendCode({ email }))}>Resend code</button>
     </> : (
       <button type="button" disabled={!ready || busy} onClick={() => void run(() => initOAuth({ provider: 'google' }))}>Continue with Google</button>
     )}
   </div>
 </>}
 {authenticated&&!guidedTrade&&step==='profile'&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{await api('/api/me','PUT',{username});await refresh()})}}><label>{guidedTrade?'Username':'Username'}<input required minLength={2} maxLength={24} value={username} onChange={e=>setUsername(e.target.value)}/></label><button className="identity-profile-submit" disabled={busy}>{guidedTrade?'Save name':'Save and continue'}</button></form>}
 {authenticated&&step==='twin'&&<form onSubmit={e=>{e.preventDefault();void run(async()=>{let a=await api('/api/me');if(guidedTrade&&!a.profile)a=await api('/api/me','PUT',{username:'twin-'+crypto.randomUUID().replaceAll('-','').slice(0,18)});const result=await api('/api/companion','PUT',{name:twin});a=await api('/api/me');const previous=JSON.parse(localStorage.getItem('loka.web.journey.v1')||'{}');if(previous.accountId)localStorage.setItem('loka.web.journey.account.'+previous.accountId,JSON.stringify(previous));const local=previous.accountId===a.id?previous:JSON.parse(localStorage.getItem('loka.web.journey.account.'+a.id)||'{}');local.accountId=a.id;local.username=a.profile.username;local.name=result.companion.name;local.twinId=result.companion.ai_id;local.identityMode='privy';localStorage.setItem('loka.web.journey.v1',JSON.stringify(local));openWorkspace(result.companion.name, true, result.companion.ai_id)})}}><label>{guidedTrade?'Twin name':'Twin name'}<input required maxLength={24} value={twin} onChange={e=>setTwin(e.target.value)}/></label>{companion&&<p>Twin ID: {companion.ai_id}</p>}<button className="identity-profile-submit" disabled={busy}>{guidedTrade?'Create Twin':'Save and enter my Twin'}</button>{!guidedTrade&&<button type="button" disabled={busy} onClick={()=>setStep('profile')}>Edit username</button>}</form>}
 {authenticated&&step==='twin'&&companion&&<button type="button" disabled={busy} onClick={()=>openWorkspace(companion.name, false, companion.ai_id)}>Open Twin workspace</button>}
 {authenticated&&<button disabled={busy} onClick={()=>void run(async()=>{await logout();try{sessionStorage.removeItem('loka.twin-workspace:name');sessionStorage.removeItem('loka.twin-workspace:id')}catch{/* Storage may be unavailable. */}setStep('email');setAccount(null);setCompanion(null)})}>Sign out</button>}{guidedTrade ? <p className="identity-privacy">Local files stay on this device.</p> : <p>Your account and Twin identifiers are stored by the account service. Your Loka Points balance and activity are available in My account. Local source files and local model prompts are not sent to this service.</p>}</main>
}
function OnlineIdentity(){const [config,setConfig]=useState<Config|null>(null),[error,setError]=useState('');useEffect(()=>{fetch('/api/config').then(r=>{if(!r.ok)throw Error('Account service unavailable.');return r.json()}).then(setConfig).catch(e=>setError(e.message))},[]);if(!config?.ready && new URLSearchParams(location.search).get('view') === 'trades')return <main className="identity-panel" data-trade-signin><a href={workspaceReturnPath()}>← Back</a><h1>{!config&&!error?'Checking sign-in…':'Sign-in is temporarily unavailable'}</h1>{(config||error)&&<><p>Email verification is unavailable. Go back and choose Try on this device.</p><button onClick={()=>location.reload()}>Check again</button></>}</main>;if(!config?.ready)return <main className="identity-panel"><a href="/design">← LokaChat</a><h1>{!config&&!error?'Checking account service…':'Online registration is not available yet.'}</h1><p>{error||'Email authentication is not configured. No online account has been created.'}</p><a href={new URLSearchParams(location.search).get('view') === 'trades' ? '/twin-workspace?view=trades' : '/twin-workspace'}>Open Twin workspace without an online account</a><p>Local mode stays on this browser. Sign in to access your points account.</p><button onClick={()=>location.reload()}>Check sign-in availability</button></main>;return <PrivyProvider appId={config.appId} clientId={config.clientId||undefined} config={{loginMethods:['email','google'],appearance:{theme:'light',accentColor:'#202124'},embeddedWallets:{ethereum:{createOnLogin:'off'}}}}><IdentityFlow/></PrivyProvider>}

function LocalEntry(){const opening=useRef(false);useEffect(()=>{if(opening.current)return;opening.current=true;let next=15;try{const saved=JSON.parse(localStorage.getItem('loka.web.journey.v1')||'{}');if(saved.twinId&&saved.name)next=16}catch{}location.replace('/experience/index.html#'+next)},[]);return <main className="identity-panel"><h1>Opening your Twin…</h1><a href="/experience/index.html#15">Continue to your Twin</a></main>}
export default function ExperienceIdentity(){const query=new URLSearchParams(location.search);return query.has('signin')||query.has('connect')||query.has('qb')?<OnlineIdentity/>:<LocalEntry/>}
