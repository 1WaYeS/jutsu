import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { constructSentence, PHRASES } from './sentence-builder.js';
const files = { '/': ['index.html', 'text/html'], '/classic': ['classic.html', 'text/html'], '/experimental': ['experimental.html', 'text/html'], '/ai-app.js': ['ai-app.js', 'text/javascript'], '/app.js': ['app.js', 'text/javascript'], '/yes-detector.js': ['yes-detector.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
for (const name of ['mobile-app.js', 'camera-controller.js', 'speech-controller.js', 'sentence-builder.js']) files[`/${name}`] = [name, 'text/javascript'];
for (const route of ['/translate','/dictionary','/history']) files[route] = ['index.html','text/html'];
files['/everyday-detector.js'] = ['everyday-detector.js','text/javascript'];
files['/jutsu-logo.png'] = ['jutsu-logo.png','image/png'];
files['/hero-hands-light.png'] = ['hero-hands-light.png','image/png'];
files['/home-reference.png'] = ['home-reference.png','image/png'];
files['/jutsu.css'] = ['jutsu.css','text/css'];
files['/hero-hands.png'] = ['hero-hands.png','image/png'];
files['/basic-messages.js'] = ['basic-messages.js','text/javascript'];
files['/manual-app.js'] = ['manual-app.js','text/javascript'];
files['/manual'] = ['manual.html','text/html'];
files['/train'] = ['train.html', 'text/html'];
for (const name of ['train-app.js','personal-recognizer.js','personal-worker.js','sample-store.js']) files[`/${name}`] = [name,'text/javascript'];
files['/mobile.css'] = ['mobile.css', 'text/css'];
files['/qualification'] = ['MODEL_QUALIFICATION.md', 'text/plain; charset=utf-8'];
const aiRoot = resolve('public-ai');
const mime = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.txt': 'text/plain', '.onnx': 'application/octet-stream', '.task': 'application/octet-stream' };
const handler = async (req, res) => {
  let path;
  try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Invalid path'); return; }
  if (path === '/api/capabilities' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ inputLanguageTarget: 'ASL', recognition: { status: 'experimental-basic-gestures', availableGestures: ['HELLO','YES','NO','MORE','YOU'], verifiedVocabulary: [], reason: 'No model has passed actual live signing evaluation.' }, sentenceBuilder: { mode: 'manual-demonstration', mappings: PHRASES.length }, speech: 'browser', videoUpload: false })); return;
  }
  if (path === '/api/sentences' && req.method === 'POST') {
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 16384) { res.writeHead(413); res.end('Request too large'); return; } chunks.push(chunk); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!body || typeof body !== 'object' || !Array.isArray(body.concepts) || body.concepts.length > 30 || body.concepts.some(c => typeof c !== 'string' || c.length > 50)) { res.writeHead(400); res.end('Invalid concepts'); return; }
      if (body.source !== 'manual') { res.writeHead(409, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Live recognition is not qualified. This endpoint currently accepts labeled manual demonstrations only.' })); return; }
      const result = constructSentence(body.concepts, { complete: body.complete === true, uncertain: body.uncertain === true });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ...result, source: 'manual-demonstration', isCameraRecognition: false }));
    } catch { if (!res.headersSent) res.writeHead(400); res.end('Invalid request'); }
    return;
  }
  if (path.startsWith('/ai/')) {
    const asset = resolve(aiRoot, path.slice(4));
    if (!asset.startsWith(aiRoot + sep) || !mime[extname(asset)]) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const data = await readFile(asset);
      res.writeHead(200, { 'Content-Type': mime[extname(asset)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
    } catch { res.writeHead(404); res.end('Asset not found. Run npm run build.'); }
    return;
  }
  const entry = files[path];
  if (!entry) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(new URL(entry[0], import.meta.url));
    res.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-store' }); res.end(data);
  } catch { res.writeHead(500); res.end('Unable to load app'); }
};
const cert = process.env.JUTSU_TLS_CERT, key = process.env.JUTSU_TLS_KEY;
if (Boolean(cert) !== Boolean(key)) throw new Error('Set both JUTSU_TLS_CERT and JUTSU_TLS_KEY for HTTPS.');
const server = cert ? https.createServer({ cert: await readFile(cert), key: await readFile(key) }, handler) : http.createServer(handler);
const host = process.env.JUTSU_HOST || '127.0.0.1';
const port = Number(process.env.JUTSU_PORT || 5180);
server.listen(port, host, () => console.log(`Jutsu: ${cert ? 'https' : 'http'}://${host}:${port}`));


