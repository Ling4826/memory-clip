from pathlib import Path
p=Path('work/app.js');s=p.read_text(encoding='utf-8-sig');s=s.replace("const controls=new OrbitControls", "const leaderSVG=document.createElementNS('http://www.w3.org/2000/svg','svg');leaderSVG.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';viewport.insertBefore(leaderSVG,labelRenderer.domElement);\nconst controls=new OrbitControls")
s=s.replace("pos=new THREE.Vector3(...CONFIG.view.iso).multiplyScalar(factor*(1+e*0.6))", "pos=new THREE.Vector3(...(e>0?CONFIG.view.exploded:CONFIG.view.iso)).multiplyScalar(factor*(1+e*0.2))")
s=s.replace("$('loadStatus').hidden=true;", """function arrangeLabels() {
 const width=viewport.clientWidth,height=viewport.clientHeight;
 leaderSVG.style.display=state.labels?'block':'none';
 if(!state.labels)return;
 while(leaderSVG.children.length<device.labels.length){const l=document.createElementNS('http://www.w3.org/2000/svg','line');l.setAttribute('stroke','#739a8a');l.setAttribute('stroke-width','0.8');l.setAttribute('opacity','0.65');leaderSVG.appendChild(l);}
 while(leaderSVG.children.length>device.labels.length)leaderSVG.lastChild.remove();
 const anchors=device.labels.map((l,i)=>{const p=l.getWorldPosition(new THREE.Vector3()).project(camera);return{l,i,x:(p.x+1)*width/2,y:(1-p.y)*height/2,side:[0,1,5,6,9].includes(i)?-1:1};});
 for(const side of [-1,1]) {
  const entries=anchors.filter(a=>a.side===side).sort((a,b)=>a.y-b.y);
  entries.forEach((a,n)=>{
   const x=width*(side===-1?0.24:0.78),top=Math.min(height*0.3,150),bottom=height-105;
   const y=entries.length===1?(top+bottom)/2:top+n*(bottom-top)/(entries.length-1);
   a.l.element.style.marginLeft=(x-a.x)+'px';a.l.element.style.marginTop=(y-a.y)+'px';
   const line=leaderSVG.children[a.i];line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',x-side*a.l.element.offsetWidth/2);line.setAttribute('y2',y);
  });
 }
}
$('loadStatus').hidden=true;""")
s=s.replace('controls.update();renderer.render(scene,camera);labelRenderer.render(scene,camera);','controls.update();renderer.render(scene,camera);arrangeLabels();labelRenderer.render(scene,camera);')
p.write_text(s,encoding='utf-8')
p=Path('work/config.js');s=p.read_text(encoding='utf-8-sig').replace('iso: [135,65,200],','iso: [135,65,200], exploded: [240,90,170],').replace('separation: 14, y: 21','separation: 14, y: 1');p.write_text(s,encoding='utf-8')
p=Path('work/build.mjs');s=p.read_text(encoding='utf-8-sig').replace('.part-label::before{content:"";position:absolute;left:50%;top:100%;height:8px;border-left:1px solid #839c8e}', '.part-label::before{display:none}')
p.write_text(s,encoding='utf-8')
