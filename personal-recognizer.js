// Local supervised nearest-neighbour sequence classifier with DTW alignment.
// It learns examples; it is not a pretrained ASL-language model.
export const LABELS = ['I','NEED','HELP','YES','NO','HELLO','NONE'];
export const FEATURE_DIM = 460;
export function validateSample(sample) {
  return sample && typeof sample.id === 'string' && LABELS.includes(sample.label)
    && ['train','test'].includes(sample.split) && Number.isInteger(sample.frames)
    && sample.frames >= 8 && sample.frames <= 32 && sample.dim === FEATURE_DIM
    && Array.isArray(sample.data) && sample.data.length === sample.frames * FEATURE_DIM
    && sample.data.every(v => Number.isFinite(v) && Math.abs(v) < 1000);
}
export function fingerprint(sample) {
  // Exact feature duplicate detection: labels/IDs do not make a take independent.
  let hash = 2166136261;
  const bytes = new Uint8Array(Float32Array.from(sample.data).buffer);
  for (const byte of bytes) { hash ^= byte; hash = Math.imul(hash, 16777619); }
  return `${sample.frames}:${hash >>> 0}`;
}
export function sequenceDistance(a, b) {
  const n = a.frames, m = b.frames, d = a.dim;
  if (d !== b.dim || !n || !m) return Infinity;
  let previous = new Float64Array(m + 1).fill(Infinity); previous[0] = 0;
  for (let i = 1; i <= n; i++) {
    const current = new Float64Array(m + 1).fill(Infinity);
    for (let j = 1; j <= m; j++) {
      let square = 0;
      for (let k = 0; k < d; k++) { const delta = a.data[(i-1)*d+k] - b.data[(j-1)*d+k]; square += delta * delta; }
      current[j] = Math.sqrt(square / d) + Math.min(previous[j], previous[j-1], current[j-1]);
    }
    previous = current;
  }
  return previous[m] / Math.max(n, m);
}
const median = values => { const sorted = [...values].sort((a,b) => a-b); return sorted[Math.floor(sorted.length / 2)]; };
export function trainClassifier(samples) {
  const train = samples.filter(s => s.split === 'train');
  if (train.some(s => !validateSample(s))) throw new Error('Invalid training data.');
  const seen = new Set();
  for (const sample of train) { const hash = fingerprint(sample); if (seen.has(hash)) throw new Error('Duplicate training take. Record separate attempts.'); seen.add(hash); }
  const labels = [...new Set(train.map(s => s.label))];
  if (!labels.includes('NONE') || labels.filter(l => l !== 'NONE').length < 2) throw new Error('Record at least two signs and NONE background examples.');
  const classes = [];
  for (const label of labels) {
    const takes = train.filter(s => s.label === label);
    if (takes.length < 3) throw new Error(`Record at least 3 training takes for ${label}.`);
    const within = takes.map(take => Math.min(...takes.filter(other => other.id !== take.id).map(other => sequenceDistance(take, other))));
    const outside = takes.map(take => Math.min(...train.filter(s => s.label !== label).map(other => sequenceDistance(take, other))));
    // Calibrate from training only. Overlapping classes get conservative radii.
    const radius = Math.max(.005, Math.min(.6, Math.max(.03, median(within) * 1.8), median(outside) * .75));
    classes.push({ label, takes, radius });
  }
  return { version: 1, classes, trainIds: train.map(s => s.id), trainFingerprints: [...seen] };
}
export function predict(model, sample) {
  const ranked = model.classes.map(group => ({ label: group.label, radius: group.radius, distance: Math.min(...group.takes.map(t => sequenceDistance(sample, t))) })).sort((a,b) => a.distance-b.distance);
  const [best, next] = ranked;
  if (!best) return { label: 'UNKNOWN', reason: 'No model available.', ranked: [] };
  const separation = next ? next.distance - best.distance : Infinity;
  const accepted = best.distance <= best.radius && separation >= Math.max(.012, best.distance * .15);
  return { label: accepted ? best.label : 'UNKNOWN', reason: accepted ? 'Matched local recorded examples.' : best.distance > best.radius ? 'Nearest match exceeds its training-derived distance limit.' : 'Ambiguous between sign classes.', ranked: ranked.slice(0,3) };
}
export function evaluateClassifier(model, samples) {
  const tests = samples.filter(s => s.split === 'test');
  if (!tests.length) throw new Error('Record new test takes; training takes are not evaluation data.');
  const testFingerprints = new Set();
  for (const sample of tests) {
    if (!validateSample(sample)) throw new Error('Invalid test take.');
    if (model.trainIds.includes(sample.id) || model.trainFingerprints.includes(fingerprint(sample))) throw new Error('A test take duplicates training data. Record a fresh attempt.');
    const hash = fingerprint(sample);
    if (testFingerprints.has(hash)) throw new Error('Duplicate test take. Record independent attempts.');
    testFingerprints.add(hash);
  }
  const labels = model.classes.map(c => c.label);
  if (tests.some(s => !labels.includes(s.label))) throw new Error('A test label has no training examples.');
  const quality = sample => {
    let one = 0, both = 0;
    for (let frame = 0; frame < sample.frames; frame++) {
      const a = sample.data[frame * FEATURE_DIM + 270] > .5, b = sample.data[frame * FEATURE_DIM + 271] > .5;
      if (a || b) one++; if (a && b) both++;
    }
    return { handFrames: one, bothHandFrames: both, frames: sample.frames, durationMs: sample.durationMs ?? null };
  };
  const records = tests.map(sample => { const result = predict(model, sample); return { id: sample.id, expected: sample.label, predicted: result.label, reason: result.reason, ranked: result.ranked, quality: quality(sample) }; });
  const trainingQuality = model.classes.map(group => ({ label: group.label, radius: group.radius, takes: group.takes.map(take => ({ id: take.id, ...quality(take) })) }));
  const byLabel = labels.map(label => {
    const rows = records.filter(r => r.expected === label);
    return { label, total: rows.length, correct: rows.filter(r => r.predicted === label || (label === 'NONE' && r.predicted === 'UNKNOWN')).length };
  });
  const missed = records.filter(r => r.expected !== 'NONE' && ['NONE','UNKNOWN'].includes(r.predicted)).length;
  const falseTriggers = records.filter(r => r.expected === 'NONE' && !['NONE','UNKNOWN'].includes(r.predicted)).length;
  const complete = byLabel.every(row => row.total >= 2);
  // A small screening gate for this user's prototype, not general ASL accuracy.
  const passed = complete && falseTriggers === 0 && byLabel.every(row => row.correct / row.total >= .8);
  return { total: records.length, byLabel, missed, falseTriggers, complete, passed, records, trainingQuality };
}
