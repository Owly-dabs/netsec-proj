import { mountPlant } from './plant.js';
import { AttackController } from './attack-controller.js';
const events=document.querySelector('#events');
let plant,controller;
function updateLogFade(){
 events.dataset.atTop=String(events.scrollTop<=1);
 events.dataset.atBottom=String(events.scrollHeight-events.clientHeight-events.scrollTop<=1);
}
events.addEventListener('scroll',updateLogFade,{passive:true});
new ResizeObserver(updateLogFade).observe(events);
updateLogFade();
function log(kind,text){
 const previousHeight=events.scrollHeight,readingHistory=events.scrollTop>8;
 const row=document.createElement('li'),time=document.createElement('time'),label=document.createElement('span'),message=document.createElement('span');
 const now=new Date();time.dateTime=now.toISOString();time.textContent=now.toLocaleTimeString('en-GB')+'.'+String(now.getMilliseconds()).padStart(3,'0');
 label.className='log-level';label.textContent=kind==='monitor'?'MONITORING':kind.toUpperCase();message.className='log-message';message.textContent=text;
 row.dataset.kind=kind;row.title=`${time.textContent} ${label.textContent} ${text}`;row.append(time,label,message);events.prepend(row);
 if(readingHistory)events.scrollTop+=events.scrollHeight-previousHeight;else events.scrollTop=0;
 updateLogFade();
}
function attack(stage,component){return controller.toggle({componentId:component.userData.id,stage,name:`${stage} / ${component.userData.id}`,component});}
try{
 plant=mountPlant(document.querySelector('canvas'),attack);
 controller=new AttackController({
  retryMisses:true,
  repairDelay:3500,
  onStart:target=>plant.select(target.stage,target.component),
  onState:(id,state)=>plant.setState(id,state),
  onSuspicion:(stage,on)=>plant.setSuspicion(stage,on),
  onMonitoring:phase=>plant.setMonitoring(phase),
  onEvent:log,
  detect:async(input,signal)=>{const response=await fetch('/api/attacks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal});if(!response.ok)throw Error('API error');return response.json();}
 });
 controller.start();
}catch(error){document.querySelector('#graphics-error').hidden=false;console.error(error);}
// Auto mode starts one random attack every 2–3.5 s on idle equipment, with at most
// four attacks open at one time. It is off by default. Turning it off stops new
// attacks only; attacks already running continue to detection or repair.
const autoButton=document.querySelector('#auto');let autoTimer=null;
function autoAttack(){
 if(!plant||!controller)return;
 const busy=new Set(controller.snapshot().map(t=>t.componentId));if(busy.size>=4)return;
 const free=plant.components().filter(c=>!busy.has(c.id));if(!free.length)return;
 const id=free[Math.floor(Math.random()*free.length)].id;let target=null;
 plant.scene.traverse(o=>{if(!target&&o.userData.id===id&&o.userData.stage)target=o;});
 if(target)attack(target.userData.stage,target);
}
function scheduleAuto(delay){autoTimer=setTimeout(()=>{autoAttack();scheduleAuto(2000+Math.random()*1500);},delay);}
autoButton.addEventListener('click',()=>{
 const on=autoButton.getAttribute('aria-pressed')!=='true';autoButton.setAttribute('aria-pressed',String(on));
 clearTimeout(autoTimer);autoTimer=null;if(on)scheduleAuto(800);
});
if(!plant)autoButton.hidden=true;
window.addEventListener('pagehide',()=>clearTimeout(autoTimer));
window.__plant=plant;
window.__attacks=controller;
window.addEventListener('pagehide',()=>controller?.dispose());
