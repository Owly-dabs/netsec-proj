import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDetection as detect } from './detector.mjs';
import { server } from './server.mjs';
const createDetection=(input,random,outcomes)=>detect(input,random,outcomes,{falseAlarmProbability:0});
const input={targets:[{componentId:'T101',attackId:'a'},{componentId:'P101',attackId:'b'},{componentId:'UF',attackId:'c'}],modelInput:null};
test('concurrent components use independent stage outcomes and exact stage-set evaluation',()=>{
 const detected=createDetection(input,()=>.799999);assert.deepEqual(detected.attackedStages,[1,3]);assert.deepEqual(detected.predictedStages,[1,3]);assert.deepEqual(detected.stageAlarms,[true,false,true,false,false,false]);assert.equal(detected.correct,true);
 const missed=createDetection(input,()=>.8);assert.deepEqual(missed.predictedStages,[]);assert.equal(missed.correct,false);assert.equal(missed.targets.length,3);
 const sequence=[.1,.9,.9,0];const partial=createDetection(input,()=>sequence.shift());assert.deepEqual(partial.predictedStages,[1]);assert.equal(partial.correct,false);assert.equal(partial.delayMs,2000);assert.equal(partial.targetResults[1].detected,false);
});
test('model input is ordered finite (T,N), with no label or timestamps in features',()=>{
 assert.doesNotThrow(()=>createDetection({...input,modelInput:{columns:['FIT101','LIT301'],values:[[1,2],[3,4]]}}));
 for(const modelInput of [{columns:['label'],values:[[1]]},{columns:['FIT101'],values:[[1,2]]},{columns:['FIT101'],values:[[NaN]]}])assert.throws(()=>createDetection({...input,modelInput}),RangeError);
 assert.throws(()=>createDetection({targets:[{componentId:'unknown'}]}),RangeError);
 assert.throws(()=>createDetection({targets:[{componentId:'UF',attackId:'c'},{componentId:'UF',attackId:'c'}]}),RangeError);
});
test('API accepts concurrent targets, rejects invalid input, and delays its result',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 try{const post=body=>fetch(url+'/api/attacks',{method:'POST',body});assert.equal((await post('{')).status,400);const idle=await post('{"targets":[]}');assert.equal(idle.status,200);assert.deepEqual((await idle.json()).targetResults,[]);
 const start=performance.now(),response=await post(JSON.stringify(input)),data=await response.json();assert.equal(response.status,200);assert.equal(data.simulated,true);assert.equal(data.targets.length,3);assert.ok(performance.now()-start>=1950);assert.equal(data.stageAlarms.length,6);
 assert.equal((await fetch(url+'/')).status,200);assert.equal((await fetch(url+'/../server.mjs')).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('unrelated requests keep an existing miss; only an explicit recheck may detect it',()=>{
 const outcomes=new Map(),a={targets:[{componentId:'P101',attackId:'cached-miss'}]};
 assert.equal(createDetection(a,()=>.9,outcomes).targetResults[0].detected,false);
 const other={targets:[...a.targets,{componentId:'UF',attackId:'other'}]};
 const result=createDetection(other,()=>0,outcomes);assert.equal(result.targetResults[0].detected,false);assert.equal(result.targetResults[1].detected,true);
 assert.equal(createDetection({...a,recheck:true},()=>0,outcomes).targetResults[0].detected,true);
});
test('same-stage detection is not component attribution',()=>{
 const values=[.1,.9,0];const result=createDetection({targets:input.targets.slice(0,2)},()=>values.shift());
 assert.deepEqual(result.predictedStages,[1]);assert.equal(result.stageCorrect,true);assert.equal(result.correct,false);assert.equal(result.targetResults[1].detected,false);
});

test('rare alarm is one plant-wide trial on a healthy stage, separate from attack detection',()=>{
 const input={targets:[{componentId:'T101',attackId:'miss'}]};
 let calls=0;
 const result=detect(input,()=>.9,new Map(),{falseAlarmRandom:()=>{calls++;return 0;}});
 assert.equal(calls,2);assert.equal(result.targetResults[0].detected,false);
 assert.deepEqual(result.attackedStages,[1]);assert.deepEqual(result.predictedStages,[2]);
 assert.equal(result.stageCorrect,false);assert.equal(result.correct,false);
 const idle=detect({targets:[]},()=>.9,new Map(),{falseAlarmRandom:()=>0});
 assert.deepEqual(idle.targets,[]);assert.deepEqual(idle.targetResults,[]);assert.deepEqual(idle.predictedStages,[1]);
 const boundary=detect({targets:[]},()=>0,new Map(),{falseAlarmRandom:()=>.001});
 assert.deepEqual(boundary.predictedStages,[]);
});

test('plant context excludes other active batches from false alarms without checking them again',()=>{
 const outcomes=new Map(),plantTargets=[{componentId:'T101',attackId:'one'},{componentId:'UF',attackId:'two'}];
 const first=detect({targets:[plantTargets[0]],plantTargets},()=>.9,outcomes,{falseAlarmProbability:0});
 assert.equal(first.targetResults.length,1);assert.equal(outcomes.has('two'),false);
 const next=detect({targets:[plantTargets[1]],plantTargets},()=>.1,outcomes,{falseAlarmRandom:()=>0});
 assert.deepEqual(next.attackedStages,[1,3]);assert.deepEqual(next.predictedStages,[2,3]);
 assert.equal(next.targetResults.length,1);assert.equal(outcomes.get('one').detected,false);
 const idle=detect({targets:[],plantTargets,recheck:true},()=>.9,outcomes,{falseAlarmProbability:0});
 assert.deepEqual(idle.targetResults,[]);assert.deepEqual(idle.predictedStages,[3]);
 assert.throws(()=>detect({targets:[plantTargets[0]],plantTargets:[]}),RangeError);
});
