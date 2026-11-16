import * as T from '/vendor/three.module.js';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { flowSpeed } from './visual-response.js';
import { routeConnections, auditConnections } from './routing.js';

// World units are illustrative. Equipment ownership follows the official process image.
export function mountPlant(canvas, onAttack) {
  const scene = new T.Scene();
  scene.background = new T.Color('#f7f6f2');
  const renderer = new T.WebGLRenderer({canvas, antialias:true, alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const camera = new T.OrthographicCamera(-28,28,20,-20,.1,200);
  camera.position.set(50,42,50); camera.lookAt(0,1.5,0);
  const controls=new OrbitControls(camera,canvas);controls.target.set(0,1.5,0);controls.enableDamping=true;controls.dampingFactor=.1;controls.minPolarAngle=.12;controls.maxPolarAngle=Math.PI/2-.08;controls.minZoom=.65;controls.maxZoom=4;controls.update();
  scene.add(new T.HemisphereLight(0xffffff,0xffffff,1.5));
  const light = new T.DirectionalLight(0xffffff,1.2); light.position.set(-20,45,20); light.castShadow=true;
  light.shadow.mapSize.set(2048,2048); Object.assign(light.shadow.camera,{left:-35,right:35,top:30,bottom:-30,near:1,far:100});light.shadow.bias=-.0003;scene.add(light);
  const root = new T.Group(); scene.add(root);
  const components = [], stages = new Map(), rotors=[],flows=[],effects=[],instruments=[];
  const palette={body:0xf0eeea,lid:0xfcfbf8,steel:0xcac7c1,pipe:0xa29e97,dark:0x69665f,water:0xbdb9b1};
  const ramp=new T.DataTexture(new Uint8Array([115,160,205,248]),4,1,T.RedFormat);ramp.minFilter=T.NearestFilter;ramp.magFilter=T.NearestFilter;ramp.needsUpdate=true;
  const geometries = new Map();
  function mesh(parent,geometry,color,outline=true){
    const material=new T.MeshToonMaterial({color,gradientMap:ramp});
    const m=new T.Mesh(geometry,material);m.userData.baseColor=material.color.clone();m.castShadow=true;m.receiveShadow=true;parent.add(m);
    if(outline){let edges=geometries.get(geometry);if(!edges){edges=new T.EdgesGeometry(geometry,35);geometries.set(geometry,edges);}const lines=new T.LineSegments(edges,new T.LineBasicMaterial({color:0x6c6861,transparent:true,opacity:.6,depthTest:true}));lines.userData.statusEdge=true;lines.userData.baseColor=lines.material.color.clone();m.add(lines);}
    return m;
  }
  function box(p,x,y,z,w,h,d,color=palette.body){const m=mesh(p,new T.BoxGeometry(w,h,d),color);m.position.set(x,y,z);return m;}
  function cyl(p,x,y,z,r,h,color=palette.body,axis='y') {const m=mesh(p,new T.CylinderGeometry(r,r,h,32),color);m.position.set(x,y,z);if(axis==='x')m.rotation.z=Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;return m;}
  function pipe(parent,points,r=.105,color=palette.pipe,owners=[]){
    const curve=new T.CurvePath(),v=points.map(p=>new T.Vector3(...p));let last=v[0];
    for(let i=1;i<v.length-1;i++){const before=v[i-1],corner=v[i],after=v[i+1];const radius=Math.min(.2,corner.distanceTo(before)/3,corner.distanceTo(after)/3);const a=corner.clone().add(before.clone().sub(corner).normalize().multiplyScalar(radius)),b=corner.clone().add(after.clone().sub(corner).normalize().multiplyScalar(radius));curve.add(new T.LineCurve3(last,a));curve.add(new T.QuadraticBezierCurve3(a,corner,b));last=b;}
    curve.add(new T.LineCurve3(last,v.at(-1)));
    const shell=mesh(parent,new T.TubeGeometry(curve,Math.max(12,Math.ceil(curve.getLength()*5)),r,10,false),0xc7c4bc,false);
    shell.userData.fluidShell=true;shell.material.transparent=true;shell.material.opacity=.14;shell.material.depthWrite=false;
    const length=curve.getLength();
    // A continuous light band travels along arc length; the rotor confirms local speed.
    const material=new T.MeshPhysicalMaterial({color:0x0070f3,roughness:.18,metalness:0,ior:1.333,clearcoat:1,clearcoatRoughness:.12});
    // Soft lighter-blue swells advect along the bore in world units, so they
    // follow every bend at one speed. The band is smooth: no beads or dashes.
    const flowUniform={value:0};
    material.onBeforeCompile=shader=>{
      shader.uniforms.uFlow=flowUniform;shader.uniforms.uLength={value:length};
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying float vAlong;').replace('#include <begin_vertex>','#include <begin_vertex>\nvAlong=uv.x;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vAlong;\nuniform float uFlow;\nuniform float uLength;').replace('#include <color_fragment>','#include <color_fragment>\nfloat flowX=vAlong*uLength-uFlow*.8;\nfloat ripple=.5+.25*sin(flowX*4.2)+.25*sin(flowX*2.3+1.7);\nfloat sheen=smoothstep(.55,1.,ripple);\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.55,.76,1.),sheen*.28);');
    };
    const water=new T.Mesh(new T.TubeGeometry(curve,Math.max(12,Math.ceil(length*5)),r*.91,16,false),material);
    parent.add(water);water.userData.fluid=true;water.raycast=()=>{};
    const flow={curve,length,water,uniform:flowUniform,owners:owners.length?owners:parent.userData.id?[parent.userData.id]:[],distance:0,speed:2.2};flows.push(flow);
    if(owners.length){
      let segment=1;for(let i=2;i<v.length;i++)if(v[i].distanceTo(v[i-1])>v[segment].distanceTo(v[segment-1]))segment=i;
      const a=v[segment-1],b=v[segment],span=a.distanceTo(b);
      if(span>3){
        const direction=b.clone().sub(a).normalize(),centre=a.clone().lerp(b,.25),meter=new T.Group();
        meter.position.copy(centre);meter.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction);parent.add(meter);
        // The clear chamber surrounds the uninterrupted blue bore. Tapered
        // reducers meet the original tube at both ends of the chamber.
        for(const sign of [-1,1]){
          const reducer=mesh(meter,new T.CylinderGeometry(sign>0?r:.23,sign>0?.23:r,.18,24),palette.steel,false);reducer.position.y=sign*.45;
          const rim=mesh(meter,new T.TorusGeometry(.23,.035,8,32),palette.steel,false);rim.rotation.x=Math.PI/2;rim.position.y=sign*.35;
        }
        const glass=new T.Mesh(new T.CylinderGeometry(.23,.23,.7,24,1,true),new T.MeshPhysicalMaterial({color:0xd4e9f5,roughness:.1,transparent:true,opacity:.18,depthWrite:false,side:T.DoubleSide}));meter.add(glass);
        // Open the bore inside the chamber so the rotor is visible through water.
        const geometry=water.geometry,index=geometry.index.array,positions=geometry.attributes.position;
        const kept=[],q=new T.Vector3();
        for(let k=0;k<index.length;k+=3){q.set(0,0,0);for(let j=0;j<3;j++)q.add(new T.Vector3().fromBufferAttribute(positions,index[k+j]));q.multiplyScalar(1/3).sub(centre);if(Math.abs(q.dot(direction))>.36||q.clone().cross(direction).length()>.12)kept.push(index[k],index[k+1],index[k+2]);}
        geometry.setIndex(kept);
        const liquid=new T.Mesh(new T.CylinderGeometry(.2,.2,.7,24),new T.MeshPhysicalMaterial({color:0x0070f3,roughness:.12,ior:1.333,transparent:true,opacity:.32,depthWrite:false}));liquid.userData.fluid=true;meter.add(liquid);liquid.userData.fluid=true;
        cyl(meter,0,0,0,.035,.82,palette.dark);
        const rotor=new T.Group();meter.add(rotor);
        for(let j=0;j<4;j++){
          const blade=box(rotor,Math.cos(j*Math.PI/2)*.12,0,Math.sin(j*Math.PI/2)*.12,.16,.07,.06,palette.lid);
          blade.rotation.y=-j*Math.PI/2;blade.rotation.z=.3;
        }
        flow.rotor=rotor;
      }
    }
    for(let i=1;i<v.length;i++){const delta=v[i].clone().sub(v[i-1]),len=delta.length();if(len<3)continue;const ring=mesh(parent,new T.CylinderGeometry(r*1.45,r*1.45,.09,12),palette.steel,false);ring.position.copy(v[i-1]).addScaledVector(delta,.5);ring.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());}
  }
  function component(parent,id,name,x,z){const g=new T.Group();g.position.set(x,0,z);parent.add(g);g.userData={id,name,stage:parent.userData.stage,component:true};components.push(g);return g;}
  function tank(parent,id,name,x,z,r=1.6,h=4.6){
    const g=component(parent,id,name,x,z);g.userData.radius=r;g.userData.lidTop=.64+h;g.userData.lampMount=[0,.95+h,0];
    cyl(g,0,.45,0,r+.12,.2,palette.steel);cyl(g,0,.55+h/2,0,r,h);cyl(g,0,.55+h,0,r+.06,.18,palette.lid);
    cyl(g,0,.73+h,0,.43,.18,palette.steel);cyl(g,0,.88+h,0,.38,.14,palette.lid);
    // Tank bands and a closed level indicator lie on the vessel surface.
    for(const y of [1,h-.3]){const ring=new T.Mesh(new T.TorusGeometry(r+.015,.025,6,48),new T.MeshStandardMaterial({color:palette.steel}));ring.rotation.x=Math.PI/2;ring.position.y=y;g.add(ring);}
    const gaugeHeight=Math.min(2.5,h*.65),gaugeY=.55+h*.5;box(g,r*.65,gaugeY,r*.77,.15,gaugeHeight,.12,palette.dark);const gauge=box(g,r*.65,gaugeY-.08,r*.77+.08,.08,gaugeHeight*.68,.06,palette.water);Object.assign(gauge.userData,{levelGauge:true,levelBottom:gaugeY-.08-gaugeHeight*.34,levelHalf:gaugeHeight*.34});
    for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(g,Math.cos(a)*(r-.17),.68+h,Math.sin(a)*(r-.17),.055,.08,palette.dark);}

    return g;
  }
  function pump(parent,id,name,x,z){const g=component(parent,id,name,x,z);box(g,0,.52,0,1.4,.25,1.8,palette.steel);box(g,0,.88,0,.5,.5,.7,palette.steel);cyl(g,0,1.5,0,.46,.8,palette.steel,'z');cyl(g,0,1.5,-.7,.38,.75,palette.dark,'z');cyl(g,0,1.5,-1.09,.4,.08,palette.steel,'z');
    const rotor=new T.Group();rotor.position.set(0,1.5,-1.15);g.add(rotor);for(let i=0;i<6;i++){const a=i*Math.PI/3;const blade=box(rotor,Math.cos(a)*.2,Math.sin(a)*.2,0,.18,.055,.04,palette.steel);blade.rotation.z=a;}rotors.push({object:rotor,stage:g.userData.stage,id:g.userData.id});
    return g;}
  function cabinet(parent,x,z){const p=component(parent,'PLC'+parent.userData.stage.slice(1),'Stage controller',x,z);box(p,0,2.5,0,1.05,4.1,.8,palette.steel);box(p,0,2.5,.42,.94,3.9,.08,palette.body);box(p,0,3.4,.48,.55,.44,.06,palette.dark);box(p,.32,2.3,.49,.055,.5,.07,palette.dark);for(let i=0;i<3;i++)cyl(p,-.25+i*.24,2.85,.5,.045,.05,palette.dark,'z');}
  function frame(p,x,z,w,h,d){for(const xx of [-w/2,w/2])for(const zz of [-d/2,d/2])box(p,x+xx,.45+h/2,z+zz,.12,h,.12,palette.steel);for(const y of [.55,h+.4]){for(const zz of [-d/2,d/2])box(p,x,y,z+zz,w,.12,.12,palette.steel);for(const xx of [-w/2,w/2])box(p,x+xx,y,z,.12,.12,d,palette.steel);}}
  function column(g,x,z,h=4.8){cyl(g,x,.8+h/2,z,.35,h,palette.lid);for(const y of [.8,h+.8])cyl(g,x,y,z,.44,.17,palette.steel);}
  const locations=[[-14,-7],[0,-7],[14,-7],[14,7],[0,7],[-14,7]];
  box(root,0,-.12,0,42,.4,25,0xe2dfd8);
  for(let i=0;i<6;i++){
    const p=new T.Group();p.position.set(locations[i][0],0,locations[i][1]);p.userData.stage=`P${i+1}`;root.add(p);stages.set(p.userData.stage,p);
    box(p,0,.18,0,12,.25,10,palette.steel);box(p,0,.34,0,11.8,.09,9.8,palette.lid);
    for(const x of [-5.5,5.5])for(const z of [-4.5,4.5])cyl(p,x,.43,z,.07,.07,palette.dark);
    cabinet(p,4.8,-3.6);
    if(i===0){tank(p,'T101','Raw water tank',-1.5,-.5,2,5.5);pump(p,'P101','Raw water pump',2.5,2);}
    if(i===1){for(let j=0;j<3;j++){const x=-3.5+j*2.5;const g=tank(p,`dosing-${j}`,['NaCl dosing','HCl dosing','NaOCl dosing'][j],x,-.5,.85,2.5);box(g,0,3.6,0,.6,.5,.65,palette.dark);}const mixer=component(p,'mixer','Static mixer',3,2.5);cyl(mixer,0,1.5,0,.26,1.2,palette.steel,'x');}
    if(i===2){tank(p,'T301','UF feed tank',-3,-1,1.5,4.6);pump(p,'P301','UF feed pump',-3,2.5);const g=component(p,'UF','Ultrafiltration unit',1.5,0);frame(g,0,0,3.6,5.9,2.4);for(let j=0;j<4;j++)column(g,-1.2+j*.8,0);}
    if(i===3){tank(p,'T401','RO feed tank',-3,-1,1.5,4.6);pump(p,'P401','RO feed pump',-3,2.5);const g=component(p,'UV','UV dechlorinator',1,0);frame(g,0,0,2,3.6,1.8);for(const y of [1.5,2.8]){cyl(g,0,y,0,.3,2.4,palette.steel,'x');for(const x of [-1.2,1.2])cyl(g,x,y,0,.38,.15,palette.dark,'x');}tank(p,'NaHSO3','NaHSO₃ dosing',3.5,3,.65,1.8);}
    if(i===4){const filter=component(p,'cartridge','Cartridge filter',-4,1.5);column(filter,0,0,2.8);pump(p,'P501','RO high-pressure pump',-2,3);const g=component(p,'RO','Reverse osmosis unit',.5,-1);frame(g,0,0,5.4,5.7,2.8);for(let j=0;j<3;j++){const y=2+j*1.5;cyl(g,0,y,0,.35,5.1,palette.lid,'x');for(const x of [-2.6,2.6]){cyl(g,x,y,0,.44,.2,palette.steel,'x');}}}
    if(i===5){for(let j=0;j<3;j++){const x=-3.5+j*3;tank(p,['T601','T602','T603'][j],['RO permeate tank','UF backwash tank','CIP tank'][j],x,-.5,1.25,j===2?3.1:4.2);pump(p,['P601','P602','P603'][j],['RO permeate pump','UF backwash pump','CIP pump'][j],x,4);}}
  }
  const uf=components.find(c=>c.userData.id==='UF');
  for(const y of [1.5,5.5]){pipe(uf,[[-1.6,y,0],[1.6,y,0]]);pipe(uf,[[0,y,0],[0,y,y===1.5?-1.2:1.2]]);}
  const uv=components.find(c=>c.userData.id==='UV');
  for(const side of [-1,1]){pipe(uv,[[0,1.5,side*.3],[0,1.5,side*.9]]);pipe(uv,[[side*1.2,1.5,0],[side*1.6,1.5,0],[side*1.6,2.8,0],[side*1.2,2.8,0]]);}
  const ro=components.find(c=>c.userData.id==='RO');
  for(let j=0;j<2;j++){const y=2+j*1.5,z=j? -2:2;pipe(ro,[[2.7,y,0],[3,y,0],[3,y,z],[-3,y,z],[-3,y+1.5,z],[-3,y+1.5,0],[-2.7,y+1.5,0]]);}
  // Real parts from the reference: motor fins, rack saddles, door hinges,
  // cable glands, tank lifting eyes, metering heads and mounted instruments.
  function ring(p,x,y,z,r,t=.035,axis='y'){
    const m=mesh(p,new T.TorusGeometry(r,t,8,32),palette.steel,false);
    m.position.set(x,y,z);if(axis==='y')m.rotation.x=Math.PI/2;if(axis==='x')m.rotation.y=Math.PI/2;return m;
  }
  function dial(c,x,y,z){
    cyl(c,x,y-.3,z,.065,.6,palette.steel);
    if(z>.5)cyl(c,x,y-.6,z/2,.065,z,palette.steel,'z');
    cyl(c,x,y,z,.29,.14,palette.dark,'z');cyl(c,x,y,z+.085,.245,.025,palette.lid,'z');
    for(let j=0;j<9;j++){const a=-Math.PI*.2+j*Math.PI*1.4/8;const tick=box(c,x+Math.cos(a)*.2,y+Math.sin(a)*.2,z+.105,.055,.018,.012,palette.dark);tick.rotation.z=a;}
    const needle=new T.Group();needle.position.set(x,y,z+.125);c.add(needle);box(needle,.085,0,0,.17,.025,.015,palette.dark);cyl(c,x,y,z+.14,.04,.025,palette.dark,'z');
    instruments.push({id:c.userData.id,needle});
  }
  for(const c of components){const id=c.userData.id;
    if(c.userData.radius){const r=c.userData.radius,h=c.userData.lidTop;
      for(const x of [-r*.65,r*.65]){box(c,x,h+.02,0,.26,.08,.16,palette.steel);ring(c,x,h+.14,0,.12,.03,'z');}
      // A graduated sight glass remains on the vessel, with a blue liquid level.
      const gauge=c.children.find(o=>o.userData.levelGauge);if(gauge)for(let j=0;j<9;j++)box(c,r*.65+.13,gauge.userData.levelBottom+j*gauge.userData.levelHalf*.25,r*.77+.06,.12,.025,.045,palette.steel);
      c.children.filter(o=>o.userData.levelGauge).forEach(o=>{o.material.color.set(0x0070f3);o.userData.baseColor=o.material.color.clone();});
      if(id.startsWith('dosing')){cyl(c,.3,3.6,.25,.22,.35,palette.steel,'z');box(c,.3,3.6,.46,.26,.22,.07,palette.lid);c.userData.lampMount=[0,3.85,0];}
    }
    if(/^P\d/.test(id)){
      for(let j=0;j<8;j++){const a=j*Math.PI/4;const fin=box(c,Math.cos(a)*.39,1.5+Math.sin(a)*.39,-.7,.08,.06,.62,palette.steel);fin.rotation.z=a;}
      box(c,0,1.96,-.65,.33,.2,.35,palette.body);
      for(const x of [-.5,.5])for(const z of [-.6,.6])cyl(c,x,.68,z,.065,.08,palette.dark);
      dial(c,0,2.28,.1);
    }
    if(id.startsWith('PLC')){
      for(const y of [1.2,3.8])box(c,-.48,y,.46,.07,.25,.08,palette.dark);
      for(let j=0;j<6;j++)box(c,0,1.1+j*.1,.469,.57,.025,.018,palette.dark);
      for(const x of [-.3,0,.3])cyl(c,x,.43,0,.075,.16,palette.dark);
      for(let j=0;j<4;j++)box(c,-.18+j*.12,3.35,.52,.065,.18,.02,palette.steel);
    }
    if(id==='RO')for(const y of [2,3.5,5])for(const x of [-1.8,1.8]){ring(c,x,y,0,.39,.045,'x');box(c,x,y-.43,0,.18,.16,2.8,palette.steel);}
    if(id==='UF')for(const y of [1.8,4.8]){box(c,0,y,-.45,3.6,.12,.12,palette.steel);for(let j=0;j<4;j++)ring(c,-1.2+j*.8,y,0,.38,.035);}
    if(id==='RO')dial(c,0,4.1,1.05);
    if(id==='UF')dial(c,-1.2,3.3,1.05);
    if(id==='UV')dial(c,0,3.4,1.05);
  }
  const ports={}, obstacles=[];
  root.updateMatrixWorld(true);
  for(const c of components){const bounds=new T.Box3().setFromObject(c);obstacles.push({min:bounds.min.toArray(),max:bounds.max.toArray()});}
  for(const p of stages.values()){const at=p.position;obstacles.push({min:[at.x+4.2,.45,at.z-4.1],max:[at.x+5.4,4.6,at.z-3.1]});}
  function port(c,name,side,y,halfWidth,axis='x'){
    const centre=new T.Vector3();c.getWorldPosition(centre);const index=axis==='x'?0:2,world=centre.toArray();
    const outer=side<0?Math.floor((world[index]-halfWidth-.65)*2)/2:Math.ceil((world[index]+halfWidth+.65)*2)/2;
    const local=outer-world[index],inner=side*halfWidth;
    cyl(c,axis==='x'?(inner+local)/2:0,y,axis==='z'?(inner+local)/2:0,.12,Math.abs(local-inner),palette.pipe,axis);
    cyl(c,axis==='x'?local-side*.07:0,y,axis==='z'?local-side*.07:0,.25,.14,palette.steel,axis);
    // Bolts surround the flange bore. The valve spindle is seated on the nozzle.
    for(let j=0;j<6;j++){const a=j*Math.PI/3,rad=.195;
      cyl(c,axis==='x'?local:Math.cos(a)*rad,y+Math.sin(a)*rad,axis==='z'?local:Math.cos(a)*rad,.035,.045,palette.dark,axis);
    }
    if(name==='out'){
      const x=axis==='x'?(inner+local)/2:0,z=axis==='z'?(inner+local)/2:0;
      cyl(c,x,y+.19,z,.065,.38,palette.steel);
      const handle=new T.Group();handle.position.set(x,y+.39,z);c.add(handle);box(handle,0,0,0,.48,.07,.1,palette.dark);
      instruments.push({id:c.userData.id,handle});
    }
    world[index]=outer;world[1]=y;const normal=[0,0,0];normal[index]=side;
    ports[`${c.userData.id}.${name}`]={point:world,normal};
  }
  for(const c of components){const id=c.userData.id;if(id.startsWith('PLC'))continue;
    const axis=id.startsWith('dosing-')||/^T[346]0/.test(id)||id==='UF'||id==='UV'?'z':'x';
    const half=axis==='z'?(c.userData.radius??(id==='UF'?1.2:.9)):(c.userData.radius??(id==='RO'?2.7:id==='mixer'?.6:id==='cartridge'?.35:.46));
    port(c,'in',-1,id==='RO'?2:1.5,half,axis);
    port(c,'out',1,id==='RO'?5:id==='UF'?5.5:(id==='T301'||id==='T401')?3.5:1.5,half,axis);
  }
  const edges=[['T101.out','P101.in'],['P101.out','mixer.in'],['dosing-0.out','mixer.in'],['dosing-1.out','mixer.in'],['dosing-2.out','mixer.in'],['mixer.out','T301.in'],['T301.out','P301.in'],['P301.out','UF.in'],['UF.out','T401.in'],['T401.out','P401.in'],['P401.out','UV.in'],['NaHSO3.out','UV.in'],['UV.out','cartridge.in'],['cartridge.out','P501.in'],['P501.out','RO.in'],['RO.out','T601.in'],['RO.out','T602.in'],['RO.out','T603.in'],['T601.out','P601.in'],['T602.out','P602.in'],['T603.out','P603.in'],['P602.out','UF.in'],['P603.out','cartridge.in'],['P601.out','T101.in']];
  const routes=routeConnections(ports,edges,obstacles);
  const audit=auditConnections(routes,ports,obstacles);
  if(audit.terminalErrors||audit.equipmentCollisions)throw Error(`Pipe audit failed: ${JSON.stringify(audit)}`);
  for(const {points,from,to} of routes){
    pipe(root,points,.105,palette.pipe,[from.split('.')[0],to.split('.')[0]]);
    // Supports meet the actual floor and stop below the pipe's lower surface.
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i];if(a[1]!==b[1]||Math.hypot(a[0]-b[0],a[2]-b[2])<3)continue;
      const x=(a[0]+b[0])/2,z=(a[2]+b[2])/2;
      if(obstacles.some(o=>x>o.min[0]-.2&&x<o.max[0]+.2&&z>o.min[2]-.2&&z<o.max[2]+.2))continue;
      const floor=locations.some(([sx,sz])=>Math.abs(x-sx)<6&&Math.abs(z-sz)<5)?.385:.08;
      const low=floor+.12,high=a[1]-.165;
      if(high<=low)continue;
      box(root,x,floor+.06,z,.45,.12,.45,palette.steel);
      cyl(root,x,(high+low)/2,z,.045,high-low,palette.steel);
      box(root,x,a[1]-.135,z,.25,.06,.25,palette.steel);
    }
  }
  // A small plate is part of each skid. It identifies stages without floating labels.
  for(const [id,p] of stages){const label=document.createElement('canvas');label.width=128;label.height=64;const ctx=label.getContext('2d');ctx.fillStyle='#ece9e2';ctx.fillRect(0,0,128,64);ctx.fillStyle='#69655e';ctx.font='28px monospace';ctx.textAlign='center';ctx.fillText(id,64,42);const plate=new T.Mesh(new T.PlaneGeometry(1.6,.8),new T.MeshBasicMaterial({map:new T.CanvasTexture(label)}));plate.rotation.x=-Math.PI/2;plate.position.set(4.3,.405,3.8);p.add(plate);}
  const vapourCanvas=document.createElement('canvas');vapourCanvas.width=64;vapourCanvas.height=64;
  const context=vapourCanvas.getContext('2d'),gradient=context.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'rgba(255,255,255,.85)');gradient.addColorStop(.4,'rgba(255,255,255,.3)');gradient.addColorStop(1,'rgba(255,255,255,0)');context.fillStyle=gradient;context.fillRect(0,0,64,64);
  const vapourTexture=new T.CanvasTexture(vapourCanvas);
  for(const c of components){const bounds=new T.Box3().setFromObject(c),centre=bounds.getCenter(new T.Vector3()),cloud=new T.Group();cloud.position.set(centre.x,bounds.max.y+.12,centre.z);root.add(cloud);
    const particles=[];for(let i=0;i<8;i++){const sprite=new T.Sprite(new T.SpriteMaterial({map:vapourTexture,color:0xb9b1a9,transparent:true,opacity:0,depthWrite:false}));sprite.raycast=()=>{};cloud.add(sprite);particles.push(sprite);}
    // A mounted status lamp makes each component state visible from any orbit.
    const id=c.userData.id;
    const mount=c.userData.lampMount??(id.startsWith('PLC')?[0,4.55,0]:/^P\d/.test(id)?[0,2.06,-.65]:id==='RO'?[2.7,6.16,1.4]:id==='UF'?[1.8,6.36,1.2]:id==='UV'?[1,4.06,.9]:id==='cartridge'?[0,3.685,0]:[0,1.76,0]);
    const local=new T.Vector3(...mount);
    c.userData.lampAnchor=mount;
    c.userData.mountHosts=[];c.traverse(o=>{if(o.isMesh)c.userData.mountHosts.push(o);});
    cyl(c,local.x,local.y+.15,local.z,.07,.3,palette.dark);
    const lamp=cyl(c,local.x,local.y+.38,local.z,.16,.24,palette.lid);
    lamp.userData.statusLamp=true;
    cyl(c,local.x,local.y+.52,local.z,.18,.05,palette.dark);
    effects.push({id:c.userData.id,cloud,particles,lamp,level:0});
  }
  // Test real lamp/host contact, using the same meshes rendered by Three.js.
  root.updateMatrixWorld(true);
  audit.lampMounts=components.length;audit.lampMountErrors=[];
  for(const c of components){const origin=c.localToWorld(new T.Vector3(...c.userData.lampAnchor));origin.y+=.001;const ray=new T.Raycaster(origin,new T.Vector3(0,-1,0),0,.003);if(!ray.intersectObjects(c.userData.mountHosts,false).length)audit.lampMountErrors.push(c.userData.id);delete c.userData.mountHosts;}
  if(audit.lampMountErrors.length)throw Error(`Unsupported lamp: ${audit.lampMountErrors.join(', ')}`);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2();
  let monitoring='monitoring',lastHealthy=false;
  const suspicions=new Set();
  const active=new Map();let visible=true,hovered=null,down=null,dragged=false,keyboardIndex=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function pick(event){const rect=canvas.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);for(const hit of raycaster.intersectObjects(root.children,true)){let obj=hit.object;while(obj&&!obj.userData.component)obj=obj.parent;if(obj)return obj;if(hit.object.isMesh)return null;}return null;}
  const pointers=new Set();
  function restoreCursor(event){down=null;dragged=false;if(event&&Number.isFinite(event.clientX))hovered=pick(event);canvas.style.cursor=hovered?'pointer':'grab';}
  controls.addEventListener('end',()=>{canvas.style.cursor=hovered?'pointer':'grab';});
  canvas.addEventListener('pointerdown',e=>{pointers.add(e.pointerId);down=[e.clientX,e.clientY];dragged=pointers.size>1;});
  canvas.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&!e.buttons){down=null;dragged=false;}if(down&&Math.hypot(e.clientX-down[0],e.clientY-down[1])>4)dragged=true;hovered=pick(e);canvas.style.cursor=down&&dragged?'grabbing':hovered?'pointer':'grab';});
  canvas.addEventListener('pointerup',e=>{const wasDragged=dragged||pointers.size>1;pointers.delete(e.pointerId);if(!wasDragged&&e.button===0&&!e.shiftKey&&!e.ctrlKey){const picked=pick(e);if(picked)onAttack(picked.userData.stage,picked);}restoreCursor(e);});
  canvas.addEventListener('pointercancel',()=>{pointers.clear();restoreCursor();});
  canvas.addEventListener('lostpointercapture',()=>{pointers.clear();down=null;canvas.style.cursor=hovered?'pointer':'grab';});
  canvas.addEventListener('pointerleave',()=>{hovered=null;if(!down)restoreCursor();});
  window.addEventListener('pointerup',e=>{pointers.delete(e.pointerId);restoreCursor(e);});
  window.addEventListener('blur',()=>{pointers.clear();restoreCursor();});
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();keyboardIndex=(keyboardIndex+(e.key==='ArrowRight'?1:-1)+components.length)%components.length;hovered=components[keyboardIndex];}if(e.key==='Enter'||e.key===' '){e.preventDefault();const c=hovered||components[keyboardIndex];onAttack(c.userData.stage,c);}});
  const cycles=new Map();
  function select(stage,c){const id=c.userData.id,index=cycles.get(id)??[...id].reduce((sum,ch)=>sum+ch.charCodeAt(0),0)%3;cycles.set(id,index+1);
    const variants=id.startsWith('dosing-')||id==='NaHSO3'?['Dosing rate override','Chemical feed interruption','Dosing pump replay']:c.userData.radius?['Level sensor spoofing','Overflow command','Outlet valve override']:id.startsWith('PLC')?['Control command injection','PLC signal replay','Controller output override']:/^P\d/.test(id)?['Pump speed override','Pump stall command','Intermittent pump trip']:id==='UV'?['UV output override','UV controller replay','UV shutdown command']:['Pressure sensor spoofing','Valve cycling command','Filter pressure surge'];
    const variant=variants[index%variants.length];active.set(id,{state:'pending',variant:index%variants.length});c.userData.attackType=variant;return variant;
  }
  function setState(id,state){if(state==='stopped')active.delete(id);else if(active.has(id)){const info=active.get(id);info.state=state;if(state==='resolved')info.until=performance.now()+1100;}}
  function resize(){const {width,height}=canvas.getBoundingClientRect();renderer.setSize(width,height,false);
    // Keep the current model scale, centred in the full viewport behind the log.
    const reserve=Math.min(height*.38,216),available=Math.max(160,height-reserve),aspect=width/height;
    const halfWidth=Math.max(30,15.1*width/available),halfHeight=halfWidth/aspect;
    camera.left=-halfWidth;camera.right=halfWidth;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();}

  const observer=new ResizeObserver(resize);observer.observe(canvas);
  new IntersectionObserver(entries=>visible=entries.at(-1).isIntersecting).observe(canvas);
  const statusStyle=getComputedStyle(document.documentElement);
  const statusColors=Object.fromEntries(['attack','detected','resolved','normal'].map(role=>[role,new T.Color(statusStyle.getPropertyValue('--color-status-'+role+'-solid').trim())]));
  const color=new T.Color();const start=performance.now();let lastFrame=start;
  function render(now){if(!visible||document.hidden)return;controls.update();const t=Math.max(0,now-start)/1000,dt=Math.max(0,Math.min(.1,(now-lastFrame)/1000));lastFrame=now;
    for(const [id,info] of active)if(info.until&&now>info.until)active.delete(id);
    for(const c of components){const info=active.get(c.userData.id)??(c.userData.id.startsWith('PLC')&&suspicions.has(c.userData.stage)?{state:'repairing',variant:0}:null),selected=!!info,recovering=info?.state==='repairing'||info?.state==='resolved';const variant=info?.variant??0;
      const wave=variant===1?Math.sin(t*1.7)**2:variant===2?(Math.sin(t*5)+Math.sin(t*2.3)+2)/4:(.5+.5*Math.sin(t*3.2));
      const pulse=reduced.matches?.45:recovering?.35+.3*Math.sin(t*2.5)**2:.14+.4*wave;color.copy(info?.state==='resolved'?statusColors.resolved:info?.state==='repairing'?statusColors.detected:statusColors.attack);
      c.traverse(o=>{if(o.isLineSegments&&o.parent?.isMesh&&!o.parent.userData.fluid){o.userData.baseColor ??= o.material.color.clone();o.userData.edgeInk=reduced.matches?(selected?1:0):(o.userData.edgeInk??0)+((selected?1:0)-(o.userData.edgeInk??0))*(1-Math.exp(-dt*8));o.userData.edgeTint??=color.clone();if(selected)o.userData.edgeTint.copy(color);o.material.color.copy(o.userData.baseColor).lerp(o.userData.edgeTint,o.userData.edgeInk);o.material.opacity=.6+.4*o.userData.edgeInk;return;}
        if(o.isMesh&&o.material.emissive&&!o.userData.statusLamp&&!o.userData.fluid&&!o.userData.fluidShell){o.userData.baseColor ??= o.material.color.clone();const target=selected?(recovering?.14:.1)+pulse*.18:0;o.userData.attackInk=reduced.matches?target:(o.userData.attackInk??0)+(target-(o.userData.attackInk??0))*(1-Math.exp(-dt*8));o.userData.attackTint??=color.clone();if(selected)o.userData.attackTint.lerp(color,reduced.matches?1:1-Math.exp(-dt*18));o.material.color.copy(o.userData.baseColor).lerp(o.userData.attackTint,o.userData.attackInk);o.material.emissive.copy(o.userData.attackTint);o.material.emissiveIntensity=selected?pulse*.06:c===hovered?.04:0;}});
      c.children.filter(o=>o.userData.levelGauge).forEach(gauge=>{const scale=selected&&!recovering&&!reduced.matches?(variant===0?.7+.3*Math.sin(t*1.6):variant===1?.8+.3*Math.sin(t*.7):.8+.25*Math.sin(t*3)):1;gauge.scale.y+=(scale-gauge.scale.y)*(reduced.matches?1:1-Math.exp(-dt*5));gauge.position.y=gauge.userData.levelBottom+gauge.userData.levelHalf*gauge.scale.y;});
      // A failed control signal flickers in its display; tanks and filters vary their pressure pulse.
      if(c.userData.id.startsWith('PLC'))c.children.forEach(o=>{if(o.isMesh&&o.position.z>.45&&o.material.emissive&&selected&&!recovering)o.material.emissiveIntensity=reduced.matches?.15:.12+.5*Math.sin(t*(variant+3)*3)**8;});
    }
    for(const effect of effects){const info=active.get(effect.id),recovering=info?.state==='repairing'||info?.state==='resolved',target=info&&!recovering&&['UF','RO','cartridge'].includes(effect.id)&&info.variant===2?1:0;effect.level=reduced.matches?0:effect.level+(target-effect.level)*(1-Math.exp(-dt*(target?2.5:4)));effect.cloud.visible=effect.level>.005;
      const lampColor=!info&&suspicions.has('P'+effect.id.slice(3))&&effect.id.startsWith('PLC')?statusColors.detected:info?(info.state==='resolved'?statusColors.resolved:recovering?statusColors.detected:statusColors.attack):new T.Color(palette.lid);
      effect.lamp.material.color.lerp(lampColor,reduced.matches?1:1-Math.exp(-dt*10));
      effect.lamp.material.emissive.copy(effect.lamp.material.color);
      effect.lamp.material.emissiveIntensity=info?(reduced.matches?.2:recovering?.25+.2*Math.sin(t*3)**2:.35):0;
      effect.particles.forEach((sprite,i)=>{const pace=info?.variant===1?.14:info?.variant===2?.32:.23;const phase=(t*pace+i/8)%1,spread=.2+phase*.7;sprite.position.set(Math.sin(i*2.4+t*.25)*spread,phase*(info?.variant===1?2.2:3.1),Math.cos(i*1.8+t*.2)*spread);const size=.4+phase*1.5;sprite.scale.set(size,size,1);sprite.material.opacity=effect.level*Math.sin(Math.PI*phase)**2*(info?.variant===2?.4:.3);});
    }
    for(const f of flows){const speed=flowSpeed(f.owners.map(id=>active.get(id)),t);f.speed+=(speed-f.speed)*(1-Math.exp(-dt*3));if(!reduced.matches)f.distance+=dt*f.speed;f.uniform.value=f.distance;if(f.rotor&&!reduced.matches)f.rotor.rotation.y=f.distance*2;}
    for(const item of instruments){const info=active.get(item.id),bad=info&&info.state!=='repairing'&&info.state!=='resolved';
      const target=bad&&!reduced.matches?(info.variant===1?1.45:info.variant===2?.4+Math.sin(t*3)*.65:-.65):.65;
      if(item.needle)item.needle.rotation.z+=(target-item.needle.rotation.z)*(reduced.matches?1:1-Math.exp(-dt*5));
      if(item.handle){const angle=bad&&!reduced.matches?(info.variant===1?Math.PI/2:info.variant===2?Math.PI/4*(1+Math.sin(t*2)):0):0;item.handle.rotation.y+=(angle-item.handle.rotation.y)*(reduced.matches?1:1-Math.exp(-dt*4));}
    }
    for(const rotor of rotors){const info=active.get(rotor.id),attacked=info&&info.state!=='repairing'&&info.state!=='resolved';const speed=attacked?(info.variant===1?0:info.variant===2?4*Math.max(0,Math.sin(t*2)):8):2;rotor.speed=(rotor.speed??2)+(speed-(rotor.speed??2))*(1-Math.exp(-dt*4));if(!reduced.matches)rotor.object.rotation.z+=dt*rotor.speed;}
    renderer.render(scene,camera);
  }
  renderer.setAnimationLoop(render);resize();
  // Expose identifiers and projected centres for repeatable interaction checks.
  const project=c=>{const v=new T.Vector3();new T.Box3().setFromObject(c).getCenter(v);v.project(camera);return {id:c.userData.id,stage:c.userData.stage,x:(v.x+1)/2*canvas.clientWidth,y:(1-v.y)/2*canvas.clientHeight};};
  return {select,setState,setMonitoring:phase=>{monitoring=phase;if(phase==='normal')lastHealthy=true;else if(phase!=='monitoring')lastHealthy=false;},monitoring:()=>monitoring,setSuspicion:(stage,on)=>on?suspicions.add(stage):suspicions.delete(stage),suspicions:()=>[...suspicions],components:()=>components.map(project),renderer,scene,camera,controls,audit,ports,routes,flowCount:flows.length,flowState:()=>flows.map(f=>({owners:f.owners,distance:f.distance,speed:f.speed})),flowLengths:flows.map(f=>f.length),states:()=>Object.fromEntries([...active].map(([id,info])=>[id,{...info}]))};
}
