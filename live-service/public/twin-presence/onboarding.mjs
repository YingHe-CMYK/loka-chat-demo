import { localProfile } from './profile.mjs';
import { setupControls } from './integrate.mjs?v=portrait-flow-5';
import { getImageDetector, setupReplyVoice } from './reply-voice.mjs?v=portrait-flow-4';

const controls = setupControls();
const panel = document.querySelector('.panel');
const nav = panel.querySelector('.nav');
const workbench = panel.querySelector('.dbody');
const items = panel.querySelector('.work-items');
const composer = document.querySelector('.vcomposer');
const toolbar = document.querySelector('.tp-toolbar');
const collaboration = document.querySelector('.tp-follow');
const twinStatus = document.querySelector('.tp-status');
const workspace = document.querySelector('.twin-root');
const profileKey = workspace.dataset.twinProfile ? 'twin:' + workspace.dataset.twinProfile : 'self';
const externalControls = document.querySelector('.twin-workspace-header');
const identityStage = workspace.querySelector('.twin-identity-stage');
const orbActions = document.createElement('div');
orbActions.className = 'setup-orb-actions';
orbActions.hidden = true;
identityStage?.append(orbActions);
const guide = document.createElement('dialog');
guide.className = 'setup';
document.body.append(guide);
guide.setAttribute('aria-labelledby', 'setup-title');
const shortcuts = document.createElement('div');
shortcuts.className = 'setup-shortcuts';
nav.after(shortcuts);
const workspaceStep = 5;
const journey = new URLSearchParams(location.search);
const setupStage = journey.get('setup');
const deviceTrial = journey.get('start') === '1';
const profileId = workspace.dataset.twinProfile;
const accountTwin = !deviceTrial && profileId?.startsWith('miro_');
const canRename = deviceTrial || Boolean(profileId);
let editingName = false;
let firstSetup = Boolean(externalControls && (setupStage === 'appearance' || setupStage === 'voice'));
let step = firstSetup ? (setupStage === 'voice' ? 2 : 1) : workspaceStep;
let pausedIdentity = false;
let handoffReason = '';
let photoSource = '';
let processingPhoto = false;
const voicePrompt = 'Hello, this is a sample of my voice. I would like to talk with my Twin and hear what it thinks.';
const previewLine = 'I am your Twin. You can correct me at any time, and I will adjust what I do next.';
let voiceLanguage = 'en';
let generatedVoiceURL;
let generatingVoice = false;

let portraitVideoURL;
let facePreview;
let faceCamera;
let faceCameraVideo;
let faceCameraTimer;
function closeFaceCamera() {
  window.clearInterval(faceCameraTimer);
  faceCameraTimer = undefined;
  faceCamera?.getTracks().forEach(track => track.stop());
  faceCamera = undefined;
  faceCameraVideo?.parentElement?.querySelector('.setup-orb-still')?.remove();
  faceCameraVideo?.remove();
  faceCameraVideo = undefined;
  delete workspace.dataset.twinLiveCamera;
  delete workspace.dataset.twinCameraFraming;
}
function cameraFrame(video) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 900 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context || !canvas.width || !canvas.height) return undefined;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function updateCameraHandoff(title, detail) {
  const handoff = guide.querySelector('.setup-handoff');
  if (!handoff) return;
  handoff.querySelector('strong').textContent = title;
  handoff.querySelector('p').textContent = detail;
}

async function guideFaceCapture(video, message) {
  let detector;
  try { detector = await getImageDetector(); }
  catch { return; }
  if (faceCameraVideo !== video) return;
  let centeredFrames = 0;
  let lastFrame;
  const deadline = performance.now() + 15000;
  faceCameraTimer = window.setInterval(() => {
    if (faceCameraVideo !== video || video.readyState < 2 || !video.videoWidth) return;
    if (performance.now() > deadline) {
      window.clearInterval(faceCameraTimer);
      faceCameraTimer = undefined;
      message.textContent = 'You can capture a frame now or reopen the camera for guided framing.';
      return;
    }
    try {
      const faces = detector.detect(video).detections;
      const box = faces.length === 1 ? faces[0].boundingBox : undefined;
      const width = video.videoWidth;
      const height = video.videoHeight;
      const x = box ? (box.originX + box.width / 2) / width : 0;
      const y = box ? (box.originY + box.height / 2) / height : 0;
      const centered = box && Math.abs(x - .5) < .2 && Math.abs(y - .5) < .24 && box.width / width > .14;
      const stable = centered && (!lastFrame || Math.abs(x - lastFrame.x) + Math.abs(y - lastFrame.y) < .1);
      centeredFrames = stable ? centeredFrames + 1 : 0;
      lastFrame = centered ? { x, y } : undefined;
      if (!centered) {
        const cue = faces.length > 1 ? 'One face at a time.' : 'Move your face into the center of the orb.';
        if (message.textContent !== cue) message.textContent = cue;
        workspace.dataset.twinCameraFraming = 'seeking';
        return;
      }
      if (message.textContent !== 'Face in frame. Hold still for a moment.') message.textContent = 'Face in frame. Hold still for a moment.';
      workspace.dataset.twinCameraFraming = 'aligned';
      if (centeredFrames < 5) return;
      window.clearInterval(faceCameraTimer);
      faceCameraTimer = undefined;
      const still = cameraFrame(video);
      if (!still) return;
      still.className = 'setup-orb-camera setup-orb-still';
      video.after(still);
      video.hidden = true;
      workspace.dataset.twinCameraFraming = 'held';
      message.textContent = 'Twin held a frame.';
      updateCameraHandoff('I found a frame that fits',
        'You can adopt it, retake it, or close the camera. It hasn’t been applied yet.');
      const capture = orbActions.querySelector('[data-face-capture]');
      if (capture) capture.textContent = 'Use this frame';
      const retake = orbActions.querySelector('[data-face-retake]');
      if (retake) retake.hidden = false;
      faceCamera?.getTracks().forEach(track => track.stop());
    } catch {
      window.clearInterval(faceCameraTimer);
      faceCameraTimer = undefined;
      message.textContent = 'Automatic framing is unavailable. You can capture a frame yourself.';
    }
  }, 185);
}

window.addEventListener('pagehide', closeFaceCamera);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !faceCamera) return;
  closeFaceCamera();
  notice = 'Camera paused when you left this page.';
  if (step === 1 && guide.open) render();
});
let generatingPortrait = false;

function clearPortraitPreview() {
  if (portraitVideoURL) URL.revokeObjectURL(portraitVideoURL);
  portraitVideoURL = undefined;
  workspace.dispatchEvent(new CustomEvent('twin:portrait-preview'));
}

async function previewTwinPortrait() {
  const photo = controls.getPortraitSource();
  if (!photo) return;
  let response;
  try {
    response = await fetch('http://127.0.0.1:11435/portrait', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: photo,
      signal: AbortSignal.timeout(270_000),
    });
  } catch {
    notice = 'Could not connect to local LivePortrait. Check the service and retry.';
    return;
  }
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('video/mp4')) {
    notice = response.ok ? 'The local service did not return a playable video.' : await response.text();
    return;
  }
  const preview = await response.blob();
  clearPortraitPreview();
  portraitVideoURL = URL.createObjectURL(preview);
  workspace.dispatchEvent(new CustomEvent('twin:portrait-preview', { detail: portraitVideoURL }));
  notice = 'Animated portrait generated.';
}

async function previewTwinVoice() {
  let response;
  try {
    response = await fetch('http://127.0.0.1:11435/preview', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Loka-Voice-Language': voiceLanguage },
      body: voiceBlob,
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    notice = 'Could not connect to local Qwen3-TTS. Start the service, allow local access, and retry.';
    return;
  }
  if (!response.ok || !response.headers.get('Content-Type')?.startsWith('audio/wav')) {
    notice = 'Could not generate a voice preview. Read the full prompt and record again.';
    return;
  }
  if (generatedVoiceURL) URL.revokeObjectURL(generatedVoiceURL);
  generatedVoiceURL = URL.createObjectURL(await response.blob());
  notice = 'Voice preview generated.';
}
let notice = '';
let pending = false;
let manualPicker = false;
let selectingSource = false;
let reminderAdvanced = false;
let recorder, recordingStream, voiceURL, voiceBlob, playingSample;
let stopVoiceMeter;
setupReplyVoice(workspace, () => ({ sample: voiceBlob, language: voiceLanguage }));

function syncVoiceActivity() {
  workspace.dataset.twinVoiceActive = String(Boolean(recordingStream || playingSample));
}

function beginVoiceMeter(stream) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !window.AudioContext) return;
  const orb = identityStage?.querySelector('.twin-workspace-orb');
  if (!orb) return;
  let context;
  try {
    context = new AudioContext();
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(stream);
    analyser.fftSize = 256;
    source.connect(analyser);
    void context.resume().catch(() => {});
    const samples = new Uint8Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
      orb.dataset.tpVoiceLevel = Math.min(rms * 5, 1).toFixed(2);
    }, 55);
    stopVoiceMeter = () => {
      window.clearInterval(timer);
      delete orb.dataset.tpVoiceLevel;
      source.disconnect();
      void context.close().catch(() => {});
      stopVoiceMeter = undefined;
    };
  } catch {
    void context?.close().catch(() => {});
  }
}

function stopPlayback() {
  const previous = playingSample;
  playingSample = undefined;
  previous?.pause();
  syncVoiceActivity();
}
const savedSamples = { photo: undefined, voice: undefined };

async function removeSavedSample(field) {
  if (!savedSamples[field]) return;
  const retained = field === 'photo' ? 'voice' : 'photo';
  const existing = await localProfile('readwrite', store => {
    const request = store.get(profileKey);
    request.addEventListener('success', () => {
      const sample = request.result?.[retained];
      if (sample) store.put(retained === 'voice' ? { voice: sample, voiceLanguage: request.result.voiceLanguage } : { photo: sample, faceGeometry: request.result.faceGeometry === true }, profileKey);
      else store.delete(profileKey);
    });
    return request;
  });
  savedSamples[field] = undefined;
  if (!existing?.[retained]) savedSamples[retained] = undefined;
}

function clearVoice() {
  workspace.dispatchEvent(new Event('twin:stop-reply'));
  if (generatedVoiceURL) URL.revokeObjectURL(generatedVoiceURL);
  generatedVoiceURL = undefined;
  if (voiceURL) URL.revokeObjectURL(voiceURL);
  voiceURL = voiceBlob = undefined;
}

window.addEventListener('pagehide', () => {
  recordingStream?.getTracks().forEach(track => track.stop());
  stopVoiceMeter?.();
  stopPlayback();
  clearVoice();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden || recorder?.state !== 'recording') return;
  recorder.stop();
  recordingStream?.getTracks().forEach(track => track.stop());
  notice = 'Recording stopped when you left the page.';
});

async function recordVoice() {
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function' || typeof MediaRecorder !== 'function') {
    notice = 'Recording is unavailable in this browser. You can finish setup and try later.';
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (error) {
    const messages = {
      NotAllowedError: 'Allow microphone access in your browser settings and try again.',
      NotFoundError: 'No microphone found. Connect one and retry.',
      NotReadableError: 'The microphone is unavailable. Check whether another app is using it.',
    };
    notice = messages[error?.name] || 'The microphone is unavailable. Retry or finish setup for now.';
    return;
  }
  if (document.hidden) {
    stream.getTracks().forEach(track => track.stop());
    notice = 'Return to this page to start recording.';
    return;
  }
  recordingStream = stream;
  syncVoiceActivity();
  const chunks = [];
  try {
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      recorder = recordingStream = undefined;
      stopVoiceMeter?.();
      syncVoiceActivity();
      if (chunks.length) {
        clearVoice();
        voiceBlob = new Blob(chunks, { type: chunks[0].type });
        voiceLanguage = 'en';
        voiceURL = URL.createObjectURL(voiceBlob);
      }
      render(true);
    };
    recorder.start();
    beginVoiceMeter(stream);
  } catch (error) {
    stream.getTracks().forEach(track => track.stop());
    recorder = recordingStream = undefined;
    syncVoiceActivity();
    throw error;
  }
}

const titles = ['', 'Set my Twin appearance', 'Set my Twin voice', 'Choose a file for Twin to watch', 'Choose how Twin alerts you'];
const descriptions = [
  '',
  'Use your camera or a local photo. Your likeness appears inside the particle orb and stays on this device.',
  'Record your voice, then listen back or generate a new sentence with local Qwen3-TTS. You can save the recording on this device.',
  'Choose a local TXT or Markdown file. When it changes, Twin prepares a comparison. Only that file is read, on this device.',
  'Twin shows a marker while you edit. When you stop and return to that item, it opens the result.',
];

function add(tag, text, parent = guide) {
  const node = document.createElement(tag);
  node.textContent = text;
  parent.append(node);
  return node;
}

function button(label, action, parent = guide, primary = false) {
  const node = add('button', label, parent);
  node.type = 'button';
  node.disabled = pending;
  node.classList.toggle('primary', primary);
  node.addEventListener('click', action);
  return node;
}

async function requestSource() {
  if (selectingSource) return;
  selectingSource = true;
  try {
    const outcome = manualPicker ? 'manual' : await controls.proactive.chooseSource();
    if (outcome === 'manual') {
      manualPicker = true;
      move(3);
    } else if (outcome === 'selected' && externalControls && step === 3) {
      move(workspaceStep);
    }
  } finally {
    selectingSource = false;
  }
}

function snapshotInput(labelText, compare) {
  const picker = add('input', '');
  picker.hidden = true;
  button(labelText, () => picker.click());
  picker.type = 'file';
  picker.accept = '.txt,.md';
  picker.addEventListener('change', () => {
    const file = picker.files[0];
    if (!file) return;
    void change(async () => {
      const selected = await controls.proactive.chooseSnapshot(file, compare);
      if (selected && externalControls && step === 3) move(workspaceStep);
    });
  });
}

function move(next) {
  closeFaceCamera();
  pausedIdentity = false;
  if (firstSetup) {
    const target = new URL(location.href);
    if (next === workspaceStep) {
      firstSetup = false;
      target.searchParams.set('setup', 'complete');
      workspace.dispatchEvent(new Event('twin:identity-finished'));
    } else {
      target.searchParams.set('setup', next === 1 ? 'appearance' : 'voice');
    }
    history.replaceState(history.state, '', target);
  }
  notice = '';
  step = next;
  render(true);
  if (next !== workspaceStep && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    guide.querySelector('h1')?.animate([{ opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'none' }], { duration: 280, easing: 'ease-out' });
  }
}

async function adoptPhoto(photo, source) {
  processingPhoto = true;
  try {
    await change(async () => {
      const accepted = await controls.setPhoto(photo);
      if (!accepted) {
        notice = 'Could not use that image. Try another photo or capture a frame.';
        return;
      }
      clearPortraitPreview();
      facePreview = undefined;
      photoSource = source;
      if (source === 'camera') {
        try {
          const { createFacePreview } = await import('./face-geometry.mjs');
          facePreview = await createFacePreview(photo);
        } catch {
          // The existing portrait remains available if the local geometry model fails.
        }
      }
      notice = firstSetup ? '' : 'Your likeness is now inside the orb.';
      if (firstSetup) handoffReason = 'Appearance prepared';
    });
  } finally {
    processingPhoto = false;
    if (firstSetup && step === 1) render();
  }
}

function renderHandoff(title, detail, parent = guide) {
  const handoff = add('section', '', parent);
  handoff.className = 'setup-handoff';
  handoff.setAttribute('aria-live', 'polite');
  const signal = add('span', '', handoff);
  signal.className = 'setup-handoff-signal';
  signal.setAttribute('aria-hidden', 'true');
  add('strong', title, handoff);
  add('p', detail, handoff);
  return handoff;
}

async function change(action) {
  closeFaceCamera();
  pending = true;
  notice = '';
  // Start the browser permission request in the original click gesture.
  const operation = action();
  render();
  try { await operation; }
  catch { notice = 'Could not finish this update. Retry or continue.'; }
  finally { pending = false; render(true); }
}

function render(focusHeading = false) {
  stopPlayback();
  const faceHolder = workspace.querySelector('.twin-workspace-orb .tp-face');
  const previousSurface = faceHolder?.querySelector('.setup-face-surface');
  if (previousSurface && previousSurface !== facePreview?.canvas) previousSurface.remove();
  if (facePreview && faceHolder && facePreview.canvas.parentElement !== faceHolder) faceHolder.append(facePreview.canvas);
  const finished = step === workspaceStep;
  controls.proactive.setConfiguring(!finished);
  toolbar.hidden = true;
  const inlineSetup = firstSetup && !finished;
  workspace.dataset.twinIdentitySetup = String(inlineSetup);
  orbActions.hidden = !inlineSetup || step !== 1 || pausedIdentity;
  orbActions.replaceChildren();
  workspace.dataset.twinHandoff = inlineSetup && !pausedIdentity
    ? pending ? 'working' : step === 1 && controls.hasPhoto() ? 'portrait' : step === 2 ? 'voice' : 'ready'
    : '';
  for (const element of [nav, items, workbench, composer, collaboration, twinStatus, shortcuts]) {
    element.hidden = inlineSetup && (element === nav || element === items || element === workbench);
  }
  if (finished) {
    if (guide.open) guide.close();
    if (guide.parentElement !== document.body) document.body.append(guide);
    return;
  }
  if (inlineSetup) {
    if (guide.parentElement !== panel) panel.append(guide);
    guide.classList.add('setup-inline');
    if (!guide.open) guide.show();
  } else {
    guide.classList.remove('setup-inline');
    if (!guide.open) guide.showModal();
  }
  guide.replaceChildren();
  if (editingName) {
    const heading = add('h1', 'Name your Twin');
    heading.id = 'setup-title';
    const form = add('form', '', guide);
    const label = add('label', 'Twin name', form);
    label.htmlFor = 'twin-edited-name';
    const input = add('input', '', form);
    input.id = label.htmlFor;
    input.required = true;
    input.maxLength = 24;
    input.value = externalControls.querySelector('h1')?.textContent ?? '';
    const actions = add('div', '', form);
    actions.className = 'setup-actions';
    const save = add('button', 'Save and continue', actions);
    save.type = 'submit';
    save.className = 'primary';
    const cancel = button('Cancel', () => { editingName = false; render(true); }, actions);
    const feedback = add('p', '', form);
    feedback.setAttribute('role', 'status');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      let name = input.value.trim();
      if (!name || save.disabled) { input.focus(); return; }
      if (accountTwin) {
        save.disabled = cancel.disabled = input.disabled = true;
        feedback.textContent = 'Saving your Twin’s name…';
        try {
          name = await new Promise((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error('Saving timed out. Try again.')), 25000);
            workspace.dispatchEvent(new CustomEvent('twin:account-rename', { detail: {
              name,
              resolve: value => { window.clearTimeout(timer); resolve(value); },
              reject: error => { window.clearTimeout(timer); reject(error); },
            } }));
          });
        } catch (error) {
          feedback.textContent = error.message;
          save.disabled = cancel.disabled = input.disabled = false;
          input.focus();
          return;
        }
      }
      try {
        sessionStorage.setItem(deviceTrial ? 'loka.trade-preview:name' : 'loka.twin-workspace:name', name);
        if (!deviceTrial && !accountTwin) localStorage.setItem('loka.trade-twin:name', name);
      } catch {
        // The name still updates in the open workspace.
      }
      workspace.dispatchEvent(new CustomEvent('twin:name-changed', { detail: name }));
      editingName = false;
      render(true);
    });
    input.focus();
    return;
  }
  if (inlineSetup && pausedIdentity) {
    const heading = add('h1', 'Continue getting to know your Twin');
    heading.id = 'setup-title';
    heading.tabIndex = -1;
    add('p', step === 1 ? 'Your appearance step is ready when you are.' : 'Your voice step is ready when you are.');
    button('Resume with Twin', () => { pausedIdentity = false; render(true); }, guide, true);
    if (focusHeading) heading.focus();
    return;
  }
  if (inlineSetup) {
    const speaker = add('small', 'Twin');
    speaker.className = 'setup-twin-speaker';
  }
  const sections = add('nav', '');
  guide.dataset.stage = step < 3 ? 'identity' : 'permissions';
  guide.dataset.journeyStep = inlineSetup ? String(step) : '';
  sections.className = 'setup-sections';
  sections.setAttribute('aria-label', 'Twin settings');
  const group = [[1, 'Appearance'], [2, 'Voice']];
  if (!firstSetup) group.push([3, 'Local sources'], [4, 'Alerts and permissions']);
  for (const [index, label] of group) {
    if (inlineSetup) {
      const progress = add('span', label, sections);
      if (step === index) progress.setAttribute('aria-current', 'step');
      continue;
    }
    const control = button(label, () => move(index), sections);
    control.setAttribute('aria-pressed', String(step === index));
    control.disabled = pending || Boolean(recorder);
  }
  if (step === 1 && canRename) {
    button('← Back to Twin name', () => {
      closeFaceCamera();
      editingName = true;
      render();
    }, guide).disabled = pending;
  }
  const heading = add('h1', titles[step]);
  heading.tabIndex = -1;
  heading.id = 'setup-title';
  if (!inlineSetup) add('p', descriptions[step]);
  if (inlineSetup && step === 1) {
    if (pending && processingPhoto) renderHandoff('Fitting your portrait', 'I’m placing the face inside the particle orb.');
    else if (controls.hasPhoto()) renderHandoff(
      photoSource === 'camera' ? 'Camera frame applied' : photoSource === 'file' ? 'Photo applied' : 'Local portrait restored',
      'Look at the orb to see your likeness. I can animate it here, or we can try your voice.',
    );
    else renderHandoff('Your orb is ready',
      'I’ve prepared a live place for your likeness. Choose how you’d like to add it.');
  } else if (inlineSetup && step === 2) {
    if (handoffReason === 'Appearance prepared') renderHandoff('Your appearance carries over', 'I’ll keep it visible while we try a voice.');
    else renderHandoff('Your Twin is ready to try a voice', 'Record a short reference or continue with text.');
  }
  const setup = controls.proactive.setup;

  let sampleActions;
  {
    if (step === 1) {
      const stage = add('div', '');
      stage.className = 'setup-likeness';
      const choose = button('', () => {
        closeFaceCamera();
        const picker = add('input', '', stage);
        picker.type = 'file';
        picker.accept = 'image/jpeg,image/png,image/webp';
        picker.hidden = true;
        picker.addEventListener('change', async () => {
          const photo = picker.files?.[0];
          picker.remove();
          if (!photo) return;
          await adoptPhoto(photo, 'file');
        }, { once: true });
        picker.addEventListener('cancel', () => picker.remove(), { once: true });
        picker.click();
      }, stage);
      choose.className = 'setup-photo-source';
      if (controls.hasPhoto()) {
        const likeness = add('span', '', choose);
        likeness.className = 'setup-orb-likeness';
        const photo = add('img', '', likeness);
        photo.src = document.querySelector('.tp-face img').src;
        photo.alt = 'Selected Twin portrait';
        photo.className = 'setup-avatar';
        const source = workspace.querySelector('.twin-particle-canvas');
        if (source?.width && source.height) {
          const particles = add('canvas', '', likeness);
          particles.width = source.width;
          particles.height = source.height;
          particles.getContext('2d').drawImage(source, 0, 0);
          particles.setAttribute('aria-hidden', 'true');
        }
      } else {
        const mark = add('span', '+', choose);
        mark.className = 'setup-photo-mark';
        mark.setAttribute('aria-hidden', 'true');
      }
      add('span', controls.hasPhoto() ? 'Replace photo' : 'Choose a local photo', choose);
      const cameraTarget = inlineSetup && identityStage ? orbActions : stage;
      const cameraArea = add('div', '', cameraTarget);
      cameraArea.className = 'setup-camera-preview';
      const camera = button('Open camera', async () => {
        camera.disabled = true;
        const message = add('p', 'Waiting for camera permission…', cameraArea);
        message.setAttribute('role', 'status');
        try {
          if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera unavailable');
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
          if (!camera.isConnected || step !== 1 || document.hidden) {
            stream.getTracks().forEach(track => track.stop());
            if (camera.isConnected) {
              message.textContent = 'Return to this page and open the camera again.';
              camera.disabled = false;
            }
            return;
          }
          faceCamera = stream;
          camera.hidden = true;
          message.textContent = 'Center your face, then capture a frame.';
          const orb = workspace.querySelector('.twin-workspace-orb');
          const placeInOrb = firstSetup && orb;
          const live = add('video', '', placeInOrb ? orb : cameraArea);
          faceCameraVideo = live;
          if (placeInOrb) {
            workspace.dataset.twinLiveCamera = 'true';
            updateCameraHandoff('I’m checking the frame',
              'The camera is inside the orb. When one face holds steady, I’ll pause on that frame for you.');
            live.className = 'setup-orb-camera';
          }
          live.setAttribute('aria-label', 'Live camera framing preview');
          live.autoplay = true;
          live.muted = true;
          live.playsInline = true;
          live.srcObject = stream;
          const capture = button('Capture face', () => {
            const frame = live.parentElement?.querySelector('.setup-orb-still') || cameraFrame(live);
            if (!frame) return;
            capture.disabled = true;
            closeFaceCamera();
            frame.toBlob(photo => {
              if (!photo || step !== 1) return;
              void adoptPhoto(photo, 'camera');
            }, 'image/jpeg', .88);
          }, cameraArea, true);
          capture.dataset.faceCapture = '';
          if (placeInOrb) void guideFaceCapture(live, message);
          capture.disabled = !live.videoWidth;
          live.addEventListener('loadeddata', () => { capture.disabled = false; }, { once: true });
          const retake = button('Retake', () => {
            closeFaceCamera();
            render();
            const open = cameraTarget === orbActions ? orbActions.querySelector('[data-open-face-camera]') : guide.querySelector('[data-open-face-camera]');
            open?.click();
          }, cameraArea);
          retake.dataset.faceRetake = '';
          retake.hidden = true;
          button('Close camera', () => { closeFaceCamera(); render(!firstSetup); orbActions.querySelector('button')?.focus(); }, cameraArea);
        } catch {
          message.textContent = 'Camera access is unavailable. Allow it in your browser or choose a local photo.';
          camera.disabled = false;
        }
      }, cameraTarget);
      camera.dataset.openFaceCamera = '';
      if (controls.hasPhoto()) {
        if (facePreview) stage.append(facePreview.controls);
        else if (photoSource === 'camera') add('p', '3D preview needs one clear face. You can retake the photo or continue with this portrait.', stage);
        if (portraitVideoURL) {
          if (firstSetup) {
            button('Replay animation', () => {
              const preview = workspace.querySelector('.tp-portrait-preview');
              if (!preview) return;
              preview.currentTime = 0;
              void preview.play().catch(() => {});
            }, stage);
          } else {
            const video = add('video', '', stage);
            video.src = portraitVideoURL;
            video.controls = true;
            video.playsInline = true;
            video.muted = true;
            video.className = 'setup-portrait-video';
            video.setAttribute('aria-label', 'Animated portrait preview');
          }
        } else {
          add('p', 'Preview facial expressions and head movement with local LivePortrait.', stage);
          button(generatingPortrait ? 'Generating portrait…' : 'Animate portrait', () => {
            generatingPortrait = true;
            void change(async () => {
              try { await previewTwinPortrait(); }
              finally { generatingPortrait = false; }
            });
          }, stage, true);
        }
      }
      sampleActions = add('div', '', stage);
      sampleActions.className = 'setup-sample-actions';
      if (controls.hasPhoto()) {
        button('Use default appearance', () => void change(async () => {
          await removeSavedSample('photo');
          facePreview = undefined;
          clearPortraitPreview();
          controls.orb.click();
          notice = 'Restored the default appearance.';
        }), sampleActions);
      }
    }
    if (step === 2) {
      const voiceStage = add('div', '');
      voiceStage.className = 'setup-voice-stage';
      if (recorder) add('blockquote', voicePrompt, voiceStage);
      if (recorder) {
        add('p', 'Recording…', voiceStage).setAttribute('role', 'status');
        button('Stop recording', () => { if (recorder.state === 'recording') recorder.stop(); }, voiceStage);
      } else {
        button(voiceURL ? 'Record again' : 'Record with microphone', () => void change(recordVoice), voiceStage).classList.add('setup-voice-source');
        if (voiceURL) {
          const playback = add('audio', '', voiceStage);
          playback.controls = true;
          playback.src = voiceURL;
          playback.setAttribute('aria-label', 'Listen to your recording');
          playback.addEventListener('playing', () => {
            playingSample = playback;
            syncVoiceActivity();
          });
          const finish = () => {
            if (playingSample !== playback) return;
            playingSample = undefined;
            syncVoiceActivity();
          };
          for (const event of ['pause', 'ended', 'error']) playback.addEventListener(event, finish);
          add('p', 'Qwen3-TTS generates the preview on this device.', voiceStage);
          const generate = button(generatingVoice ? 'Generating a voice preview…' : 'Generate a preview in my voice', () => {
            generatingVoice = true;
            void change(async () => {
              try { await previewTwinVoice(); }
              finally { generatingVoice = false; }
            });
          }, voiceStage);
          generate.classList.add('setup-voice-source');
          generate.disabled = pending;
          if (generatedVoiceURL) {
            add('p', previewLine, voiceStage);
            const generated = add('audio', '', voiceStage);
            generated.controls = true;
            generated.src = generatedVoiceURL;
            generated.setAttribute('aria-label', "Listen to Twin's AI voice");
            generated.addEventListener('playing', () => { playingSample = generated; syncVoiceActivity(); });
            for (const event of ['pause', 'ended', 'error']) generated.addEventListener(event, () => {
              if (playingSample !== generated) return;
              playingSample = undefined;
              syncVoiceActivity();
            });
            if (firstSetup) generated.addEventListener('ended', () => {
              if (!firstSetup || step !== 2 || pausedIdentity || !generated.isConnected) return;
              workspace.dataset.twinVoicePreview = 'heard';
              move(workspaceStep);
            }, { once: true });
          }
          sampleActions = add('div', '', voiceStage);
          sampleActions.className = 'setup-sample-actions';
          button('Delete local recording', () => void change(async () => {
            await removeSavedSample('voice');
            clearVoice();
            notice = 'Local recording deleted.';
          }), sampleActions);
        }
      }
    }
    if (step === 3) {
      if (!manualPicker && typeof window.showOpenFilePicker === 'function') {
        button(setup.source ? 'Replace file' : 'Choose a local file', () => void change(requestSource));
      } else {
        add('p', setup.source && externalControls
          ? 'Replacing the file starts a new comparison.'
          : 'Choose the original file, then select a newer file with the same name to compare.');
        snapshotInput(setup.manual ? 'Replace original file' : 'Choose original file', false);
      }
      if (!externalControls && setup.manual && !setup.paused) snapshotInput('Choose a newer file to compare', true);
      if (setup.source) {
        add('p', (setup.paused ? 'Paused · ' : 'Selected · ') + setup.source);
        if (!externalControls) button(setup.paused ? 'Resume watching' : 'Pause watching', () => { controls.proactive.togglePause(); render(); });
        button('Disconnect and clear preview', () => {
          controls.proactive.disconnect();
          move(workspaceStep);
          workspace.querySelector('[data-twin-source-picker]')?.focus();
        });
      }
    }
    if (step === 4) {
      button(setup.sound ? 'Turn off sound' : 'Enable and preview sound', () => void change(controls.proactive.toggleSound))
        .setAttribute('aria-pressed', String(setup.sound));
      button(setup.quiet ? 'Unmute' : 'Mute for now', () => {
        controls.proactive.setQuiet(!setup.quiet);
        render();
      }).setAttribute('aria-pressed', String(setup.quiet));
      const advanced = add('details', '');
      add('summary', 'More options', advanced);
      advanced.open = reminderAdvanced;
      advanced.addEventListener('toggle', () => { reminderAdvanced = advanced.open; });
      button(setup.camera ? 'Turn off camera presence' : 'Enable camera presence', () => void change(controls.proactive.toggleCamera), advanced)
        .setAttribute('aria-pressed', String(setup.camera));
      add('p', 'The camera detects presence on this device. Twin can also use workspace activity.', advanced);
      if (setup.sound || setup.ambient) {
        button(setup.ambient ? 'Turn off ambient volume detection' : 'Mute when it is noisy', () => void change(controls.proactive.toggleAmbient), advanced)
          .setAttribute('aria-pressed', String(setup.ambient));
        add('p', 'Optional microphone permission. Volume is measured locally and stops in the background.', advanced);
      }

      const hours = add('fieldset', '', advanced);
      add('legend', 'Quiet hours', hours);
      const timeInput = (id, labelText, value) => {
        const label = add('label', labelText, hours);
        label.htmlFor = id;
        const input = add('input', '', hours);
        input.type = 'time';
        input.id = id;
        input.value = value;
        return input;
      };
      const start = timeInput('twin-quiet-start', 'Start', setup.quietStart);
      const end = timeInput('twin-quiet-end', 'End', setup.quietEnd);
      const save = () => controls.proactive.setQuietHours(start.value, end.value);
      start.addEventListener('input', save);
      end.addEventListener('input', save);
      add('p', 'Uses your local time. Results still appear during quiet hours. Leave blank to disable.', hours);
    }
    if (step < 3) {
      const photoStep = step === 1;
      const sample = photoStep ? controls.getPhoto() : voiceBlob;
      const field = photoStep ? 'photo' : 'voice';
      if (sample && sample === savedSamples[field]) add('p', 'Saved on this device.');
      if (sample && sample !== savedSamples[field]) {
        add('small', 'This sample is available for this preview.', sampleActions ?? guide);
        button(photoStep ? 'Save photo on this device' : 'Save recording on this device', () => void change(async () => {
          await localProfile('readwrite', store => {
            const request = store.get(profileKey);
            request.addEventListener('success', () => store.put({ ...request.result, [field]: sample, ...(photoStep ? { faceGeometry: Boolean(facePreview) } : { voiceLanguage }) }, profileKey));
            return request;
          });
          savedSamples[field] = sample;
          notice = photoStep ? 'Photo saved. It will be restored in this browser.' : 'Recording saved. It will be restored in this browser.';
        }), sampleActions ?? guide);
      }

    }
    const feedback = add('p', pending ? generatingVoice ? 'Generating a voice preview on this device.' : generatingPortrait ? 'Generating an animated portrait on this device.' : 'Waiting for your selection…' : notice || (step === 3 ? setup.sourceError : step === 4 ? setup.error : ''));
    feedback.className = 'setup-status';
    feedback.setAttribute('role', 'status');
    const actions = add('div', '');
    actions.className = 'setup-actions';
    if (firstSetup && step === 2) {
      button('Back to appearance', () => move(1), actions).disabled = pending || Boolean(recorder);
    }
    const next = firstSetup && step === 1 ? 2 : workspaceStep;
    const label = firstSetup ? (step === 1 ? 'Continue to voice' : 'Choose trading information') : 'Done';
    const nextAction = button(label, () => {
      if (firstSetup && step === 1) handoffReason = controls.hasPhoto() ? 'Appearance prepared' : '';
      move(next);
    }, actions, true);
    nextAction.dataset.identityNext = '';
    nextAction.disabled = pending || Boolean(recorder);
    if (firstSetup) button('Later', () => {
      closeFaceCamera();
      pausedIdentity = true;
      render(true);
    }, actions).disabled = pending || Boolean(recorder);

  }
  if (focusHeading) heading.focus();
}
guide.addEventListener('cancel', event => {
  event.preventDefault();
  if (pending || recorder) return;
  if (editingName) {
    if (guide.querySelector('input')?.disabled) return;
    editingName = false;
    render(true);
    return;
  }
  if (!firstSetup) move(workspaceStep);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && step === 4 && guide.open && !pending) render();
});
workspace.addEventListener('twin:sensor-stopped', () => {
  if (step === 4 && guide.open && !pending) render();
});
workspace.addEventListener('twin:portrait-preview', event => {
  const face = workspace.querySelector('.tp-face');
  if (!face) return;
  face.querySelector('video')?.remove();
  if (!event.detail) return;
  const video = document.createElement('video');
  video.src = event.detail;
  video.poster = face.querySelector('img')?.src || '';
  video.className = 'tp-portrait-preview';
  video.setAttribute('aria-label', 'Twin animated portrait in the workspace');
  video.controls = !firstSetup;
  video.playsInline = true;
  video.muted = true;
  video.preload = 'metadata';
  face.append(video);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) void video.play().catch(() => {});
});
workspace.addEventListener('twin:resume-voice-setup', () => {
  if (step !== workspaceStep || pending || recorder) return;
  firstSetup = true;
  move(2);
});
workspace.addEventListener('twin:configure-source', () => move(3));
workspace.addEventListener('twin:show-example', () => controls.proactive.showExample());
const workspaceFilePicker = document.createElement('input');
workspaceFilePicker.type = 'file';
workspaceFilePicker.accept = '.txt,.md';
workspaceFilePicker.hidden = true;
let compareWorkspaceFile = false;
workspace.append(workspaceFilePicker);
workspaceFilePicker.addEventListener('change', () => {
  const file = workspaceFilePicker.files[0];
  workspaceFilePicker.value = '';
  if (file) void controls.proactive.chooseSnapshot(file, compareWorkspaceFile);
});
workspace.addEventListener('twin:choose-source', () => {
  compareWorkspaceFile = false;
  if (manualPicker || typeof window.showOpenFilePicker !== 'function') {
    manualPicker = true;
    workspaceFilePicker.click();
  } else {
    void requestSource();
  }
});
workspace.addEventListener('twin:toggle-source', () => {
  if (controls.proactive.setup.source) controls.proactive.togglePause();
});
workspace.addEventListener('twin:compare-source', () => {
  if (!controls.proactive.setup.manual || controls.proactive.setup.paused) return;
  compareWorkspaceFile = true;
  workspaceFilePicker.click();
});
if (externalControls) {
  externalControls.addEventListener('twin:settings', event => {
    const section = { source: 3, reminders: 4, permissions: 1 }[event.detail];
    if (section) move(section);
  });
  shortcuts.remove();
} else {
  button('My permissions', () => move(1), shortcuts);
  button('Proactive collaboration', () => move(3), shortcuts);
}
controls.photo.addEventListener('twin:photo-result', event => {
  if (step !== 1 || editingName) return;
  if (event.detail) {
    facePreview = undefined;
    clearPortraitPreview();
  }
  notice = event.detail ? 'Portrait preview updated.' : 'Could not read the photo. Choose a JPEG, PNG, or WebP under 8 MB.';
  render(true);
});
try {
  const existing = await localProfile('readonly', store => store.get(profileKey));
  if (existing) {
    if (existing.photo) {
      savedSamples.photo = existing.photo;
      const restored = await controls.setPhoto(existing.photo);
      if (restored && existing.faceGeometry === true) {
        const savedPhoto = existing.photo;
        void import('./face-geometry.mjs').then(({ createFacePreview }) => createFacePreview(savedPhoto)).then(preview => {
          if (!preview || controls.getPhoto() !== savedPhoto || savedSamples.photo !== savedPhoto) return;
          facePreview = preview;
          if (step === workspaceStep || (step === 1 && !editingName && !faceCamera && !pending)) render();
          else workspace.querySelector('.twin-workspace-orb .tp-face')?.append(preview.canvas);
        }).catch(() => { /* Keep the saved portrait available even without the geometry model. */ });
      }
    }
    if (existing.voice) {
      voiceBlob = savedSamples.voice = existing.voice;
      voiceLanguage = existing.voiceLanguage === 'en' ? 'en' : 'zh';
      voiceURL = URL.createObjectURL(voiceBlob);
    }
  }
} catch {
  // Local persistence may be disabled in the browser. The session still works.
}
render(true);
