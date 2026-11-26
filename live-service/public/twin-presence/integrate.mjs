import { getImageDetector } from './reply-voice.mjs?v=portrait-flow-4';
import {mountProactive} from './proactive.mjs';
import {phase,labels,correctionText} from './state.mjs';
// Installs only on the original /twin DOM. It does not replace the app or fabricate replies.
let portraitBlob;
let photoBlob;
let photoRevision = 0;
let root,host,toolbar,status,face,followup,photoURL='',takeover=false,correcting=false,generation=0;
const pending=new Set();const originalFetch=window.fetch;
function isTwinMutation(input,init){const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);return url.origin===location.origin&&/\/api\/twin\/v1\/(twins\/[^/]+\/(tell|tick)|asks\/[^/]+\/answer)$/.test(url.pathname)&&(init?.method||input?.method||'GET').toUpperCase()==='POST';}
window.fetch=async function(input,init){if(!isTwinMutation(input,init))return originalFetch.call(this,input,init);if(takeover)throw new DOMException('Paused by owner','AbortError');const c=new AbortController(),signal=init?.signal||(input instanceof Request?input.signal:null);const abort=()=>c.abort(signal?.reason);if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});pending.add(c);update();try{return await originalFetch.call(this,input,{...init,signal:c.signal})}finally{pending.delete(c);signal?.removeEventListener('abort',abort);update();}};
function say(text){if(status)status.textContent=text;}
function update(){if(!host||!root)return;let mode=root.querySelector('.vstatus')?.dataset.mode||'listen';if(mode==='listen'&&document.activeElement!==root.querySelector('#twin-say'))mode='wait';const p=phase({takeover,correcting,busy:pending.size>0,mode});if(host.dataset.tpPhase!==p)host.dataset.tpPhase=p;const toggle=toolbar?.querySelector('[data-action=takeover]');if(toggle){const label=takeover?'Resume Twin':'Take over';if(toggle.textContent!==label)toggle.textContent=label;toggle.setAttribute('aria-pressed',String(takeover));}const corr=toolbar?.querySelector('[data-action=correct]');if(corr)corr.setAttribute('aria-pressed',String(correcting));const message=`${labels[p]} · ${photoURL?'Your local photo · static likeness, not a generated digital human':'Original orb'} · no voice or lip sync`;if(status&&status.dataset.notice!=='true'&&status.textContent!==message)status.textContent=message;}
async function cropPortrait(image) {
  const detector = await getImageDetector();
  const faces = detector.detect(image).detections;
  if (faces.length !== 1 || !faces[0].boundingBox) return undefined;
  const { originX, originY, width, height } = faces[0].boundingBox;
  const side = Math.min(Math.max(width, height) * 1.65, image.naturalWidth, image.naturalHeight);
  if (side < 16) return undefined;
  const x = originX + width / 2 - side / 2;
  const y = originY + height / 2 - side / 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 384;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.drawImage(image, x, y, side, side, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
}

async function setPhoto(file) {
  const revision = ++photoRevision;
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    say('Choose a JPEG, PNG or WebP under 8 MB.');
    return false;
  }
  const candidate = URL.createObjectURL(file);
  const image = new Image();
  image.src = candidate;
  try {
    await image.decode();
  } catch {
    URL.revokeObjectURL(candidate);
    return revision === photoRevision ? false : undefined;
  }
  const cropped = await cropPortrait(image).catch(() => undefined);
  if (revision !== photoRevision) {
    URL.revokeObjectURL(candidate);
    return undefined;
  }
  if (photoURL) URL.revokeObjectURL(photoURL);
  photoBlob = file;
  portraitBlob = cropped || file;
  photoURL = cropped ? URL.createObjectURL(cropped) : candidate;
  if (cropped) URL.revokeObjectURL(candidate);
  host.dataset.tpPortraitCrop = String(Boolean(cropped));
  face.src = photoURL;
  face.alt = 'My Twin appearance';
  host.dataset.tpFace = 'true';
  status.dataset.notice = 'false';
  update();
  return true;
}
function stop(){followup?.pause();takeover=true;generation++;for(const c of pending)c.abort(new DOMException('Owner took over','AbortError'));pending.clear();window.speechSynthesis?.cancel();status.dataset.notice='true';say('Twin paused. In-flight requests were cancelled in this browser; server work may already have completed. Your text stays editable. Resume never resends automatically.');update();}
function mount(){root=document.querySelector('.twin-root');const next=root?.querySelector('.vorb');const composer=root?.querySelector('.vcomposer');if(!next||!composer||next===host&&toolbar?.isConnected)return;if(toolbar)toolbar.remove();if(status)status.remove();followup?.remove();host=next;const holder=document.createElement('div');holder.className='tp-face';face=document.createElement('img');face.alt='My Twin appearance';holder.append(face);host.append(holder);toolbar=document.createElement('div');toolbar.className='tp-toolbar';toolbar.innerHTML='<button type="button" data-action="photo">Set my Twin appearance</button><button type="button" data-action="orb">Restore default appearance</button><button type="button" data-action="correct" aria-pressed="false">Correct</button><button type="button" data-action="takeover" aria-pressed="false">Take over</button><small>Appearance stays in this tab</small>';const file=document.createElement('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.className='tp-file';toolbar.append(file);file.onchange = async () => {
  const selected = file.files?.[0];
  if (!selected) return;
  const accepted = await setPhoto(selected);
  if (file.files?.[0] === selected) file.value = '';
  if (accepted !== undefined) file.dispatchEvent(new CustomEvent('twin:photo-result', { detail: accepted }));
};toolbar.onclick=e=>{const a=e.target.closest('button')?.dataset.action;if(a==='photo')file.click();if(a==='orb'){photoRevision++;photoBlob=portraitBlob=undefined;host.dataset.tpFace='false';if(photoURL){URL.revokeObjectURL(photoURL);photoURL='';face.removeAttribute('src')}update();}if(a==='correct'){correcting=!correcting;status.dataset.notice='false';root.querySelector('#twin-say')?.focus();update();}if(a==='takeover'){if(takeover){takeover=false;status.dataset.notice='false';update();}else stop();}};status=document.createElement('div');status.className='tp-status';status.setAttribute('role','status');composer.before(toolbar);toolbar.after(status);followup=mountProactive(status);
// Let React own the input and original submit path. Correction travels through the real backend.
composer.addEventListener('focusin',update);composer.addEventListener('focusout',()=>queueMicrotask(update));composer.addEventListener('submit',e=>{if(takeover){e.preventDefault();e.stopImmediatePropagation();say('Twin is paused. Resume to send your text.');return;}if(correcting){const input=root.querySelector('#twin-say'),text=input?.value.trim();if(!text)return;e.preventDefault();e.stopImmediatePropagation();const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,correctionText(text));input.dispatchEvent(new Event('input',{bubbles:true}));correcting=false;const id=++generation;requestAnimationFrame(()=>{if(id===generation&&!takeover&&composer.isConnected)composer.requestSubmit()});}},true);update();}
const observer=new MutationObserver(()=>{mount();update()});observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['data-mode']});mount();
window.addEventListener('pagehide',()=>{observer.disconnect();followup?.remove();for(const c of pending)c.abort();if(photoURL)URL.revokeObjectURL(photoURL);window.fetch=originalFetch;});

export function setupControls() {
  return { proactive: followup, photo: toolbar?.querySelector('input[type=file]'), orb: toolbar?.querySelector('[data-action=orb]'), hasPhoto: () => Boolean(photoURL), getPhoto: () => photoBlob, getPortraitSource: () => portraitBlob, setPhoto };
}
