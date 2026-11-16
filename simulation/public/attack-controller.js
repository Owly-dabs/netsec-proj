// Each request owns an immutable batch. New clicks cannot cancel older batches.
export class AttackController {
 constructor({detect,onStart=()=>'',onState=()=>{},onEvent=()=>{},onSuspicion=()=>{},onMonitoring=()=>{},idFactory=()=>crypto.randomUUID(),schedule=(fn,delay)=>setTimeout(fn,delay),cancel=handle=>clearTimeout(handle),retryMisses=false,retryDelay=3000,repairDelay=3500,timeout=10000}){
  Object.assign(this,{detect,onStart,onState,onEvent,onSuspicion,onMonitoring,idFactory,schedule,cancel,retryMisses,retryDelay,repairDelay,timeout});
  this.active=new Map();this.repairTimers=new Map();this.verifications=new Map();
  this.batches=new Set();this.inFlight=new Map();this.retryTimers=new Map();
  this.stageVersions=new Map();this.revision=0;this.running=false;this.disposed=false;
 }
 changed(stage){this.revision++;this.stageVersions.set(stage,(this.stageVersions.get(stage)??0)+1);}
 start(){
  if(this.running||this.disposed)return;
  this.running=true;this.onEvent('demo','Dummy detector · simulated attacks and repairs');
  return this.monitor(false,[],true);
 }
 toggle(target){
  if(this.disposed)return;
  this.changed(target.stage);
  const verification=this.verifications.get(target.stage);
  if(verification){this.cancel(verification.timer);this.verifications.delete(target.stage);this.onSuspicion(target.stage,false);this.onEvent('monitor',`${target.stage} · verification cancelled`,{traceId:verification.traceId});}
  const previous=this.active.get(target.componentId);
  if(previous){
   this.cancel(this.repairTimers.get(previous.attackId));this.repairTimers.delete(previous.attackId);
   this.cancel(this.retryTimers.get(previous.attackId));this.retryTimers.delete(previous.attackId);
   this.active.delete(target.componentId);this.onState(target.componentId,'stopped');this.onEvent('resolved',`${previous.name} · attack stopped`,{componentId:previous.componentId,attackIds:[previous.attackId]});
   return;
  }
  const entry={...target,attackId:this.idFactory(),state:'pending'};
  entry.type=this.onStart(entry);this.active.set(entry.componentId,entry);this.status='alert';this.onEvent('attack',`${entry.name} · ${entry.type}`,{componentId:entry.componentId,attackIds:[entry.attackId]});
  return this.monitor(false,[entry]);
 }
 async monitor(recheck=false,candidates=[...this.active.values()],background=false){
  if(this.disposed)return;
  const pending=candidates.filter(t=>this.active.get(t.componentId)===t&&t.state!=='repairing'&&!this.inFlight.has(t.attackId));
  if(!pending.length&&!background)return;
  const batch={pending,abort:new AbortController(),revision:this.revision,stages:new Map(this.stageVersions)};
  this.batches.add(batch);
  for(const target of pending){
   this.inFlight.set(target.attackId,batch);
   this.cancel(this.retryTimers.get(target.attackId));this.retryTimers.delete(target.attackId);
  }
  const plantTargets=[...this.active.values()].map(({componentId,attackId})=>({componentId,attackId}));
  this.onMonitoring('monitoring');
  // The log records state changes only; repeated checks and rechecks add no rows.
  if(!this.monitorReported){this.monitorReported=true;this.onEvent('monitor','P1–P6 · checking');}
  const timeout=this.schedule(()=>batch.abort.abort('timeout'),this.timeout);
  try{
   const result=await this.detect({targets:pending.map(({componentId,attackId})=>({componentId,attackId})),plantTargets,modelInput:null,recheck},batch.abort.signal);
   if(this.disposed||(!background&&!pending.some(t=>this.active.get(t.componentId)===t)))return;
   if(batch.abort.signal.aborted)throw Error('Check timed out');
   if(!Array.isArray(result.targetResults)||result.targetResults.length!==pending.length)throw Error('Missing per-attack results');
   const results=new Map();
   for(const item of result.targetResults){
    const target=pending.find(t=>t.attackId===item.attackId);
    if(!target||target.componentId!==item.componentId||target.stage!==item.stage||typeof item.detected!=='boolean'||results.has(item.attackId))throw Error('Invalid per-attack result');
    results.set(item.attackId,item);
   }
   const predicted=result.predictedStages??[];
   if(!Array.isArray(predicted)||predicted.some(s=>!Number.isInteger(s)||s<1||s>6))throw Error('Invalid stage predictions');
   // Verify only healthy stages whose truth has not changed since this batch.
   for(const stageNumber of new Set(predicted)){
    const stage=`P${stageNumber}`;
    if((batch.stages.get(stage)??0)!==(this.stageVersions.get(stage)??0)||[...this.active.values()].some(t=>t.stage===stage)||this.verifications.has(stage))continue;
    const token={traceId:this.idFactory()};this.verifications.set(stage,token);this.onSuspicion(stage,true);
    this.status='alert';this.onEvent('verify',`${stage} · checking alarm`,{traceId:token.traceId});
    token.timer=this.schedule(()=>{
     if(this.verifications.get(stage)!==token)return;
     this.verifications.delete(stage);this.onSuspicion(stage,false);
     this.onEvent('dismissed',`${stage} · false positive confirmed`,{traceId:token.traceId});
    },this.repairDelay);
   }
   if(background&&batch.revision===this.revision&&!this.active.size&&!predicted.length&&!this.verifications.size&&this.batches.size===1){
    this.onMonitoring('normal');if(this.status!=='normal'){this.status='normal';this.onEvent('normal','P1–P6 · all clear');}
   }else this.onMonitoring(this.batches.size>1?'monitoring':'result');
   for(const target of pending){
    if(this.active.get(target.componentId)!==target||target.state==='repairing')continue;
    if(!results.get(target.attackId).detected){
     target.state='missed';this.onState(target.componentId,'missed');if(!target.missReported){target.missReported=true;this.onEvent('missed',`${target.name} · not detected`,{componentId:target.componentId,attackIds:[target.attackId]});}continue;
    }
    target.state='repairing';this.onState(target.componentId,'repairing');this.onEvent('detected',`${target.name} · repair started`,{componentId:target.componentId,attackIds:[target.attackId]});
    const timer=this.schedule(()=>{
     this.repairTimers.delete(target.attackId);
     if(this.active.get(target.componentId)!==target||target.state!=='repairing')return;
     this.active.delete(target.componentId);this.changed(target.stage);this.onState(target.componentId,'resolved');this.onEvent('resolved',`${target.name} · repair complete`,{componentId:target.componentId,attackIds:[target.attackId]});
    },this.repairDelay);
    this.repairTimers.set(target.attackId,timer);
   }
  }catch(error){
   if(!this.disposed&&(background||pending.some(t=>this.active.get(t.componentId)===t))){
    this.onMonitoring('error');
    for(const target of pending)if(this.active.get(target.componentId)===target&&target.state!=='repairing'){target.state='error';this.onState(target.componentId,'error');}
    if(this.status!=='error'){this.status='error';this.onEvent('error',`${background?'P1–P6':pending.map(t=>t.name).join(', ')} · check failed`,{attackIds:pending.map(t=>t.attackId)});}
   }
  }finally{
   this.cancel(timeout);this.batches.delete(batch);
   for(const target of pending){
    if(this.inFlight.get(target.attackId)===batch)this.inFlight.delete(target.attackId);
    if(!this.disposed&&this.retryMisses&&this.active.get(target.componentId)===target&&(target.state==='missed'||target.state==='error')){
     const timer=this.schedule(()=>{this.retryTimers.delete(target.attackId);void this.monitor(true,[target]);},this.retryDelay);
     this.retryTimers.set(target.attackId,timer);
    }
   }
   // The whole-plant lane has its own clock. Component clicks never reset it.
   if(!this.disposed&&this.running&&background)this.backgroundTimer=this.schedule(()=>this.monitor(false,[],true),this.retryDelay);
  }
 }
 snapshot(){return [...this.active.values()].map(({componentId,attackId,stage,state})=>({componentId,attackId,stage,state}));}
 dispose(){
  this.disposed=true;this.running=false;this.onMonitoring('stopped');this.cancel(this.backgroundTimer);
  for(const batch of this.batches)batch.abort.abort();this.batches.clear();this.inFlight.clear();
  for(const [stage,entry] of this.verifications){this.cancel(entry.timer);this.onSuspicion(stage,false);}this.verifications.clear();
  for(const timer of this.retryTimers.values())this.cancel(timer);this.retryTimers.clear();
  for(const timer of this.repairTimers.values())this.cancel(timer);this.repairTimers.clear();
 }
}
