import { createPersonalTracker, extractPersonalSample, HAND_CONNECTIONS, POSE_CONNECTIONS, LEFT_HAND_START, RIGHT_HAND_START, POSE_START } from '/ai/bridge.js';
import { CameraController, cameraError } from './camera-controller.js';
import { SpeechController } from './speech-controller.js';
import { constructSentence } from './sentence-builder.js';
import { LABELS, validateSample, fingerprint } from './personal-recognizer.js';
import { loadSamples, saveSample, deleteSample } from './sample-store.js';
const $ = id => document.getElementById(id), video = $('training-video'), canvas = $('tracking'), context = canvas.getContext('2d');
const camera = new CameraController(video);
const speech = new SpeechController(undefined, undefined, message => { $('speech-state').textContent = message; });
const worker = new Worker('/personal-worker.js', { type: 'module' });
let requestId = 0; const pending = new Map();
worker.onmessage = ({ data }) => { const waiter = pending.get(data.id); if (!waiter) return; pending.delete(data.id); data.error ? waiter.reject(new Error(data.error)) : waiter.resolve(data); };
worker.onerror = () => { for (const waiter of pending.values()) waiter.reject(new Error('Recognition worker failed. Reload the page.')); pending.clear(); };
function work(operation, payload = {}) { const id = ++requestId; return new Promise((resolve,reject) => { pending.set(id,{resolve,reject}); worker.postMessage({ id, operation, ...payload }); }); }
let tracker, cameraGeneration = 0, samples = [], armed = null, timer, modelReady = false, modelPassed = false, modelEpoch = 0, predicting = false, saving = false, concepts = [], uncertain = false, sentence = '', confirmed = false, starting = false, evaluation = null;
const say = (id, text) => { $(id).textContent = text; };
function controls() {
  $('record-take').disabled = !tracker || !camera.stream || starting || !!armed || saving || samples.length >= 100;
  $('cancel-take').disabled = !armed;
  $('stop-training-camera').disabled = !tracker && !starting;
  $('start-training-camera').disabled = starting;
  $('train-model').disabled = !!armed || saving;
  $('evaluate-model').disabled = !modelReady || !!armed || saving;
}
function cancelRecording(message = 'Recording cancelled; nothing saved.') { clearTimeout(timer); armed = null; say('record-status', message); controls(); }
function invalidateModel() { modelEpoch++; modelReady = false; modelPassed = false; evaluation = null; work('reset').catch(() => {}); say('model-state','Dataset changed · train and evaluate again.'); controls(); }
function renderSamples() {
  $('counts').replaceChildren();
  for (const label of LABELS) {
    const row = document.createElement('tr');
    for (const value of [label, samples.filter(s => s.label === label && s.split === 'train').length, samples.filter(s => s.label === label && s.split === 'test').length]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    $('counts').append(row);
  }
  $('takes-list').replaceChildren();
  for (const sample of samples.slice(-12).reverse()) {
    const row = document.createElement('div'); row.className = 'take-row';
    const text = document.createElement('span'); text.textContent = `${sample.label} · ${sample.split} · ${sample.frames} frames`;
    const remove = document.createElement('button'); remove.className = 'ghost'; remove.textContent = 'Delete take';
    remove.addEventListener('click', async () => { try { await deleteSample(sample.id); samples = samples.filter(s => s.id !== sample.id); invalidateModel(); renderSamples(); } catch(e) { say('record-status',e.message); } });
    row.append(text, remove); $('takes-list').append(row);
  }
  controls();
}
async function storeTake(segment) {
  if (!armed || saving) return;
  const take = { ...segment, id: crypto.randomUUID(), label: armed.label, split: armed.split, at: new Date().toISOString(), featureVersion: 2 };
  if (!validateSample(take)) { cancelRecording('Invalid or too-short tracking sequence. Nothing saved; try again.'); return; }
  if (take.label === 'HELP') {
    let both=0; for(let i=0;i<take.frames;i++) if(take.data[i*take.dim+270]>.5 && take.data[i*take.dim+271]>.5) both++;
    if (both / take.frames < .4) { cancelRecording(`HELP needs both hands tracked. Both were visible in ${both}/${take.frames} feature frames; this new take was not saved. Try moving back or angling your supporting palm so it is not hidden. Existing takes are unchanged.`); return; }
  }
  if (samples.some(s => fingerprint(s) === fingerprint(take))) { cancelRecording('That feature sequence duplicates an existing take. Make a fresh attempt.'); return; }
  clearTimeout(timer); armed = null; saving = true; controls();
  tracker?.reset();
  try { await saveSample(take); samples.push(take); invalidateModel(); say('record-status',`Saved ${take.label} ${take.split} take on this device. No video was saved.`); renderSamples(); }
  catch(e) { say('record-status',`Could not save: ${e.message}`); }
  finally { saving = false; controls(); }
}
function draw(frame) {
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const p = i => ({ x: frame[i*3]*canvas.width, y: frame[i*3+1]*canvas.height });
  const edges = (offset,pairs,color) => { context.strokeStyle = color; context.lineWidth = 2; for (const [a,b] of pairs) { const u=p(offset+a),v=p(offset+b); if (![u.x,u.y,v.x,v.y].every(Number.isFinite)) continue; context.beginPath();context.moveTo(u.x,u.y);context.lineTo(v.x,v.y);context.stroke(); } };
  edges(POSE_START,POSE_CONNECTIONS,'#85858e'); edges(LEFT_HAND_START,HAND_CONNECTIONS,'#ff747e'); edges(RIGHT_HAND_START,HAND_CONNECTIONS,'#ff747e');
}
function frameReceived(event) {
  if(event.error){say('tracking-state',`Tracker error: ${event.error}`);return;}
  draw(event.frame);
  const hints = { ok: 'Tracking ready · sign once, then pause.', partial: 'Move back: both shoulders must be visible.', crowded: 'Only one signer should be in view.', nothing: 'Step into view.', 'no-hands': 'Body visible · raise your hands to sign.' };
  say('tracking-state',hints[event.status]);
  const left=Number.isFinite(event.frame[LEFT_HAND_START*3]),right=Number.isFinite(event.frame[RIGHT_HAND_START*3]);
  say('hand-coverage',`Left hand: ${left?'tracked':'not tracked'} · Right hand: ${right?'tracked':'not tracked'} · ${Math.round(event.ms)} ms/frame${event.directHands>event.holisticHands?' · full-image detector recovered a hand':''}`);
  if (armed?.label === 'NONE' && ['ok','no-hands'].includes(event.status)) armed.frames.push({ frame: event.frame.slice(), time: event.t });
}
async function segmentReceived(segment) {
  if (saving) return;
  if (armed) { if (armed.label !== 'NONE') await storeTake(segment); return; }
  if (!modelReady || predicting || !$('live-predictions').checked) return;
  const epoch = modelEpoch, cameraToken = cameraGeneration; predicting = true;
  try {
    const output = await work('predict',{ sample: segment });
    if (epoch !== modelEpoch || cameraToken !== cameraGeneration || armed || saving || !$('live-predictions').checked) return;
    const result = output.result;
    say('prediction', result.label === 'UNKNOWN' ? 'Not sure' : result.label === 'NONE' ? 'Ordinary movement · no sign added' : result.label);
    say('prediction-detail',`${result.reason} Match time: ${Math.round(output.milliseconds)} ms. Distance is a similarity measure, not a probability.`);
    if (result.label === 'NONE') return;
    if (!modelPassed) { say('sequence-state','Suggestion only. Record fresh tests and pass the screening check before automatic concept collection.'); return; }
    if (result.label === 'UNKNOWN') { uncertain = true; renderSentence(); return; }
    if (concepts.length >= 12) { say('sequence-state','Message is full. Finish or clear it before continuing.'); return; }
    concepts.push(result.label); confirmed = false; sentence = ''; speech.stop(); renderSentence();
  } catch(e) { say('prediction-detail',e.message); }
  finally { predicting = false; }
}
function renderSentence(finish = false) {
  $('recognized-concepts').textContent = concepts.length ? concepts.join(' → ') : 'No camera-recognized concepts yet.';
  const result = constructSentence(concepts,{ complete: finish, uncertain });
  sentence = result.sentence; confirmed = false;
  $('learned-sentence').value = sentence;
  say('sequence-state', uncertain ? 'An uncertain segment occurred. Review the message; do not assume no sign was missed.' : result.reason);
  $('confirm-learned').disabled = !sentence; $('speak-learned').disabled = true;
}
function stopCamera() {
  cameraGeneration++; starting = false; tracker?.dispose(); tracker = null; camera.stop(); cancelRecording(); speech.stop();
  context.clearRect(0,0,canvas.width,canvas.height); say('tracking-state','Camera stopped.'); say('hand-coverage','Hand tracking is off.'); controls();
}
async function startCamera() {
  stopCamera(); const token = cameraGeneration; starting = true; controls(); say('tracking-state','Loading local MediaPipe body/hand tracker…');
  try {
    const created = await createPersonalTracker(event => { if (token === cameraGeneration) frameReceived(event); }, segment => { if (token === cameraGeneration) segmentReceived(segment); });
    if (token !== cameraGeneration) { created.dispose(); return; }
    tracker = created;
    const started = await camera.start({ deviceId: $('training-camera').value });
    if (!started || token !== cameraGeneration) return;
    const devices = await camera.devices(); if (token !== cameraGeneration) return;
    const selected = $('training-camera').value;
    $('training-camera').replaceChildren(new Option('Default / rear camera',''),...devices.map((d,i) => new Option(d.label || `Camera ${i+1}`,d.deviceId)));
    if (devices.some(d => d.deviceId === selected)) $('training-camera').value = selected;
    tracker.start(video); say('tracking-state','Ready. Record your examples first.');
  } catch(e) { if (token === cameraGeneration) { stopCamera(); say('tracking-state',cameraError(e)); } }
  finally { if (token === cameraGeneration) { starting = false; controls(); } }
}
$('start-training-camera').addEventListener('click',startCamera);
$('stop-training-camera').addEventListener('click',stopCamera);
$('training-camera').addEventListener('change',() => { if(tracker) startCamera(); });
$('record-take').addEventListener('click',() => {
  if (!tracker || armed) return;
  tracker.reset(); armed = { label: $('take-label').value, split: $('take-split').value, frames: [] };
  say('record-status',armed.label === 'NONE' ? 'Recording ordinary movement for 2.5 seconds. Do not perform a target sign.' : `Recording next ${armed.label} attempt. Sign once, then pause comfortably. Waiting up to 15 seconds…`);
  const background = armed.label === 'NONE';
  timer = setTimeout(() => {
    if (!armed) return;
    if (!background) { cancelRecording('No complete sign captured. Check framing, then sign and pause. Nothing saved.'); return; }
    const frames = armed.frames;
    if (frames.length < 8) { cancelRecording('Not enough body tracking for a background take. Nothing saved.'); return; }
    const fps = (frames.length-1)*1000/(frames.at(-1).time-frames[0].time);
    storeTake(extractPersonalSample(frames.map(f => f.frame), fps));
  },background ? 2500 : 15000); controls();
});
$('cancel-take').addEventListener('click',() => cancelRecording());
$('train-model').addEventListener('click',async () => {
  if (armed) return;
  const epoch = ++modelEpoch; modelReady = false; modelPassed = false; $('train-model').disabled = true;
  say('model-state','Training local sequence matcher from training takes only…');
  try { const output = await work('train',{samples}); if(epoch !== modelEpoch) return; modelReady = true; say('model-state',`Trained from ${output.result.trainingCount} takes: ${output.result.labels.join(', ')}. No accuracy claim yet. Run fresh test takes.`); }
  catch(e) { say('model-state',e.message); }
  finally { controls(); }
});
$('evaluate-model').addEventListener('click',async () => {
  const epoch=modelEpoch; $('evaluate-model').disabled=true;
  try {
    const output=await work('evaluate',{samples}); if(epoch!==modelEpoch)return;
    evaluation=output.result; modelPassed=evaluation.passed;
    $('evaluation-output').textContent=evaluation.byLabel.map(r=>`${r.label}: ${r.correct}/${r.total} correct`).join('\n')+`\nMissed signs: ${evaluation.missed}\nFalse triggers on NONE: ${evaluation.falseTriggers}\n${evaluation.complete?'Minimum test counts met.':'Need at least 2 fresh tests per trained label.'}\n${evaluation.passed?'Screening passed for these recordings. Automatic concept collection is enabled.':'Screening not passed. Live matches remain suggestions only.'}`;
    const details = [];
    for (const group of evaluation.trainingQuality) {
      details.push(`${group.label} training · distance limit ${group.radius.toFixed(4)}`);
      group.takes.forEach((take,i) => details.push(`  Take ${i+1}: hands ${take.handFrames}/${take.frames}; BOTH hands ${take.bothHandFrames}/${take.frames}${take.durationMs ? `; ${Math.round(take.durationMs)} ms` : ''}`));
    }
    evaluation.records.forEach((record,i) => {
      details.push(`Test ${i+1}: expected ${record.expected} → predicted ${record.predicted}`);
      details.push(`  ${record.reason} BOTH hands: ${record.quality.bothHandFrames}/${record.quality.frames}`);
      details.push(`  ${record.ranked.map(r => `${r.label}: distance ${r.distance.toFixed(4)} / limit ${r.radius.toFixed(4)}`).join(' | ')}`);
    });
    $('evaluation-details').textContent = details.join('\n');
    say('model-state', modelPassed ? 'Personal prototype passed its small local screen. General ASL accuracy is not established.' : 'Needs more or better examples. Do not present this as reliable recognition.');
  } catch(e) { say('model-state',e.message); } finally { controls(); }
});
$('finish-learned').addEventListener('click',()=>renderSentence(true));
$('undo-learned').addEventListener('click',()=>{concepts.pop();renderSentence();});
$('clear-learned').addEventListener('click',()=>{concepts=[];uncertain=false;speech.stop();renderSentence();});
$('review-uncertainty').addEventListener('click',()=>{uncertain=false;renderSentence();say('sequence-state','You explicitly reviewed the uncertain segment. Check the concepts before finishing.');});
$('learned-sentence').addEventListener('input',()=>{sentence=$('learned-sentence').value;confirmed=false;$('confirm-learned').disabled=!sentence.trim();$('speak-learned').disabled=true;speech.stop();say('sequence-state','Manually corrected text · confirm before speech.');});
$('confirm-learned').addEventListener('click',()=>{if(!sentence.trim())return;confirmed=true;$('speak-learned').disabled=false;say('sequence-state','Message confirmed by you.');if($('auto-learned').checked)speech.speak(sentence,{voice:speech.voices()[0]});});
$('speak-learned').addEventListener('click',()=>{if(confirmed)speech.speak(sentence,{voice:speech.voices()[0]});});
$('stop-learned-audio').addEventListener('click',()=>speech.stop());
$('export-takes').addEventListener('click',()=>{
  // A visible, read-only export also works in browsers that block blob downloads.
  let field = $('local-training-export');
  if (!field) {
    const details = document.createElement('details');
    const title = document.createElement('summary'); title.textContent = 'Local training export (JSON)';
    field = document.createElement('textarea'); field.id = 'local-training-export'; field.readOnly = true;
    field.setAttribute('aria-label','Local training export JSON'); field.style.width = '100%';
    details.append(title,field); $('export-takes').after(details);
  }
  field.value = JSON.stringify({version:1,featureVersion:2,samples,evaluation});
  const blob=new Blob([JSON.stringify({version:1,featureVersion:2,samples,evaluation},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='jutsu-personal-sign-examples.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});
window.addEventListener('pagehide',()=>{stopCamera();worker.terminate();});
try { samples=(await loadSamples()).filter(validateSample); renderSamples(); if(samples.length) say('record-status',`Loaded ${samples.length} saved takes. No recordings were removed.`); } catch(e) { say('record-status',`Local storage unavailable: ${e.message}`); }
camera.devices().then(devices => {
  if (!camera.stream && !starting) $('training-camera').replaceChildren(new Option('Default / rear camera',''),...devices.map((device,i) => new Option(device.label || `Camera ${i+1}`,device.deviceId)));
}).catch(() => {});
controls();renderSentence();
