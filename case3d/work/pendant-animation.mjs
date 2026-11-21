// Helpers for the recorded neck-lanyard clips. The JSON stores world-space
// positions and [w, x, y, z] quaternions; Three.js uses (x, y, z, w).
function rotateWxyz(q, v) {
  const [w, x, y, z] = q;
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}

// The JSON keeps one torso track per scenario and a flat device track per clip.
// Expand a clip to frames {t, torso, device, cord, contact, flip} once, on first use.
export function expandPendantClip(data, clip) {
  if (clip.frames) return clip;
  const track = data.scenarios[clip.scenario], frames = [];
  for (let i = 0; i < track.frameCount; i++) {
    const torso = { p: track.torso.slice(i * 7, i * 7 + 3), q: track.torso.slice(i * 7 + 3, i * 7 + 7) };
    const device = { p: clip.device.slice(i * 7, i * 7 + 3), q: clip.device.slice(i * 7 + 3, i * 7 + 7) };
    const onTorso = local => rotateWxyz(torso.q, local).map((value, axis) => value + torso.p[axis]);
    const onDevice = body => rotateWxyz(device.q, body).map((value, axis) => value + device.p[axis]);
    const cord = [onTorso(clip.anchorsLocal[0]), ...clip.attachFromCom.map(onDevice), onTorso(clip.anchorsLocal[1])];
    const flags = Number(clip.flags[i]);
    frames.push({ t: Math.round((track.t0 + i / data.fps) * 1e4) / 1e4, torso, device, cord, contact: (flags & 1) > 0, flip: (flags & 2) > 0 });
  }
  clip.frames = frames;
  return clip;
}

export function samplePendantFrame(THREE, clip, elapsedSeconds) {
  const frames = clip.frames;
  if (!frames?.length) throw new Error(`Clip ${clip.id ?? ''} has no frames`);

  const firstTime = frames[0].t;
  const duration = frames[frames.length - 1].t - firstTime;
  const wrapped = duration > 0 ? ((elapsedSeconds % duration) + duration) % duration : 0;
  const time = Number((firstTime + wrapped).toFixed(6));
  let low = 0, high = frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (frames[mid].t <= time) low = mid;
    else high = mid - 1;
  }
  const a = frames[low], b = frames[Math.min(low + 1, frames.length - 1)];
  const amount = a === b ? 0 : THREE.MathUtils.clamp((time - a.t) / (b.t - a.t), 0, 1);
  const lerpArray = (left, right) => left.map((value, index) => THREE.MathUtils.lerp(value, right[index], amount));
  const lerpQuaternion = (left, right) => {
    const qa = new THREE.Quaternion(left[1], left[2], left[3], left[0]);
    const qb = new THREE.Quaternion(right[1], right[2], right[3], right[0]);
    qa.slerp(qb, amount);
    return [qa.w, qa.x, qa.y, qa.z];
  };
  const points = a.cord.map((point, index) => lerpArray(point, b.cord[index]));
  return {
    t: THREE.MathUtils.lerp(a.t, b.t, amount),
    torso: { p: lerpArray(a.torso.p, b.torso.p), q: lerpQuaternion(a.torso.q, b.torso.q) },
    device: { p: lerpArray(a.device.p, b.device.p), q: lerpQuaternion(a.device.q, b.device.q) },
    cord: points,
    contact: amount < 1 ? a.contact : b.contact,
    flip: amount < 1 ? a.flip : b.flip,
  };
}

function roundedBoxGeometry(THREE, size) {
  const [width, height, depth] = size;
  const bevel = Math.min(1.5, depth / 8, width / 10, height / 10);
  const radius = Math.min(5, width / 4, height / 4);
  const halfWidth = width / 2 - bevel, halfHeight = height / 2 - bevel;
  const corner = Math.max(0.5, radius - bevel);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + corner, -halfHeight);
  shape.lineTo(halfWidth - corner, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + corner);
  shape.lineTo(halfWidth, halfHeight - corner);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - corner, halfHeight);
  shape.lineTo(-halfWidth + corner, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - corner);
  shape.lineTo(-halfWidth, -halfHeight + corner);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + corner, -halfHeight);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.1, depth - bevel * 2),
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 6,
  });
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const center = bounds.getCenter(new THREE.Vector3());
  const extent = bounds.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(width / extent.x, height / extent.y, depth / extent.z);
  return geometry;
}

function vectorFrom(THREE, array) {
  return new THREE.Vector3(array[0], array[1], array[2]);
}

function quaternionFromWxyz(THREE, array) {
  return new THREE.Quaternion(array[1], array[2], array[3], array[0]).normalize();
}

function makeRing(THREE, radius, tube, material, x, y, z, scaleY = 1) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 10, 32), material);
  mesh.position.set(x, y, z);
  mesh.scale.y = scaleY;
  return mesh;
}

function buildRig(THREE, data, clip, offsetX, index) {
  const firstRig = index === 0;
  const wrapper = new THREE.Group();
  wrapper.name = `pendant-rig-${clip.id}`;
  wrapper.position.x = offsetX;

  const torso = new THREE.Group();
  torso.name = `pendant-torso-${clip.id}`;
  wrapper.add(torso);

  const chestMaterial = new THREE.MeshBasicMaterial({
    color: firstRig ? 0xcab8a7 : 0xa7c6bf,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const chest = new THREE.Mesh(new THREE.PlaneGeometry(160, 220), chestMaterial);
  chest.name = `pendant-chest-${clip.id}`;
  chest.position.copy(vectorFrom(THREE, data.chest.pointLocal));
  chest.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), vectorFrom(THREE, data.chest.normalLocal).normalize());
  torso.add(chest);
  const chestEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(chest.geometry),
    new THREE.LineBasicMaterial({ color: 0x748b82, transparent: true, opacity: 0.65 }),
  );
  chest.add(chestEdge);

  const device = new THREE.Group();
  device.name = `pendant-device-${clip.id}`;
  torso.add(device);
  const baseColor = firstRig ? 0x416e76 : 0x427d72;
  const boxMaterial = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.42, metalness: 0.08 });
  const box = new THREE.Mesh(roundedBoxGeometry(THREE, clip.box.size), boxMaterial);
  box.name = `pendant-box-${clip.id}`;
  box.position.copy(vectorFrom(THREE, clip.box.centerFromCom));
  box.castShadow = true;
  box.receiveShadow = true;
  device.add(box);

  // Rings sit at the recorded attach points, so B/G (on the COM line) differ from the back-flush designs.
  const attachmentBackZ = clip.box.centerFromCom[2] - clip.box.size[2] / 2 - 1.2;
  if (clip.loop) {
    const loopMaterial = new THREE.MeshStandardMaterial({ color: 0x243f46, roughness: 0.65 });
    const [outerWidth, outerHeight] = clip.loop.outer;
    const point = clip.attachFromCom[0];
    const loop = makeRing(THREE, outerWidth / 2 - clip.loop.thickness / 2, clip.loop.thickness / 2,
      loopMaterial, point[0], point[1], point[2], outerHeight / outerWidth);
    loop.name = `pendant-single-loop-${clip.id}`;
    device.add(loop);
  } else {
    const holeMaterial = new THREE.MeshStandardMaterial({ color: 0x203a3b, roughness: 0.8 });
    for (const point of clip.attachFromCom) {
      const hole = makeRing(THREE, 4, 1.25, holeMaterial, point[0], point[1], point[2]);
      hole.name = `pendant-lanyard-hole-${clip.id}`;
      device.add(hole);
    }
  }
  if (clip.pad) {
    const padMaterial = new THREE.MeshStandardMaterial({ color: 0x5b6258, roughness: 0.95 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(clip.pad.size[0], clip.pad.size[1], clip.pad.thickness), padMaterial);
    pad.name = `pendant-friction-pad-${clip.id}`;
    pad.position.set(clip.box.centerFromCom[0], clip.box.centerFromCom[1], attachmentBackZ - clip.pad.thickness / 2);
    device.add(pad);
  }

  const arrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(clip.box.centerFromCom[0], clip.box.centerFromCom[1], clip.box.centerFromCom[2] + clip.box.size[2] / 2 + 1),
    25,
    0xd18836,
    8,
    5,
  );
  arrow.name = `pendant-camera-direction-${clip.id}`;
  device.add(arrow);

  const cordPositions = new Float32Array(clip.frames[0].cord.length * 3);
  const cordGeometry = new THREE.BufferGeometry();
  cordGeometry.setAttribute('position', new THREE.BufferAttribute(cordPositions, 3));
  const cord = new THREE.Line(cordGeometry, new THREE.LineBasicMaterial({ color: 0x4b5050, linewidth: 2 }));
  cord.name = `pendant-cord-${clip.id}`;
  torso.add(cord);

  const rig = { clip, wrapper, torso, device, box, cord, baseColor };
  rig.applyFrame = frame => {
    const torsoPosition = vectorFrom(THREE, frame.torso.p);
    const torsoRotation = quaternionFromWxyz(THREE, frame.torso.q);
    const inverseTorso = torsoRotation.clone().invert();
    torso.position.copy(torsoPosition);
    torso.quaternion.copy(torsoRotation);
    device.position.copy(vectorFrom(THREE, frame.device.p).sub(torsoPosition).applyQuaternion(inverseTorso));
    device.quaternion.copy(inverseTorso).multiply(quaternionFromWxyz(THREE, frame.device.q));
    const positions = cord.geometry.getAttribute('position');
    for (let i = 0; i < frame.cord.length; i++) {
      const point = vectorFrom(THREE, frame.cord[i]).sub(torsoPosition).applyQuaternion(inverseTorso);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
    positions.needsUpdate = true;
    cord.geometry.computeBoundingSphere();
    box.material.color.set(frame.flip ? 0xe09034 : baseColor);
    box.material.emissive.set(frame.flip ? 0x4b2107 : 0x000000);
    rig.frame = frame;
  };
  return rig;
}

export function createPendantMode(THREE, data, clipIds = ['A-brisk-30']) {
  const clips = clipIds.map(id => {
    const clip = data.clips.find(item => item.id === id);
    if (!clip) throw new Error(`Unknown pendant clip: ${id}`);
    return expandPendantClip(data, clip);
  });
  const root = new THREE.Group();
  root.name = 'pendant-simulation';
  const rigs = clips.map((clip, index) => {
    const offsetX = clips.length === 2 ? (index === 0 ? -125 : 125) : 0;
    const rig = buildRig(THREE, data, clip, offsetX, index);
    root.add(rig.wrapper);
    return rig;
  });
  let disposed = false;
  const mode = {
    root,
    rigs,
    update(elapsedSeconds) {
      for (const rig of rigs) rig.applyFrame(samplePendantFrame(THREE, rig.clip, elapsedSeconds));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.traverse(object => {
        object.geometry?.dispose();
        if (object.material) {
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
        }
      });
      root.removeFromParent();
    },
  };
  mode.update(0);
  return mode;
}
