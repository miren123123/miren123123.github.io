import * as THREE from '../vendor/three.module.js';

const cache = new Map();

function canvasTex(width, height, draw, { repeatX = 1, repeatY = 1, color = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  return texture;
}

function speckle(g, w, h, count, color, size) {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    const s = size * (0.4 + Math.random());
    g.fillRect(Math.random() * w, Math.random() * h, s, s * (0.4 + Math.random()));
  }
}

function scratch(g, w, h, count, color, width) {
  g.strokeStyle = color;
  g.lineWidth = width;
  for (let i = 0; i < count; i++) {
    g.beginPath();
    const x = Math.random() * w;
    const y = Math.random() * h;
    g.moveTo(x, y);
    g.lineTo(x + (Math.random() - 0.5) * 80, y + (Math.random() - 0.3) * 18);
    g.stroke();
  }
}

function cached(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

export function surface(kind, tint = '') {
  return cached(`s:${kind}:${tint}`, () => {
    if (kind === 'concrete') return concrete();
    if (kind === 'asphalt') return asphalt();
    if (kind === 'yard') return yard();
    if (kind === 'dirt') return dirt();
    if (kind === 'panel') return panel(tint || '#7d847c', 0.22);
    if (kind === 'corrugated') return corrugated(tint || '#6a7270');
    if (kind === 'wood') return wood();
    if (kind === 'rust') return rust();
    if (kind === 'water') return water();
    if (kind === 'fabric') return fabric(tint || '#2c3542');
    if (kind === 'case') return panel('#4a5148', 0.45);
    return metal(0.55);
  });
}

export function finish(kind) {
  return cached(`f:${kind}`, () => {
    if (kind === 'park') return parkerized();
    if (kind === 'poly') return polymer('#3c3832');
    if (kind === 'polyTan') return polymer('#6a5b45');
    if (kind === 'black') return polymer('#141616');
    if (kind === 'brass') {
      return new THREE.MeshStandardMaterial({ color: 0xc6a15a, metalness: 0.85, roughness: 0.28 });
    }
    if (kind === 'glass') {
      return new THREE.MeshStandardMaterial({
        color: 0x9ec4d6,
        metalness: 0.92,
        roughness: 0.04,
        transparent: true,
        opacity: 0.55,
        envMapIntensity: 1.4,
      });
    }
    if (kind === 'glove') return polymer('#2a2e2a');
    if (kind === 'rubber') return new THREE.MeshStandardMaterial({ color: 0x1a1c1b, roughness: 0.92, metalness: 0.04 });
    return metal(0.35);
  });
}

function concrete() {
  const map = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#8a8276';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      g.fillStyle = `rgba(90, 84, 74, ${0.05 + Math.random() * 0.08})`;
      g.fillRect(Math.random() * w, Math.random() * h, 80 + Math.random() * 220, 40 + Math.random() * 120);
    }
    speckle(g, w, h, 4000, 'rgba(70,64,56,0.25)', 3);
    speckle(g, w, h, 800, 'rgba(230,224,210,0.2)', 2);
    g.strokeStyle = 'rgba(60,54,48,0.55)';
    g.lineWidth = 3;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.strokeStyle = 'rgba(40,36,32,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      let x = Math.random() * w;
      let y = Math.random() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (Math.random() - 0.5) * 180;
        y += 40 + Math.random() * 80;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.fillStyle = 'rgba(30,28,24,0.18)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(120 + Math.random() * 800, 120 + Math.random() * 800, 40 + Math.random() * 70, 18 + Math.random() * 24, Math.random(), 0, Math.PI * 2);
      g.fill();
    }
  }, { repeatX: 6, repeatY: 6 });
  const bump = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1500, '#9a9a9a', 3);
    speckle(g, w, h, 800, '#5e5e5e', 2);
    g.strokeStyle = '#3a3a3a';
    g.lineWidth = 3;
    g.strokeRect(4, 4, w - 8, h - 8);
  }, { color: false, repeatX: 6, repeatY: 6 });
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.045, roughness: 0.94, metalness: 0.02 });
}

function dirt() {
  const map = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#6e5e4a';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 40}, ${70 + Math.random() * 30}, ${48 + Math.random() * 20}, 0.18)`;
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 40 + Math.random() * 160, 20 + Math.random() * 50, Math.random() * 2, 0, Math.PI * 2);
      g.fill();
    }
    speckle(g, w, h, 5000, 'rgba(50,40,28,0.28)', 2.5);
    speckle(g, w, h, 600, 'rgba(160,140,100,0.25)', 4);
    g.strokeStyle = 'rgba(50,40,30,0.25)';
    g.lineWidth = 6;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.moveTo(0, 80 + i * 180);
      g.bezierCurveTo(200, 40 + i * 180, 500, 160 + i * 160, w, 90 + i * 170);
      g.stroke();
    }
  }, { repeatX: 5, repeatY: 5 });
  const bump = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#777777';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2000, '#989898', 3);
    speckle(g, w, h, 900, '#555555', 2);
  }, { color: false, repeatX: 5, repeatY: 5 });
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.09, roughness: 1, metalness: 0 });
}

const photoTargets = [];
let photoStarted = false;

function queuePhoto(material, repeatX, repeatY) {
  material.userData.photoRepeat = new THREE.Vector2(repeatX, repeatY);
  photoTargets.push(material);
  if (photoStarted) return;
  photoStarted = true;
  const loader = new THREE.TextureLoader();
  const load = (url, srgb) => new Promise((resolve) => {
    loader.load(url, (tex) => {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = 8;
      tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      resolve(tex);
    }, undefined, () => resolve(null));
  });
  Promise.all([
    load('/vendor/textures/asphalt_diff.jpg', true),
    load('/vendor/textures/asphalt_nor.jpg', false),
    load('/vendor/textures/asphalt_rough.jpg', false),
  ]).then(([diff, nor, rough]) => {
    if (!diff || !nor || !rough) return;
    for (const mat of photoTargets) {
      const rep = mat.userData.photoRepeat;
      const stamp = (source, srgb) => {
        const copy = source.clone();
        copy.repeat.copy(rep);
        copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
        copy.anisotropy = 8;
        copy.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
        copy.needsUpdate = true;
        return copy;
      };
      mat.map = stamp(diff, true);
      mat.normalMap = stamp(nor, false);
      mat.normalScale = new THREE.Vector2(1.6, 1.6);
      mat.roughnessMap = stamp(rough, false);
      mat.roughness = 0.92;
      mat.bumpMap = null;
      mat.needsUpdate = true;
    }
  });
}

function asphalt() {
  const map = canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#3e4144';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3500, 'rgba(20,20,20,0.35)', 2);
    speckle(g, w, h, 900, 'rgba(170,170,170,0.18)', 2);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 8; i++) {
      g.fillRect(Math.random() * w, Math.random() * h, 30 + Math.random() * 80, 8 + Math.random() * 20);
    }
    g.fillStyle = '#d2b15a';
    g.fillRect(w * 0.46, 0, w * 0.06, h);
    g.fillStyle = 'rgba(210,177,90,0.35)';
    for (let y = 40; y < h; y += 90) g.fillRect(w * 0.47, y, w * 0.04, 36);
  }, { repeatX: 1, repeatY: 8 });
  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.96, metalness: 0.04 });
  queuePhoto(material, 4, 29);
  return material;
}

function yard() {
  const map = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#4a4e52';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const shade = 40 + Math.random() * 70;
      g.fillStyle = `rgba(${shade},${shade},${shade + 4},${0.15 + Math.random() * 0.35})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 2);
    }
    g.strokeStyle = 'rgba(20,20,22,0.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      g.moveTo(Math.random() * w, Math.random() * h);
      g.bezierCurveTo(Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h, Math.random() * w, Math.random() * h);
      g.stroke();
    }
    g.fillStyle = 'rgba(18,18,20,0.28)';
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 30 + Math.random() * 80, 10 + Math.random() * 18, Math.random(), 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#d2b15a';
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(0, h * 0.5);
    g.lineTo(w, h * 0.5);
    g.stroke();
    g.strokeStyle = 'rgba(210,177,90,0.9)';
    g.lineWidth = 7;
    for (const y of [h * 0.18, h * 0.82]) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  }, { repeatX: 4, repeatY: 4 });
  const bump = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 2500, '#a0a0a0', 2);
    speckle(g, w, h, 1200, '#5a5a5a', 2);
  }, { color: false, repeatX: 4, repeatY: 4 });
  const material = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.035, roughness: 0.94, metalness: 0.02 });
  queuePhoto(material, 10, 14);
  return material;
}

function panel(hex, metalness) {
  const map = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      const lit = g.createLinearGradient(0, y, 0, y + 64);
      lit.addColorStop(0, 'rgba(255,255,255,0.16)');
      lit.addColorStop(0.18, 'rgba(255,255,255,0.02)');
      lit.addColorStop(0.72, 'rgba(0,0,0,0.05)');
      lit.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = lit;
      g.fillRect(0, y, w, 64);
      g.fillStyle = 'rgba(8,10,12,0.85)';
      g.fillRect(0, y + 60, w, 4);
    }
    g.strokeStyle = 'rgba(20,22,24,0.45)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(w * 0.33, 0);
    g.lineTo(w * 0.33, h);
    g.moveTo(w * 0.66, 0);
    g.lineTo(w * 0.66, h);
    g.stroke();
    g.fillStyle = 'rgba(210,206,196,0.7)';
    for (let y = 28; y < h; y += 64) {
      for (const x of [22, w * 0.33 - 14, w * 0.33 + 14, w * 0.66 - 14, w * 0.66 + 14, w - 22]) {
        g.beginPath();
        g.arc(x, y, 4.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(40,40,42,0.55)';
        g.beginPath();
        g.arc(x, y, 1.6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(210,206,196,0.7)';
      }
    }
    g.fillStyle = 'rgba(70,62,48,0.28)';
    for (let i = 0; i < 16; i++) {
      g.fillRect(Math.random() * w, h * 0.55 + Math.random() * h * 0.4, 10 + Math.random() * 40, 6 + Math.random() * 18);
    }
    scratch(g, w, h, 40, 'rgba(30,28,24,0.35)', 1.5);
  }, { repeatX: 2, repeatY: 1 });
  const bump = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) {
      g.fillStyle = '#d0d0d0';
      g.fillRect(0, y, w, 4);
      g.fillStyle = '#3a3a3a';
      g.fillRect(0, y + 26, w, 6);
    }
  }, { color: false, repeatX: 2, repeatY: 1 });
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.08, roughness: 0.58, metalness });
}

function corrugated(hex) {
  const map = canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, w, h);
    const ridge = 18;
    for (let x = 0; x < w; x += ridge) {
      const lit = g.createLinearGradient(x, 0, x + ridge, 0);
      lit.addColorStop(0, 'rgba(0,0,0,0.28)');
      lit.addColorStop(0.35, 'rgba(255,255,255,0.2)');
      lit.addColorStop(0.7, 'rgba(255,255,255,0.02)');
      lit.addColorStop(1, 'rgba(0,0,0,0.34)');
      g.fillStyle = lit;
      g.fillRect(x, 0, ridge, h);
    }
    g.fillStyle = 'rgba(40,32,24,0.35)';
    for (let i = 0; i < 8; i++) {
      const x = Math.random() * w;
      g.fillRect(x, Math.random() * h, 3, 80 + Math.random() * 220);
    }
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(0, h * 0.9, w, h * 0.1);
    scratch(g, w, h, 24, 'rgba(20,16,12,0.4)', 1);
  }, { repeatX: 4, repeatY: 1 });
  const bump = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#777';
    g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 10) {
      g.fillStyle = '#d2d2d2';
      g.fillRect(x, 0, 3, h);
      g.fillStyle = '#3c3c3c';
      g.fillRect(x + 6, 0, 4, h);
    }
  }, { color: false, repeatX: 4, repeatY: 1 });
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.16, roughness: 0.48, metalness: 0.62 });
}

function wood() {
  const map = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#6d5438';
    g.fillRect(0, 0, w, h);
    const board = 96;
    for (let y = 0; y < h; y += board) {
      const tone = 96 + ((y / board) % 3) * 14;
      g.fillStyle = `rgb(${tone + 30}, ${tone}, ${tone - 28})`;
      g.fillRect(0, y + 3, w, board - 6);
      g.strokeStyle = 'rgba(70,48,28,0.45)';
      g.lineWidth = 2;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        g.moveTo(0, y + 16 + k * 18);
        g.bezierCurveTo(200, y + 8 + k * 18, 600, y + 28 + k * 16, w, y + 14 + k * 18);
        g.stroke();
      }
      g.fillStyle = 'rgba(40,28,16,0.9)';
      g.fillRect(0, y + board - 5, w, 4);
      for (const x of [36, w * 0.5, w - 36]) {
        g.fillStyle = '#2a241c';
        g.beginPath();
        g.arc(x, y + 18, 3.2, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(x, y + board - 22, 3.2, 0, Math.PI * 2);
        g.fill();
      }
      if ((y / board) % 2 === 0) {
        g.fillStyle = 'rgba(90,60,36,0.55)';
        g.beginPath();
        g.ellipse(180 + (y % 200), y + 48, 16, 9, 0.4, 0, Math.PI * 2);
        g.fill();
      }
    }
  }, { repeatX: 1, repeatY: 1 });
  const bump = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#8a8a8a';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 48) {
      g.fillStyle = '#4a4a4a';
      g.fillRect(0, y, w, 3);
    }
  }, { color: false, repeatX: 1, repeatY: 1 });
  return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 0.05, roughness: 0.84, metalness: 0.02 });
}

function rust() {
  const map = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a4e32';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 400, 'rgba(60,24,14,0.45)', 6);
    speckle(g, w, h, 200, 'rgba(190,120,70,0.35)', 4);
    g.fillStyle = 'rgba(40,40,42,0.35)';
    g.fillRect(0, 0, w, 18);
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0.25 });
}

function water() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x6e8e96,
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.35,
    thickness: 0.6,
    transparent: true,
    opacity: 0.92,
  });
}

function fabric(hex) {
  const map = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 1;
    for (let y = 0; y < h; y += 4) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    speckle(g, w, h, 300, 'rgba(255,255,255,0.05)', 2);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, h * 0.42, w, 10);
  }, { repeatX: 2, repeatY: 2 });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.86, metalness: 0.02 });
}

function parkerized() {
  const map = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5a615c';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 1800, 'rgba(10,12,10,0.45)', 2);
    speckle(g, w, h, 600, 'rgba(90,96,88,0.25)', 1.5);
    scratch(g, w, h, 20, 'rgba(180,180,170,0.18)', 1);
  });
  const rough = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#9a9a9a';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 800, '#d0d0d0', 2);
    speckle(g, w, h, 400, '#666', 2);
  }, { color: false });
  return new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap: rough,
    roughness: 0.38,
    metalness: 0.86,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    envMapIntensity: 1.35,
  });
}

function polymer(hex) {
  const map = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      g.fillRect(0, y, w, 1);
    }
    speckle(g, w, h, 250, 'rgba(0,0,0,0.15)', 1);
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.78, metalness: 0.08 });
}

function metal(roughness) {
  return new THREE.MeshStandardMaterial({ color: 0x8a9298, roughness, metalness: 0.72 });
}

export function skyDome() {
  const map = canvasTex(1024, 512, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#3d7ec4');
    sky.addColorStop(0.38, '#8ec0e4');
    sky.addColorStop(0.7, '#d5e7f2');
    sky.addColorStop(1, '#e4d3b8');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.ellipse(60 + (i * 150) % 980, 70 + (i % 4) * 48, 150, 26, -0.15, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeatX: 1, repeatY: 1 });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(150, 32, 16),
    new THREE.MeshBasicMaterial({ map, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  mesh.frustumCulled = false;
  return mesh;
}

export function applyAtmosphere(scene, renderer) {
  scene.add(skyDome());
  scene.background = new THREE.Color(0xd5e6f2);
  scene.fog = new THREE.Fog(0xd3e3ee, 48, 140);
  const envScene = new THREE.Scene();
  envScene.add(skyDome());
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x8a7d6c }));
  deck.rotation.x = -Math.PI / 2;
  envScene.add(deck);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.05).texture;
  scene.environmentIntensity = 0.84;
  pmrem.dispose();
}
