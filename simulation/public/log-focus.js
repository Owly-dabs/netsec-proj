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
 add(row,{attackIds=[],traceId}={}){
  this.rows.unshift(row);this.keys.set(row,new Set(attackIds.length?attackIds:[traceId??'plant-monitoring']));
  row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-pressed','false');
 }
 toggle(row,animate=true){this.focus(this.selected===row?null:row,animate);}
 refresh(){if(this.selected)this.focus(this.selected);}
 focus(row,animate=true){
  const list=this.list,before=new Map([...list.children].map(el=>[el,el.getBoundingClientRect()]));
  for(const el of list.children)el.getAnimations().forEach(a=>a.cancel());
  if(!this.selected&&row)this.savedScroll=list.scrollTop;
  this.selected=row;
  const selectedKeys=this.keys.get(row),matches=el=>!row||[...this.keys.get(el)].some(key=>selectedKeys.has(key));
  const ordered=row?[...this.rows.filter(matches),...this.rows.filter(el=>!matches(el))]:this.rows;
  for(const el of ordered){
   el.classList.toggle('log-unrelated',!matches(el));el.classList.toggle('log-related',!!row&&matches(el));
   el.setAttribute('aria-pressed',String(!!row&&matches(el)));list.append(el);
  }
  list.dataset.focused=String(!!row);list.scrollTop=row?0:(this.savedScroll??list.scrollTop);
  this.onLayout();
  if(!animate||this.reduced.matches)return;
  for(const el of ordered){
   const previous=before.get(el),next=el.getBoundingClientRect();if(!previous)continue;
   const delta=previous.top-next.top;
   if(delta&&Math.min(previous.bottom,next.bottom)>0&&Math.max(previous.top,next.top)<innerHeight)
    el.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}],{duration:250,easing:'cubic-bezier(0.77, 0, 0.175, 1)'});
  }
 }
}
