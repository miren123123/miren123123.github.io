import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

// CC0 original designs from 3dassets.dev (not game-extracted models).
const FILES = {
  rifle: '/vendor/models/rifle.glb',
  pistol: '/vendor/models/pistol.glb',
  smg: '/vendor/models/smg.glb',
};

const loader = new GLTFLoader();
const templates = {};
const waiters = [];
let ready = false;

function muzzleFlash(group, x, y, z) {
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff1c4,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const flashes = [];
  for (const rot of [0, Math.PI / 2, Math.PI / 5]) {
    const sprite = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), material);
    sprite.position.set(x, y, z);
    sprite.rotation.z = rot;
    sprite.visible = false;
    sprite.renderOrder = 3;
    group.add(sprite);
    flashes.push(sprite);
  }
  return flashes;
}

function centerAndFace(model) {
  model.rotation.y = Math.PI;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.updateMatrixWorld(true);
  const sized = new THREE.Box3().setFromObject(model);
  return sized.getSize(new THREE.Vector3());
}

function paintTex(draw) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function brushTex() {
  if (brushTex.tex) return brushTex.tex;
  brushTex.tex = paintTex((g, size) => {
    g.fillStyle = '#b7b7b7';
    g.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 28) {
      g.fillStyle = '#3a3a3a';
      g.fillRect(0, y, size, 5);
      g.fillStyle = '#e4e4e4';
      g.fillRect(0, y + 6, size, 3);
    }
  });
  return brushTex.tex;
}

function polyTex() {
  if (polyTex.tex) return polyTex.tex;
  polyTex.tex = paintTex((g, size) => {
    g.fillStyle = '#b4b4b4';
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#8e8e8e';
    for (let i = 0; i < 28; i++) {
      g.beginPath();
      g.ellipse(30 + (i * 97) % size, 20 + (i * 53) % size, 26 + (i % 4) * 8, 10, i * 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#6a6a6a';
    g.lineWidth = 4;
    for (let y = 24; y < size; y += 36) {
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(140, y - 8, 320, y + 10, size, y);
      g.stroke();
    }
  });
  return polyTex.tex;
}

function grainNormal() {
  if (grainNormal.tex) return grainNormal.tex;
  grainNormal.tex = paintTex((g, size) => {
    g.fillStyle = 'rgb(128,128,255)';
    g.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 28) {
      g.fillStyle = 'rgb(70,128,255)';
      g.fillRect(0, y, size, 5);
      g.fillStyle = 'rgb(196,128,246)';
      g.fillRect(0, y + 6, size, 3);
    }
  });
  return grainNormal.tex;
}

const GUN_SHADER = {
  vertex(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGunPos;\nvarying vec3 vGunN;\nvarying vec3 vGunT;\nvarying vec3 vGunB;')
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        'vGunPos = position;',
        'vGunN = normal;',
        'vec3 gT = cross(normal, vec3(0.0, 1.0, 0.0));',
        'if (dot(gT, gT) < 0.04) gT = cross(normal, vec3(1.0, 0.0, 0.0));',
        'gT = normalize(gT);',
        'vec3 gB = normalize(cross(normal, gT));',
        'vGunT = normalize(mat3(modelViewMatrix) * gT);',
        'vGunB = normalize(mat3(modelViewMatrix) * gB);',
      ].join('\n'));
  },
  fragment(shader) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGunPos;\nvarying vec3 vGunN;\nvarying vec3 vGunT;\nvarying vec3 vGunB;\nuniform sampler2D gunMap;\nuniform sampler2D gunNor;\nuniform float gunScale;\nuniform float gunBump;\nuniform float gunEdge;\nuniform float gunLo;\nuniform float gunHi;')
      .replace('#include <roughnessmap_fragment>', [
        'float roughnessFactor = roughness;',
        'vec3 gw = abs(normalize(vGunN));',
        'gw /= (gw.x + gw.y + gw.z + 0.0001);',
        'float gr = texture2D(gunMap, vGunPos.zy * gunScale).g * gw.x',
        ' + texture2D(gunMap, vGunPos.xz * gunScale).g * gw.y',
        ' + texture2D(gunMap, vGunPos.xy * gunScale).g * gw.z;',
        'roughnessFactor = mix(gunHi, gunLo, gr);',
        'vec3 nmap = texture2D(gunNor, vGunPos.zy * gunScale).xyz * gw.x',
        ' + texture2D(gunNor, vGunPos.xz * gunScale).xyz * gw.y',
        ' + texture2D(gunNor, vGunPos.xy * gunScale).xyz * gw.z;',
        'nmap = nmap * 2.0 - 1.0;',
      ].join('\n'))
      .replace('#include <normal_fragment_begin>', [
        '#include <normal_fragment_begin>',
        'normal = normalize(vGunT * nmap.x * gunBump + vGunB * nmap.y * gunBump + normal * nmap.z);',
        'float edge = length(fwidth(normal));',
        'float wear = smoothstep(0.85, 1.4, edge) * gunEdge;',
        'roughnessFactor = mix(roughnessFactor, 0.18, wear);',
        'diffuseColor.rgb += vec3(0.045) * wear;',
      ].join('\n'));
  },
};

function creaseNormals(geometry) {
  if (!geometry || geometry.userData.gunCreased) return;
  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');
  if (!pos || !norm) return;
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 800)},${Math.round(pos.getY(i) * 800)},${Math.round(pos.getZ(i) * 800)}`;
    const list = groups.get(key);
    if (list) list.push(i);
    else groups.set(key, [i]);
  }
  const out = new Float32Array(pos.count * 3);
  const limit = Math.cos(38 * Math.PI / 180);
  const n = new THREE.Vector3();
  const o = new THREE.Vector3();
  const acc = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.set(norm.getX(i), norm.getY(i), norm.getZ(i));
    acc.copy(n);
    for (const j of groups.get(`${Math.round(pos.getX(i) * 800)},${Math.round(pos.getY(i) * 800)},${Math.round(pos.getZ(i) * 800)}`)) {
      if (j === i) continue;
      o.set(norm.getX(j), norm.getY(j), norm.getZ(j));
      if (n.dot(o) >= limit) acc.add(o);
    }
    acc.normalize();
    out[i * 3] = acc.x;
    out[i * 3 + 1] = acc.y;
    out[i * 3 + 2] = acc.z;
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  geometry.userData.gunCreased = true;
}

function stampGunMesh(geometry) {
  if (!geometry || geometry.userData.gunStamped) return;
  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');
  if (!pos || !norm) return;
  const uv = new Float32Array(pos.count * 2);
  const tangent = new Float32Array(pos.count * 4);
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * 6;
    uv[i * 2 + 1] = pos.getY(i) * 6;
    n.set(norm.getX(i), norm.getY(i), norm.getZ(i));
    t.set(0, 0, 1);
    if (Math.abs(n.z) > 0.92) t.set(1, 0, 0);
    t.addScaledVector(n, -n.dot(t));
    if (t.lengthSq() < 1e-6) t.set(1, 0, 0);
    t.normalize();
    tangent[i * 4] = t.x;
    tangent[i * 4 + 1] = t.y;
    tangent[i * 4 + 2] = t.z;
    tangent[i * 4 + 3] = 1;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('tangent', new THREE.BufferAttribute(tangent, 4));
  geometry.userData.gunStamped = true;
}

function bindGunSurface(material, tex, scale, bump, edge, lo, hi, key) {
  material.userData.gunSurface = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.gunMap = { value: tex };
    shader.uniforms.gunNor = { value: grainNormal() };
    shader.uniforms.gunScale = { value: scale };
    shader.uniforms.gunBump = { value: bump };
    shader.uniforms.gunEdge = { value: edge };
    shader.uniforms.gunLo = { value: lo };
    shader.uniforms.gunHi = { value: hi };
    GUN_SHADER.vertex(shader);
    GUN_SHADER.fragment(shader);
  };
  material.customProgramCacheKey = () => key;
}

function finishGunMaterial(material) {
  const name = material.name || '';
  if (/ember|lamp/i.test(name)) {
    material.emissive = material.color.clone();
    material.emissiveIntensity = /red/i.test(name) ? 1.6 : 0.55;
    material.envMapIntensity = 1.3;
    return material;
  }
  if (/glass/i.test(name)) {
    const glass = new THREE.MeshPhysicalMaterial({
      name,
      color: material.color.clone(),
      roughness: 0.04,
      metalness: 0,
      envMapIntensity: 2.8,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.72,
    });
    return glass;
  }
  const metal = /gunmetal|steel|alloy|brass|copper/i.test(name) || material.metalness > 0.4;
  const bright = /steelBright/i.test(name);
  const soft = /brass|copper/i.test(name);
  const rubber = /rubber/i.test(name);
  const color = material.color.clone();
  if (/gunmetal|alloy/i.test(name)) color.set(0x121416);
  if (bright) color.set(0x8d949c);
  const next = new THREE.MeshPhysicalMaterial({
    name,
    color,
    metalness: metal ? 1 : 0,
    roughness: bright ? 0.28 : soft ? 0.34 : metal ? 0.55 : rubber ? 0.94 : 0.8,
    clearcoat: bright ? 0.22 : 0,
    clearcoatRoughness: 0.28,
    envMapIntensity: bright ? 1.8 : metal ? 1.05 : 0.35,
  });
  if (metal) bindGunSurface(next, brushTex(), bright ? 3.4 : 2.5, bright ? 1.15 : 1.55, 1, bright ? 0.16 : soft ? 0.22 : 0.28, bright ? 0.42 : soft ? 0.5 : 0.62, 'gun-metal-groove');
  else bindGunSurface(next, polyTex(), 2.4, 0.16, 0, rubber ? 0.9 : 0.7, rubber ? 0.98 : 0.88, 'gun-poly-grain');
  return next;
}

function tuneMaterials(root) {
  const swaps = new Map();
  const finish = (material) => {
    if (!material) return material;
    if (swaps.has(material)) return swaps.get(material);
    const next = finishGunMaterial(material);
    swaps.set(material, next);
    return next;
  };
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.frustumCulled = false;
    obj.castShadow = false;
    obj.receiveShadow = false;
    creaseNormals(obj.geometry);
    stampGunMesh(obj.geometry);
    obj.material = Array.isArray(obj.material) ? obj.material.map(finish) : finish(obj.material);
  });
}

function leatherMaps() {
  const size = 512;
  const color = document.createElement('canvas');
  color.width = size;
  color.height = size;
  const g = color.getContext('2d');
  g.fillStyle = '#3c4238';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 7000; i++) {
    const shade = 36 + Math.random() * 46;
    g.fillStyle = `rgba(${shade},${shade + 6},${shade - 4},${0.22 + Math.random() * 0.35})`;
    g.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 3 + Math.random() * 7);
  }
  g.fillStyle = 'rgba(92, 84, 68, 0.45)';
  g.fillRect(0, 150, size, 90);
  g.strokeStyle = 'rgba(18,16,12,0.8)';
  g.lineWidth = 4;
  for (let y = 48; y < size; y += 42) {
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(120, y - 10, 280, y + 12, size, y - 2);
    g.stroke();
  }
  g.strokeStyle = '#c6ad78';
  g.lineWidth = 3;
  g.strokeRect(18, 18, size - 36, size - 36);
  g.setLineDash([10, 7]);
  g.strokeRect(34, 34, size - 68, size - 68);
  g.setLineDash([]);
  const height = document.createElement('canvas');
  height.width = size;
  height.height = size;
  const hg = height.getContext('2d');
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, size, size);
  for (let i = 0; i < 2500; i++) {
    hg.fillStyle = Math.random() > 0.5 ? '#9a9a9a' : '#6a6a6a';
    hg.fillRect(Math.random() * size, Math.random() * size, 2, 4);
  }
  hg.strokeStyle = '#5a5a5a';
  hg.lineWidth = 4;
  for (let y = 70; y < size; y += 90) {
    hg.beginPath();
    hg.moveTo(0, y);
    hg.bezierCurveTo(140, y - 16, 300, y + 18, size, y + 4);
    hg.stroke();
  }
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const bump = new THREE.CanvasTexture(height);
  bump.colorSpace = THREE.LinearSRGBColorSpace;
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  const material = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.03,
    roughness: 0.62,
    metalness: 0.02,
    color: 0xffffff,
    sheen: 0.42,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color(0x8d7b68),
    side: THREE.DoubleSide,
  });
  return material;
}

const leather = leatherMaps();

function glove(side) {
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.02, 0.064), leather);
  const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.01, 0.028), leather);
  knuckles.position.set(0, 0.012, -0.012);
  const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.014, 0.036), leather);
  fingers.position.set(0, -0.004, -0.042);
  fingers.rotation.x = 0.45;
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.014, 0.03), leather);
  thumb.position.set(0.038, -0.002, -0.008);
  thumb.rotation.z = 0.5;
  const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.018, 0.026), leather);
  cuff.position.set(0, 0, 0.04);
  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.062, 0.006, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x161816, roughness: 0.7 }),
  );
  strap.position.set(0, 0.012, 0.028);
  hand.add(palm, knuckles, fingers, thumb, cuff, strap);
  hand.scale.set(side < 0 ? -1 : 1, 1, 1);
  return hand;
}

function mount(group, model, kind) {
  tuneMaterials(model);
  const size = centerAndFace(model);
  templates[kind] = model.clone(true);
  group.add(model);
  const barrelY = size.y * (kind === 'pistol' ? 0.08 : 0.02);
  group.userData.muzzle.set(0, barrelY, -size.z * 0.5 - 0.01);
  for (const sprite of group.userData.flashes) sprite.position.copy(group.userData.muzzle);
  const sightY = size.y * (kind === 'pistol' ? 0.34 : 0.42);
  const sightZ = kind === 'pistol' ? size.z * 0.12 : -size.z * 0.04;
  group.userData.aim.set(0, -sightY + 0.012, -0.32 - sightZ);
  if (kind === 'pistol') group.userData.rest.set(0.16, -0.2, -0.34);
  else if (kind === 'smg') group.userData.rest.set(0.1, -0.2, -0.38);
  else group.userData.rest.set(0.1, -0.15, -0.36);
  if (kind !== 'pistol') {
    group.userData.restY = group.userData.rest.y;
  } else {
    const firing = glove(1);
    firing.position.set(0.02, -size.y * 0.08, size.z * 0.06);
    firing.rotation.set(-0.42, -0.3, 0.16);
    group.add(firing);
  }
  group.userData.restY = group.userData.rest.y;
  group.position.copy(group.userData.rest);
  if (templates.rifle && templates.pistol && templates.smg && !ready) {
    ready = true;
    for (const fn of waiters.splice(0)) fn();
  }
}

export function createViewmodel(kind) {
  const group = new THREE.Group();
  group.name = kind;
  group.userData.rest = new THREE.Vector3(0.16, -0.22, -0.42);
  group.userData.aim = new THREE.Vector3(0, -0.12, -0.36);
  group.userData.muzzle = new THREE.Vector3(0, 0.04, -0.55);
  group.userData.flashes = muzzleFlash(group, 0, 0.04, -0.58);
  group.userData.blend = 0;
  group.userData.restY = -0.22;
  group.visible = false;
  loader.load(FILES[kind], (gltf) => mount(group, gltf.scene, kind));
  return group;
}

export function gunsReady() {
  return ready;
}

export function onGuns(fn) {
  if (ready) fn();
  else waiters.push(fn);
}

export function worldGun(kind) {
  const source = templates[kind];
  if (!source) return null;
  const gun = source.clone(true);
  gun.traverse((obj) => {
    if (obj.isMesh) {
      obj.frustumCulled = true;
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return gun;
}
