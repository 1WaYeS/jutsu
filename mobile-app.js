import { CameraController, cameraError } from './camera-controller.js';
import { SpeechController } from './speech-controller.js';
import { setRecognitionMode } from './yes-detector.js';
import { EverydayRecognizer } from './everyday-detector.js';
import { BasicMessageController, BASIC_GESTURES, REFERENCE_GESTURES } from './basic-messages.js';
const $=id=>document.getElementById(id);
setRecognitionMode('relaxed');
const recognizer=new EverydayRecognizer();
const camera=new CameraController($('live-video'));
const speech=new SpeechController(undefined,undefined,message=>{$('audio-status').textContent=message;});
let tracker=null, busy=false, generation=0, page='home';
const canvas=$('hand-overlay'),context=canvas.getContext('2d');
const message=new BasicMessageController({speech,onChange:renderMessage});
let saved=[];
try{const value=JSON.parse(localStorage.getItem('jutsu.basic.history.v1')||'[]');if(Array.isArray(value))saved=value.filter(x=>x&&typeof x.text==='string'&&typeof x.at==='string').slice(0,100);}catch{}
const icons={Hello:'hand',Yes:'hand',No:'hand'};
function gestureArt(phrase){const wrap=document.createElement('span');wrap.className='gesture-art';wrap.innerHTML=`<svg aria-hidden="true"><use href="#${icons[phrase]||'hand'}"/></svg>`;return wrap;}
for(const gesture of [...BASIC_GESTURES,...REFERENCE_GESTURES]){
 const quick=document.createElement('article');quick.className='gesture-card';quick.append(gestureArt(gesture.phrase));
 const copy=document.createElement('div'),heading=document.createElement('h3'),description=document.createElement('p');heading.textContent=gesture.phrase.toUpperCase();description.textContent=gesture.short;copy.append(heading,description);quick.append(copy);if(!gesture.referenceOnly)$('quick-gestures').append(quick);
 const card=document.createElement('article');card.className='dictionary-card';card.append(gestureArt(gesture.phrase));
 const title=document.createElement('h2');title.textContent=gesture.phrase.toUpperCase();
 const status=document.createElement('span');status.className=`dictionary-status ${gesture.referenceOnly?'reference-only':''}`;status.textContent=gesture.referenceOnly?'LEARN ONLY':gesture.new?'NEW · EXPERIMENTAL CAMERA':'EXPERIMENTAL CAMERA';
 const text=document.createElement('p');text.textContent=gesture.guide;
 const note=document.createElement('p');note.textContent=gesture.note;
 const link=document.createElement('a');link.className='text-link';link.href=gesture.reference;link.target='_blank';link.rel='noopener noreferrer';link.textContent='Watch the ASL reference ↗';card.append(status,title,text,note,link);$('dictionary-cards').append(card);
}
function renderMessage(text,audio){
 $('live-message').textContent=text||'Your words will appear here.';$('live-message').classList.toggle('has-message',!!text);
 $('camera-caption').hidden=!text;$('camera-caption').textContent=text;
 $('audio-enabled').checked=audio;$('audio-mode-label').textContent=audio?'On · speak recognized messages':'Off · text only';
 $('output-text').setAttribute('aria-pressed',String(!audio));$('output-audio').setAttribute('aria-pressed',String(audio));
 $('replay-message').disabled=!text||!audio;$('save-message').disabled=!text;$('clear-message').disabled=!text;
}
$('audio-enabled').addEventListener('change',()=>message.setAudio($('audio-enabled').checked));
$('output-text').addEventListener('click',()=>message.setAudio(false));
$('output-audio').addEventListener('click',()=>message.setAudio(true));
$('replay-message').addEventListener('click',()=>message.replay());
$('clear-message').addEventListener('click',()=>{message.clear();recognizer.reset();$('recognition-state').textContent=camera.stream?'Ready for your next gesture.':'Start the camera to begin.';});
$('save-message').addEventListener('click',()=>{
 if(!message.text)return;
 const next=[{id:crypto.randomUUID(),at:new Date().toISOString(),text:message.text,source:'experimental camera gesture'},...saved].slice(0,100);
 try{localStorage.setItem('jutsu.basic.history.v1',JSON.stringify(next));saved=next;renderHistory();$('audio-status').textContent='Message saved on this device.';}catch{$('audio-status').textContent='Could not save on this device. Your text remains visible.';}
});
function renderHistory(){
 $('history-list').replaceChildren();
 if(!saved.length){const empty=document.createElement('p');empty.className='empty-history';empty.textContent='A little quiet here. Save a recognized message to find it later.';$('history-list').append(empty);return;}
 for(const item of saved){
  const card=document.createElement('article');card.className='history-card';const copy=document.createElement('div'),title=document.createElement('h2'),meta=document.createElement('p');title.textContent=item.text;meta.textContent=`${new Date(item.at).toLocaleString()} · Experimental camera recognition`;copy.append(title,meta);
  const actions=document.createElement('div');actions.className='history-buttons';const replay=document.createElement('button');replay.textContent='Listen';replay.addEventListener('click',()=>{speech.speak(item.text,{voice:speech.voices()[0]});$('history-state').textContent='Playing the saved message.';});actions.append(replay);card.append(copy,actions);$('history-list').append(card);
 }
}
function cameraControls(){
 $('start-camera').disabled=busy||!!camera.stream;$('stop-camera').disabled=!busy&&!camera.stream;$('switch-camera').disabled=busy||!camera.stream;$('camera-source').disabled=busy;
}
async function populateCameras(){const selected=$('camera-source').value;const devices=await camera.devices();$('camera-source').replaceChildren(new Option('Rear camera / default',''),...devices.map((d,i)=>new Option(d.label||`Camera ${i+1}`,d.deviceId)));if(devices.some(d=>d.deviceId===selected))$('camera-source').value=selected;}
function stopCamera(status='Camera stopped. Your video has been released.'){
 generation++;busy=false;tracker?.dispose();tracker=null;camera.stop();recognizer.reset();speech.stop();context.clearRect(0,0,canvas.width,canvas.height);$('camera-empty').hidden=false;$('camera-state').textContent=status;$('camera-badge').classList.remove('live');$('camera-badge').innerHTML='<span class="dot"></span> Camera off';$('recognition-state').textContent='Camera off. Start again when you are ready.';cameraControls();
}
async function startCamera(switching=false){
 stopCamera();const token=generation;busy=true;cameraControls();$('camera-state').textContent='Loading hand tracking…';
 try{
  const {createBasicTracker}=await import('/ai/bridge.js');if(token!==generation)return;
  $('camera-state').textContent='Starting the local hand-tracking model…';
  const created=await createBasicTracker();if(token!==generation){created.dispose();return;}tracker=created;
  $('camera-state').textContent='Waiting for camera permission. Allow access in the browser prompt.';
  const started=switching?await camera.switch():await camera.start({deviceId:$('camera-source').value});
  if(!started||token!==generation)return;
  $('camera-empty').hidden=true;$('live-video').classList.toggle('mirrored',camera.facing==='user');canvas.classList.toggle('mirrored',camera.facing==='user');
  await populateCameras();if(token!==generation)return;if(switching)$('camera-source').value='';
  $('camera-badge').classList.add('live');$('camera-badge').innerHTML='<span class="dot"></span> Live camera';
  tracker.start($('live-video'),event=>{if(token!==generation)return;if(event.error){stopCamera(`Tracking stopped: ${event.error}. Try starting again.`);return;}receiveFrame(event);});
  $('camera-state').textContent='Camera live · looking for your signing hand.';
  const owned=camera.stream;owned?.getVideoTracks()[0]?.addEventListener('ended',()=>{if(camera.stream===owned)stopCamera('Camera disconnected. Reconnect and start again.');});
 }catch(error){if(token===generation)stopCamera(cameraError(error));}
 finally{if(token===generation){busy=false;cameraControls();}}
}
const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
function receiveFrame(event){
 const hands=event.hands||[];canvas.width=$('live-video').videoWidth;canvas.height=$('live-video').videoHeight;context.clearRect(0,0,canvas.width,canvas.height);context.strokeStyle='#f17d87';context.lineWidth=2;
 for(const hand of hands){for(const[a,b]of edges){const u=hand.image[a],v=hand.image[b];if(!u||!v)continue;context.beginPath();context.moveTo(u.x*canvas.width,u.y*canvas.height);context.lineTo(v.x*canvas.width,v.y*canvas.height);context.stroke();}}
 const result=recognizer.update(hands,null,event.t);
 $('recognition-state').textContent=result.hint||'Watching your movement…';
 $('camera-state').textContent=hands.length?`${hands.length} hand${hands.length===1?'':'s'} tracked · ${Math.round(event.ms)} ms/frame · Pause between gestures.`:'Camera live · bring your hand into view.';
 if(result.phrase)message.accept(result.phrase);
}
$('start-camera').addEventListener('click',()=>startCamera());$('switch-camera').addEventListener('click',()=>startCamera(true));$('stop-camera').addEventListener('click',()=>stopCamera());$('camera-source').addEventListener('change',()=>{if(camera.stream)startCamera();});
$('fullscreen-camera').addEventListener('click',async()=>{const stage=$('video-stage');if(document.fullscreenElement){await document.exitFullscreen();return;}if(stage.classList.contains('viewport-fullscreen')){stage.classList.remove('viewport-fullscreen');return;}try{if(stage.requestFullscreen){await stage.requestFullscreen();return;}}catch{}stage.classList.add('viewport-fullscreen');});
$('caption-size').addEventListener('input',()=>document.documentElement.style.setProperty('--caption',`${$('caption-size').value}rem`));$('high-contrast').addEventListener('change',()=>document.body.classList.toggle('high-contrast',$('high-contrast').checked));
function route(){document.querySelectorAll('.nav-solutions[open]').forEach(menu=>{menu.open=false;});const next=({ '/':'home','/translate':'translate','/dictionary':'dictionary','/history':'history' })[location.pathname]||'home';if(page!==next&&(camera.stream||busy))stopCamera();if(page!==next)speech.stop();page=next;$('home-view').hidden=page!=='home';$('app-view').hidden=page==='home';for(const name of ['translate','dictionary','history'])$(`${name}-view`).hidden=page!==name;document.querySelectorAll('[data-page]').forEach(link=>{const active=link.dataset.page===page;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});document.title=`Jutsu — ${page==='home'?'Your Voice Is Your Power':page==='translate'?'Live Translation':page==='dictionary'?'Gesture Dictionary':'History'}`;}
document.addEventListener('click',event=>{const anchor=event.target.closest('a');if(!anchor||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button>0||anchor.target)return;const url=new URL(anchor.href,location.href);if(url.origin!==location.origin||url.hash||!['/','/translate','/dictionary','/history'].includes(url.pathname))return;event.preventDefault();if(location.pathname!==url.pathname){history.pushState({},'',url.pathname);route();window.scrollTo({top:0,behavior:'instant'});}});
window.addEventListener('popstate',route);document.addEventListener('visibilitychange',()=>{if(document.hidden&&(camera.stream||busy))stopCamera('Camera paused while the page is hidden. Start again to resume.');});window.addEventListener('pagehide',()=>{tracker?.dispose();camera.stop();speech.stop();});
route();renderMessage('',false);renderHistory();populateCameras().catch(()=>{});cameraControls();
