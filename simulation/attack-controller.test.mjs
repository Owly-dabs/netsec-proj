import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AttackController } from './public/attack-controller.js';
class Clock {
 time=0;next=0;jobs=new Map();
 schedule=(fn,delay)=>{const id=++this.next;this.jobs.set(id,{fn,at:this.time+delay});return id;};
 cancel=id=>this.jobs.delete(id);
 tick(ms){const end=this.time+ms;while(true){const first=[...this.jobs].filter(([,j])=>j.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;this.jobs.delete(first[0]);this.time=first[1].at;first[1].fn();}this.time=end;}
}
const target=(id,stage='P1')=>({componentId:id,stage,name:id});
const response=(input,detected)=>({targetResults:input.targets.map(t=>({...t,stage:t.componentId==='UF'?'P3':'P1',detected:detected(t.componentId)}))});
function setup(options={}){const clock=new Clock(),states=[],calls=[];let next=0;const controller=new AttackController({repairDelay:1400,schedule:clock.schedule,cancel:clock.cancel,idFactory:()=>`attack-${++next}`,onState:(...v)=>states.push(v),detect:async input=>{calls.push(input);return response(input,id=>id==='T101');},...options});return {clock,states,calls,controller};}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('repairing a detected component leaves a missed component in the SAME stage active',async()=>{
 const {controller,clock,states}=setup();await controller.toggle(target('P101'));await controller.toggle(target('T101'));
 assert.equal(controller.active.get('P101').state,'missed');assert.equal(controller.active.get('T101').state,'repairing');clock.tick(1400);
 assert.deepEqual(controller.snapshot().map(t=>[t.componentId,t.state]),[['P101','missed']]);assert.equal(states.some(([id,state])=>id==='P101'&&state==='resolved'),false);controller.dispose();
});
test('repairing a component leaves a missed component in ANOTHER stage active',async()=>{
 const {controller,clock}=setup();await controller.toggle(target('UF','P3'));await controller.toggle(target('T101'));clock.tick(1400);
 assert.deepEqual(controller.snapshot().map(t=>[t.componentId,t.state]),[['UF','missed']]);controller.dispose();
});
test('misses can be detected by a later explicit monitoring check',async()=>{
 let attempt=0;const {controller,clock,calls}=setup({retryMisses:true,detect:async input=>{calls.push(input);return response(input,()=>++attempt>1);}});
 await controller.toggle(target('P101'));assert.equal(controller.active.get('P101').state,'missed');clock.tick(3000);await flush();assert.equal(calls[1].recheck,true);assert.equal(calls[1].targets[0].attackId,calls[0].targets[0].attackId);assert.equal(controller.active.get('P101').state,'repairing');clock.tick(1400);assert.equal(controller.active.size,0);controller.dispose();
});
test('fixed-miss mode does not schedule later monitoring',async()=>{
 const {controller,clock,calls}=setup({retryMisses:false});await controller.toggle(target('P101'));clock.tick(60000);await flush();assert.equal(calls.length,1);assert.equal(controller.active.get('P101').state,'missed');controller.dispose();
});
test('old repair timers cannot clear a replacement attack on the same component',async()=>{
 const {controller,clock}=setup();await controller.toggle(target('T101'));const first=controller.active.get('T101').attackId;clock.tick(400);await controller.toggle(target('T101'));await controller.toggle(target('T101'));const second=controller.active.get('T101').attackId;assert.notEqual(first,second);clock.tick(1000);assert.equal(controller.active.get('T101').attackId,second);clock.tick(400);assert.equal(controller.active.size,0);controller.dispose();
});
test('stale responses do not change a newer attack instance',async()=>{
 let finish;const {controller}=setup({detect:input=>new Promise(resolve=>finish=()=>resolve(response(input,()=>true)))});
 const old=controller.toggle(target('T101'));const oldFinish=finish;await controller.toggle(target('T101'));const newer=controller.toggle(target('T101'));const id=controller.active.get('T101').attackId;oldFinish();await old;assert.equal(controller.active.get('T101').attackId,id);assert.equal(controller.active.get('T101').state,'pending');finish();await newer;controller.dispose();
});
test('stage-only results never auto-repair individual components',async()=>{
 const {controller,clock,states}=setup({detect:async()=>({predictedStages:[1]})});await controller.toggle(target('P101'));clock.tick(1400);assert.equal(controller.active.get('P101').state,'error');assert.equal(states.some(([,state])=>state==='resolved'),false);controller.dispose();
});

test('monitor starts before any click and continues during normal idle operation',async()=>{
 const {controller,clock,calls}=setup();await controller.start();assert.equal(calls.length,1);assert.deepEqual(calls[0].targets,[]);
 clock.tick(3000);await flush();assert.equal(calls.length,2);assert.equal(calls[1].recheck,false);
 controller.dispose();clock.tick(3000);await flush();assert.equal(calls.length,2);
});
test('false-positive verification dismisses suspicion without repairing missed attacks',async()=>{
 const suspicion=[],events=[];const {controller,clock,states}=setup({onSuspicion:(...v)=>suspicion.push(v),onEvent:(...v)=>events.push(v),detect:async input=>({...response(input,()=>false),predictedStages:[2]})});
 await controller.toggle(target('P101'));assert.equal(controller.active.get('P101').state,'missed');
 assert.deepEqual(suspicion,[['P2',true]]);clock.tick(1400);
 assert.deepEqual(suspicion,[['P2',true],['P2',false]]);assert.equal(controller.active.get('P101').state,'missed');
 assert.ok(events.some(([kind])=>kind==='dismissed'));assert.ok(!states.some(([,state])=>state==='resolved'));controller.dispose();
});
test('attack during an idle request rejects the old idle alarm',async()=>{
 const finishes=[],suspicion=[];const {controller}=setup({onSuspicion:(...v)=>suspicion.push(v),detect:input=>new Promise(resolve=>finishes.push(()=>resolve({...response(input,()=>false),predictedStages:input.targets.length?[]:[1]})))});
 const idle=controller.start();const attack=controller.toggle(target('P101'));finishes[0]();await idle;
 assert.deepEqual(suspicion,[]);assert.equal(controller.active.get('P101').state,'pending');finishes[1]();await attack;
 assert.equal(controller.active.get('P101').state,'missed');controller.dispose();
});
test('new attack cancels same-stage suspicion without an old dismissal changing it',async()=>{
 const suspicion=[];const {controller,clock}=setup({onSuspicion:(...v)=>suspicion.push(v),detect:async input=>({...response(input,()=>false),predictedStages:[1]})});
 await controller.start();assert.deepEqual(suspicion,[['P1',true]]);
 await controller.toggle(target('P101'));clock.tick(1400);assert.equal(controller.active.get('P101').state,'missed');
 assert.deepEqual(suspicion,[['P1',true],['P1',false]]);controller.dispose();
});

test('NORMAL requires a completed healthy result; monitoring and unresolved attacks are distinct',async()=>{
 const phases=[],events=[];let finish;
 const {controller}=setup({onMonitoring:p=>phases.push(p),onEvent:(...e)=>events.push(e),detect:input=>new Promise(resolve=>finish=()=>resolve(response(input,()=>false)))});
 const idle=controller.start();assert.deepEqual(phases,['monitoring']);assert.ok(!events.some(([kind])=>kind==='normal'));
 finish();await idle;assert.equal(phases.at(-1),'normal');
 const attack=controller.toggle(target('P101'));assert.equal(phases.at(-1),'monitoring');finish();await attack;
 assert.equal(phases.at(-1),'result');assert.equal(events.filter(([kind])=>kind==='normal').length,1);controller.dispose();
});

test('new clicks do not abort or repeat an in-flight batch; responses can finish out of order',async()=>{
 const requests=[];const {controller,clock}=setup({detect:(input,signal)=>new Promise(resolve=>requests.push({input,signal,finish:()=>resolve(response(input,()=>true))}))});
 const first=controller.toggle(target('T101'));clock.tick(900);
 const second=controller.toggle(target('P101'));clock.tick(900);
 const third=controller.toggle(target('UF','P3'));
 assert.deepEqual(requests.map(r=>r.input.targets.map(t=>t.componentId)),[['T101'],['P101'],['UF']]);
 assert.ok(requests.every(r=>!r.signal.aborted));
 requests[1].finish();await second;assert.equal(controller.active.get('P101').state,'repairing');
 assert.equal(controller.active.get('T101').state,'pending');
 requests[0].finish();await first;assert.equal(controller.active.get('T101').state,'repairing');
 requests[2].finish();await third;clock.tick(1400);assert.equal(controller.active.size,0);controller.dispose();
});
test('clicks cannot postpone a missed attack recheck or the background check',async()=>{
 const requests=[];const {controller,clock}=setup({retryMisses:true,detect:async(input,signal)=>{requests.push({input,signal});return response(input,()=>false);}});
 await controller.start();await controller.toggle(target('P101'));clock.tick(1500);
 await controller.toggle(target('UF','P3'));clock.tick(1500);await flush();
 const checks=requests.filter(r=>r.input.recheck);assert.equal(checks.length,1);
 assert.deepEqual(checks[0].input.targets.map(t=>t.componentId),['P101']);
 assert.equal(requests.filter(r=>!r.input.targets.length).length,2);
 assert.equal(controller.active.get('UF').state,'missed');controller.dispose();
});
test('an old idle result cannot announce NORMAL while another batch has an attack',async()=>{
 const requests=[],events=[];const {controller}=setup({onEvent:(...e)=>events.push(e),detect:input=>new Promise(resolve=>requests.push(()=>resolve(response(input,()=>true))))});
 const idle=controller.start();const attack=controller.toggle(target('T101'));
 requests[0]();await idle;assert.ok(!events.some(([kind])=>kind==='normal'));
 requests[1]();await attack;controller.dispose();
});
test('one failed batch leaves another batch and its response active',async()=>{
 const requests=[];const {controller}=setup({detect:(input,signal)=>new Promise((resolve,reject)=>requests.push({signal,reject,finish:()=>resolve(response(input,()=>true))}))});
 const first=controller.toggle(target('P101'));const second=controller.toggle(target('T101'));
 requests[0].reject(Error('network'));await first;assert.equal(controller.active.get('P101').state,'error');
 assert.equal(requests[1].signal.aborted,false);requests[1].finish();await second;
 assert.equal(controller.active.get('T101').state,'repairing');controller.dispose();
});
test('dispose aborts all independent requests and ignores their late results',async()=>{
 const requests=[],states=[];const {controller,clock}=setup({onState:(...s)=>states.push(s),detect:(input,signal)=>new Promise(resolve=>requests.push({signal,finish:()=>resolve(response(input,()=>true))}))});
 const a=controller.toggle(target('P101')),b=controller.toggle(target('T101'));controller.dispose();
 assert.ok(requests.every(r=>r.signal.aborted));requests.forEach(r=>r.finish());await Promise.all([a,b]);clock.tick(60000);
 assert.deepEqual(states,[]);assert.equal(clock.jobs.size,0);
});

test('idle monitoring stays live without repeating normal and monitoring log rows',async()=>{
 const events=[];const {controller,clock,calls}=setup({onEvent:(...e)=>events.push(e)});await controller.start();
 for(let i=0;i<6;i++){clock.tick(3000);await flush();}
 assert.equal(calls.length,7);assert.equal(events.filter(([k])=>k==='monitor').length,1);assert.equal(events.filter(([k])=>k==='normal').length,1);controller.dispose();
});
test('a persistent missed attack logs one miss while rechecks continue',async()=>{
 const events=[];const {controller,clock,calls}=setup({retryMisses:true,onEvent:(...e)=>events.push(e)});await controller.toggle(target('P101'));
 for(let i=0;i<4;i++){clock.tick(3000);await flush();}
 assert.equal(calls.length,5);assert.equal(events.filter(([k])=>k==='missed').length,1);assert.equal(events.filter(([k])=>k==='monitor').length,1);assert.equal(controller.active.get('P101').state,'missed');controller.dispose();
});
test('default repair keeps verification visible for 3.5 seconds',async()=>{
 const {controller,clock}=setup({repairDelay:undefined});await controller.toggle(target('T101'));clock.tick(1400);assert.equal(controller.active.get('T101').state,'repairing');clock.tick(2100);assert.equal(controller.active.size,0);controller.dispose();
});
test('log metadata links an attack through repair and separates a later attack on the same component',async()=>{
 const events=[];const {controller,clock}=setup({onEvent:(...e)=>events.push(e)});
 await controller.toggle(target('T101'));clock.tick(1400);await controller.toggle(target('T101'));
 const linked=events.filter(([kind])=>['attack','detected','resolved'].includes(kind));
 assert.deepEqual(linked.slice(0,3).map(e=>e[2].attackIds),[['attack-1'],['attack-1'],['attack-1']]);
 assert.deepEqual(linked.slice(3).map(e=>e[2].attackIds),[['attack-2'],['attack-2']]);controller.dispose();
});
