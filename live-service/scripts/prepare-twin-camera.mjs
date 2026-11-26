import { copyFile, cp, mkdir } from 'node:fs/promises';

const packageRoot = new URL('../node_modules/@mediapipe/tasks-vision/', import.meta.url);
const target = new URL('../public/twin-presence/vision-runtime/', import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(new URL('vision_bundle.mjs', packageRoot), new URL('vision_bundle.mjs', target));
await cp(new URL('wasm', packageRoot), new URL('wasm', target), { recursive: true });
