import {test} from 'node:test';
import assert from 'node:assert/strict';
import {flowSpeed} from './public/visual-response.js';
test('local stalled attack wins over overspeed and unrelated repair',()=>{
 assert.equal(flowSpeed([{state:'missed',variant:1},{state:'pending',variant:0}],0),0);
 assert.equal(flowSpeed([{state:'missed',variant:1},{state:'repairing',variant:0}],0),0);
 assert.equal(flowSpeed([{state:'repairing',variant:1}],0),2.2);
 assert.equal(flowSpeed([],0),2.2);
});
test('trip varies continuously and remains forward',()=>{
 for(let t=0;t<6;t+=.01){const v=flowSpeed([{state:'missed',variant:2}],t);assert.ok(v>=0&&v<=2.2);assert.ok(Math.abs(v-flowSpeed([{state:'missed',variant:2}],t+.001))<.004);}
});
