export function cameraError(error) {
  return ({ NotAllowedError: 'Camera permission was denied. Allow camera access in browser settings and try again.', NotFoundError: 'No camera was found. Connect a camera or check your phone permissions.', NotReadableError: 'Camera is busy or disconnected. Close other camera apps and retry.', OverconstrainedError: 'That camera is unavailable. Try the default camera.', SecurityError: 'Camera access requires a secure connection. Open JUTSU over HTTPS.' })[error.name] || `Camera could not start: ${error.message}`;
}
export class CameraController {
  constructor(video, media = globalThis.navigator?.mediaDevices) { this.video = video; this.media = media; this.stream = null; this.generation = 0; this.facing = 'environment'; }
  stop() { this.generation++; this.stream?.getTracks().forEach(t => t.stop()); this.stream = null; this.video.srcObject = null; }
  async start({ deviceId = '', facing = this.facing } = {}) {
    this.stop(); const token = this.generation;
    if (!this.media?.getUserMedia) throw new Error('Camera access requires HTTPS on a phone, or localhost on this computer.');
    const stream = await this.media.getUserMedia({ audio: false, video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: facing } }), width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (token !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
    this.stream = stream; this.facing = facing; this.video.srcObject = stream;
    try { await this.video.play(); }
    catch (error) { if (token === this.generation) this.stop(); throw error; }
    return token === this.generation;
  }
  async switch() { return this.start({ facing: this.facing === 'environment' ? 'user' : 'environment' }); }
  async devices() { return this.media?.enumerateDevices ? (await this.media.enumerateDevices()).filter(d => d.kind === 'videoinput') : []; }
}
