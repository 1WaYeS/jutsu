import test from 'node:test';
import assert from 'node:assert/strict';
import { constructSentence, PHRASES } from './sentence-builder.js';
import { CameraController, cameraError } from './camera-controller.js';
import { SpeechController } from './speech-controller.js';
test('all supported sentences preserve the explicit concept mapping', () => {
  for (const phrase of PHRASES) assert.deepEqual(constructSentence(phrase.concepts, { complete: true }).sentence, phrase.sentence);
  assert.equal(constructSentence(['I','NEED','WATER'], { complete: true }).sentence, 'I need some water.');
  assert.equal(constructSentence(['PLEASE','HELP','ME'], { complete: true }).sentence, 'Could you please help me?');
  assert.equal(constructSentence(['I','DISAGREE','DECISION'], { complete: true }).sentence, 'I disagree with this decision.');
});
test('missing, unknown, or ambiguous concepts do not invent sentences', () => {
  for (const concepts of [[], ['I'], ['I','NEED'], ['I','WATER'], ['PLEASE','HELP'], ['I','NEED','MEDICINE'], ['YES','NO']]) assert.equal(constructSentence(concepts, { complete: true }).sentence, '');
  assert.equal(constructSentence(['I','NEED','HELP']).state, 'incomplete');
  assert.equal(constructSentence(['YES'], { complete: true, uncertain: true }).sentence, '');
  assert.equal(constructSentence('I NEED HELP').state, 'unsupported');
});
function videoMock() { return { srcObject: null, play: async () => {} }; }
test('camera prefers rear input, requests no audio, releases old tracks before switching', async () => {
  const calls = [], events = [];
  const media = { getUserMedia: async constraints => { calls.push(constraints); const id = calls.length; events.push(`start${id}`); return { getTracks: () => [{ stop: () => events.push(`stop${id}`) }] }; } };
  const controller = new CameraController(videoMock(), media);
  assert.equal(await controller.start(), true);
  assert.equal(calls[0].audio, false); assert.equal(calls[0].video.facingMode.ideal, 'environment');
  await controller.switch();
  assert.deepEqual(events.slice(0,3), ['start1','stop1','start2']);
  assert.equal(calls[1].video.facingMode.ideal, 'user');
  controller.stop(); assert.equal(controller.video.srcObject, null); assert(events.includes('stop2'));
});
test('cancelled camera permission requests cannot leave a stream running', async () => {
  let resolve, stopped = false;
  const controller = new CameraController(videoMock(), { getUserMedia: () => new Promise(done => { resolve = done; }) });
  const pending = controller.start(); controller.stop();
  resolve({ getTracks: () => [{ stop: () => { stopped = true; } }] });
  assert.equal(await pending, false); assert(stopped); assert.equal(controller.stream, null);
});
test('camera playback failure releases tracks and permission errors are actionable', async () => {
  let stopped = false;
  const video = videoMock(); video.play = async () => { throw new Error('play failed'); };
  const controller = new CameraController(video, { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped = true; } }] }) });
  await assert.rejects(controller.start(), /play failed/); assert(stopped);
  assert.match(cameraError({ name: 'NotAllowedError' }), /permission was denied/);
  assert.match(cameraError({ name: 'SecurityError' }), /HTTPS/);
});
test('speech uses confirmed caller text and supports stop, pause and resume', () => {
  const actions = [], messages = [];
  const synthesis = { speak: u => actions.push(u), cancel: () => actions.push('stop'), pause: () => actions.push('pause'), resume: () => actions.push('resume'), getVoices: () => [] };
  class Utterance { constructor(text) { this.text = text; } }
  const speech = new SpeechController(synthesis, Utterance, m => messages.push(m));
  assert.equal(speech.speak('I need help.', { rate: 1.2, volume: .7 }), true);
  const utterance = actions.at(-1); assert.equal(utterance.text, 'I need help.'); assert.equal(utterance.rate, 1.2); assert.equal(utterance.volume, .7);
  speech.pause(); speech.resume(); speech.stop();
  const count = messages.length; utterance.onend(); assert.equal(messages.length, count, 'Cancelled utterance must not overwrite current status');
  assert(actions.includes('pause')); assert(actions.includes('resume'));
});
test('missing speech is handled without hiding text', () => {
  let status = '';
  const speech = new SpeechController(null, null, m => { status = m; });
  assert.equal(speech.speak('Hello.'), false); assert.match(status, /text is still readable/);
});
