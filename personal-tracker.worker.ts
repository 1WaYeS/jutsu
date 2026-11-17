import { FilesetResolver, HolisticLandmarker, HandLandmarker } from '@mediapipe/tasks-vision';
import { assembleFrame } from './vendor/GestureSign/web/src/ml/assemble';
let body: HolisticLandmarker, hands: HandLandmarker;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await FilesetResolver.forVisionTasks('/ai/vendor/mediapipe/wasm', true);
      body = await HolisticLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/ai/vendor/mediapipe/models/holistic_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO' });
      // Each task consumes and clears ModuleFactory. A distinct loader URL
      // reruns the local ES module for the second task in this worker.
      const handFiles = { ...files, wasmLoaderPath: `${files.wasmLoaderPath}?task=hands` };
      hands = await HandLandmarker.createFromOptions(handFiles, { baseOptions: { modelAssetPath: '/ai/vendor/mediapipe/models/hand_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: .45, minHandPresenceConfidence: .45, minTrackingConfidence: .45 });
      self.postMessage({ type: 'ready' });
    } catch (error) { body?.close(); hands?.close(); self.postMessage({ type: 'error', message: String(error) }); }
    return;
  }
  if (data.type !== 'frame') return;
  const { bitmap, t } = data;
  try {
    const started = performance.now();
    const holistic = body.detectForVideo(bitmap, t);
    const original: any[] = [];
    if (holistic.leftHandLandmarks[0]) original.push({ points: holistic.leftHandLandmarks[0], side: 'left' });
    if (holistic.rightHandLandmarks[0]) original.push({ points: holistic.rightHandLandmarks[0], side: 'right' });
    // Scan the full image independently of the body's hand regions. Never
    // synthesize an occluded hand or carry stale landmarks into current frames.
    const detected = hands.detectForVideo(bitmap, t);
    const direct = detected.landmarks.map((points, i) => ({ points, label: detected.handedness[i]?.[0]?.categoryName || '' }));
    const selected = direct.length > original.length ? direct : original;
    const frame = assembleFrame({ hands: selected, pose: holistic.poseLandmarks[0] || null, face: holistic.faceLandmarks[0] || null });
    self.postMessage({ type: 'frame', frame, t, poses: holistic.poseLandmarks.length, hands: selected.length, holisticHands: original.length, directHands: direct.length, ms: performance.now()-started }, [frame.buffer]);
  } catch (error) { self.postMessage({ type: 'error', message: String(error) }); }
  finally { bitmap.close(); }
};
