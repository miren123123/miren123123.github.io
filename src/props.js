import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { applyWear } from './wear.js?v=19';

const loader = new GLTFLoader();
let crateTpl = null;
let shelfTpl = null;
const crateWaiters = [];
const shelfWaiters = [];

function prep(root, longest) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of list) {
      if (material) material.envMapIntensity = 1;
    }
  });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);
  if (longest && span > longest) root.scale.setScalar(longest / span);
  root.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(root);
  root.position.y -= grounded.min.y;
  return root;
}

function ownMaterials(root) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const cloneMat = (material) => {
      const copy = material.clone();
      copy.userData.owned = true;
      return copy;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(cloneMat) : cloneMat(obj.material);
  });
  return root;
}

export const YARD_CONTAINERS = [
  { x: -5.75, z: 21.4, rot: Math.PI / 2, open: false, w: 2.7, d: 6.15, h: 2.6 },
  { x: -5.75, z: 14.2, rot: Math.PI / 2, open: false, w: 2.7, d: 6.15, h: 2.6 },
  { x: 5.8, z: 18.2, rot: -Math.PI / 2, open: false, w: 2.7, d: 6.15, h: 2.6 },
  { x: 5.8, z: 10.6, rot: -Math.PI / 2, open: true, w: 2.9, d: 6.15, h: 2.6 },
];

loader.load('/vendor/models/crate.glb', (gltf) => {
  crateTpl = prep(gltf.scene, 0.92);
  for (const fn of crateWaiters.splice(0)) fn(crateTpl);
});

loader.load('/vendor/models/shelf.glb', (gltf) => {
  shelfTpl = prep(gltf.scene, 2.2);
  for (const fn of shelfWaiters.splice(0)) fn(shelfTpl);
});

export function claimCrate() {
  if (!crateTpl) return null;
  return ownMaterials(crateTpl.clone(true));
}

export function onCrate(fn) {
  if (crateTpl) fn(crateTpl);
  else crateWaiters.push(fn);
}

const operators = {};
const operatorWaiters = [];
let closedContainer = null;
let openContainer = null;
let yardScene = null;
let yardPlaced = false;

function containersReady() {
  return closedContainer && openContainer && yardScene && !yardPlaced;
}

function placeYard() {
  if (!containersReady()) return;
  yardPlaced = true;
  for (const spot of YARD_CONTAINERS) {
    const tpl = spot.open ? openContainer : closedContainer;
    const mesh = tpl.clone(true);
    mesh.rotation.y = spot.rot;
    mesh.position.set(spot.x, tpl.position.y, spot.z);
    yardScene.add(mesh);
  }
  const trunkMat = barkMaterial();
  const leafMat = frondMaterial(false);
  const leafDry = frondMaterial(true);
  const frond = new THREE.PlaneGeometry(0.85, 2.7);
  for (const [x, z] of [[-10.6, 28.2], [10.4, 27.4], [-10.2, 8.4], [10.2, 8.8], [8.6, -9.2]]) {
    const palm = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.26, 4.6, 8), trunkMat);
    trunk.position.y = 2.3;
    trunk.castShadow = true;
    palm.add(trunk);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.7, 7), trunkMat);
    ring.position.y = 4.15;
    palm.add(ring);
    for (let i = 0; i < 14; i++) {
      const leaf = new THREE.Mesh(frond, i % 4 === 0 ? leafDry : leafMat);
      leaf.position.set(0, 4.35, 0);
      leaf.rotation.y = (i / 14) * Math.PI * 2 + 0.2;
      leaf.rotation.x = 0.62 + (i % 5) * 0.14;
      leaf.castShadow = true;
      palm.add(leaf);
    }
    palm.position.set(x, 0, z);
    yardScene.add(palm);
  }
  const bagMat = new THREE.MeshStandardMaterial({ color: 0x6d6454, roughness: 0.94 });
  for (const [x, z] of [[-4.15, 20.4], [-4.15, 19.5], [-4.15, 18.6], [4.25, 16.6], [4.25, 15.6], [4.25, 14.6]]) {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.24, 0.62), bagMat);
    bag.position.set(x, 0.13, z);
    bag.rotation.y = x < 0 ? 0.12 : -0.1;
    bag.castShadow = true;
    bag.receiveShadow = true;
    yardScene.add(bag);
  }
  if (operators.survivor) placeBody();
  dressForeground(yardScene);
}

function stencilMaterial(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 220;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 512, 220);
  g.strokeStyle = '#e4d7a6';
  g.lineWidth = 12;
  g.strokeRect(14, 14, 484, 192);
  g.fillStyle = '#f0e2b4';
  g.font = '700 86px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 116);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

function dressForeground(scene) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.86 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x7a4636, roughness: 0.72, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c2a, roughness: 0.8 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xc4552c, roughness: 0.6 });
  const pallet = (x, z, rot) => {
    const group = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.035, 0.1), wood);
      slat.position.set(0, 0.1, (i - 2) * 0.16);
      group.add(slat);
    }
    for (const bx of [-0.34, 0, 0.34]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.78), wood);
      beam.position.set(bx, 0.04, 0);
      group.add(beam);
    }
    group.position.set(x, 0, z);
    group.rotation.y = rot;
    group.traverse((obj) => {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    scene.add(group);
  };
  pallet(-3.55, 22.6, 0.2);
  pallet(3.4, 21.2, -0.15);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 18), dark);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(-3.15, 0.06, 21.2);
  coil.castShadow = true;
  coil.receiveShadow = true;
  scene.add(coil);
  for (const [x, z] of [[-3.7, 17.2], [3.55, 12.4]]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), coneMat);
    cone.position.set(x, 0.21, z);
    cone.castShadow = true;
    scene.add(cone);
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.86, 12), rust);
  drum.position.set(-7.6, 0.43, 17.2);
  drum.castShadow = true;
  drum.receiveShadow = true;
  scene.add(drum);
  const marks = [
    ['HZ-04', -4.32, 1.55, 21.2, -Math.PI / 2],
    ['HZ-07', -4.32, 1.55, 14.4, -Math.PI / 2],
    ['HZ-11', 4.38, 1.45, 18.0, Math.PI / 2],
    ['HZ-12', 4.38, 1.45, 11.0, Math.PI / 2],
  ];
  for (const [text, x, y, z, rot] of marks) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.64), stencilMaterial(text));
    plate.position.set(x, y, z);
    plate.rotation.y = rot;
    if (rot > 0) plate.scale.x = -1;
    scene.add(plate);
  }
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 2.5, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x2c3034, roughness: 0.7, metalness: 0.25 }),
  );
  door.position.set(0, 1.35, -11.58);
  door.castShadow = true;
  scene.add(door);
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(2.05, 0.1, 0.1),
    new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.45, metalness: 0.4 }),
  );
  frame.position.set(0, 2.62, -11.52);
  scene.add(frame);
  for (const x of [-1.15, 1.15]) {
    const post = frame.clone();
    post.scale.set(0.08, 26, 1);
    post.position.set(x, 1.35, -11.52);
    scene.add(post);
  }
  for (const [x, z] of [[-4.15, 20.4], [-4.15, 19.5]]) {
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.56), new THREE.MeshStandardMaterial({ color: 0x5e5648, roughness: 0.94 }));
    top.position.set(x, 0.34, z);
    top.castShadow = true;
    top.receiveShadow = true;
    scene.add(top);
  }
  containerFaces(scene);
  officeFront(scene);
  harborBeyond(scene);
  laneKit(scene);
}

function barkMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#6a5034';
  g.fillRect(0, 0, 128, 256);
  g.strokeStyle = '#3a2818';
  g.lineWidth = 3;
  for (let x = 8; x < 128; x += 14) {
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 6, 80, x - 8, 160, x + 2, 256);
    g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 128, Math.random() * 256, 8, 3);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.94, metalness: 0 });
}

function frondMaterial(dry) {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 160, 512);
  const green = dry ? '#7d8a3c' : '#1f6a34';
  const edge = dry ? '#c2b15a' : '#14381c';
  g.strokeStyle = edge;
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(80, 500);
  g.lineTo(80, 16);
  g.stroke();
  g.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const y = 40 + i * 20;
    const len = 18 + Math.sin((i / 22) * Math.PI) * 48;
    g.strokeStyle = i % 4 === 0 ? edge : green;
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(80, y);
    g.quadraticCurveTo(80 - len * 0.55, y + 6, 80 - len, y - 10);
    g.stroke();
    g.beginPath();
    g.moveTo(80, y);
    g.quadraticCurveTo(80 + len * 0.55, y + 4, 80 + len, y - 12);
    g.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({
    map,
    alphaTest: 0.35,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
}

function hazardMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = '#141414';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#e2b13a';
  for (let x = -64; x < 280; x += 48) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 28, 0);
    g.lineTo(x + 46, 0);
    g.lineTo(x + 18, 64);
    g.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.repeat.x = 2;
  return new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide });
}

function containerPhoto() {
  if (containerPhoto.mat) return containerPhoto.mat;
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6f7b6a,
    roughness: 0.52,
    metalness: 0.32,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const loader = new THREE.TextureLoader();
  const take = (file, srgb, apply) => {
    loader.load(`/vendor/textures/${file}`, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2.6, 1);
      tex.anisotropy = 8;
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      apply(tex);
      mat.needsUpdate = true;
    });
  };
  take('container_diff.jpg', true, (tex) => { mat.map = tex; });
  take('container_nor.jpg', false, (tex) => {
    mat.normalMap = tex;
    mat.normalScale = new THREE.Vector2(1.9, 1.9);
  });
  containerPhoto.mat = mat;
  return mat;
}

function containerFaces(scene) {
  const barMat = new THREE.MeshStandardMaterial({ color: 0x1b1e1c, roughness: 0.42, metalness: 0.62 });
  const hazard = hazardMaterial();
  const skin = containerPhoto();
  const faces = [
    { x: -4.39, z0: 18.4, z1: 24.4, out: 1 },
    { x: -4.39, z0: 11.2, z1: 17.2, out: 1 },
    { x: 4.43, z0: 15.2, z1: 21.2, out: -1 },
    { x: 4.43, z0: 7.6, z1: 13.6, out: -1 },
  ];
  const rivetGeo = new THREE.SphereGeometry(0.018, 5, 4);
  const rivetMat = new THREE.MeshStandardMaterial({ color: 0xb7b8b0, roughness: 0.35, metalness: 0.8 });
  const rivets = new THREE.InstancedMesh(rivetGeo, rivetMat, faces.length * 32);
  const dummy = new THREE.Object3D();
  let n = 0;
  for (const face of faces) {
    const span = face.z1 - face.z0;
    const mid = (face.z0 + face.z1) / 2;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.985, 2.42), skin);
    plate.position.set(face.x + face.out * 0.02, 1.28, mid);
    plate.rotation.y = face.out > 0 ? Math.PI / 2 : -Math.PI / 2;
    plate.receiveShadow = true;
    scene.add(plate);
    for (const z of [face.z0 + 0.06, face.z1 - 0.06]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.48, 0.09), barMat);
      post.position.set(face.x + face.out * 0.03, 1.26, z);
      post.castShadow = true;
      scene.add(post);
    }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, span * 0.98), barMat);
    rail.position.set(face.x + face.out * 0.03, 2.5, mid);
    scene.add(rail);
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(span * 0.94, 0.22), hazard);
    stripe.position.set(face.x + face.out * 0.035, 0.2, mid);
    stripe.rotation.y = face.out > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(stripe);
    for (const y of [0.42, 2.28]) {
      for (let i = 0; i < 14; i++) {
        dummy.position.set(face.x + face.out * 0.04, y, face.z0 + 0.25 + ((span - 0.5) * i) / 13);
        dummy.updateMatrix();
        rivets.setMatrixAt(n, dummy.matrix);
        n += 1;
      }
    }
  }
  rivets.count = n;
  scene.add(rivets);
}

function officeFront(scene) {
  const glass = new THREE.MeshBasicMaterial({ color: 0x8ec5d6 });
  const frame = new THREE.MeshStandardMaterial({ color: 0xd5d8dc, roughness: 0.4, metalness: 0.45 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x4a514c, roughness: 0.7, metalness: 0.3 });
  for (const x of [-5.1, -2.55, 2.55, 5.1]) {
    const pane = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.05, 0.08), glass);
    pane.position.set(x, 3.7, -11.48);
    scene.add(pane);
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.05, 0.1), frame);
    mullion.position.set(x, 3.7, -11.44);
    scene.add(mullion);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.045, 0.1), frame);
    bar.position.set(x, 3.7, -11.44);
    scene.add(bar);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.1), frame);
    sill.position.set(x, 3.16, -11.46);
    scene.add(sill);
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.07, 0.85), frame);
  canopy.position.set(0, 2.78, -11.25);
  canopy.castShadow = true;
  scene.add(canopy);
  const seamMat = new THREE.MeshStandardMaterial({ color: 0x343a36, roughness: 0.48, metalness: 0.42 });
  const boltMat = new THREE.MeshStandardMaterial({ color: 0xa4a8ac, roughness: 0.32, metalness: 0.85 });
  for (const x of [-6.8, -3.9, 3.9, 6.8]) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.055, 5.85, 0.07), seamMat);
    seam.position.set(x, 3.2, -11.4);
    seam.castShadow = true;
    scene.add(seam);
  }
  for (const y of [2.35, 5.2]) {
    const belt = new THREE.Mesh(new THREE.BoxGeometry(15.3, 0.055, 0.07), seamMat);
    belt.position.set(0, y, -11.4);
    belt.castShadow = true;
    scene.add(belt);
  }
  for (let x = -6.6; x <= 6.6; x += 0.95) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.025, 6), boltMat);
    head.rotation.x = Math.PI / 2;
    head.position.set(x, 5.2, -11.35);
    scene.add(head);
  }
  const parapet = new THREE.Mesh(new THREE.BoxGeometry(15.4, 0.7, 0.22), new THREE.MeshStandardMaterial({ color: 0x2a2f2c, roughness: 0.7 }));
  parapet.position.set(0, 6.85, -11.85);
  parapet.castShadow = true;
  scene.add(parapet);
  for (const x of [-3.2, 3.4]) {
    const unit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.7, 1.1), roof);
    unit.position.set(x, 7.45, -13.1);
    unit.castShadow = true;
    scene.add(unit);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), frame);
    fan.position.set(x, 7.9, -13.1);
    scene.add(fan);
  }
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.8, 0.14), frame);
  mast.position.set(-6.3, 9.1, -12.5);
  mast.castShadow = true;
  scene.add(mast);
  const yardarm = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.08), frame);
  yardarm.position.set(-6.3, 11.2, -12.5);
  scene.add(yardarm);
}

function harborBeyond(scene) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x8d9290, roughness: 0.45, metalness: 0.55 });
  const cabMat = new THREE.MeshStandardMaterial({ color: 0xc4552c, roughness: 0.5, metalness: 0.2 });
  const addCrane = (x, z, yaw, height) => {
    const group = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.6, height, 0.6), steel);
    mast.position.y = height / 2;
    group.add(mast);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(height * 0.9, 0.34, 0.34), steel);
    jib.position.set(height * 0.2, height - 0.5, 0);
    group.add(jib);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(height * 0.28, 0.3, 0.3), steel);
    counter.position.set(-height * 0.18, height - 0.45, 0);
    group.add(counter);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.2, 1.35), cabMat);
    cab.position.y = height - 1.7;
    group.add(cab);
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 5.2, 0.05), steel);
    line.position.set(height * 0.4, height - 3.2, 0);
    group.add(line);
    const hook = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), cabMat);
    hook.position.set(height * 0.4, height - 5.9, 0);
    group.add(hook);
    group.position.set(x, 0, z);
    group.rotation.y = yaw;
    scene.add(group);
  };
  addCrane(-8, -42, 0.4, 22);
  addCrane(11, -46, -0.6, 19);
  addCrane(42, 4, 1.2, 16);
  const colors = [0x8a4e32, 0x355e68, 0x6d6844, 0x8e3a34, 0x3e4650];
  const stacks = [
    [-16, -38, 3, 0.1],
    [-6, -40, 2, 0.4],
    [4, -39, 3, -0.2],
    [15, -37, 2, 0.3],
    [48, 12, 2, 0.8],
  ];
  for (const [x, z, levels, rot] of stacks) {
    for (let i = 0; i < levels; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.3, 6.1), containerPhoto());
      box.position.set(x, 1.2 + i * 2.35, z);
      box.rotation.y = rot;
      scene.add(box);
    }
  }
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x2e3a42, roughness: 0.48, metalness: 0.4 });
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 18), hullMat);
  hull.position.set(52, 1.3, 6);
  scene.add(hull);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 4.2), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.55 }));
  cabin.position.set(52, 3.3, 1.2);
  scene.add(cabin);
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(3.7, 0.28, 18.05),
    new THREE.MeshStandardMaterial({ color: 0xc4552c, roughness: 0.5 }),
  );
  stripe.position.set(52, 2.15, 6);
  scene.add(stripe);
}

function laneKit(scene) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x6a6256, roughness: 0.55, metalness: 0.4 });
  const jerry = new THREE.MeshStandardMaterial({ color: 0x3c5a30, roughness: 0.55, metalness: 0.15 });
  const card = new THREE.MeshStandardMaterial({ color: 0xb08958, roughness: 0.9 });
  const ladder = new THREE.Group();
  for (const x of [-0.16, 0.16]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 2.3, 0.035), steel);
    rail.position.set(x, 1.15, 0);
    ladder.add(rail);
  }
  for (let i = 0; i < 8; i++) {
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.025), steel);
    rung.position.set(0, 0.25 + i * 0.26, 0);
    ladder.add(rung);
  }
  ladder.position.set(-4.18, 0.05, 23.2);
  ladder.rotation.z = 0.08;
  ladder.traverse((obj) => {
    if (obj.isMesh) obj.castShadow = true;
  });
  scene.add(ladder);
  const can = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.16), jerry);
  can.position.set(-3.95, 0.2, 16.5);
  can.castShadow = true;
  scene.add(can);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 10), steel);
  handle.position.set(-3.95, 0.4, 16.5);
  scene.add(handle);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.035, 0.38), card);
  board.position.set(-2.35, 0.04, 23.15);
  board.rotation.y = 0.4;
  board.receiveShadow = true;
  scene.add(board);
  const hosePts = [
    [-3.4, 0.04, 22.4],
    [-2.7, 0.05, 21.2],
    [-2.2, 0.04, 19.6],
    [-2.8, 0.04, 18.2],
  ].map((p) => new THREE.Vector3(...p));
  const hose = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hosePts), 24, 0.025, 6, false),
    new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 }),
  );
  hose.castShadow = true;
  scene.add(hose);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.28), stencilMaterial('HF-2'));
  plate.position.set(0, 0.72, 12.86);
  plate.rotation.y = Math.PI;
  scene.add(plate);
  const kick = new THREE.PointLight(0xffe2c0, 16, 9, 2);
  kick.position.set(-3.1, 2.5, 22.4);
  scene.add(kick);
  const tower = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a2e28, roughness: 0.6, metalness: 0.4 }));
  base.position.y = 0.16;
  const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.6, 0.08), new THREE.MeshStandardMaterial({ color: 0xc8ccd0, roughness: 0.4, metalness: 0.55 }));
  pole.position.y = 2.05;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.12, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffd9a0, emissiveIntensity: 0.7, roughness: 0.35 }),
  );
  head.position.set(0, 3.85, 0.08);
  tower.add(base, pole, head);
  tower.position.set(-3.45, 0, 16.4);
  tower.traverse((obj) => { if (obj.isMesh) obj.castShadow = true; });
  scene.add(tower);
  const towerLight = new THREE.PointLight(0xffe6c0, 18, 11, 2);
  towerLight.position.set(-3.45, 3.7, 16.4);
  scene.add(towerLight);
  const tarp = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x2a5270, roughness: 0.8, side: THREE.DoubleSide }),
  );
  tarp.position.set(-4.05, 0.55, 19.6);
  tarp.rotation.set(0.7, 0.15, 0.2);
  tarp.castShadow = true;
  scene.add(tarp);
  const wet = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 2.4),
    new THREE.MeshStandardMaterial({
      color: 0x2a3034,
      roughness: 0.08,
      metalness: 0.55,
      transparent: true,
      opacity: 0.45,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(-1.5, 0.045, 20.2);
  scene.add(wet);
  const lampHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.1, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xffe2b0, emissive: 0xffc98a, emissiveIntensity: 0.8, roughness: 0.4 }),
  );
  lampHead.position.set(-1.35, 2.72, -11.4);
  scene.add(lampHead);
  const iron = new THREE.MeshStandardMaterial({ color: 0x8c908c, roughness: 0.38, metalness: 0.82 });
  const faceZ = 12.83;
  for (const [x, y, sx] of [[-1.16, 0.22, 1], [1.16, 0.22, -1], [-1.16, 1.08, 1], [1.16, 1.08, -1]]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.22, 0.016), iron);
    upright.position.set(x, y, faceZ);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.016), iron);
    arm.position.set(x + sx * 0.09, y + (y < 0.6 ? 0.08 : -0.08), faceZ);
    scene.add(upright, arm);
  }
  const lip = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.035, 0.04), iron);
  lip.position.set(0, 1.34, 12.72);
  lip.castShadow = true;
  scene.add(lip);
  for (let row = 0; row < 4; row++) {
    for (const x of [-1.02, -0.34, 0.34, 1.02]) {
      const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 6), iron);
      nail.rotation.x = Math.PI / 2;
      nail.position.set(x, 0.24 + row * 0.27, faceZ + 0.012);
      scene.add(nail);
    }
  }
}

let bodyPlaced = false;
function placeBody() {
  if (bodyPlaced || !operators.survivor || !yardScene) return;
  bodyPlaced = true;
  const body = ownMaterials(operators.survivor.clone(true));
  body.rotation.set(1.15, 0.4, 1.25);
  body.position.set(-3.85, 0.15, 17.7);
  yardScene.add(body);
}

function weather(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of list) {
      material.color.set(0x667562);
      material.roughness = Math.max(material.roughness || 0.5, 0.68);
      material.metalness = Math.min(material.metalness || 0, 0.22);
      applyWear(material, 1.4, 0.015);
    }
  });
  return root;
}

loader.load('/vendor/models/container.glb', (gltf) => {
  closedContainer = weather(prep(gltf.scene));
  placeYard();
});
loader.load('/vendor/models/container-open.glb', (gltf) => {
  openContainer = weather(prep(gltf.scene));
  placeYard();
});
for (const [key, file] of [
  ['survivor', '/vendor/models/operator.glb'],
  ['heavy', '/vendor/models/heavy.glb'],
  ['raider', '/vendor/models/raider.glb'],
]) {
  loader.load(file, (gltf) => {
    operators[key] = prep(gltf.scene);
    if (operators.survivor && operators.heavy && operators.raider) {
      for (const fn of operatorWaiters.splice(0)) fn();
      placeBody();
    }
  });
}

export function claimOperator(role) {
  const key = role === 'shotgun' ? 'raider' : role === 'marksman' ? 'heavy' : 'survivor';
  const tpl = operators[key] || operators.survivor;
  if (!tpl) return null;
  return ownMaterials(tpl.clone(true));
}

export function onOperators(fn) {
  if (operators.survivor && operators.heavy && operators.raider) fn();
  else operatorWaiters.push(fn);
}

export function dressYard(scene) {
  yardScene = scene;
  placeYard();
}

export function dressShelves(scene) {
  const place = (tpl) => {
    const spots = [
      [-23.4, 1.2, 0],
      [23.4, 1.2, Math.PI],
      [-5.4, -22.4, 0],
      [5.6, -22.4, 0],
    ];
    for (const [x, z, rot] of spots) {
      const shelf = tpl.clone(true);
      shelf.position.set(x, tpl.position.y, z);
      shelf.rotation.y = rot;
      scene.add(shelf);
    }
  };
  if (shelfTpl) place(shelfTpl);
  else shelfWaiters.push(place);
}
