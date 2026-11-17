import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_DIM, validateSample, trainClassifier, predict, evaluateClassifier, sequenceDistance } from './personal-recognizer.js';
import { constructSentence } from './sentence-builder.js';
// Synthetic feature vectors test the algorithm, not sign-language accuracy.
function take(label, center, variation, split='train', frames=8) {
  return { id: `${label}-${center}-${variation}-${split}-${frames}`, label, split, dim: FEATURE_DIM, frames,
    data: Array.from({length:frames*FEATURE_DIM},(_,i)=>center+variation+.01*Math.sin(Math.floor(i/FEATURE_DIM)/(frames-1)*Math.PI)+(i%7)*.0001) };
}
const dataset=()=>['I','NEED','HELP','NONE'].flatMap((label,index)=>[0,.004,.008].map(delta=>take(label,index*.5,delta)));
test('requires fresh multi-class training and explicit background examples',()=>{
  assert.throws(()=>trainClassifier([]),/at least two signs/);
  assert.throws(()=>trainClassifier(dataset().filter(s=>s.label!=='NONE')),/NONE/);
  assert.throws(()=>trainClassifier(dataset().filter(s=>s.label!=='HELP'||s.id.includes('-0-train'))),/3 training takes/);
});
test('time alignment accepts different sample lengths',()=>{
  const short=take('I',0,0,'train',8), long=take('I',0,0,'test',16);
  assert(sequenceDistance(short,long)<.01);
  assert(validateSample(long));
  assert(!validateSample({...long,data:[NaN]}));
});
test('learns labeled movement examples and rejects unfamiliar sequences',()=>{
  const model=trainClassifier(dataset());
  assert.equal(predict(model,take('I',0,.003,'test')).label,'I');
  assert.equal(predict(model,take('NONE',1.5,.003,'test')).label,'NONE');
  assert.equal(predict(model,take('I',6,0,'test')).label,'UNKNOWN');
});
test('ambiguous between-class sequences are not forced into a sign',()=>{
  const data=['I','NEED','NONE'].flatMap((label,index)=>[0,.002,.004].map(delta=>take(label,index===2?1:index*.04,delta)));
  assert.equal(predict(trainClassifier(data),take('I',.022,0,'test')).label,'UNKNOWN');
});
test('evaluation excludes training and exposes minimum test coverage',()=>{
  const data=dataset(), model=trainClassifier(data);
  assert.throws(()=>evaluateClassifier(model,data),/new test takes/);
  assert.throws(()=>evaluateClassifier(model,[{...data[0],split:'test'}]),/duplicates training/);
  const one=['I','NEED','HELP','NONE'].map((label,index)=>take(label,index*.5,.003,'test'));
  assert.equal(evaluateClassifier(model,one).passed,false);
  const fresh=['I','NEED','HELP','NONE'].flatMap((label,index)=>[.003,.006].map(delta=>take(label,index*.5,delta,'test')));
  const result=evaluateClassifier(model,fresh);
  assert.equal(result.total,8);assert.equal(result.passed,true);assert.equal(result.falseTriggers,0);
  assert.throws(()=>evaluateClassifier(model,[...fresh,{...fresh[0],id:'renamed'}]),/Duplicate test/);
});
test('wrong sign on background fails the evaluation gate',()=>{
  const model=trainClassifier(dataset());
  const fresh=['I','NEED','HELP','NONE'].flatMap((label,index)=>[.003,.006].map(delta=>take(label,label==='NONE'?0:index*.5,delta,'test')));
  // NONE-labeled takes deliberately contain I-like features, a false-trigger case.
  fresh.filter(s=>s.label==='NONE').forEach(s=>{s.data=s.data.map(v=>v+.0002);});
  const result=evaluateClassifier(model,fresh);
  assert.equal(result.falseTriggers,2);assert.equal(result.passed,false);
});
test('accepted predicted concepts construct a sentence without missing-word invention',()=>{
  const model=trainClassifier(dataset());
  const concepts=['I','NEED','HELP'].map((label,index)=>predict(model,take(label,index*.5,.003,'test')).label);
  assert.equal(constructSentence(concepts,{complete:true}).sentence,'I need help.');
  assert.equal(constructSentence(concepts.slice(0,2),{complete:true}).sentence,'');
});
test('evaluation retains ranked matches and hand-coverage diagnostics',()=>{
  const model=trainClassifier(dataset());
  const report=evaluateClassifier(model,[take('HELP',1,.003,'test')]);
  assert.equal(report.records[0].expected,'HELP');
  assert.equal(report.records[0].ranked.length,3);
  assert.equal(report.records[0].quality.frames,8);
  assert.equal(report.trainingQuality.length,4);
});
