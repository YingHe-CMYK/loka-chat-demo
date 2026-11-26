let landmarker;

async function getLandmarker() {
  if (!landmarker) {
    const runtime = new URL('./vision-runtime/', import.meta.url);
    landmarker = import(new URL('vision_bundle.mjs', runtime).href).then(async ({ FaceLandmarker, FilesetResolver }) => {
      const files = await FilesetResolver.forVisionTasks(new URL('wasm', runtime).href);
      const detector = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: new URL('../previous/vendor/mediapipe/face_landmarker.task', import.meta.url).href },
        runningMode: 'IMAGE',
        numFaces: 2,
      });
      return { detector, edges: FaceLandmarker.FACE_LANDMARKS_TESSELATION };
    }).catch(error => {
      landmarker = undefined;
      throw error;
    });
  }
  return landmarker;
}

export async function estimateFaceSurface(image) {
  const { detector, edges } = await getLandmarker();
  const { faceLandmarks } = detector.detect(image);
  if (faceLandmarks.length !== 1) return undefined;
  const faces = [];
  for (let index = 0; index + 2 < edges.length; index += 3) {
    const [first, second, third] = edges.slice(index, index + 3);
    if (first.end === second.start && second.end === third.start && third.end === first.start) {
      faces.push([first.start, second.start, third.start]);
    }
  }
  if (!faces.length) throw new Error('Face model did not provide a surface topology.');
  return { vertices: faceLandmarks[0], faces };
}

export async function createFacePreview(photo) {
  const url = URL.createObjectURL(photo);
  const image = new Image();
  image.src = url;
  let surface;
  try {
    await image.decode();
    surface = await estimateFaceSurface(image);
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!surface) return undefined;

  const texture = document.createElement('canvas');
  texture.width = 256;
  texture.height = 256;
  const sampler = texture.getContext('2d');
  sampler.drawImage(image, 0, 0, 256, 256);
  const { data } = sampler.getImageData(0, 0, 256, 256);
  const vertices = surface.vertices.slice(0, 468);
  const center = ['x', 'y', 'z'].map(axis =>
    (Math.min(...vertices.map(point => point[axis])) + Math.max(...vertices.map(point => point[axis]))) / 2);
  const aspect = image.naturalWidth / image.naturalHeight;
  const width = Math.max(...vertices.map(point => Math.abs((point.x - center[0]) * aspect)));
  const height = Math.max(...vertices.map(point => Math.abs(point.y - center[1])));
  const scale = 103 / Math.max(width, height);
  const points = vertices.map(point => ({
    x: (point.x - center[0]) * aspect * scale,
    y: (point.y - center[1]) * scale,
    z: (center[2] - point.z) * aspect * scale,
  }));
  const triangles = surface.faces.filter(face => face.every(index => index < points.length)).map(face => {
    const centroid = axis => face.reduce((sum, index) => sum + vertices[index][axis], 0) / 3;
    const pixel = axis => Math.max(0, Math.min(255, Math.round(centroid(axis) * 255)));
    const offset = (pixel('y') * 256 + pixel('x')) * 4;
    return { face, color: `rgb(${data[offset]},${data[offset + 1]},${data[offset + 2]})` };
  });

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  canvas.className = 'setup-face-surface';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Personalized three-dimensional facial surface');
  const painter = canvas.getContext('2d');
  const angle = document.createElement('input');
  angle.type = 'range';
  angle.min = '-35';
  angle.max = '35';
  angle.value = '0';
  angle.setAttribute('aria-label', 'Turn your 3D face');
  function draw() {
    const radians = angle.valueAsNumber * Math.PI / 180;
    const sine = Math.sin(radians);
    const cosine = Math.cos(radians);
    const projected = points.map(({ x, y, z }) => ({
      x: 128 + x * cosine + z * sine,
      y: 128 + y,
      depth: z * cosine - x * sine,
    }));
    painter.clearRect(0, 0, 256, 256);
    const depth = face => face.reduce((sum, index) => sum + projected[index].depth, 0);
    for (const { face, color } of [...triangles].sort((a, b) => depth(a.face) - depth(b.face))) {
      const [first, second, third] = face.map(index => projected[index]);
      painter.beginPath();
      painter.moveTo(first.x, first.y);
      painter.lineTo(second.x, second.y);
      painter.lineTo(third.x, third.y);
      painter.closePath();
      painter.fillStyle = painter.strokeStyle = color;
      painter.fill();
      painter.stroke();
    }
  }
  angle.addEventListener('input', draw);
  draw();
  const preview = document.createElement('div');
  preview.className = 'setup-face-geometry';
  const caption = document.createElement('span');
  caption.textContent = 'Turn your 3D face';
  preview.append(caption, angle);
  return { canvas, controls: preview };
}
