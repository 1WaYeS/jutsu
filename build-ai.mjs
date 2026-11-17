import { build } from 'esbuild';
import { mkdir, cp, copyFile, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { MODELS, downloadVerified } from './vendor/GestureSign/web/scripts/fetch-assets.mjs';
const out = resolve('public-ai');
await mkdir(out, { recursive: true });
await cp('vendor/GestureSign/web/public/models', join(out, 'models'), { recursive: true });
await cp('vendor/GestureSign/web/public/replay', join(out, 'replay'), { recursive: true });
await copyFile('vendor/GestureSign/LICENSE', join(out, 'GESTURESIGN-LICENSE.txt'));
for (const [source, folder] of [
  ['@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.js', 'vendor/mediapipe/wasm'],
  ['@mediapipe/tasks-vision/wasm/vision_wasm_module_internal.wasm', 'vendor/mediapipe/wasm'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', 'vendor/ort'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.wasm', 'vendor/ort'],
]) {
  const dest = join(out, folder); await mkdir(dest, { recursive: true });
  await copyFile(join('node_modules', source), join(dest, source.split('/').at(-1)));
}
for (const holistic of MODELS.filter(m => ['holistic_landmarker.task','hand_landmarker.task'].includes(m.file))) {
const destination = join(out, 'vendor/mediapipe/models', holistic.file);
let valid = false;
try { valid = (await stat(destination)).size === holistic.bytes && createHash('sha256').update(await readFile(destination)).digest('hex') === holistic.sha256; } catch {}
if (!valid) {
  const body = await downloadVerified(holistic);
  await mkdir(join(out, 'vendor/mediapipe/models'), { recursive: true }); await writeFile(destination, body);
}
}
await build({
  entryPoints: { bridge: 'ai-entry.ts', 'model.worker': 'vendor/GestureSign/web/src/ml/model.worker.ts', 'tracker.worker': 'vendor/GestureSign/web/src/ml/tracker.worker.ts', 'personal-tracker.worker':'personal-tracker.worker.ts', 'basic-tracker.worker':'basic-tracker.worker.ts' },
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outdir: out,
  define: { 'import.meta.env.BASE_URL': '"/ai/"' },
  plugins: [{ name: 'jutsu-worker-paths', setup(api) {
    api.onLoad({ filter: /(?:model|tracker)-client\.ts$/ }, async ({ path }) => ({
      contents: (await readFile(path, 'utf8')).replace(/new URL\('\.\/(model|tracker)\.worker\.ts', import\.meta\.url\)/g, (_, name) => `new URL('/ai/${name}.worker.js', globalThis.location.origin)`), loader: 'ts'
    }));
  }}]
});
console.log('Built Jutsu AI bridge, trained model, workers, and verified local runtime assets.');
