// Half-unit routing lattice. Obstacles include equipment and previously routed pipes.
const STEP=.5;
const key=p=>p.join(',');
const same=(a,b)=>a.every((v,i)=>Math.abs(v-b[i])<1e-6);
class Heap {
  items=[];
  push(item){let i=this.items.push(item)-1;while(i){const p=(i-1)>>1;if(this.items[p].f<=item.f)break;this.items[i]=this.items[p];i=p;}this.items[i]=item;}
  pop(){const result=this.items[0],last=this.items.pop();if(this.items.length){let i=0;while(i*2+1<this.items.length){let c=i*2+1;if(c+1<this.items.length&&this.items[c+1].f<this.items[c].f)c++;if(this.items[c].f>=last.f)break;this.items[i]=this.items[c];i=c;}this.items[i]=last;}return result;}
}
export function routeConnections(ports, edges, obstacles){
  const blocked=new Set(),used=new Set(),result=[];
  for(const {min,max} of obstacles){for(let x=Math.ceil((min[0]-.25)/STEP);x<=Math.floor((max[0]+.25)/STEP);x++)for(let y=Math.ceil((min[1]-.25)/STEP);y<=Math.floor((max[1]+.25)/STEP);y++)for(let z=Math.ceil((min[2]-.25)/STEP);z<=Math.floor((max[2]+.25)/STEP);z++)blocked.add(key([x,y,z]));}
  const dirs=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]];
  for(const [from,to] of edges){
    const a=ports[from],b=ports[to];if(!a||!b)throw Error(`Missing port ${from} or ${to}`);
    const start=a.point.map(v=>Math.round(v/STEP)),end=b.point.map(v=>Math.round(v/STEP));
    const exit=start.map((v,i)=>v+a.normal[i]),entry=end.map((v,i)=>v+b.normal[i]);
    const allowed=new Set([start,exit,entry,end].map(key));
    const heuristic=p=>p.reduce((sum,v,i)=>sum+Math.abs(v-entry[i]),0);
    const stateKey=(p,dir)=>key(p)+':'+dir;
    const first={p:exit,dir:-1,g:0,f:heuristic(exit)},heap=new Heap(),cost=new Map([[stateKey(exit,-1),0]]),parents=new Map();heap.push(first);let found;
    while(heap.items.length){const current=heap.pop(),ck=stateKey(current.p,current.dir);if(current.g!==cost.get(ck))continue;if(same(current.p,entry)){found=current;break;}
      for(let di=0;di<dirs.length;di++){const dir=dirs[di],p=current.p.map((v,i)=>v+dir[i]),pk=key(p),sk=stateKey(p,di);if(Math.abs(p[0])>52||Math.abs(p[2])>38||p[1]<2||p[1]>22)continue;if(!allowed.has(pk)&&(blocked.has(pk)||used.has(pk)))continue;
        const next=current.g+1+(dir[1]===0?0:.15)+(current.dir>=0&&current.dir!==di?.65:0);if(next>=(cost.get(sk)??Infinity))continue;cost.set(sk,next);parents.set(sk,current);heap.push({p,dir:di,f:next+heuristic(p),g:next});}
    }
    if(!found)throw Error(`Cannot route ${from} → ${to}`);
    const path=[];for(let state=found;state;state=parents.get(stateKey(state.p,state.dir)))path.push(state.p);path.reverse();path.unshift(start);path.push(end);
    const nodes=path.filter((p,i)=>!i||!same(p,path[i-1]));nodes.forEach(p=>used.add(key(p)));
    const compact=nodes.filter((p,i)=>{if(!i||i===nodes.length-1)return true;const prev=nodes[i-1],next=nodes[i+1];return !p.every((v,j)=>v-prev[j]===next[j]-v);}).map(p=>p.map(v=>v*STEP));
    result.push({from,to,points:compact});
  }
  return result;
}
export function auditConnections(routes,ports,obstacles){
  let terminals=0,collisions=0;const details=[];
  for(const route of routes){if(!same(route.points[0],ports[route.from].point)||!same(route.points.at(-1),ports[route.to].point))terminals++;
    for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i],length=Math.hypot(...b.map((v,j)=>v-a[j]));for(let t=.2;t<length-.1;t+=.1){const p=a.map((v,j)=>v+(b[j]-v)*t/length);if(obstacles.some(o=>p.every((v,j)=>v>o.min[j]-.1&&v<o.max[j]+.1))){collisions++;if(details.length<12)details.push({from:route.from,to:route.to,point:p});}}}
  }
  return {connections:routes.length,terminalErrors:terminals,equipmentCollisions:collisions,details};
}
