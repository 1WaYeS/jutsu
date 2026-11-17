// Integration adapter. Upstream sources remain unchanged in vendor/GestureSign.
import { ModelClient } from './vendor/GestureSign/web/src/ml/model-client';
import { TrackerClient } from './vendor/GestureSign/web/src/ml/tracker-client';
import { Recognizer } from './vendor/GestureSign/web/src/ml/recognizer';
import { modelInput } from './vendor/GestureSign/web/src/ml/features';
import { decide } from './vendor/GestureSign/web/src/ml/decision';
import { loadReplayClips } from './vendor/GestureSign/web/src/replay/clips';
import { Segmenter, frameStatus } from './vendor/GestureSign/web/src/ml/segmenter';
import { createEnhancedTracker } from './enhanced-tracker';
export const createBasicTracker = () => createEnhancedTracker('/ai/basic-tracker.worker.js');
export { HAND_CONNECTIONS, POSE_CONNECTIONS, LEFT_HAND_START, RIGHT_HAND_START, POSE_START } from './vendor/GestureSign/web/src/ml/landmarks';
export function extractPersonalSample(frames: Float32Array[], fps: number) {
  const input = modelInput(frames, fps, { fps: 30, maxFrames: 32, featureSet: 'hands_pose_lips' });
  return { data: Array.from(input.data), frames: input.frames, dim: input.dim };
}

// Uses only pretrained landmark tracking. No GestureSign word predictions or
// ONNX sign model are loaded by this personalized training path.
export async function createPersonalTracker(onFrame: (event: any) => void, onSegment: (event: any) => void) {
  const tracker = await createEnhancedTracker();
  const segmenter = new Segmenter({ prerollMs: 300, gapMs: 350 });
  let running = false;
  return {
    start(video: HTMLVideoElement) {
      running = true;
      tracker.start(video, frame => {
        if (!running) return;
        if (frame.error) { onFrame({ error: frame.error }); return; }
        const status = frameStatus(frame.frame, frame.poses);
        onFrame({ ...frame, status });
        if (status === 'partial' || status === 'crowded') { segmenter.reset(); return; }
        const event = segmenter.push(frame.frame, frame.t, { crowded: status === 'crowded' || status === 'partial' });
        if (event?.type === 'end') {
          const input = modelInput(event.segment.frames, event.segment.fps, { fps: 30, maxFrames: 32, featureSet: 'hands_pose_lips' });
          if (input.frames >= 8) onSegment({ data: Array.from(input.data), frames: input.frames, dim: input.dim, durationMs: event.segment.durationMs });
        }
      });
    },
    reset() { segmenter.reset(); },
    dispose() { running = false; segmenter.reset(); tracker.dispose(); }
  };
}

export async function createAi(onEvent: (event: any) => void, onFrame: (frame: any) => void) {
  const model = await ModelClient.load();
  let tracker: TrackerClient;
  try { tracker = await TrackerClient.create(model.meta.featureSet); }
  catch (error) { model.client.dispose(); throw error; }
  const recognizer = new Recognizer(model.meta, model.labels, input => model.client.infer(input), event => {
    if (event.type === 'result') onEvent({ ...event, guesses: event.result.decision.top.map(g => ({ ...g, label: model.labels[g.index].label })) });
    else onEvent(event);
  });
  return {
    labels: model.labels,
    start(video: HTMLVideoElement) { tracker.start(video, frame => { onFrame(frame); recognizer.push(frame); }); },
    reset() { recognizer.reset(); },
    dispose() { recognizer.reset(); tracker.dispose(); model.client.dispose(); }
  };
}

export async function testModel(onResult: (result: any) => void) {
  const model = await ModelClient.load();
  try {
    const clips = await loadReplayClips();
    for (const clip of clips) {
      const input = modelInput(clip.frames, clip.fps, model.meta);
      const result = await model.client.infer(input);
      const decision = decide(result.logits, model.labels.map(l => l.shipped), model.meta.calibration);
      onResult({ expected: clip.sign || clip.title, credit: clip.credit, guessed: decision.top.map(g => ({ label: model.labels[g.index].label, probability: g.probability })), kind: decision.kind });
    }
  } finally { model.client.dispose(); }
}
