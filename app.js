import { SignRecognizer, setRecognitionMode } from './yes-detector.js';
setRecognitionMode('relaxed');
const recognizer = new SignRecognizer();
const $ = id => document.getElementById(id);
const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
let stream, tracker, drawing, visionModule, frame, previousTime = -1;
let loading;
let faceTracker, faceModelError = '', recentFace = null, recentFaceAt = -Infinity;
const synthesis = window.speechSynthesis;
let voices = [], speaking = false, speechGeneration = 0;
function updateSpeechControls() {
  $('speak').disabled = !synthesis || !voices.length || $('phrase').textContent === '—' || speaking;
  $('cancel-speech').disabled = !speaking;
  $('voice').disabled = speaking || !voices.length;
}
function refreshVoices() {
  if (!synthesis) { $('speech-status').textContent = 'Speech is unavailable. Open this app in Chrome or Edge.'; updateSpeechControls(); return; }
  const selected = $('voice').value;
  voices = synthesis.getVoices().filter(v => /^en(?:-|$)/i.test(v.lang) && v.localService);
  $('voice').replaceChildren();
  voices.forEach((voice, index) => $('voice').add(new Option(`${voice.name} (${voice.lang})`, String(index))));
  const retained = voices.findIndex(v => v.voiceURI === selected);
  // Store URI as the option value so delayed voice-list updates keep selection.
  [...$('voice').options].forEach((option, i) => { option.value = voices[i].voiceURI; });
  if (retained >= 0) $('voice').value = selected;
  if (!voices.length) $('voice').add(new Option('No installed English voice found', ''));
  if (!speaking) $('speech-status').textContent = voices.length ? 'Voice ready · detect a sign, then press Speak.' : 'No local English voice available yet. Install an English speech voice in Windows, then reopen the browser.';
  updateSpeechControls();
}
function cancelSpeech(message = 'Speech cancelled.') {
  speechGeneration++; synthesis?.cancel(); speaking = false;
  $('speech-status').textContent = message; updateSpeechControls();
}
function speakPhrase() {
  if ($('speak').disabled) return;
  const voice = voices.find(v => v.voiceURI === $('voice').value);
  if (!voice) { refreshVoices(); return; }
  const utterance = new SpeechSynthesisUtterance($('phrase').textContent);
  utterance.voice = voice; utterance.lang = voice.lang;
  const generation = ++speechGeneration;
  speaking = true; updateSpeechControls();
  $('speech-status').textContent = 'Preparing speech…';
  utterance.onstart = () => { if (generation === speechGeneration) $('speech-status').textContent = 'Speaking…'; };
  const finish = message => {
    if (generation !== speechGeneration) return;
    speaking = false; $('speech-status').textContent = message; updateSpeechControls();
  };
  utterance.onend = () => finish('Finished speaking.');
  utterance.onerror = event => finish(`Speech could not finish (${event.error}). Check your voice and audio output, then retry.`);
  try { synthesis.speak(utterance); }
  catch (error) { finish(`Could not speak: ${error.message}`); }
}
const setStatus = message => { $('status').textContent = message; };
async function loadTracker() {
  if (tracker) return;
  if (!loading) loading = (async () => {
    visionModule = await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/vision_bundle.mjs');
    const { FilesetResolver, HandLandmarker, DrawingUtils } = visionModule;
    const files = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm');
    tracker = await HandLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task' },
      runningMode: 'VIDEO', numHands: 2
    });
    drawing = new DrawingUtils(ctx);
    try {
      faceTracker = await visionModule.FaceDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite' },
        runningMode: 'VIDEO', minDetectionConfidence: .6
      });
    } catch (error) { faceModelError = `Face tracking unavailable: ${error.message}. YES, NO, and HELLO still work. Reload to retry.`; }
  })().catch(error => { loading = null; throw error; });
  await loading;
}
async function refreshCameras() {
  const selected = $('camera').value;
  const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
  $('camera').replaceChildren(new Option('Default camera', ''));
  cameras.forEach((d, i) => $('camera').add(new Option(d.label || `Camera ${i + 1}`, d.deviceId)));
  if (cameras.some(d => d.deviceId === selected)) $('camera').value = selected;
}
function release() {
  cancelSpeech('Camera stopped · speech cancelled.');
  recognizer.reset(); recentFace = null; recentFaceAt = -Infinity;
  $('phrase').textContent = '—';
  updateSpeechControls();
  $('recognition').textContent = 'Start the camera to try YES, NO, HELLO, or THANK YOU.';
  $('face-status').textContent = 'Face tracking is off.';
  $('hand-status').textContent = 'Either hand works. Your other hand can stay in view.';
  cancelAnimationFrame(frame);
  stream?.getTracks().forEach(track => track.stop());
  stream = null; video.srcObject = null; previousTime = -1;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $('placeholder').hidden = false; $('stop').disabled = true;
}
function tick() {
  if (!stream) return;
  try {
    if (video.readyState >= 2 && video.currentTime !== previousTime) {
      previousTime = video.currentTime;
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const result = tracker.detectForVideo(video, performance.now());
      for (const hand of result.landmarks) {
        drawing.drawConnectors(hand, visionModule.HandLandmarker.HAND_CONNECTIONS, { color: '#9de1bd', lineWidth: 3 });
        drawing.drawLandmarks(hand, { color: '#ffe4a5', radius: 4, lineWidth: 1 });
      }
      const count = result.landmarks.length;
      const hands = result.landmarks.map((image, i) => ({
        image, world: result.worldLandmarks[i], side: result.handedness[i]?.[0]?.categoryName
      }));
      const now = performance.now();
      let face = null;
      if (faceTracker) {
        const faces = faceTracker.detectForVideo(video, now).detections;
        if (faces.length === 1) {
          const detection = faces[0], box = detection.boundingBox;
          const mouth = detection.keypoints[3];
          if (box && mouth) {
            face = { mouth, height: box.height / video.videoHeight };
            recentFace = face; recentFaceAt = now;
            ctx.strokeStyle = '#f7d68a'; ctx.lineWidth = 2;
            ctx.strokeRect(box.originX, box.originY, box.width, box.height);
            ctx.beginPath(); ctx.arc(mouth.x * canvas.width, mouth.y * canvas.height, 5, 0, Math.PI * 2); ctx.stroke();
          }
        }
        if (faces.length > 1) { recentFace = null; recentFaceAt = -Infinity; }
        if (!face && faces.length === 0 && now - recentFaceAt <= 200) face = recentFace;
        $('face-status').textContent = face ? 'Face located · THANK YOU tracking available.' : 'Keep one face visible for THANK YOU. Other signs still work.';
      } else $('face-status').textContent = faceModelError || 'Face tracking unavailable.';
      const recognition = recognizer.update(hands, face, now, $('signing-hand').value, $('practice-sign').value);
      const phrase = recognition.phrase;
      $('recognition').textContent = recognition.hint;
      $('thank-you-status').textContent = recognizer.detectors[1].feedback;
      $('hand-status').textContent = recognition.handLabel ? `Following your ${recognition.handLabel.toLowerCase()} hand · your other hand can stay visible.` : 'Looking for your signing hand…';
      if (phrase) {
        $('phrase').textContent = phrase; updateSpeechControls();
        if ($('auto-speak').checked) speakPhrase();
      }
      setStatus(count ? `${count} hand${count === 1 ? '' : 's'} detected · tracking active` : 'Camera active · bring your hands into view');
    }
    frame = requestAnimationFrame(tick);
  } catch (error) { release(); setStatus(`Tracking stopped: ${error.message}. Try starting again.`); }
}
async function start() {
  $('start').disabled = true; $('camera').disabled = true;
  release(); setStatus('Loading hand tracking…');
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Open this app through its localhost address in Chrome or Edge.');
    await loadTracker();
    setStatus('Requesting camera access…');
    const deviceId = $('camera').value;
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 } } });
    video.srcObject = stream; await video.play();
    await refreshCameras();
    stream.getVideoTracks()[0].addEventListener('ended', () => { release(); setStatus('Camera disconnected. Reconnect DroidCam and start again.'); }, { once: true });
    $('placeholder').hidden = true; $('stop').disabled = false;
    tick();
  } catch (error) {
    release();
    const hints = { NotAllowedError: 'Camera permission was denied. Allow camera access in the browser and retry.', NotReadableError: 'Camera is unavailable or busy. Check DroidCam and close other camera apps.', OverconstrainedError: 'Selected camera is unavailable. Refresh the page and select it again.' };
    setStatus(hints[error.name] || `Could not start: ${error.message}. Check your internet connection if the model failed to load.`);
  } finally { $('start').disabled = false; $('camera').disabled = false; }
}
$('start').addEventListener('click', start);
$('sensitivity').addEventListener('change', () => {
  setRecognitionMode($('sensitivity').value);
  recognizer.reset();
  $('phrase').textContent = '—';
  cancelSpeech('Recognition sensitivity changed · ready for a new sign.');
  $('recognition').textContent = 'Ready · sign at a comfortable size.';
});
$('clear').addEventListener('click', () => { recognizer.reset(); $('phrase').textContent = '—'; cancelSpeech('Text cleared · ready to try again.'); });
$('signing-hand').addEventListener('change', () => {
  recognizer.reset(); $('phrase').textContent = '—'; cancelSpeech('Signing hand changed · ready to try again.');
});
const practiceHints = {
  all: 'Try one movement at a time. Small, comfortable attempts are welcome. Pause briefly between messages.',
  Yes: 'YES: loosely close your hand and give a small wrist nod, like your fist is nodding yes. Your fingers do not need to be perfectly tucked.',
  No: 'NO: bring your index and middle fingers toward your thumb, keeping the other fingers loosely curled. In beginner mode the fingertips do not have to touch.',
  Hello: 'HELLO: show an open, relaxed hand and wave gently side to side. A little bend in the fingers is okay.',
  'Thank you': 'THANK YOU: bring an open hand near your mouth or chin, then sweep it away and slightly down. Keep your face visible. No starting hold is needed.'
};
$('practice-sign').addEventListener('change', () => {
  recognizer.reset(); $('phrase').textContent = '—'; cancelSpeech('Practice selection changed · ready when you are.');
  $('practice-hint').textContent = practiceHints[$('practice-sign').value];
});
$('speak').addEventListener('click', speakPhrase);
$('cancel-speech').addEventListener('click', () => cancelSpeech());
$('auto-speak').addEventListener('change', () => {
  if (!$('auto-speak').checked) cancelSpeech('Automatic speech is off. Use Speak to confirm a detected sign.');
  else $('speech-status').textContent = 'Automatic speech is on · the next detected sign will be spoken.';
});
synthesis?.addEventListener('voiceschanged', refreshVoices);
refreshVoices();
$('stop').addEventListener('click', () => { release(); setStatus('Camera is off.'); });
$('camera').addEventListener('change', () => { if (stream) start(); });
$('mirror').addEventListener('change', () => document.querySelector('.stage').classList.toggle('mirrored', $('mirror').checked));
document.querySelector('.stage').classList.add('mirrored');
navigator.mediaDevices?.addEventListener('devicechange', () => refreshCameras().catch(() => {}));
window.addEventListener('pagehide', release);
if (navigator.mediaDevices) refreshCameras().catch(() => {});
