import test from 'node:test';
import assert from 'node:assert/strict';
import {YouDetector,MoreDetector,EverydayRecognizer} from './everyday-detector.js';
import {BasicMessageController,REFERENCE_GESTURES} from './basic-messages.js';
function pose({love=false,point=false,pinch=false,center=.5,mirror=false}={}){
 const world=Array.from({length:21},()=>({x:0,y:0,z:0}));
 for(const base of [5,9,13,17]){const x=(base-11)*.004;world[base]={x,y:-.05,z:0};world[base+1]={x,y:-.075,z:0};world[base+2]={x,y:-.065,z:0};world[base+3]={x,y:-.04,z:.005};}
 world[3]={x:-.025,y:-.035,z:0};world[4]={x:love?-.08:-.025,y:-.04,z:0};
 if(love)for(const base of [5,17])world[base+3]={x:world[base].x,y:-.14,z:0};
 if(point){world[8]={x:world[5].x,y:-.075,z:-.12};}
 if(pinch){world[4]={x:0,y:-.07,z:0};for(const i of [8,12,16,20])world[i]={x:(i-14)*.001,y:-.075,z:0};}
 if(mirror)world.forEach(p=>p.x*=-1);
 return {world,image:world.map(p=>({x:center+p.x,y:.5+p.y,z:p.z})),side:mirror?'Left':'Right'};
}
test('YOU requires its distinct handshape and a sustained hold; does not repeat while held',()=>{
 const d=new YouDetector();let count=0;for(let i=0;i<55;i++)count+=Number(d.update([pose({point:true})],i*40).detected);assert.equal(count,1);
 const wrong=new YouDetector();for(let i=0;i<30;i++)assert.equal(wrong.update([pose()],i*40).detected,false);
 const mirrored=new YouDetector();let hit=false;for(let i=0;i<25;i++)hit||=mirrored.update([pose({point:true,mirror:true})],i*40).detected;assert(hit);
});
test('tracking loss cannot complete an YOU hold and invalid geometry is rejected',()=>{const d=new YouDetector();d.update([pose({point:true})],0);assert.equal(d.update([pose({point:true})],800).detected,false);assert.equal(d.update([{world:[],image:[]}],840).detected,false);});
function moreFrames(d,moving=true){let count=0;for(let i=0;i<30;i++){const gap=moving?(i<10?.20-i*.016:i<15?.035:.035+(i-15)*.012):.035;const hands=[pose({pinch:true,center:.5-gap/2}),pose({pinch:true,center:.5+gap/2,mirror:true})];count+=Number(d.update(hands,i*40).detected);}return count;}
test('MORE requires two pinched hands to approach and separate, not stationary contact',()=>{assert.equal(moreFrames(new MoreDetector()),1);assert.equal(moreFrames(new MoreDetector(),false),0);const d=new MoreDetector();for(let i=0;i<30;i++)assert.equal(d.update([pose({pinch:true})],i*40).detected,false);});
test('ordinary closed fists moving together do not count as MORE',()=>{const d=new MoreDetector();for(let i=0;i<30;i++){const gap=.2-Math.sin(i/29*Math.PI)*.18;assert.equal(d.update([pose({center:.5-gap/2}),pose({center:.5+gap/2,mirror:true})],i*40).detected,false);}});
test('new YOU flows through real recognizer output to text without audio when muted',()=>{const recognizer=new EverydayRecognizer();const speech={stop(){},voices(){return[]},speak(){throw Error('muted')}};const messages=new BasicMessageController({speech});let hits=0;for(let i=0;i<60;i++){const result=recognizer.update([pose({point:true})],null,i*40);if(result.phrase){hits++;messages.accept(result.phrase);}}assert.equal(hits,1);assert.equal(messages.text,'You.');for(const reference of REFERENCE_GESTURES)assert.equal(messages.accept(reference.phrase),false);});

test('removed ILY handshape is not renamed YOU or accepted for speech',()=>{const d=new YouDetector();for(let i=0;i<30;i++)assert.equal(d.update([pose({love:true})],i*40).detected,false);const m=new BasicMessageController({speech:{stop(){},voices(){return[]},speak(){throw Error('must not speak')}}});assert.equal(m.accept('I love you'),false);});
