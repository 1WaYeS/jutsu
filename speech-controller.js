export class SpeechController {
  constructor(synthesis = globalThis.speechSynthesis, Utterance = globalThis.SpeechSynthesisUtterance, onStatus = () => {}) { this.synthesis = synthesis; this.Utterance = Utterance; this.onStatus = onStatus; this.token = 0; this.lastText = ''; }
  voices() { return this.synthesis?.getVoices().filter(v => /^en(?:-|$)/i.test(v.lang) && v.localService) || []; }
  stop() { this.token++; this.synthesis?.cancel(); this.onStatus('Speech stopped.'); }
  speak(text, { voice, rate = 1, volume = 1 } = {}) {
    if (!this.synthesis || !this.Utterance) { this.onStatus('Speech is unavailable in this browser. Your text is still readable.'); return false; }
    if (!text?.trim()) return false;
    this.stop(); const token = this.token; const utterance = new this.Utterance(text);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'en-US'; utterance.rate = rate; utterance.volume = volume;
    this.lastText = text;
    utterance.onstart = () => { if (token === this.token) this.onStatus('Speaking…'); };
    utterance.onend = () => { if (token === this.token) this.onStatus('Finished speaking. Replay is available.'); };
    utterance.onerror = e => { if (token === this.token) this.onStatus(`Audio could not play (${e.error}). Tap Speak to retry.`); };
    try { this.synthesis.speak(utterance); return true; } catch (e) { this.onStatus(`Speech unavailable: ${e.message}`); return false; }
  }
  pause() { this.synthesis?.pause(); this.onStatus('Speech paused.'); }
  resume() { this.synthesis?.resume(); this.onStatus('Resuming speech…'); }
}
