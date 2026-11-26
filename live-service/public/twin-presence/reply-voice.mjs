let imageDetector;

export function getImageDetector() {
  if (!imageDetector) {
    const runtime = new URL('./vision-runtime/', import.meta.url);
    imageDetector = import(new URL('vision_bundle.mjs', runtime).href).then(async ({ FaceDetector, FilesetResolver }) => {
      const files = await FilesetResolver.forVisionTasks(new URL('wasm', runtime).href);
      return FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('./models/blaze-face-short-range.tflite', import.meta.url).href },
        runningMode: 'IMAGE',
      });
    }).catch(error => {
      imageDetector = undefined;
      throw error;
    });
  }
  return imageDetector;
}

async function prepareMouth(workspace) {
  const photo = workspace.querySelector('.vorb[data-tp-face="true"] .tp-face img');
  if (!photo || !photo.naturalWidth || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const detector = await getImageDetector();
  const face = detector.detect(photo).detections[0];
  const mouth = face?.keypoints?.[3];
  if (!mouth || !face.boundingBox) return;
  return {
    photo,
    x: mouth.x * photo.naturalWidth,
    y: mouth.y * photo.naturalHeight,
    width: Math.round(face.boundingBox.width * 0.31),
  };
}

function animateMouth(mouth, analyser) {
  if (!mouth?.photo.isConnected) return () => {};
  const { photo, x, y, width } = mouth;
  if (!width) return () => {};
  const height = Math.max(4, Math.round(width * 0.43));
  const canvas = document.createElement('canvas');
  canvas.className = 'tp-speaking-mouth';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.width = width;
  canvas.height = height;
  const painter = canvas.getContext('2d');
  if (!painter) return () => {};
  photo.after(canvas);
  const waveform = new Uint8Array(analyser.fftSize);
  let frame;
  let opening = 0;
  function draw() {
    const bounds = photo.getBoundingClientRect();
    const holder = photo.parentElement?.getBoundingClientRect();
    if (!holder || !bounds.width || !bounds.height || !photo.naturalWidth) return;
    const scale = Math.min(bounds.width / photo.naturalWidth, bounds.height / photo.naturalHeight);
    canvas.style.left = `${bounds.left - holder.left + (bounds.width - photo.naturalWidth * scale) / 2 + (x - width / 2) * scale}px`;
    canvas.style.top = `${bounds.top - holder.top + (bounds.height - photo.naturalHeight * scale) / 2 + (y - height / 2) * scale}px`;
    canvas.style.width = `${width * scale}px`;
    canvas.style.height = `${height * scale}px`;
    analyser.getByteTimeDomainData(waveform);
    const rms = Math.sqrt(waveform.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / waveform.length);
    opening = opening * 0.65 + Math.min(0.45, rms * 2.7) * 0.35;
    painter.clearRect(0, 0, width, height);
    painter.drawImage(photo, x - width / 2, y - height / 2, width, height, 0, -height * opening / 2, width, height * (1 + opening));
    frame = requestAnimationFrame(draw);
  }
  draw();
  return () => {
    cancelAnimationFrame(frame);
    canvas.remove();
  };
}

export function setupReplyVoice(workspace, getReference) {
  let active;
  function stop() {
    active?.abort();
  }
  workspace.addEventListener('twin:stop-reply', stop);
  window.addEventListener('pagehide', stop);
  workspace.addEventListener('twin:speak-reply', async event => {
    const { text, status } = event.detail;
    event.detail.handled = true;
    stop();
    const { sample, language } = getReference();
    if (!sample) {
      status('Record a voice sample in My Twin → Voice first.');
      return;
    }
    const controller = new AbortController();
    active = controller;
    let context;
    let clearMouth;
    try {
      context = new AudioContext();
      controller.signal.addEventListener('abort', () => {
        clearMouth?.();
        if (context.state !== 'closed') void context.close();
      }, { once: true });
      status('Preparing your Twin’s voice…');
      await context.resume();
      const mouthPromise = prepareMouth(workspace).catch(() => undefined);
      const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(Array.from(text.trim()).slice(0, 600).join(''))));
      const response = await fetch('http://127.0.0.1:11435/speak', {
        method: 'POST',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Loka-Voice-Language': language,
          'X-Loka-Twin-Text': encoded,
        },
        body: sample,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
      });
      if (!response.ok) throw new Error(await response.text());
      const audio = await context.decodeAudioData(await response.arrayBuffer());
      const mouth = await mouthPromise;
      if (controller.signal.aborted) return;
      const source = context.createBufferSource();
      source.buffer = audio;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(context.destination);
      source.onended = () => {
        if (active !== controller || controller.signal.aborted) return;
        controller.abort();
        active = undefined;
        status('');
      };
      clearMouth = animateMouth(mouth, analyser);
      status(clearMouth && mouth ? 'Speaking with audio-driven mouth motion…' : 'Speaking…');
      source.start();
    } catch {
      if (!controller.signal.aborted) {
        controller.abort();
        status('Could not play this reply. Check the local voice service and try again.');
      }
    }
  });
}
