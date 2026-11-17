import assert from 'node:assert/strict';
import { YesDetector, NoDetector, HelloDetector, ThankYouDetector, RepeatGate, SignRecognizer, SigningHandSelector, setRecognitionMode } from './yes-detector.js';
function hand(angle = 0, offset = 0) {
  const world = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const base of [5,9,13,17]) {
    const x = (base - 11) * .002;
    world[base] = { x, y: -.05, z: 0 };
    world[base + 1] = { x, y: -.075, z: 0 };
    world[base + 3] = { x, y: -.045, z: .005 };
  }
  const rotated = world.map(p => ({ x: p.x, y: p.y * Math.cos(angle) - p.z * Math.sin(angle), z: p.y * Math.sin(angle) + p.z * Math.cos(angle) }));
  return [{ world: rotated, image: rotated.map(p => ({ x: .5 + p.x, y: .5 + p.y + offset })), side: 'Right' }];
}
function run(makeHand) {
  const detector = new YesDetector(); let hits = 0;
  for (let i = 0; i <= 24; i++) hits += Number(detector.update(makeHand(i), i * 40).detected);
  return { detector, hits };
}
assert.equal(run(() => hand()).hits, 0, 'Stationary fist must not trigger');
assert.equal(run(i => hand(0, Math.sin(i / 24 * Math.PI) * .2)).hits, 0, 'Translation alone must not trigger');
const { detector, hits } = run(i => hand(Math.sin(i / 24 * Math.PI) * .8));
assert.equal(hits, 1, 'Bend and return should trigger once');
assert.equal(detector.update(hand(), 1100).detected, false, 'Held fist remains locked');
detector.update([], 1200); detector.update([], 1900);
assert.equal(detector.locked, false, 'Neutral interval releases repeat lock');
const open = hand(); open[0].world[8] = { x: 0, y: -.14, z: 0 };
assert.equal(run(() => open).hits, 0, 'Open finger must not trigger');
assert.equal(run(i => i === 10 || i === 11 ? [] : hand(Math.sin(i / 24 * Math.PI) * .65)).hits, 1, 'Brief tracking dropout should preserve a complete motion');
assert.equal(run(i => {
  const hands = hand(Math.sin(i / 24 * Math.PI) * .7);
  hands[0].world = hands[0].world.map(p => ({ x: -p.y, y: p.x, z: p.z }));
  return hands;
}).hits, 1, 'Camera roll should not prevent recognition');
assert.equal(run(i => hand(Math.sin(i / 24 * Math.PI) * .12)).hits, 0, 'Small orientation jitter should not trigger');
assert.equal(run(i => hand(i / 24 * .8)).hits, 0, 'A one-way tilt should not count as bend and return');
assert.equal(run(i => hand(Math.sin(i / 24 * Math.PI) * .36)).hits, 1, 'Smaller single nod should be accepted');
assert.equal(run(i => hand(i <= 12 ? i / 12 * .4 : .4 - (i - 12) / 12 * .2)).hits, 1, 'Partial return should be enough');
assert.equal(run(i => hand(i < 12 ? 0 : .36)).hits, 0, 'One-way step and hold should not trigger');
assert.equal(run(i => hand(i === 12 ? .5 : 0)).hits, 0, 'One-frame depth spike should not trigger');
console.log('Passed motion checks, including smaller nods, partial returns, jitter, and one-way motion rejection.');
function noHand(closed = false, allOpen = false) {
  const hands = hand(); const p = hands[0].world;
  p[4] = { x: 0, y: -.04, z: .005 };
  for (const base of allOpen ? [5,9,13,17] : [5,9]) {
    p[base + 3] = { x: (base - 7) * .002, y: closed ? -.045 : -.12, z: .005 };
  }
  return hands;
}
function runNo(makeHand) {
  const no = new NoDetector(); let hits = 0;
  for (let i = 0; i < 25; i++) hits += Number(no.update(makeHand(i), i * 40).detected);
  return hits;
}
assert.equal(runNo(i => noHand(i >= 8)), 1, 'NO requires opening then closing both fingers');
assert.equal(runNo(() => noHand(true)), 0, 'Held closed pose is not NO');
assert.equal(runNo(() => noHand()), 0, 'Held open pose is not NO');
assert.equal(runNo(i => noHand(i >= 8, true)), 0, 'Open palm to closed hand must not count as NO');
assert.equal(runNo(i => hand(Math.sin(i / 24 * Math.PI) * .8)), 0, 'YES must not trigger NO');
assert.equal(run(i => noHand(i >= 8)).hits, 0, 'NO must not trigger YES');
assert.equal(runNo(i => i < 8 ? noHand() : i < 17 ? [] : noHand(true)), 0, 'Tracking loss must not join unrelated poses');
console.log('Passed NO motion and YES/NO confusion checks.');
function wave(i, vertical = false, amplitude = .07) {
  const hands = noHand(false, true);
  const offset = Math.sin(i / 24 * Math.PI) * amplitude;
  hands[0].image = hands[0].world.map(p => ({ x: .5 + p.x + (vertical ? 0 : offset), y: .5 + p.y + (vertical ? offset : 0) }));
  return hands;
}
function runHello(makeHand) {
  const detector = new HelloDetector(); let hits = 0;
  for (let i = 0; i < 25; i++) hits += Number(detector.update(makeHand(i), i * 40).detected);
  return hits;
}
assert.equal(runHello(i => wave(i)), 1, 'Open-hand sideways wave should trigger HELLO');
assert.equal(runHello(i => wave(i, false, -.07)), 1, 'Opposite wave direction should work');
assert.equal(runHello(i => wave(i, true)), 0, 'Vertical motion must not count as HELLO');
assert.equal(runHello(i => wave(i, false, 0)), 0, 'Still open palm must not count as HELLO');
assert.equal(runHello(i => wave(i, false, .004)), 0, 'Small position jitter must not count as HELLO');
assert.equal(runHello(i => hand(Math.sin(i / 24 * Math.PI) * .8)), 0, 'YES must not trigger HELLO');
assert.equal(runHello(i => noHand(i >= 8)), 0, 'NO must not trigger HELLO');
assert.equal(run(i => wave(i)).hits, 0, 'HELLO must not trigger YES');
assert.equal(runNo(i => wave(i)), 0, 'HELLO must not trigger NO');
assert.equal(runHello(i => i > 8 && i < 17 ? [] : wave(i)), 0, 'Separate wave fragments must not join across tracking loss');
console.log('Passed HELLO motion and three-sign confusion checks.');
const face = { mouth: { x: .5, y: .38 }, height: .25 };
function thanksHand(i, forward = true) {
  const hands = noHand(false, true);
  const progress = Math.max(0, Math.min(1, (i - 4) / 12));
  hands[0].image = hands[0].world.map(p => ({ x: .5 + p.x * (forward ? 1 + .3 * progress : 1), y: .5 + p.y + .2 * progress }));
  return hands;
}
function runThanks(makeHand, getFace = () => face) {
  const detector = new ThankYouDetector(); let hits = 0;
  for (let i = 0; i < 25; i++) hits += Number(detector.update(makeHand(i), getFace(i), i * 40).detected);
  return hits;
}
assert.equal(runThanks(i => thanksHand(i)), 1, 'Near-mouth outward/downward flat hand should trigger');
assert.equal(runThanks(() => thanksHand(0)), 0, 'Holding a hand near the mouth must not trigger');
assert.equal(runThanks(i => thanksHand(i, false)), 0, 'Downward translation without forward cue should not trigger');
assert.equal(runThanks(i => thanksHand(i), () => null), 0, 'Face is required');
assert.equal(runThanks(i => hand(Math.sin(i / 24 * Math.PI) * .8)), 0, 'YES must not trigger THANK YOU');
assert.equal(runThanks(i => noHand(i >= 8)), 0, 'NO must not trigger THANK YOU');
assert.equal(runThanks(i => wave(i)), 0, 'HELLO must not trigger THANK YOU');
assert.equal(runThanks(i => thanksHand(i), i => i >= 6 ? null : face), 0, 'Lost face must discard a pending THANK YOU');
assert.equal(runHello(i => thanksHand(i)), 0, 'THANK YOU must not trigger HELLO');
assert.equal(runNo(i => thanksHand(i)), 0, 'THANK YOU must not trigger NO');
assert.equal(run(i => thanksHand(i)).hits, 0, 'THANK YOU must not trigger YES');
console.log('Passed THANK YOU motion, missing-face, and four-sign confusion checks.');
setRecognitionMode('relaxed');
assert.equal(run(i => hand(Math.sin(i / 24 * Math.PI) * .28)).hits, 1, 'Forgiving mode accepts a smaller YES nod');
assert.equal(run(i => {
  const hands = hand(Math.sin(i / 24 * Math.PI) * .36);
  hands[0].world[20] = { x: .012, y: -.09, z: 0 };
  return hands;
}).hits, 1, 'Forgiving mode tolerates an imperfect little finger in YES');
assert.equal(runHello(i => wave(i, false, .022)), 1, 'Forgiving mode accepts a smaller HELLO wave');
assert.equal(runHello(i => {
  const hands = wave(i); hands[0].world[20] = { x: .012, y: -.06, z: 0 }; return hands;
}), 1, 'Forgiving mode tolerates one bent finger in HELLO');
assert.equal(runNo(i => noHand(i >= 8)), 1, 'NO remains recognized in forgiving mode');
assert.equal(runThanks(i => thanksHand(i)), 1, 'THANK YOU remains recognized in forgiving mode');
assert.equal(run(() => hand()).hits, 0, 'Relaxed still fist must remain silent');
assert.equal(run(i => hand(Math.sin(i / 24 * Math.PI) * .12)).hits, 0, 'Relaxed orientation jitter must remain silent');
assert.equal(run(i => hand(i / 24 * .8)).hits, 0, 'Relaxed one-way tilt must remain silent');
assert.equal(runHello(i => wave(i, false, .004)), 0, 'Relaxed position jitter must remain silent');
assert.equal(runHello(i => wave(i, true)), 0, 'Relaxed vertical movement is not HELLO');
assert.equal(runNo(i => wave(i)), 0, 'Relaxed HELLO must not trigger NO');
assert.equal(runHello(i => noHand(i >= 8)), 0, 'Relaxed NO must not trigger HELLO');
assert.equal(run(i => noHand(i >= 8)).hits, 0, 'Relaxed NO must not trigger YES');
assert.equal(runThanks(i => wave(i)), 0, 'Relaxed HELLO must not trigger THANK YOU');
assert.equal(runThanks(() => thanksHand(0)), 0, 'Relaxed hand held near mouth must remain silent');
assert.equal(runThanks(i => thanksHand(i, false)), 1, 'Forgiving THANK YOU does not require apparent palm growth');
assert.equal(runThanks(i => thanksHand(i, false), i => i === 8 || i === 9 ? null : face), 1, 'Brief face occlusion must not discard a THANK YOU attempt');
assert.equal(runThanks(i => i === 8 ? [] : thanksHand(i, false)), 1, 'Brief missing hand must not discard a THANK YOU attempt');
assert.equal(runThanks(i => thanksHand(i, false), i => i >= 6 ? null : face), 0, 'Extended face loss must still prevent detection');
const fastThanks = new ThankYouDetector(); let fastHits = 0;
for (let i = 0; i < 12; i++) fastHits += Number(fastThanks.update(thanksHand(i + 4, false), face, i * 40).detected);
assert.equal(fastHits, 1, 'A single continuous movement must work without a starting hold');
const gate = new RepeatGate();
gate.lock(0);
assert.equal(gate.update(hand(), 100), false);
assert.equal(gate.update(hand(), 500), false, 'Do not rearm too quickly');
assert.equal(gate.update(hand(), 750), true, 'Still fist rearms without opening');
gate.lock(1000);
for (let i = 0; i < 40; i++) assert.equal(gate.update(wave(i % 25), 1000 + i * 40), false, 'Continuous movement should not rearm');
gate.reset(); gate.lock(0); gate.update([], 100);
assert.equal(gate.update([], 750), true, 'Lowering hand also rearms');
setRecognitionMode('balanced');
assert.equal(run(i => hand(Math.sin(i / 24 * Math.PI) * .28)).hits, 0, 'Switching back restores balanced thresholds');
console.log('Passed forgiving-mode small-movement, imperfect-shape, confusion, and mode-switch checks.');
setRecognitionMode('relaxed');
function approximateNo(i) {
  const hands = noHand();
  if (i >= 8) for (const index of [8,12]) hands[0].world[index].y = -.07;
  return hands;
}
assert.equal(runNo(approximateNo), 1, 'Beginner NO should not require fingertip contact');
assert.equal(runNo(i => i === 9 ? [] : approximateNo(i)), 1, 'NO tolerates a short missing frame');
assert.equal(run(i => hand(Math.sin(i / 24 * Math.PI) * .23)).hits, 1, 'A modest YES nod should be accepted');
function restingHand() {
  const resting = noHand(false, true)[0];
  resting.side = 'Left';
  resting.image = resting.image.map(p => ({ ...p, x: p.x + .2, y: p.y + .3 }));
  return resting;
}
function runCombined(makeHands, getFace = () => null, practice = 'all') {
  const recognizer = new SignRecognizer(), phrases = [];
  for (let i = 0; i < 25; i++) {
    const result = recognizer.update(makeHands(i), getFace(i), i * 40, 'auto', practice);
    if (result.phrase) phrases.push(result.phrase);
  }
  return phrases;
}
assert.deepEqual(runCombined(i => [...hand(Math.sin(i / 24 * Math.PI) * .36), restingHand()]), ['Yes'], 'A resting second hand must not block YES');
assert.deepEqual(runCombined(i => [...wave(i), restingHand()]), ['Hello'], 'A resting second hand must not block HELLO');
assert.deepEqual(runCombined(i => [...approximateNo(i), restingHand()]), ['No'], 'Approximate NO with a resting second hand should work');
assert.deepEqual(runCombined(i => wave(i), () => face), ['Hello'], 'Tentative near-mouth pose must not suppress a completed HELLO');
assert.deepEqual(runCombined(i => thanksHand(i, false), () => face), ['Thank you'], 'Coordinator should speak THANK YOU once');
assert.deepEqual(runCombined(() => noHand(false, true), () => face), [], 'Still open hand must remain silent in the coordinator');
assert.deepEqual(runCombined(i => hand(Math.sin(i / 24 * Math.PI) * .36), () => null, 'No'), [], 'NO practice must not speak YES');
const selector = new SigningHandSelector();
const selectedFirst = selector.select([hand()[0], restingHand()], 0);
const selectedReordered = selector.select([restingHand(), hand()[0]], 40);
assert.equal(selectedFirst[0].side, selectedReordered[0].side, 'Tracking order must not switch hand identity');
assert.equal(selector.select([hand()[0], restingHand()], 80, 'Left')[0].label, 'Left', 'Explicit hand selection should be respected');
setRecognitionMode('balanced');
assert.equal(runNo(approximateNo), 0, 'Balanced mode keeps the stricter NO closure');
console.log('Passed beginner NO, second-hand selection, simultaneous candidates, and guided-practice checks.');
setRecognitionMode('relaxed');
function approachingThanks(i) {
  const hands = thanksHand(0, false);
  // Raise fingertips from below the chin, then sweep away only a short way.
  const offset = i <= 8 ? .16 - i / 8 * .15 : .01 + Math.min(1, (i - 8) / 10) * .1;
  hands[0].image = hands[0].image.map(p => ({ ...p, y: p.y + offset }));
  return hands;
}
assert.equal(runThanks(approachingThanks), 1, 'THANK YOU must anchor at mouth after approach, not below-chin entry');
assert.deepEqual(runCombined(approachingThanks, () => face), ['Thank you'], 'Natural approach and short outward sweep should work through the app coordinator');
const thanksDiagnostics = new ThankYouDetector();
thanksDiagnostics.update(thanksHand(0), null, 0);
assert.match(thanksDiagnostics.feedback, /Face not located/);
thanksDiagnostics.update([], face, 40);
assert.match(thanksDiagnostics.feedback, /hand not located/);
setRecognitionMode('balanced');
console.log('Passed THANK YOU approach regression and missing-tracker diagnostics.');
