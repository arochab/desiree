import * as THREE from './vendor/three.module.min.js';

const stage = document.querySelector('#presence-stage'), canvas = document.querySelector('#presence-canvas');
const g = window.gsap, keys = ['gmail','whatsapp','memory','studio'];
const colors = ['#8b9aff','#5fd8a0','#5eead4','#de8a66'];
let renderer;
try { renderer = new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'}); }
catch { stage.dataset.renderer = 'fallback'; }
if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = document.documentElement.dataset.theme==='light' ? .95 : 1.15;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32,1,.1,40);
  camera.position.set(0,.18,5.8);
  const sculpture = new THREE.Group();sculpture.rotation.set(-.12,.22,-.08);scene.add(sculpture);
  const lightRoom = new THREE.Scene();
  const panels = [
    {p:[-4,3,2],s:[2,7,1],color:0xffffff,intensity:6},
    {p:[4,1,0],s:[1,7,3],color:0xdaf7ef,intensity:5},
    {p:[0,5,-2],s:[8,1,4],color:0xffffff,intensity:7},
    {p:[0,-4,1],s:[7,1,4],color:0xf0c7a9,intensity:2},
    {p:[0,0,-5],s:[8,6,1],color:0xabb9ef,intensity:3}
  ];
  for (const panel of panels) {
    const material = new THREE.MeshBasicMaterial({color:new THREE.Color(panel.color).multiplyScalar(panel.intensity),side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...panel.s),material);
    mesh.position.set(...panel.p);lightRoom.add(mesh);
  }
  const pmrem = new THREE.PMREMGenerator(renderer), environment = pmrem.fromScene(lightRoom,.06);
  scene.environment = environment.texture;pmrem.dispose();
  for(const panel of lightRoom.children){panel.geometry.dispose();panel.material.dispose();}
  scene.add(new THREE.HemisphereLight(0xffffff,0x30211a,2.1));
  const light = new THREE.DirectionalLight(0xffffff,2.4);light.position.set(-4,5,5);scene.add(light);
  function foldedRibbon() {
    const geometry = new THREE.BufferGeometry(), positions = [], indices = [];
    const segments=112,cross=10;
    for(let i=0;i<=segments;i++) {
      const u=i/segments*Math.PI*2;
      for(let j=0;j<=cross;j++) {
        const v=(j/cross-.5)*.65,r=1+v*.35;
        positions.push(Math.sin(u)*r*.76,Math.cos(u)*r*1.16,Math.sin(u*2)*.25+v*Math.cos(u)*.65);
      }
    }
    for(let i=0;i<segments;i++)for(let j=0;j<cross;j++){
      const a=i*(cross+1)+j,b=a+cross+1;indices.push(a,b,a+1,b,b+1,a+1);
    }
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
  }
  const geometry = foldedRibbon();
  const ribbons = keys.map((key,i) => {
    const material=new THREE.MeshPhysicalMaterial({color:colors[i],metalness:.58,roughness:.24,clearcoat:1,clearcoatRoughness:.17,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set((i-1.5)*.49,Math.sin(i/3*Math.PI)*.16,(i%2)*.22);
    mesh.rotation.set(0,(i-1.5)*.48,(i-1.5)*-.12);mesh.userData.world=key;
    sculpture.add(mesh);return mesh;
  });
  const pointer=new THREE.Vector2(2,2),raycaster=new THREE.Raycaster();
  let visible=true,home=!location.hash||location.hash==='#home',dirty=true;
  let pulse,entrance,state=window.DesireeViewState,vocal=false;
  const motionEnabled=()=>window.DesireeMotion?.enabled()!==false;
  const invalidate=()=>dirty=true;
  const xTo=g.quickTo(sculpture.rotation,'x',{duration:.9,ease:'power3.out',onUpdate:invalidate});
  const yTo=g.quickTo(sculpture.rotation,'y',{duration:.9,ease:'power3.out',onUpdate:invalidate});
  function size() {
    const width=canvas.clientWidth,height=Math.max(1,canvas.clientHeight);
    if(!width)return;
    renderer.setSize(width,height,false);camera.aspect=width/height;
    camera.position.z=5.8*Math.max(1,1/camera.aspect);camera.updateProjectionMatrix();
    sculpture.scale.setScalar(width<200 ? .95 : 1);invalidate();
  }
  const observer=new ResizeObserver(size);observer.observe(stage);
  const intersection=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;invalidate();});intersection.observe(stage);
  function settle() {
    entrance?.progress(1).kill();pulse?.kill();
    g.killTweensOf(sculpture.rotation);g.killTweensOf(sculpture.scale);
    ribbons.forEach((ribbon,i)=>{g.killTweensOf(ribbon.position);ribbon.position.y=Math.sin(i/3*Math.PI)*.16;});
    sculpture.rotation.set(-.12,.22,-.08);size();invalidate();
  }
  function update(data) {
    if(!data)return;state=data;
    for(const ribbon of ribbons) {
      const world=data.worlds[ribbon.userData.world];
      ribbon.material.color.set(world?.available ? colors[keys.indexOf(ribbon.userData.world)] : '#827c72');
      ribbon.material.roughness=world?.error ? .4 : .24;
    }
    pulse?.kill();
    if((data.running||vocal)&&home&&motionEnabled())pulse=g.to(sculpture.rotation,{y:.38,duration:1.4,repeat:-1,yoyo:true,ease:'sine.inOut',onUpdate:invalidate});
    invalidate();
  }
  function enter() {
    if(!motionEnabled())return;
    entrance?.kill();entrance=g.timeline({onUpdate:invalidate});
    entrance.fromTo(sculpture.rotation,{y:-.7,z:-.2},{y:.22,z:-.08,duration:1.6,ease:'power3.out'},0);
    ribbons.forEach((ribbon,i)=>entrance.fromTo(ribbon.scale,{x:.1,y:.1,z:.1},{x:1,y:1,z:1,duration:1.2,ease:'power3.out'},i*.1));
  }
  stage.addEventListener('pointermove',event=>{
    if(!motionEnabled()||event.pointerType==='touch')return;
    const bounds=canvas.getBoundingClientRect();
    pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);
    xTo(-.12+pointer.y*.1);yTo(.22+pointer.x*.2);
    raycaster.setFromCamera(pointer,camera);canvas.classList.toggle('pickable',raycaster.intersectObjects(ribbons).length>0);invalidate();
  });
  stage.addEventListener('pointerleave',()=>{if(motionEnabled()){xTo(-.12);yTo(.22);}canvas.classList.remove('pickable');});
  canvas.addEventListener('click',event=>{
    const bounds=canvas.getBoundingClientRect();pointer.set((event.clientX-bounds.left)/bounds.width*2-1,-((event.clientY-bounds.top)/bounds.height)*2+1);
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObjects(ribbons)[0];
    if(hit)document.querySelector(`[data-world="${hit.object.userData.world}"]`).click();
  });
  document.querySelectorAll('[data-world]').forEach(door=>{
    const ribbon=ribbons[keys.indexOf(door.dataset.world)],base=ribbon.position.y;
    const highlight=on=>{if(motionEnabled())g.to(ribbon.position,{y:base+(on ? .2 : 0),duration:.5,ease:'power3.out',onUpdate:invalidate});};
    door.addEventListener('pointerenter',()=>highlight(true));door.addEventListener('pointerleave',()=>highlight(false));
    door.addEventListener('focus',()=>highlight(true));door.addEventListener('blur',()=>highlight(false));
  });
  document.querySelector('#home-question').addEventListener('focus',()=>{if(motionEnabled())g.to(sculpture.rotation,{y:.6,duration:.8,onUpdate:invalidate});});
  document.querySelector('#home-question').addEventListener('blur',()=>{if(motionEnabled())g.to(sculpture.rotation,{y:.22,duration:.8,onUpdate:invalidate});});
  window.addEventListener('desiree:state',event=>update(event.detail));
  window.addEventListener('desiree:voice',event=>{vocal=event.detail;update(state);});
  window.addEventListener('desiree:view',event=>{home=event.detail==='home';if(!home)settle();else{enter();update(state);}invalidate();});
  window.addEventListener('desiree:motion',()=>{if(!motionEnabled())settle();update(state);});
  window.addEventListener('desiree:scroll',event=>{if(home&&motionEnabled()){sculpture.rotation.z=-.08-event.detail*.12;invalidate();}});
  window.addEventListener('desiree:theme',event=>{renderer.toneMappingExposure=event.detail==='light' ? .95 : 1.15;invalidate();});
  document.addEventListener('visibilitychange',invalidate);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();stage.dataset.renderer='fallback';renderer.setAnimationLoop(null);});
  canvas.addEventListener('webglcontextrestored',()=>location.reload());
  let frames=0;
  renderer.setAnimationLoop(()=>{
    if(!visible||!home||document.hidden||!dirty)return;
    renderer.render(scene,camera);dirty=false;stage.dataset.frames=String(++frames);
  });
  stage.dataset.renderer='three';stage.dataset.revision=THREE.REVISION;
  size();update(state);enter();
  window.addEventListener('pagehide',()=>{
    settle();observer.disconnect();intersection.disconnect();renderer.setAnimationLoop(null);
    geometry.dispose();ribbons.forEach(ribbon=>ribbon.material.dispose());environment.dispose();renderer.dispose();
  },{once:true});
}
