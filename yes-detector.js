// Experimental isolated-sign heuristic, not a trained or validated ASL model.
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
let relaxed = false;
export function setRecognitionMode(mode) { relaxed = mode === 'relaxed'; }
const enoughExtended = (points, ratio) => [5,9,13,17].filter(base => distance(points[base + 3], points[0]) > distance(points[base + 1], points[0]) * ratio).length >= (relaxed ? 3 : 4);
// Keep a stable signing hand when the resting hand is also visible. Never
// splice different people's/hands' landmark sequences into one movement.
export class SigningHandSelector {
  constructor() { this.reset(); }
  reset() { this.previous = null; this.lastSeen = null; this.generation = 0; }
  select(hands, now, preference = 'auto') {
    const eligible = hands.filter(h => h.image?.length === 21 && h.world?.length === 21 && (preference === 'auto' || h.side === preference));
    if (!eligible.length) {
      if (this.lastSeen !== null && now - this.lastSeen > 250) this.previous = null;
      return [];
    }
    const displacement = hand => this.previous ? Math.hypot(hand.image[0].x - this.previous.x, hand.image[0].y - this.previous.y) : Infinity;
    const nearest = [...eligible].sort((a, b) => displacement(a) - displacement(b))[0];
    const raised = [...eligible].sort((a, b) => a.image[0].y - b.image[0].y)[0];
    let chosen = this.previous && now - this.lastSeen <= 250 && displacement(nearest) < .28 ? nearest : raised;
    if (preference === 'auto' && chosen.image[0].y > .7 && raised.image[0].y < chosen.image[0].y - .2) chosen = raised;
    if (!this.previous || chosen !== nearest || displacement(chosen) >= .28 || now - this.lastSeen > 250) this.generation++;
    this.previous = { ...chosen.image[0] }; this.lastSeen = now;
    return [{ ...chosen, side: `signing-hand-${this.generation}`, label: chosen.side }];
  }
}
export class RepeatGate {
  constructor() { this.reset(); }
  reset() { this.locked = false; this.detectedAt = null; this.stillSince = null; this.anchor = null; }
  lock(now) { this.locked = true; this.detectedAt = now; this.stillSince = null; this.anchor = null; }
  update(hands, now) {
    if (!this.locked) return false;
    let pose;
    if (hands.length === 0) pose = { side: 'absent', image: [], world: [], scale: 1 };
    else if (hands.length === 1 && hands[0].world?.length === 21 && hands[0].image?.length === 21) {
      const hand = hands[0], wrist = hand.world[0];
      const worldScale = distance(wrist, hand.world[9]);
      if (worldScale < .015) return false;
      const indices = [0,8,12,16,20];
      pose = { side: hand.side, image: indices.map(i => hand.image[i]),
        world: indices.map(i => ({ x: (hand.world[i].x - wrist.x) / worldScale, y: (hand.world[i].y - wrist.y) / worldScale, z: (hand.world[i].z - wrist.z) / worldScale })),
        scale: Math.max(.025, Math.hypot(hand.image[9].x - hand.image[0].x, hand.image[9].y - hand.image[0].y)) };
    } else { this.anchor = null; this.stillSince = null; return false; }
    const same = this.anchor && pose.side === this.anchor.side
      && pose.image.every((p, i) => Math.hypot(p.x - this.anchor.image[i].x, p.y - this.anchor.image[i].y) / this.anchor.scale < .22)
      && pose.world.every((p, i) => distance(p, this.anchor.world[i]) < .25);
    if (!same) { this.anchor = pose; this.stillSince = now; }
    if (now - this.detectedAt >= 700 && now - this.stillSince >= 350) { this.reset(); return true; }
    return false;
  }
}
export class ThankYouDetector {
  constructor() { this.reset(); }
  reset() { this.start = null; this.nearSince = null; this.lastSeen = null; this.awaySince = null; this.completed = false; this.feedback = 'Waiting for a hand near your mouth or chin.'; }
  update(hands, face, now) {
    const idle = { detected: false, active: false };
    if (hands.length !== 1 || !face || face.height < .08) {
      // A hand passing the mouth can briefly obscure either tracker.
      if (!relaxed || hands.length > 1 || this.lastSeen === null || now - this.lastSeen > 200) this.reset();
      this.feedback = !face ? 'Face not located · keep your face in view.' : hands.length === 0 ? 'Signing hand not located · keep it visible near your face.' : 'Waiting for one signing hand.';
      return idle;
    }
    const { world: p, image, side } = hands[0];
    if (!p || !image || !enoughExtended(p, relaxed ? .98 : 1.1)) {
      if (!relaxed || this.lastSeen === null || now - this.lastSeen > 160) this.reset();
      this.feedback = 'Hand shape unclear near your face · try a relaxed open hand.';
      return idle;
    }
    if ((this.lastSeen !== null && now - this.lastSeen > 250) || (this.start && this.start.side !== side)) this.reset();
    this.lastSeen = now;
    if (this.completed) { this.feedback = 'THANK YOU detected · pause before the next message.'; return idle; }
    const tips = [8,12,16].reduce((sum, i) => ({ x: sum.x + image[i].x / 3, y: sum.y + image[i].y / 3 }), { x: 0, y: 0 });
    const relative = { x: (tips.x - face.mouth.x) / face.height, y: (tips.y - face.mouth.y) / face.height };
    const span = Math.hypot(image[5].x - image[17].x, image[5].y - image[17].y) / face.height;
    const near = Math.hypot(relative.x, relative.y) < (relaxed ? .8 : .48);
    if (this.start && now - this.start.time > 1800) { this.reset(); }
    if (!this.start) {
      if (!near) { this.nearSince = null; this.feedback = 'Move your fingertips near your mouth or chin to begin THANK YOU.'; return idle; }
      this.nearSince ??= now;
      if (relaxed || now - this.nearSince >= 60) this.start = { ...relative, span, time: now, side };
      this.feedback = 'Start found · sweep your hand away from your mouth.';
      return { detected: false, active: true, hint: 'Hand near mouth · move it away naturally for THANK YOU. No pause needed.' };
    }
    // Anchor at the closest observed approach to the mouth, rather than the
    // first frame in the broad start region (which can be below the chin).
    if (relaxed && Math.hypot(relative.x, relative.y) < Math.hypot(this.start.x, this.start.y) - .04) {
      this.start = { ...relative, span, time: now, side }; this.awaySince = null;
      this.feedback = 'Hand near mouth · ready for the outward sweep.';
      return { detected: false, active: true, hint: this.feedback };
    }
    const dy = relative.y - this.start.y, dx = Math.abs(relative.x - this.start.x);
    // Release a sideways wave to HELLO rather than holding the near-mouth
    // candidate until timeout just because the wave began near the face.
    if (dx > .65 && Math.abs(dy) < dx * .6) { this.reset(); this.feedback = 'Sideways movement looks more like a wave; waiting for THANK YOU.'; return idle; }
    // Balanced mode uses palm growth as a forward-motion proxy. Forgiving
    // mode accepts a short outward/downward sweep without that unreliable cue.
    const forwardCue = span > this.start.span * (relaxed ? 1.03 : 1.12) && this.start.span > .04;
    const radius = Math.hypot(relative.x, relative.y);
    const away = radius > .55;
    const easySweep = dy > .18 && dy < 1.6 && dx < Math.max(.55, dy * 1.1)
      && radius - Math.hypot(this.start.x, this.start.y) > .14;
    const movingOut = relaxed ? easySweep : dy > .25 && dy < 1.5 && dx < .65 && away && forwardCue;
    if (movingOut) this.awaySince ??= now; else this.awaySince = null;
    if (this.awaySince !== null && now - this.awaySince >= (relaxed ? 35 : 60) && now - this.start.time >= (relaxed ? 120 : 180)) {
      this.reset(); this.completed = true; this.lastSeen = now;
      this.feedback = 'THANK YOU detected.';
      return { detected: true, active: true, hint: 'Possible THANK YOU detected · pause briefly before the next sign.' };
    }
    this.feedback = movingOut ? 'Outward sweep found · finishing detection…' : 'Start found · watching for the sweep away and slightly down.';
    return { detected: false, active: true, hint: this.feedback };
  }
}
export class HelloDetector {
  constructor() { this.reset(); }
  reset() { this.samples = []; this.side = null; this.lastSeen = null; this.smoothed = null; }
  update(hands, now) {
    const idle = { detected: false, active: false };
    if (hands.length !== 1) {
      if (!relaxed || hands.length > 1 || this.lastSeen === null || now - this.lastSeen > 180) this.reset();
      return idle;
    }
    const { world: p, image, side } = hands[0];
    if (!p || p.length !== 21 || !image || image.length !== 21) { this.reset(); return idle; }
    const open = enoughExtended(p, relaxed ? 1.02 : 1.12);
    if (!open) {
      if (!relaxed || this.lastSeen === null || now - this.lastSeen > 140) this.reset();
      return idle;
    }
    if (side !== this.side || (this.lastSeen !== null && now - this.lastSeen > 250)) this.reset();
    this.side = side; this.lastSeen = now;
    // Fingertip centroid captures a wrist wave as well as a whole-hand wave.
    const center = [0,8,12,16,20].reduce((sum, i) => ({ x: sum.x + image[i].x / 5, y: sum.y + image[i].y / 5 }), { x: 0, y: 0 });
    const palmSize = Math.hypot(image[9].x - image[0].x, image[9].y - image[0].y);
    this.smoothed = this.smoothed ? { x: .65 * center.x + .35 * this.smoothed.x, y: .65 * center.y + .35 * this.smoothed.y } : center;
    this.samples.push({ ...this.smoothed, time: now, scale: palmSize });
    this.samples = this.samples.filter(s => now - s.time <= 1600);
    const samples = this.samples;
    let active = false;
    for (let start = 0; start < samples.length - 5; start++) {
      const cycle = samples.slice(start), origin = cycle[0];
      if (now - origin.time < (relaxed ? 200 : 280) || origin.scale < .025) continue;
      const x = cycle.map(s => (s.x - origin.x) / origin.scale);
      const y = cycle.map(s => (s.y - origin.y) / origin.scale);
      const min = Math.min(...x), max = Math.max(...x);
      const sign = Math.abs(min) > Math.abs(max) ? -1 : 1;
      const excursion = x.map(v => sign * v), peak = Math.max(...excursion);
      const peakIndex = excursion.indexOf(peak);
      const verticalRange = Math.max(...y) - Math.min(...y);
      active ||= peak > .3;
      const returned = cycle.length - peakIndex >= 3 && now - cycle[peakIndex].time >= 70
        && excursion.slice(-2).every(value => peak - value > (relaxed ? .12 : .25));
      const minimumWave = relaxed ? .30 : .55;
      const sustained = excursion.some((v, i) => i > 0 && v > minimumWave && excursion[i - 1] > minimumWave);
      if (sustained && peak < 4 && verticalRange < peak * (relaxed ? 1.05 : .75) && returned) {
        this.samples = [];
        return { detected: true, active: true, hint: 'Possible HELLO detected · relax your hand before the next sign.' };
      }
    }
    return { detected: false, active, hint: 'Open hand found · wave gently side to side for HELLO.' };
  }
}
export class NoDetector {
  constructor() { this.reset(); }
  reset() { this.openSince = null; this.armedAt = null; this.closedSince = null; this.side = null; this.lastSeen = null; this.openGap = 0; }
  update(hands, now) {
    if (hands.length !== 1) {
      if (!relaxed || hands.length > 1 || this.lastSeen === null || now - this.lastSeen > 180) this.reset();
      return { detected: false, active: false };
    }
    const { world: p, side } = hands[0];
    if (!p || p.length !== 21) { this.reset(); return { detected: false, active: false }; }
    if (side !== this.side || (this.lastSeen !== null && now - this.lastSeen > 250)) this.reset();
    this.side = side; this.lastSeen = now;
    const scale = distance(p[0], p[9]);
    if (scale < .015) { this.reset(); return { detected: false, active: false }; }
    const folded = base => distance(p[base + 3], p[0]) < distance(p[base + 1], p[0]) * (relaxed ? 1.22 : 1.12);
    const shape = folded(13) && folded(17);
    const extended = base => distance(p[base + 3], p[0]) > distance(p[base + 1], p[0]) * (relaxed ? 1.04 : 1.12);
    const gap = Math.max(distance(p[8], p[4]), distance(p[12], p[4])) / scale;
    const fingersTogether = distance(p[8], p[12]) / scale < (relaxed ? .85 : .65);
    const indexReady = extended(5), middleReady = extended(9);
    const partlyExtended = base => distance(p[base + 3], p[0]) > distance(p[base + 1], p[0]) * .94;
    const readyFingers = relaxed ? (indexReady && partlyExtended(9)) || (middleReady && partlyExtended(5)) : indexReady && middleReady;
    const open = shape && readyFingers && fingersTogether && gap > (relaxed ? .55 : .65);
    if (this.armedAt !== null && now - this.armedAt > 1400) { this.reset(); this.side = side; this.lastSeen = now; }
    if (open) {
      this.openGap = Math.max(this.openGap, gap);
      this.openSince ??= now;
      if (now - this.openSince >= (relaxed ? 40 : 80)) this.armedAt ??= now;
    }
    // A beginner need not make exact fingertip-to-thumb contact: accept a
    // clear closing movement relative to the person's observed open pose.
    const closing = this.armedAt !== null && shape && fingersTogether && (relaxed
      ? gap < Math.min(.85, this.openGap * .72) && this.openGap - gap > .2
      : !open && gap < .48);
    if (closing) {
      this.closedSince ??= now;
      if (now - this.closedSince >= 60) { this.reset(); return { detected: true, active: true }; }
    } else {
      if (!open) this.openSince = null;
      this.closedSince = null;
    }
    return { detected: false, active: this.armedAt !== null, hint: this.armedAt !== null || this.openSince !== null ? 'Looks like a NO attempt · bring the two fingers toward your thumb.' : undefined };
  }
}
export function isFist(points) {
  if (!points || points.length !== 21) return false;
  return [[5,6,8],[9,10,12],[13,14,16],[17,18,20]].filter(([base, joint, tip]) =>
    distance(points[tip], points[base]) < distance(points[joint], points[base]) * (relaxed ? 2 : 1.65)
    && distance(points[tip], points[0]) < distance(points[joint], points[0]) * (relaxed ? 1.18 : 1.1)).length >= (relaxed ? 3 : 4);
}
export class YesDetector {
  constructor() { this.reset(); }
  reset() { this.samples = []; this.locked = false; this.neutralSince = null; this.identity = null; this.lastSeen = null; this.smoothed = null; }
  update(hands, now) {
    // Require one hand so samples cannot accidentally switch between hands.
    if (hands.length !== 1 || !isFist(hands[0].world)) {
      this.neutralSince ??= now;
      // Ignore a short landmark/finger classification glitch, not a second hand.
      if (hands.length > 1 || now - this.neutralSince > 180) {
        this.samples = []; this.identity = null; this.smoothed = null;
      }
      if (now - this.neutralSince >= 600) this.locked = false;
      const hint = hands.length > 1 ? 'Use one hand for this test.' : hands.length === 0 ? 'No hand visible · bring your signing hand into view.' : 'Fist not confirmed · keep fingers curled and visible.';
      return { detected: false, hint: this.locked ? 'Relax your hand to try again.' : hint };
    }
    this.neutralSince = null;
    if (this.locked) return { detected: false, hint: 'Result held · relax your hand before signing again.' };
    const hand = hands[0];
    if (this.identity !== hand.side || (this.lastSeen !== null && now - this.lastSeen > 250)) { this.samples = []; this.smoothed = null; }
    this.identity = hand.side; this.lastSeen = now;
    const wrist = hand.world[0];
    // Average three knuckles to reduce single-landmark jitter. Track the full
    // direction so a camera mounted at a different roll angle still works.
    const vector = ['x','y','z'].map(axis => [5,9,13].reduce((sum, i) => sum + hand.world[i][axis] - wrist[axis], 0) / 3);
    const length = Math.hypot(...vector);
    if (length < .015) return { detected: false, hint: 'Hand geometry unclear · reposition your hand.' };
    const unit = vector.map(v => v / length);
    this.smoothed = this.smoothed ? unit.map((v, i) => .65 * v + .35 * this.smoothed[i]) : unit;
    const smoothLength = Math.hypot(...this.smoothed);
    this.smoothed = this.smoothed.map(v => v / smoothLength);
    this.samples.push({ time: now, direction: [...this.smoothed], x: hand.image[0].x, y: hand.image[0].y });
    this.samples = this.samples.filter(sample => now - sample.time < 2400);
    const samples = this.samples;
    const separation = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.reduce((sum, v, i) => sum + v * b[i], 0))));
    // Try recent starting points; a badly tracked first pose must not prevent
    // all later complete bend-and-return cycles from being recognized.
    for (let start = 0; start < samples.length - 5; start++) {
      const origin = samples[start], cycle = samples.slice(start);
      const duration = now - origin.time;
      if (duration < (relaxed ? 180 : 220)) continue;
      const excursions = cycle.map(s => separation(s.direction, origin.direction));
      const bend = Math.max(...excursions);
      const stable = cycle.every(s => Math.hypot(s.x - origin.x, s.y - origin.y) < (relaxed ? .22 : .16));
      const peakIndex = excursions.indexOf(bend);
      const peak = cycle[peakIndex];
      // Detect a sustained reversal toward the starting orientation instead
      // of requiring a complete return. Two post-peak frames reject one-frame
      // depth jitter; still require a real excursion and directional return.
      const returnAmount = Math.max(relaxed ? .07 : .10, bend * .25);
      const returning = cycle.length - peakIndex >= 3
        && now - peak.time >= 70
        && excursions.slice(-2).every(value => bend - value >= returnAmount);
      const minimumBend = relaxed ? .19 : .30;
      const sustainedBend = excursions.some((value, i) => i > 0 && value > minimumBend && excursions[i - 1] > minimumBend);
      if (stable && sustainedBend && bend < 1.8 && returning) {
        this.locked = true; this.samples = [];
        return { detected: true, hint: 'Possible YES detected · relax your hand to try again.' };
      }
    }
    return { detected: false, hint: 'Loosely closed hand found · give a small, comfortable wrist nod for YES.' };
  }
}

// One coordinator gives completed movements priority over tentative poses.
// A near-mouth hand must not cancel a valid wave before it is complete.
export class SignRecognizer {
  constructor() {
    this.selector = new SigningHandSelector(); this.gate = new RepeatGate();
    this.detectors = [new NoDetector(), new ThankYouDetector(), new HelloDetector(), new YesDetector()];
    this.reset();
  }
  resetDetectors() { this.detectors.forEach(detector => detector.reset()); }
  reset() { this.selector.reset(); this.gate.reset(); this.resetDetectors(); this.identity = null; }
  update(rawHands, face, now, preference = 'auto', practice = 'all') {
    const hands = this.selector.select(rawHands, now, preference);
    if (hands.length && this.identity !== hands[0].side) {
      this.resetDetectors(); this.identity = hands[0].side;
    }
    const handLabel = hands[0]?.label || null;
    if (this.gate.locked) {
      const ready = this.gate.update(hands, now);
      if (ready) this.resetDetectors();
      return { handLabel, hint: ready ? 'Ready · try another sign.' : 'Message detected · pause briefly before the next one.' };
    }
    const [no, thankYou, hello, yes] = this.detectors;
    const results = [
      { ...no.update(hands, now), phrase: 'No' },
      { ...thankYou.update(hands, face, now), phrase: 'Thank you' },
      { ...hello.update(hands, now), phrase: 'Hello' },
      { ...yes.update(hands, now), phrase: 'Yes' }
    ].filter(result => practice === 'all' || result.phrase === practice);
    const completed = results.filter(result => result.detected);
    if (completed.length > 1) {
      this.resetDetectors();
      return { handLabel, hint: 'That movement could match more than one sign. Try once more comfortably.' };
    }
    if (completed.length === 1) {
      this.gate.lock(now);
      return { phrase: completed[0].phrase, handLabel, hint: `Looks like ${completed[0].phrase.toUpperCase()} · pause briefly before the next sign.` };
    }
    const candidate = results.find(result => result.active)
      || results.find(result => result.phrase === 'Hello' && result.hint)
      || results.find(result => result.phrase === 'Yes' && result.hint)
      || results.find(result => result.hint);
    return { handLabel, hint: hands.length ? candidate?.hint || 'Watching your movement · no sign recognized yet.' : 'Bring your signing hand into view. Either hand is welcome.' };
  }
}
