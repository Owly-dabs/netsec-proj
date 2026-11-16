// Keep the original rows and order. Focus changes presentation, never history.
export class LogFocus {
 constructor(list,onLayout=()=>{}){
  this.list=list;this.onLayout=onLayout;this.rows=[];this.keys=new WeakMap();this.selected=null;
  this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
  list.addEventListener('click',e=>{const row=e.target.closest('li');if(row&&list.contains(row))this.toggle(row);});
  list.addEventListener('keydown',e=>{
   if(e.key==='Escape'){e.preventDefault();this.focus(null,false);}
   else if((e.key==='Enter'||e.key===' ')&&e.target.matches('li')){e.preventDefault();this.toggle(e.target,false);}
  });
  document.addEventListener('pointerdown',e=>{if(this.selected&&!list.contains(e.target))this.focus(null);});
 }
 add(row,{componentId,attackIds=[],traceId}={}){
  this.rows.unshift(row);this.keys.set(row,new Set(componentId?[componentId]:attackIds.length?attackIds:[traceId??'plant-monitoring']));
  row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-pressed','false');
  if(this.selected)row.hidden=!this.matches(row,this.selected);
 }
 matches(row,selected){return !selected||[...this.keys.get(row)].some(key=>this.keys.get(selected).has(key));}
 toggle(row,animate=true){this.focus(this.selected===row?null:row,animate);}
 refresh(){if(this.selected)this.focus(this.selected);}
 async focus(row,animate=true){
  const list=this.list,version=this.version=(this.version??0)+1;
  if(!this.selected&&row)this.savedScroll=list.scrollTop;
  this.selected=row;
  // Fade the old layout before changing it. Rows never cross readable text.
  const opacity=getComputedStyle(list).opacity;
  list.getAnimations().forEach(a=>a.cancel());
  const motion=animate&&!this.reduced.matches;
  if(motion){
   const exit=list.animate([{opacity},{opacity:0}],{duration:100,easing:'cubic-bezier(0.23,1,0.32,1)',fill:'forwards'});
   try{await exit.finished;}catch{return;}
   if(version!==this.version)return;
  }
  for(const el of this.rows){
   const related=this.matches(el,row);
   el.hidden=!related;el.classList.toggle('log-related',!!row&&related);
   el.setAttribute('aria-pressed',String(!!row&&related));list.append(el);
  }
  list.dataset.focused=String(!!row);list.scrollTop=row?0:(this.savedScroll??list.scrollTop);
  this.onLayout();list.getAnimations().forEach(a=>a.cancel());
  if(motion)list.animate([{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],{duration:150,easing:'cubic-bezier(0.23,1,0.32,1)'});
 }
}
