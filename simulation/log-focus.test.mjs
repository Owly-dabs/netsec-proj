import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LogFocus } from './public/log-focus.js';
function setup(){
 globalThis.matchMedia=()=>({matches:false});
 globalThis.document={addEventListener(){}};
 globalThis.getComputedStyle=()=>({opacity:'1'});
 const list={scrollTop:0,dataset:{},animations:0,children:[],addEventListener(){},getAnimations(){return [];},append(row){this.children=this.children.filter(r=>r!==row);this.children.push(row);},animate(){this.animations++;return {finished:Promise.resolve(),cancel(){}};}};
 const focus=new LogFocus(list);
 const add=(attackId)=>{const row={attributes:{},classList:{toggle(){}},setAttribute(k,v){this.attributes[k]=v;}};focus.add(row,{componentId:'T101',attackIds:[attackId]});list.children.unshift(row);return row;};
 return {list,focus,add};
}
test('focus selects only one attack lifetime on a repeatedly attacked component',async()=>{
 const {list,focus,add}=setup();const start=add('one'),result=add('one'),later=add('two');
 await focus.focus(start);
 assert.equal(start.hidden,false);assert.equal(result.hidden,false);assert.equal(later.hidden,true);
 await focus.focus(null);assert.ok(list.children.every(row=>!row.hidden));
});
test('incoming results and unrelated logs retain focus without replaying transitions',async()=>{
 const {list,focus,add}=setup();const start=add('one');await focus.focus(start);
 const count=list.animations;const unrelated=add('two');focus.refresh();const result=add('one');focus.refresh();await focus.focus(start);
 assert.equal(list.animations,count);assert.equal(unrelated.hidden,true);assert.equal(result.hidden,false);assert.equal(result.attributes['aria-pressed'],'true');
});
