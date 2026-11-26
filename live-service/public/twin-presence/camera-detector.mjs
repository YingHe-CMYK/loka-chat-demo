// A short missed detection should not change the workspace while someone is reading.
export function createPresenceTracker() {
  let present = false;
  let consecutive = 0;
  return hasFace => {
    if (hasFace === present) {
      consecutive = 0;
    } else if (++consecutive >= (present ? 5 : 3)) {
      present = hasFace;
      consecutive = 0;
    }
    return present;
  };
}

export async function createPresenceDetector() {
  if (typeof window.FaceDetector === 'function') {
    const detector = new window.FaceDetector({ maxDetectedFaces: 1, fastMode: true });
    return { containsFace: async video => (await detector.detect(video)).length > 0, close() {} };
  }
  const runtime = new URL('./vision-runtime/', import.meta.url);
  const { FaceDetector, FilesetResolver } = await import(new URL('vision_bundle.mjs', runtime).href);
  const files = await FilesetResolver.forVisionTasks(new URL('wasm', runtime).href);
  const detector = await FaceDetector.createFromOptions(files, {
    baseOptions: { modelAssetPath: new URL('./models/blaze-face-short-range.tflite', import.meta.url).href },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.6,
  });
  return {
    containsFace: video => detector.detectForVideo(video, performance.now()).detections.length > 0,
    close: () => detector.close(),
  };
}
