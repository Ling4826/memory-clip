/** Procedural, closed shell. Units: mm. +Z is the front of the camera.
 * Caps come from Three.js ExtrudeGeometry; the matched wall grid stitches ports
 * and the split rim without Boolean operations or overlapping solid meshes.
 */
function makeShell(THREE, p) {
  const {w, h, d, wall} = p;
  const radius = p.radius ?? 5;
  const sign = p.front ? 1 : -1;
  const capZ = d / 2, innerZ = capZ - (p.front && p.frontFaceThickness ? p.frontFaceThickness : wall);
  const eps = 1e-5;
  if (![w,h,d,wall,radius].every(Number.isFinite) || wall <= 0 ||
      radius <= wall || radius >= Math.min(w,h)/2 || innerZ <= 0)
    throw new Error('Shell dimensions must leave a positive rounded interior.');
  const f = Math.fround;
  const points = [], outer = [], inner = [], edgeKinds = [];
  const ports = [];
  function port(kind, c, width, height, z) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const extent = kind === 'bottom' ? w/2-radius : h/2-radius;
    const lo = c-width/2, hi = c+width/2;
    const zlo = Math.max(0, sign*z-height/2), zhi = Math.min(innerZ, sign*z+height/2);
    if (zhi <= zlo+eps) return;
    if (lo <= -extent+eps || hi >= extent-eps || sign*z+height/2 >= innerZ-eps)
      throw new Error('A wall opening must fit inside the straight wall and below the face.');
    ports.push({kind, lo:f(lo), hi:f(hi), zlo:f(zlo), zhi:f(zhi)});
  }
  if (p.bottomPort) port('bottom', p.bottomPort.x ?? 0, p.bottomPort.w, p.bottomPort.h, p.bottomPort.z ?? 0);
  if (p.sidePort) port('right', p.sidePort.y ?? 0, p.sidePort.w, p.sidePort.h, p.sidePort.z ?? 0);
  const arcSteps = p.arcSteps ?? 12;
  function add(ox,oy,ix,iy,kind) {
    outer.push([f(ox),f(oy)]); inner.push([f(ix),f(iy)]); edgeKinds.push(kind);
  }
  const cx=w/2-radius, cy=h/2-radius, ir=radius-wall;
  // Each point labels the edge starting there. Insert port corners into both
  // contours so cap, wall and rim tessellations have identical boundaries.
  function straight(kind, from, to, outerFixed, innerFixed, horizontal) {
    const breaks=[from,to];
    ports.filter(q=>q.kind===kind).forEach(q=>breaks.push(q.lo,q.hi));
    const sorted=[...new Set(breaks)].sort((a,b)=>from<to?a-b:b-a);
    sorted.slice(0,-1).forEach(s=>horizontal ? add(s,outerFixed,s,innerFixed,kind) : add(outerFixed,s,innerFixed,s,kind));
  }
  function arc(x,y,angle) {
    for(let i=0;i<arcSteps;i++) {
      const a=angle+i*Math.PI/(2*arcSteps), c=Math.cos(a), s=Math.sin(a);
      add(x+radius*c,y+radius*s,x+ir*c,y+ir*s,'arc');
    }
  }
  straight('bottom',-cx,cx,-h/2,-h/2+wall,true);
  arc(cx,-cy,-Math.PI/2);
  straight('right',-cy,cy,w/2,w/2-wall,false);
  arc(cx,cy,0);
  straight('top',cx,-cx,h/2,h/2-wall,true);
  arc(-cx,cy,Math.PI/2);
  straight('left',cy,-cy,-w/2,-w/2+wall,false);
  arc(-cx,-cy,Math.PI);
  const holeSpecs=[...(p.holes||[]),...(p.screws||[])];
  const holeRings=holeSpecs.map(q=> {
    if (![q.x,q.y,q.r].every(Number.isFinite) || q.r <= 0) throw new Error('Invalid circular opening.');
    const n=q.segments ?? 48;
    const ring=Array.from({length:n},(_,i)=> {
      const a=i*Math.PI*2/n, x=q.x+q.r*Math.cos(a), y=q.y+q.r*Math.sin(a);
      const dx=Math.max(Math.abs(x)-cx,0), dy=Math.max(Math.abs(y)-cy,0);
      if (Math.abs(x)>w/2-wall-eps || Math.abs(y)>h/2-wall-eps || dx*dx+dy*dy>ir*ir-eps)
        throw new Error('A face opening touches the shell wall; move it inward.');
      return [f(x),f(y)];
    });
    const throughRadius=q.throughRadius??q.r;
    const throughRing=Array.from({length:n},(_,i)=>{
      const a=i*Math.PI*2/n,x=q.x+throughRadius*Math.cos(a),y=q.y+throughRadius*Math.sin(a);
      return [f(x),f(y)];
    });
    return {outer:ring,through:throughRing,depth:q.countersinkDepth??0};
  });
  for(let i=0;i<holeSpecs.length;i++) for(let j=i+1;j<holeSpecs.length;j++) {
    const a=holeSpecs[i],b=holeSpecs[j];
    if(Math.hypot(a.x-b.x,a.y-b.y)<=a.r+b.r+eps) throw new Error('Face openings overlap.');
  }
  const recessSpecs=(p.recesses||[]).map(q=>{
    if(![q.x,q.y,q.width,q.height,q.depth].every(Number.isFinite)||q.width<=0||q.height<=0||q.depth<=0||q.depth>=wall)
      throw new Error('Invalid shallow face recess.');
    if(Math.abs(q.x)+q.width/2>w/2-wall-eps||Math.abs(q.y)+q.height/2>h/2-wall-eps)
      throw new Error('Face recess touches the shell wall.');
    for(const hole of holeSpecs)if(Math.abs(q.x-hole.x)<q.width/2+hole.r&&Math.abs(q.y-hole.y)<q.height/2+hole.r)
      throw new Error('Face recess intersects a screw or port.');
    const ring=[[q.x-q.width/2,q.y-q.height/2],[q.x+q.width/2,q.y-q.height/2],[q.x+q.width/2,q.y+q.height/2],[q.x-q.width/2,q.y+q.height/2]].map(v=>v.map(f));
    return {...q,ring};
  });
  function vertex(a,z) { return [a[0],a[1],f(z)]; }
  function tri(a,b,c) {
    if(sign<0) [b,c]=[c,b];
    for(const q of [a,b,c]) points.push(q[0],q[1],f(q[2]*sign));
  }
  function quad(a,b,c,e) {tri(a,b,c);tri(a,c,e);}
  const zs=[...new Set([0,f(innerZ),f(capZ),...ports.flatMap(q=>[q.zlo,q.zhi])])].sort((a,b)=>a-b);
  function removed(i,z) {
    const kind=edgeKinds[i], j=(i+1)%outer.length;
    const s=kind==='bottom'?(outer[i][0]+outer[j][0])/2:(outer[i][1]+outer[j][1])/2;
    return ports.some(q=>q.kind===kind && s>q.lo-eps && s<q.hi+eps && z>q.zlo-eps && z<q.zhi+eps);
  }
  const N=outer.length;
  for(let i=0;i<N;i++) {
    const j=(i+1)%N;
    for(let k=0;k<zs.length-1;k++) {
      const a=zs[k],b=zs[k+1], mid=(a+b)/2, empty=removed(i,mid);
      if(!empty) {
        quad(vertex(outer[i],a),vertex(outer[j],a),vertex(outer[j],b),vertex(outer[i],b));
        if(b<=innerZ+eps)
          quad(vertex(inner[i],a),vertex(inner[i],b),vertex(inner[j],b),vertex(inner[j],a));
      } else {
        // Port reveals; omit the reveal at Z=0 because this is an open notch.
        if(a>eps && !removed(i,(zs[k-1]+a)/2))
          quad(vertex(outer[i],a),vertex(outer[j],a),vertex(inner[j],a),vertex(inner[i],a));
        if(k+2<zs.length && !removed(i,(b+zs[k+2])/2))
          quad(vertex(outer[i],b),vertex(inner[i],b),vertex(inner[j],b),vertex(outer[j],b));
        if(!removed((i+N-1)%N,mid))
          quad(vertex(outer[i],a),vertex(inner[i],a),vertex(inner[i],b),vertex(outer[i],b));
        if(!removed(j,mid))
          quad(vertex(outer[j],a),vertex(outer[j],b),vertex(inner[j],b),vertex(inner[j],a));
      }
    }
    if(!removed(i,(zs[0]+zs[1])/2))
      quad(vertex(outer[i],0),vertex(inner[i],0),vertex(inner[j],0),vertex(outer[j],0));
  }
  // Extract end caps from native extrusions. The optional edge split retains
  // collinear port-grid vertices even if the cap triangulator simplifies them.
  function cap(contour,z,outward) {
    const shape=new THREE.Shape();
    shape.moveTo(...contour[0]); contour.slice(1).forEach(q=>shape.lineTo(...q)); shape.closePath();
    for(const rings of holeRings) {
      const ring=outward?rings.outer:rings.through;
      const hole=new THREE.Path(); hole.moveTo(...ring[0]); ring.slice(1).forEach(q=>hole.lineTo(...q)); hole.closePath(); shape.holes.push(hole);
    }
    if(outward)for(const recess of recessSpecs){const hole=new THREE.Path();hole.moveTo(...recess.ring[0]);recess.ring.slice(1).forEach(q=>hole.lineTo(...q));hole.closePath();shape.holes.push(hole);}
    const source=new THREE.ExtrudeGeometry(shape,{depth:wall,bevelEnabled:false,steps:1,curveSegments:1});
    const attr=source.getAttribute('position');
    const boundary=contour.concat(...holeRings.map(q=>outward?q.outer:q.through),...(outward?recessSpecs.map(q=>q.ring):[]));
    for(let i=0;i<attr.count;i+=3) {
      if(Math.abs(attr.getZ(i)-wall)>eps || Math.abs(attr.getZ(i+1)-wall)>eps || Math.abs(attr.getZ(i+2)-wall)>eps) continue;
      const abc=[0,1,2].map(j=>[attr.getX(i+j),attr.getY(i+j)]);
      const area=(abc[1][0]-abc[0][0])*(abc[2][1]-abc[0][1])-(abc[1][1]-abc[0][1])*(abc[2][0]-abc[0][0]);
      if((area>0)!==outward) [abc[1],abc[2]]=[abc[2],abc[1]];
      const ring=[];
      for(let j=0;j<3;j++) {
        const a=abc[j],b=abc[(j+1)%3],dx=b[0]-a[0],dy=b[1]-a[1],len2=dx*dx+dy*dy;
        const splits=[];
        for(const q of boundary) {
          const t=((q[0]-a[0])*dx+(q[1]-a[1])*dy)/len2;
          if(t>1e-7 && t<1-1e-7 && Math.abs((q[0]-a[0])*dy-(q[1]-a[1])*dx)<1e-5)
            splits.push({q,t});
        }
        ring.push(a,...splits.sort((a,b)=>a.t-b.t).map(s=>s.q));
      }
      if(ring.length===3) tri(vertex(abc[0],z),vertex(abc[1],z),vertex(abc[2],z));
      else {
        const center=[f((abc[0][0]+abc[1][0]+abc[2][0])/3),f((abc[0][1]+abc[1][1]+abc[2][1])/3)];
        for(let j=0;j<ring.length;j++) tri(vertex(center,z),vertex(ring[j],z),vertex(ring[(j+1)%ring.length],z));
      }
    }
    source.dispose();
  }
  cap(outer,capZ,true); cap(inner,innerZ,false);
  for(const rings of holeRings) for(let i=0;i<rings.outer.length;i++) {
    const j=(i+1)%rings.outer.length,top=rings.outer,low=rings.through;
    const transition=capZ-rings.depth;
    quad(vertex(low[i],innerZ),vertex(low[i],transition),vertex(low[j],transition),vertex(low[j],innerZ));
    if(rings.depth>0)quad(vertex(low[i],transition),vertex(top[i],capZ),vertex(top[j],capZ),vertex(low[j],transition));
  }
  for(const recess of recessSpecs){
    const top=recess.ring,low=recess.depthZ??capZ-recess.depth;
    for(let i=0;i<top.length;i++){const j=(i+1)%top.length;quad(vertex(top[i],capZ),vertex(top[j],capZ),vertex(top[j],low),vertex(top[i],low));}
    const center=[f(recess.x),f(recess.y)];for(let i=0;i<top.length;i++)tri(vertex(center,low),vertex(top[i],low),vertex(top[(i+1)%top.length],low));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData={units:'mm',closedShell:true,wallThickness:wall,front:!!p.front,faceRecesses:recessSpecs.map(({x,y,width,height,depth})=>({x,y,width,height,depth}))};
  return geometry;
}

/** Welded-position edge audit. A closed oriented mesh uses each edge once in
 * each direction. Also reports signed volume (positive = outward normals). */
function auditClosedGeometry(geometry, tolerance=1e-5) {
  const a=geometry.getAttribute('position'), index=geometry.getIndex();
  const edges=new Map(); let degenerate=0,volume=0;
  const count=index?index.count:a.count;
  const key=v=>v.map(q=>Math.round(q/tolerance)).join(',');
  for(let i=0;i<count;i+=3) {
    const v=[0,1,2].map(j=> {const n=index?index.getX(i+j):i+j;return[a.getX(n),a.getY(n),a.getZ(n)];});
    const keys=v.map(key);
    if(new Set(keys).size<3) degenerate++;
    volume+=(v[0][0]*(v[1][1]*v[2][2]-v[1][2]*v[2][1])+v[0][1]*(v[1][2]*v[2][0]-v[1][0]*v[2][2])+v[0][2]*(v[1][0]*v[2][1]-v[1][1]*v[2][0]))/6;
    for(let j=0;j<3;j++) {
      const x=keys[j],y=keys[(j+1)%3],forward=x<y,k=forward?x+'|'+y:y+'|'+x;
      const e=edges.get(k)||{count:0,balance:0};e.count++;e.balance+=forward?1:-1;edges.set(k,e);
    }
  }
  const invalid=[...edges.entries()].filter(([,e])=>e.count!==2||e.balance!==0);
  return {closed:invalid.length===0&&degenerate===0,triangles:count/3,edges:edges.size,invalidEdges:invalid.length,degenerate,volumeMm3:volume,examples:invalid.slice(0,8)};
}

export {makeShell,auditClosedGeometry};
