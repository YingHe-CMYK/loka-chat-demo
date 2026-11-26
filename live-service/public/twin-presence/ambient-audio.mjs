export function createLoudnessTracker(threshold = 0.05) {
  let level = 'unknown';
  let previous;
  let streak = 0;
  return samples => {
    const rms = Math.sqrt(samples.reduce((energy, value) => energy + value * value, 0) / samples.length);
    if (!Number.isFinite(rms)) return level;
    const measured = rms >= threshold ? 'loud' : 'quiet';
    streak = previous === measured ? streak + 1 : 1;
    previous = measured;
    if (streak >= (measured === 'loud' ? 2 : 5)) level = measured;
    return level;
  };
}

// The analyser is intentionally disconnected from the speakers and stores no audio.
export async function startAmbientAudio(onLevel) {
  const context = new AudioContext();
  let stream;
  let timer;
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    stream?.getTracks().forEach(track => track.stop());
    void context.close().catch(() => {});
  }
  try {
    await context.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false },
      video: false,
    });
    const analyser = context.createAnalyser();
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);
    const measure = createLoudnessTracker();
    timer = setInterval(() => {
      analyser.getFloatTimeDomainData(buffer);
      onLevel(measure(buffer));
    }, 200);
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => { close(); onLevel('stopped'); }, { once: true });
    }
    return close;
  } catch (error) {
    close();
    throw error;
  }
}
