import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { build } from 'esbuild';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const result = await build({ stdin: { contents: `export * from './vendor/GestureSign/web/src/ml/assemble'; export * from './vendor/GestureSign/web/src/ml/features'; export * from './vendor/GestureSign/web/src/ml/landmarks'; export * from './vendor/GestureSign/web/src/ml/meta'; export * from './vendor/GestureSign/web/src/ml/decision';`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'node' });
const ml = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
test('model metadata, vocabulary, and input feature dimensions agree', async () => {
  const meta = ml.parseMeta(await json('public-ai/models/model-meta.json'));
  const labels = ml.parseLabels(await json('public-ai/models/labels.json'), meta.classes);
  assert.equal(meta.classes, 250); assert.equal(meta.featureDim, 460);
  assert.equal(ml.featureLayout(meta.featureSet).sequenceDim, meta.featureDim);
  for (const sign of ['hello', 'yes', 'no', 'thank you']) assert(labels.some(l => l.label.toLowerCase() === sign && l.shipped));
  assert((await stat('public-ai/models/model.onnx')).size > 5_000_000);
});
test('integrated preprocessing matches the upstream training fixtures', async () => {
  const fixture = await json('vendor/GestureSign/shared/fixtures/features.json');
  assert.equal(fixture.featureVersion, ml.FEATURE_VERSION);
  for (const example of fixture.cases) {
    const frames = example.frames.map(flat => {
      const frame = ml.emptyFrame();
      fixture.points.forEach((point, i) => { frame[point * 3] = flat[2 * i] ?? NaN; frame[point * 3 + 1] = flat[2 * i + 1] ?? NaN; });
      return frame;
    });
    const output = example.kind === 'frame' ? ml.frameFeatures(frames[0], example.featureSet) : ml.modelInput(frames, example.srcFps ?? 30, { fps: example.fps ?? 30, maxFrames: example.maxFrames ?? 64, featureSet: example.featureSet }).data;
    const expected = example.expected.features.flat();
    assert.equal(output.length, expected.length, example.name);
    const worst = Math.max(...output.map((value, i) => Math.abs(value - expected[i])));
    assert(worst <= fixture.tolerance, `${example.name}: ${worst}`);
  }
});
test('uncertain and partially framed results are not accepted for automatic speech', async () => {
  const meta = ml.parseMeta(await json('public-ai/models/model-meta.json'));
  const shipped = Array(250).fill(true);
  assert.equal(ml.decide(new Float32Array(250), shipped, meta.calibration).kind, 'not-sure');
  const confident = new Float32Array(250); confident[10] = 30;
  assert.equal(ml.decide(confident, shipped, meta.calibration, { partial: true }).kind, 'not-sure');
  assert.equal(ml.decide(confident, shipped, meta.calibration).kind, 'sign');
});
test('built workers and local runtime assets are present', async () => {
  const bridge = await readFile('public-ai/bridge.js', 'utf8');
  assert(bridge.includes('/ai/model.worker.js')); assert(bridge.includes('/ai/tracker.worker.js'));
  assert(!bridge.includes("new URL('./model.worker.ts'"));
  for (const path of ['personal-tracker.worker.js', 'vendor/mediapipe/models/hand_landmarker.task', 'tracker.worker.js', 'model.worker.js', 'vendor/mediapipe/wasm/vision_wasm_module_internal.wasm', 'vendor/mediapipe/models/holistic_landmarker.task', 'vendor/ort/ort-wasm-simd-threaded.wasm']) assert((await stat(`public-ai/${path}`)).size > 0);
});

test('full-image hand detections occupy distinct body-side slots and missing hands stay missing', () => {
  const point = (x,y) => ({x,y,z:0});
  const pose = Array.from({length:33}, () => point(.5,.5));
  pose[15] = point(.2,.5); pose[16] = point(.8,.5);
  const left = Array.from({length:21}, () => point(.2,.5));
  const right = Array.from({length:21}, () => point(.8,.5));
  const frame = ml.assembleFrame({pose, hands:[{points:right,label:'Left'},{points:left,label:'Right'}]});
  assert(Math.abs(frame[ml.LEFT_HAND_START*3]-.2)<1e-6);
  assert(Math.abs(frame[ml.RIGHT_HAND_START*3]-.8)<1e-6);
  const single = ml.assembleFrame({pose,hands:[{points:left,label:'Right'}]});
  assert(Number.isNaN(single[ml.RIGHT_HAND_START*3]));
});
