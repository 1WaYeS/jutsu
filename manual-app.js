import { constructSentence, CONCEPTS, PHRASES } from './sentence-builder.js';
import { CameraController, cameraError } from './camera-controller.js';
import { SpeechController } from './speech-controller.js';
const $ = id => document.getElementById(id);
const camera = new CameraController($('live-video'));
const speech = new SpeechController(undefined, undefined, message => { $('audio-status').textContent = message; });
let concepts = [], finished = false, approved = false, edited = false, draft = '', busy = false, cameraRequest = 0;
const readStorage = key => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };
let history = readStorage('jutsu.confirmed.history');
if (!Array.isArray(history)) history = [];
const announce = (id, text) => { $(id).textContent = text; };
function paintDemo() {
  $('concepts').replaceChildren();
  for (const concept of concepts) { const chip = document.createElement('span'); chip.className = 'concept'; chip.textContent = concept; $('concepts').append(chip); }
  if (!concepts.length) $('concepts').textContent = 'Your manually selected concepts appear here.';
  const result = constructSentence(concepts, { complete: finished });
  if (!edited) draft = result.sentence;
  $('sentence').value = draft;
  $('demo-state').textContent = approved ? 'Confirmed · manual demonstration' : edited ? 'Manually edited · review and confirm to enable speech.' : result.reason;
  $('confirm-message').disabled = !draft.trim() || approved;
  for (const id of ['speak-message','save-message','copy-message','replay-audio']) $(id).disabled = !approved;
  $('undo-concept').disabled = !concepts.length;
  $('finish-message').disabled = !concepts.length;
  $('source-label').textContent = edited ? 'Manually edited text · not camera recognition' : 'Manual concept input · not camera recognition';
}
function resetApproval() { approved = false; speech.stop(); for (const id of ['speak-message','save-message','copy-message','replay-audio']) $(id).disabled = true; }
function addConcept(concept) { resetApproval(); concepts.push(concept); finished = false; edited = false; paintDemo(); }
for (const concept of CONCEPTS) {
  const button = document.createElement('button'); button.className = 'word-button'; button.textContent = concept;
  button.addEventListener('click', () => addConcept(concept)); $('concept-picker').append(button);
}
for (const phrase of PHRASES.filter(p => p.concepts.length > 1)) {
  const button = document.createElement('button'); button.className = 'example-button'; button.textContent = phrase.concepts.join(' → ');
  button.addEventListener('click', () => { resetApproval(); concepts = [...phrase.concepts]; finished = true; edited = false; paintDemo(); });
  $('phrase-examples').append(button);
}
$('finish-message').addEventListener('click', () => { resetApproval(); finished = true; edited = false; paintDemo(); });
$('undo-concept').addEventListener('click', () => { resetApproval(); concepts.pop(); finished = false; edited = false; paintDemo(); });
$('clear-message').addEventListener('click', () => { resetApproval(); concepts = []; finished = false; edited = false; draft = ''; paintDemo(); });
$('sentence').addEventListener('input', () => { resetApproval(); edited = true; draft = $('sentence').value; $('confirm-message').disabled = !draft.trim(); $('demo-state').textContent = 'Manually edited · confirm before speech.'; $('source-label').textContent = 'Manually edited text · not camera recognition'; for (const id of ['speak-message','save-message','copy-message']) $(id).disabled = true; });
$('confirm-message').addEventListener('click', () => { if (!draft.trim()) return; approved = true; paintDemo(); if ($('auto-audio').checked) speakDraft(); });
function speakDraft() {
  if (!approved) return;
  const voice = speech.voices().find(v => v.voiceURI === $('voice').value);
  speech.speak(draft, { voice, rate: Number($('rate').value), volume: Number($('volume').value) });
}
$('speak-message').addEventListener('click', speakDraft);
$('replay-audio').addEventListener('click', speakDraft);
$('pause-audio').addEventListener('click', () => speech.pause());
$('resume-audio').addEventListener('click', () => speech.resume());
$('stop-audio').addEventListener('click', () => speech.stop());
$('auto-audio').addEventListener('change', () => { if (!$('auto-audio').checked) speech.stop(); });
function populateVoices() {
  const voices = speech.voices(), current = $('voice').value;
  $('voice').replaceChildren(...voices.map(v => new Option(`${v.name} (${v.lang})`, v.voiceURI)));
  if (voices.some(v => v.voiceURI === current)) $('voice').value = current;
  if (!voices.length) $('voice').add(new Option('Device default · availability varies', ''));
}
window.speechSynthesis?.addEventListener('voiceschanged', populateVoices); populateVoices();
$('copy-message').addEventListener('click', async () => { if (!approved) return; try { await navigator.clipboard.writeText(draft); announce('demo-state', 'Copied confirmed text.'); } catch { announce('demo-state', 'Copy unavailable. Select and copy the sentence manually.'); } });
$('save-message').addEventListener('click', () => {
  if (!approved) return;
  const entry = { id: crypto.randomUUID(), at: new Date().toISOString(), concepts: [...concepts], sentence: draft, source: edited ? 'manually edited' : 'manual demonstration' };
  const next = [entry, ...history].slice(0, 100);
  try { localStorage.setItem('jutsu.confirmed.history', JSON.stringify(next)); history = next; renderHistory(); announce('demo-state', 'Saved on this device only. No video is saved.'); }
  catch { announce('demo-state', 'This browser could not save the message. You can copy or export it.'); }
});
function renderHistory() {
  $('history-list').replaceChildren();
  if (!history.length) { $('history-list').textContent = 'No saved messages. Only messages you explicitly save appear here.'; return; }
  for (const item of history) {
    const card = document.createElement('article'); card.className = 'history-item';
    const time = document.createElement('p'); time.className = 'muted'; time.textContent = `${new Date(item.at).toLocaleString()} · ${item.source}`;
    const text = document.createElement('p'); text.textContent = item.sentence;
    const remove = document.createElement('button'); remove.textContent = 'Delete'; remove.className = 'ghost';
    remove.addEventListener('click', () => { const next = history.filter(h => h.id !== item.id); try { localStorage.setItem('jutsu.confirmed.history', JSON.stringify(next)); history = next; renderHistory(); } catch { announce('history-state', 'Could not update saved history.'); } });
    card.append(time, text, remove); $('history-list').append(card);
  }
}
$('export-history').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'jutsu-confirmed-messages.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function cameraControls() {
  $('start-camera').disabled = busy; $('stop-camera').disabled = !busy && !camera.stream; $('switch-camera').disabled = busy || !camera.stream;
  $('camera-source').disabled = busy;
}
async function populateCameras() {
  const previous = $('camera-source').value, devices = await camera.devices();
  $('camera-source').replaceChildren(new Option('Rear camera / device default', ''), ...devices.map((d,i) => new Option(d.label || `Camera ${i+1}`, d.deviceId)));
  if (devices.some(d => d.deviceId === previous)) $('camera-source').value = previous;
}
async function startCamera(switching = false) {
  const request = ++cameraRequest;
  busy = true; cameraControls(); announce('camera-state', switching ? 'Switching camera…' : 'Requesting camera access…');
  try {
    const started = switching ? await camera.switch() : await camera.start({ deviceId: $('camera-source').value });
    if (!started || request !== cameraRequest) return;
    $('camera-empty').hidden = true; $('live-video').classList.toggle('front-camera', camera.facing === 'user');
    const activeStream = camera.stream;
    await populateCameras();
    if (camera.stream !== activeStream || request !== cameraRequest) return;
    if (switching) $('camera-source').value = '';
    announce('camera-state', 'Camera live · video stays on this device.');
    announce('recognition-state', 'Recognition unavailable: no model has passed live signing evaluation. No translated sentence is being generated.');
    const owned = camera.stream;
    owned?.getVideoTracks()[0]?.addEventListener('ended', () => { if (camera.stream === owned) stopCamera('Camera disconnected. Reconnect it and tap Start camera.'); });
  } catch (error) { if (request === cameraRequest) { camera.stop(); $('camera-empty').hidden = false; announce('camera-state', cameraError(error)); } }
  finally { if (request === cameraRequest) { busy = false; cameraControls(); } }
}
function stopCamera(message = 'Camera stopped. Your camera has been released.') { cameraRequest++; busy = false; camera.stop(); speech.stop(); $('camera-empty').hidden = false; announce('camera-state', message); cameraControls(); }
$('start-camera').addEventListener('click', () => startCamera());
$('switch-camera').addEventListener('click', () => startCamera(true));
$('stop-camera').addEventListener('click', () => stopCamera());
$('camera-source').addEventListener('change', () => { if (camera.stream) startCamera(); });
$('open-live').addEventListener('click', () => { $('live').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); startCamera(); });
$('fullscreen-camera').addEventListener('click', async () => {
  if (document.fullscreenElement) { await document.exitFullscreen(); return; }
  if ($('camera-shell').requestFullscreen) { try { await $('camera-shell').requestFullscreen(); return; } catch {} }
  $('camera-shell').classList.toggle('viewport-fullscreen');
  $('fullscreen-camera').textContent = $('camera-shell').classList.contains('viewport-fullscreen') ? 'Exit full screen' : 'Full screen';
});
$('caption-size').addEventListener('input', () => document.documentElement.style.setProperty('--caption-size', `${$('caption-size').value}rem`));
$('high-contrast').addEventListener('change', () => document.body.classList.toggle('high-contrast', $('high-contrast').checked));
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera('Camera paused while the page is hidden. Tap Start camera to resume.'); });
window.addEventListener('pagehide', () => camera.stop());
populateCameras().catch(() => {}); cameraControls(); paintDemo(); renderHistory();
