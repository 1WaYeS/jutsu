import { createAi, testModel, HAND_CONNECTIONS, POSE_CONNECTIONS, LEFT_HAND_START, RIGHT_HAND_START, POSE_START } from '/ai/bridge.js';
const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
let session, stream, generation = 0, voices = [], speaking = false, speechGeneration = 0;
const synthesis = window.speechSynthesis;
function speechControls() {
  $('speak').disabled = !synthesis || !voices.length || speaking || $('phrase').textContent === '—';
  $('cancel-speech').disabled = !speaking;
}
function cancelSpeech(message = 'Speech cancelled.') {
  speechGeneration++; synthesis?.cancel(); speaking = false;
  $('speech-status').textContent = message; speechControls();
}
function speak() {
  if ($('speak').disabled) return;
  const voice = voices.find(v => v.voiceURI === $('voice').value);
  if (!voice) return;
  const utterance = new SpeechSynthesisUtterance($('phrase').textContent);
  utterance.voice = voice; utterance.lang = voice.lang;
  const token = ++speechGeneration; speaking = true; speechControls();
  $('speech-status').textContent = 'Speaking…';
  const done = message => { if (token === speechGeneration) { speaking = false; $('speech-status').textContent = message; speechControls(); } };
  utterance.onend = () => done('Finished speaking.');
  utterance.onerror = event => done(`Speech error: ${event.error}. Check your voice and audio output.`);
  try { synthesis.speak(utterance); } catch (error) { done(error.message); }
}
function loadVoices() {
  const selected = $('voice').value;
  voices = synthesis?.getVoices().filter(v => /^en(?:-|$)/i.test(v.lang) && v.localService) || [];
  $('voice').replaceChildren(...voices.map(v => new Option(`${v.name} (${v.lang})`, v.voiceURI)));
  if (voices.some(v => v.voiceURI === selected)) $('voice').value = selected;
  if (!voices.length) $('voice').add(new Option('No installed English voice available', ''));
  $('speech-status').textContent = voices.length ? 'English voice ready.' : 'No local English voice found. Install one in Windows and reopen the browser.';
  speechControls();
}
function showPhrase(label, automatic = false) {
  $('phrase').textContent = label; speechControls();
  if (automatic && $('auto-speak').checked) {
    if (speaking) $('speech-status').textContent = 'New result shown while speech is busy. Press Speak to read it afterward.';
    else speak();
  }
}
function draw({ frame }) {
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const point = i => ({ x: frame[i * 3] * canvas.width, y: frame[i * 3 + 1] * canvas.height });
  const edges = (start, pairs, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    for (const [a, b] of pairs) {
      const p = point(start + a), q = point(start + b);
      if (![p.x, p.y, q.x, q.y].every(Number.isFinite)) continue;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
  };
  edges(POSE_START, POSE_CONNECTIONS, '#718f80');
  for (const start of [LEFT_HAND_START, RIGHT_HAND_START]) {
    edges(start, HAND_CONNECTIONS, '#b6f2cc'); ctx.fillStyle = '#ffe4a5';
    for (let i = 0; i < 21; i++) { const p = point(start + i); if (Number.isFinite(p.x + p.y)) { ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); } }
  }
}
function onEvent(event) {
  if (event.type === 'status') {
    const messages = { nothing: 'Step into view with your upper body visible.', 'no-hands': 'Raise your hands when ready.', crowded: 'One person at a time, please.', partial: 'Move back a little so both shoulders are visible.', ok: 'Ready · sign once, then pause briefly.' };
    $('status').textContent = messages[event.status];
  } else if (event.type === 'signing') $('recognition').textContent = 'Reading your movement… pause briefly when finished.';
  else if (event.type === 'discarded') $('recognition').textContent = 'Not enough movement captured. Try one comfortable complete sign.';
  else if (event.type === 'error') $('recognition').textContent = `Recognition error: ${event.message}`;
  else if (event.type === 'result') {
    const decision = event.result.decision;
    $('guesses').replaceChildren();
    for (const guess of event.guesses) {
      const button = document.createElement('button');
      button.textContent = `${guess.label} · ${Math.round(guess.probability * 100)}%`;
      button.title = 'Choose this meaning manually';
      button.addEventListener('click', () => { showPhrase(guess.label); $('recognition').textContent = 'Meaning selected manually. Press Speak to read it.'; });
      $('guesses').append(button);
    }
    if (decision.kind === 'sign' && event.guesses.length) {
      showPhrase(event.guesses[0].label, true);
      $('recognition').textContent = 'Likely meaning detected. If needed, choose another suggestion below.';
    } else {
      $('phrase').textContent = '—'; speechControls();
      $('recognition').textContent = decision.reason === 'partial' ? 'Not sure · keep your upper body in view and try again.' : 'Not sure yet. Choose a suggestion or try again; uncertain results are not spoken automatically.';
    }
  }
}
async function cameras() {
  const selected = $('camera').value;
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  $('camera').replaceChildren(new Option('Default camera', ''), ...devices.map((d, i) => new Option(d.label || `Camera ${i + 1}`, d.deviceId)));
  if (devices.some(d => d.deviceId === selected)) $('camera').value = selected;
}
function stop() {
  generation++; session?.dispose(); session = null;
  stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $('placeholder').hidden = false; $('start').disabled = false; $('stop').disabled = true; $('camera').disabled = false;
  $('model-status').textContent = 'Camera and AI session stopped.';
  $('status').textContent = 'Camera is off.';
  cancelSpeech();
}
async function start() {
  stop(); const token = generation;
  $('start').disabled = true; $('stop').disabled = false; $('camera').disabled = true;
  $('phrase').textContent = '—'; $('guesses').replaceChildren(); speechControls();
  $('model-status').textContent = 'Loading trained model and body/hand tracking… first start may take a moment.';
  try {
    const created = await createAi(event => { if (token === generation) onEvent(event); }, frame => { if (token === generation) draw(frame); });
    if (token !== generation) { created.dispose(); return; }
    session = created;
    const deviceId = $('camera').value;
    const acquired = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: 960 }, height: { ideal: 720 } } });
    if (token !== generation) { acquired.getTracks().forEach(t => t.stop()); return; }
    stream = acquired; video.srcObject = acquired; await video.play();
    if (token !== generation) return;
    await cameras(); $('camera').disabled = false;
    acquired.getVideoTracks()[0].addEventListener('ended', () => { if (token === generation) stop(); });
    $('placeholder').hidden = true;
    $('model-status').textContent = `Trained sequence model ready · ${session.labels.filter(l => l.shipped).length} signs · processed locally.`;
    session.start(video);
  } catch (error) {
    if (token !== generation) return;
    stop(); $('model-status').textContent = `Could not start AI: ${error.message}. Try reloading, or use the classic demo.`;
  }
}
$('start').addEventListener('click', start);
$('stop').addEventListener('click', stop);
$('camera').addEventListener('change', () => { if (stream) start(); });
$('mirror').addEventListener('change', () => document.querySelector('.stage').classList.toggle('mirrored', $('mirror').checked));
document.querySelector('.stage').classList.add('mirrored');
$('speak').addEventListener('click', speak);
$('cancel-speech').addEventListener('click', () => cancelSpeech());
$('auto-speak').addEventListener('change', () => { if (!$('auto-speak').checked) cancelSpeech('Automatic speech disabled.'); });
$('clear').addEventListener('click', () => { session?.reset(); $('phrase').textContent = '—'; $('guesses').replaceChildren(); cancelSpeech('Cleared · ready for another sign.'); });
$('test-model').addEventListener('click', async () => {
  $('test-model').disabled = true; $('model-test').replaceChildren();
  $('test-status').textContent = 'Running supplied landmark clips through the trained model…';
  try {
    await testModel(result => {
      const row = document.createElement('li');
      row.textContent = `${result.expected} → ${result.guessed[0]?.label || 'no prediction'} (${result.kind})`;
      $('model-test').append(row);
      if (result.credit) $('test-credit').textContent = result.credit;
    });
    $('test-status').textContent = 'Model check completed. These supplied examples are not a measurement of live-camera accuracy.';
  } catch (error) { $('test-status').textContent = `Model check failed: ${error.message}`; }
  finally { $('test-model').disabled = false; }
});
synthesis?.addEventListener('voiceschanged', loadVoices); loadVoices();
cameras().catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', stop);
