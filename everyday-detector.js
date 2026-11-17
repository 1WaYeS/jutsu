import { SignRecognizer, SigningHandSelector } from './yes-detector.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
const valid=hand=>hand?.world?.length===21&&hand?.image?.length===21&&hand.world.every(p=>p&&[p.x,p.y,p.z].every(Number.isFinite))&&hand.image.every(p=>p&&[p.x,p.y].every(Number.isFinite));
export class YouDetector {
 constructor(){this.reset();}
 reset(){this.since=null;this.last=null;this.identity=null;this.latched=false;this.releaseSince=null;}
 update(hands,now){
  const hand=hands.length===1&&valid(hands[0])?hands[0]:null;
  if(this.last!==null&&now-this.last>250){this.since=null;this.identity=null;}this.last=now;
  const p=hand?.world,scale=p?dist(p[0],p[9]):0;
  const extended=base=>dist(p[base+3],p[0])>dist(p[base+1],p[0])*1.08;
  const folded=base=>dist(p[base+3],p[0])<dist(p[base+1],p[0])*1.16;
  const shape=scale>.015&&extended(5)&&folded(9)&&folded(13)&&folded(17)&&dist(p[4],p[5])/scale<.8&&(p[8].z-p[0].z)/scale<-.35;
  if(!shape){this.since=null;this.releaseSince??=now;if(now-this.releaseSince>=300)this.latched=false;return {detected:false,active:false};}
  this.releaseSince=null;
  if(this.identity!==hand.side){this.since=null;this.identity=hand.side;}
  this.since??=now;
  if(this.latched)return {detected:false,active:true,hint:'YOU held · relax your hand before signing again.'};
  if(now-this.since>=650){this.latched=true;return {detected:true,active:true};}
  return {detected:false,active:true,hint:'Possible YOU · point your index finger toward the person or camera and hold briefly.'};
 }
}
export class MoreDetector {
 constructor(){this.reset();}
 reset(){this.start=null;this.touch=null;this.last=null;this.minimum=Infinity;}
 update(hands,now){
  if(hands.length!==2||!hands.every(valid)){this.reset();return {detected:false,active:false};}
  if(this.last!==null&&now-this.last>250)this.reset();this.last=now;
  const pinch=hand=>{const p=hand.world,scale=dist(p[0],p[9]);return scale>.015&&[8,12,16,20].every(i=>dist(p[i],p[4])/scale<.9)&&[5,9,13,17].filter(base=>dist(p[base+3],p[0])>dist(p[base+1],p[0])*.78).length>=3;};
  if(!hands.every(pinch)){this.reset();return {detected:false,active:false};}
  const center=hand=>{const points=[4,8,12,16,20].map(i=>hand.image[i]);return {x:points.reduce((s,p)=>s+p.x,0)/5,y:points.reduce((s,p)=>s+p.y,0)/5};};
  const[a,b]=hands,ca=center(a),cb=center(b);
  const scale=Math.max(.025,(Math.hypot(a.image[5].x-a.image[17].x,a.image[5].y-a.image[17].y)+Math.hypot(b.image[5].x-b.image[17].x,b.image[5].y-b.image[17].y))/2);
  const gap=Math.hypot(ca.x-cb.x,ca.y-cb.y)/scale;
  if(!this.start){if(gap>1.3)this.start={time:now,gap};return {detected:false,active:false};}
  if(now-this.start.time>2200){this.reset();return {detected:false,active:false};}
  if(gap<.8&&this.start.gap-gap>.65){this.touch??=now;this.minimum=Math.min(this.minimum,gap);}
  if(this.touch!==null&&gap-this.minimum>.3&&now-this.touch>=80&&now-this.start.time>=220){this.reset();return {detected:true,active:true};}
  return {detected:false,active:true,hint:'Possible MORE · gently bring your gathered fingertips together, then separate them.'};
 }
}
// Extends the existing tested gesture rules; uses real image/world landmarks.
export class EverydayRecognizer {
 constructor(){this.base=new SignRecognizer();this.selector=new SigningHandSelector();this.you=new YouDetector();this.more=new MoreDetector();}
 reset(){this.base.reset();this.selector.reset();this.you.reset();this.more.reset();}
 update(rawHands,face,now){
  const hands=this.selector.select(rawHands,now);
  const you=this.you.update(hands,now),more=this.more.update(rawHands,now);
  if(this.base.gate.locked)return this.base.update(rawHands,null,now);
  const base=this.base.update(rawHands,null,now);
  const completed=[...(base.phrase?[base.phrase]:[]),...(you.detected?['You']:[]),...(more.detected?['More']:[])];
  if(completed.length>1){this.reset();return {hint:'That movement was ambiguous. Relax and try again.'};}
  if(completed.length===1){this.base.gate.lock(now);this.base.resetDetectors();return {phrase:completed[0],hint:`Looks like ${completed[0].toUpperCase()} · pause before the next gesture.`};}
  return you.active?you:more.active?more:base;
 }
}
