import { mkdir, copyFile, cp, access } from 'node:fs/promises';
const files = ['home-reference.png','everyday-detector.js','jutsu-logo.png','hero-hands-light.png','jutsu.css','hero-hands.png','basic-messages.js','manual.html','manual-app.js','index.html','mobile.css','mobile-app.js','sentence-builder.js','camera-controller.js','speech-controller.js','classic.html','style.css','app.js','yes-detector.js','experimental.html','ai-app.js','train.html','train-app.js','personal-recognizer.js','personal-worker.js','sample-store.js'];
await mkdir('dist', { recursive: true });
for (const file of files) await copyFile(file, `dist/${file}`);
await copyFile('classic.html', 'dist/classic');
await copyFile('experimental.html', 'dist/experimental');
await copyFile('train.html', 'dist/train');
for(const route of ['translate','dictionary','history']) await copyFile('index.html',"dist/"+route);
await copyFile('manual.html','dist/manual');
await copyFile('MODEL_QUALIFICATION.md', 'dist/qualification');
try { await access('public-ai/bridge.js'); await cp('public-ai','dist/ai', { recursive: true }); }
catch { throw new Error('Experimental assets missing. Run npm run build:ai before building the full static package.'); }
console.log('Built dist/: mobile core, labeled manual demo, and separate experimental routes. Live recognition remains unqualified.');
