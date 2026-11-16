import { randomInt, randomUUID } from 'node:crypto';
import { EQUIPMENT } from './public/equipment.js';
export function validateInput(input){
 if(!input||!Array.isArray(input.targets)||input.targets.length>EQUIPMENT.length)throw new RangeError('Expected a component target list');
 const ids=input.targets.map(t=>t.componentId),attackIds=input.targets.map(t=>t.attackId);
 if(new Set(ids).size!==ids.length||new Set(attackIds).size!==attackIds.length)throw new RangeError('Duplicate attack or component');
 const targets=input.targets.map(({componentId,attackId})=>{const target=EQUIPMENT.find(t=>t.componentId===componentId);if(!target)throw new RangeError('Unknown component');if(typeof attackId!=='string'||!/^[\w-]{1,80}$/.test(attackId))throw new RangeError('Invalid attack ID');return {...target,attackId};});
 if(input.recheck!==undefined&&typeof input.recheck!=='boolean')throw new RangeError('Invalid recheck flag');
 // Numeric (T,N) input stays separate from attack ground truth.
 if(input.modelInput!=null){const {columns,values}=input.modelInput;
  if(!Array.isArray(columns)||!columns.length||columns.some(c=>typeof c!=='string'||!/^[A-Z]+\d+$/.test(c))||new Set(columns).size!==columns.length)throw new RangeError('Invalid signal columns');
  if(!Array.isArray(values)||!values.length||values.length>10000||values.some(row=>!Array.isArray(row)||row.length!==columns.length||row.some(v=>typeof v!=='number'||!Number.isFinite(v))))throw new RangeError('Expected finite numeric values with shape (T,N)');
 }
 return targets;
}
const secureRandom=()=>randomInt(1_000_000)/1_000_000;
export const FALSE_ALARM_PROBABILITY=0.001; // One trial per whole-plant check, not per signal.
export function createDetection(input,random=secureRandom,outcomes=new Map(),{falseAlarmRandom=secureRandom,falseAlarmProbability=FALSE_ALARM_PROBABILITY}={}){
 const targets=validateInput(input);
 // Full plant truth is context only. Only this batch's targets get new checks.
 const plantTargets=input.plantTargets===undefined?targets:validateInput({targets:input.plantTargets});
 if(targets.some(t=>!plantTargets.some(p=>p.attackId===t.attackId&&p.componentId===t.componentId)))throw new RangeError('Batch target missing from plant context');
 for(const target of plantTargets){const previous=outcomes.get(target.attackId);if(previous&&(previous.componentId!==target.componentId||previous.stage!==target.stage))throw new RangeError('Attack ID belongs to another target');}
 const targetResults=targets.map(target=>{
  const previous=outcomes.get(target.attackId);
  if(previous&&(previous.componentId!==target.componentId||previous.stage!==target.stage))throw new RangeError('Attack ID belongs to another target');
  const detected=previous&&(!input.recheck||previous.detected)?previous.detected:random()<.8;
  const result={...target,detected};outcomes.set(target.attackId,result);return result;
 });
 const attackedStages=[...new Set(plantTargets.map(t=>Number(t.stage.slice(1))))].sort();
 const predictedStages=[...new Set(plantTargets.filter(t=>outcomes.get(t.attackId)?.detected).map(t=>Number(t.stage.slice(1))))].sort(),stageIds=[1,2,3,4,5,6];
 const healthyStages=stageIds.filter(s=>!attackedStages.includes(s));
 if(healthyStages.length&&falseAlarmRandom()<falseAlarmProbability)predictedStages.push(healthyStages[Math.min(healthyStages.length-1,Math.floor(falseAlarmRandom()*healthyStages.length))]);
 predictedStages.sort((a,b)=>a-b);
 return {id:randomUUID(),simulated:true,detector:'dummy',targetResults,attackedStages,predictedStages,stageIds,stageAlarms:stageIds.map(s=>predictedStages.includes(s)),targets,plantTargets,correct:plantTargets.every(t=>outcomes.get(t.attackId)?.detected)&&predictedStages.every(s=>attackedStages.includes(s)),stageCorrect:attackedStages.length===predictedStages.length&&attackedStages.every(s=>predictedStages.includes(s)),delayMs:2000+Math.floor(random()*1000),scores:null};
}
