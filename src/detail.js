import * as THREE from '../vendor/three.module.js';
import { finish, surface } from './materials.js';

function canvasTexture(width, height, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 8;
  return texture;
}

export function panelMaterial(hex, line, repeatX = 1, repeatY = 1) {
  const map = canvasTexture(256, 256, (g) => {
    g.fillStyle = hex;
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = line;
    g.lineWidth = 4;
    for (let y = 0; y <= 256; y += 32) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.16)';
    for (let x = 20; x < 256; x += 48) g.fillRect(x, 6, 5, 244);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    for (let y = 16; y < 256; y += 32) {
      g.beginPath();
      g.arc(10, y, 2.4, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(246, y, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }, repeatX, repeatY);
  return new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.12 });
}

export function signMaterial(text, color) {
  const map = canvasTexture(512, 128, (g) => {
    g.fillStyle = '#171a16';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = color;
    g.lineWidth = 8;
    g.strokeRect(8, 8, 496, 112);
    g.fillStyle = color;
    g.font = '700 58px "PingFang SC", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 66);
  });
  return new THREE.MeshStandardMaterial({ map, roughness: 0.6, metalness: 0.2 });
}

export function addDetail(scene, add) {
  const steel = surface('corrugated', '#667078');
  const dark = finish('black');
  const rust = surface('rust');
  const crate = surface('wood');
  const glass = finish('glass');
  const rubber = finish('rubber');
  const yellow = new THREE.MeshStandardMaterial({ color: 0xd7b15a, roughness: 0.55 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8e3a32, roughness: 0.6 });
  const white = surface('concrete');
  const hull = surface('panel', '#355c62');
  const soft = { block: false, ray: false };
  const floorMat = surface('concrete');
  add(-20, 0.025, 6, 14.5, 0.04, 18, floorMat, soft);
  add(20, 0.025, 6, 14.5, 0.04, 18, floorMat, soft);
  add(0, 0.025, -19, 14.6, 0.04, 12.6, floorMat, soft);

  function windowRow(x, z, width, height, axis) {
    const paneW = axis === 'x' ? 0.06 : width;
    const paneD = axis === 'x' ? width : 0.06;
    add(x, 2.35, z, paneW, height, paneD, glass, soft);
    add(x, 2.35, z, paneW + 0.05, 0.08, paneD + 0.05, dark, soft);
  }

  for (const z of [-1, 3, 8, 13]) windowRow(-12.15, z, 1.15, 0.7, 'z');
  for (const z of [-2, 10, 14]) windowRow(12.15, z, 1.15, 0.7, 'z');
  for (const x of [-5, -2, 2, 5]) windowRow(x, -12.15, 1.05, 0.85, 'x');

  const sign = (text, color, x, y, z, rotY) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), signMaterial(text, color));
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotY;
    scene.add(mesh);
  };
  sign('西仓', '#d7c07a', -12.4, 3.5, 10, Math.PI / 2);
  sign('东仓', '#d7c07a', 12.4, 3.5, 10, -Math.PI / 2);
  sign('调度室', '#9fd0c2', 0, 4.3, -11.7, 0);
  sign('停机坪', '#7ddea6', 3.2, 1.4, -28.2, 0);

  add(-9, 0.95, 21, 2.05, 1.15, 4.6, dark);
  add(-9, 1.55, 22.5, 1.9, 0.7, 1.5, steel);
  add(-9, 0.38, 19.2, 0.45, 0.45, 0.45, rubber, soft);
  add(-9, 0.38, 22.8, 0.45, 0.45, 0.45, rubber, soft);
  add(-8.2, 1.35, 23.15, 0.08, 0.28, 0.7, glass, soft);

  for (const [x, z] of [[5.2, 15.2], [4.4, 15.6], [-5.4, 16.2], [-4.6, 15.7], [14.5, -8], [15.2, -8.5]]) {
    add(x, 0.48, z, 0.52, 0.96, 0.52, rust);
    add(x, 0.98, z, 0.28, 0.08, 0.28, dark, soft);
  }

  add(8.6, 0.45, 9.5, 0.55, 0.9, 2.5, white);
  add(-14.5, 0.45, 20.5, 1.3, 0.9, 1.3, crate);
  add(18, 0.7, -8.2, 1.5, 1.15, 0.8, dark);
  add(18, 1.15, -8.2, 0.7, 0.18, 0.55, yellow, soft);

  const shelf = (x, z, rot) => {
    add(x, 1.15, z, rot ? 0.45 : 2.4, 2.3, rot ? 2.4 : 0.45, steel, soft);
    add(x, 0.55, z, rot ? 0.5 : 2.5, 0.08, rot ? 2.5 : 0.5, crate, soft);
    add(x, 1.35, z, rot ? 0.5 : 2.5, 0.08, rot ? 2.5 : 0.5, crate, soft);
    add(x, 2.05, z, rot ? 0.42 : 2.2, 0.28, rot ? 1.4 : 0.38, dark, soft);
  };
  shelf(-26.4, 2, false);
  shelf(-26.4, 11, false);
  shelf(26.4, 1, false);
  shelf(26.4, 12, false);
  shelf(-5.2, -21, true);
  shelf(5.2, -21, true);
  add(-4.6, 0.4, -17.5, 1.3, 0.75, 0.7, dark);
  add(4.6, 0.4, -17.5, 1.3, 0.75, 0.7, dark);
  add(0, 0.55, -23.4, 1.1, 1.5, 0.45, steel);

  for (const [x, z] of [[-20, 5.4], [-16, 5.4], [16, 5.4], [20, 5.4]]) {
    add(x, 4.55, z, 0.9, 0.35, 0.7, steel, soft);
  }

  for (const [x, z] of [[-10, 24], [10, 24], [-10, -10], [10, -10]]) {
    add(x, 1.7, z, 0.12, 3.4, 0.12, dark, soft);
    add(x, 3.35, z, 0.55, 0.12, 0.55, yellow, soft);
    const lamp = new THREE.PointLight(0xffe1b0, 4.5, 11, 2);
    lamp.position.set(x, 3.1, z);
    scene.add(lamp);
  }

  add(31.4, 0.45, 2.6, 1.5, 0.55, 3.4, hull, soft);
  add(31.4, 0.85, 3.6, 0.9, 0.4, 0.8, white, soft);
  add(-30.6, 1.05, -1.6, 0.35, 1.5, 0.35, yellow, soft);
  add(30.6, 1.05, -1.6, 0.35, 1.5, 0.35, red, soft);

  for (const z of [8, 14, 22, 28]) {
    add(-3.55, 0.035, z, 0.12, 0.02, 0.7, yellow, soft);
    add(3.55, 0.035, z, 0.12, 0.02, 0.7, yellow, soft);
  }
  for (const x of [-2.2, -0.7, 0.7, 2.2]) add(x, 0.04, -30.2, 0.28, 0.03, 1.1, white, soft);

  const pipe = finish('park');
  const tube = (points, radius) => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, radius, 7, false), pipe);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  tube([[-12.3, 4.7, -3], [-12.3, 4.7, 6], [-12.3, 4.55, 15]], 0.06);
  tube([[-12.3, 4.7, 2], [-12.5, 2.4, 2], [-12.7, 0.3, 2]], 0.045);
  tube([[12.3, 4.7, -3], [12.3, 4.7, 15]], 0.06);
  tube([[12.3, 4.7, 10], [12.55, 2.2, 10], [12.7, 0.25, 10]], 0.045);
  tube([[-7.5, 5.6, -12.2], [0, 5.7, -12.2], [7.5, 5.6, -12.2]], 0.05);

  for (const [x, z] of [[-20, -4.7], [-16, -4.7], [-24, -4.7], [16, -4.7], [20, -4.7], [24, -4.7]]) {
    add(x, 0.28, z, 0.85, 0.42, 0.48, crate);
    add(x, 0.62, z, 0.78, 0.28, 0.42, rust, soft);
  }
  add(-25.4, 0.32, 13.6, 0.9, 0.55, 0.9, crate);
  add(-25.4, 0.78, 13.6, 0.8, 0.4, 0.8, crate);
  add(25.4, 0.32, 13.6, 0.9, 0.55, 0.9, crate);
  add(-2.2, 0.45, -22.6, 0.7, 0.7, 1.4, dark);
  add(2.2, 0.45, -22.6, 0.7, 0.7, 1.4, dark);

  const shade = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false });
  const contact = (x, z, w, d) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), shade);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.032, z);
    mesh.renderOrder = 2;
    scene.add(mesh);
  };
  contact(-20, -4.55, 15.2, 0.85);
  contact(-20, 16.45, 15.2, 0.85);
  contact(-28.45, 6, 0.8, 18);
  contact(-11.7, -1.2, 0.7, 5);
  contact(-11.7, 12.2, 0.7, 6.4);
  contact(20, -4.55, 15.2, 0.85);
  contact(20, 16.45, 15.2, 0.85);
  contact(28.45, 6, 0.8, 18);
  contact(11.7, -1.2, 0.7, 5);
  contact(11.7, 12.2, 0.7, 6.4);
  contact(0, -11.55, 15, 0.8);
  contact(0, -26.45, 15, 0.8);
  contact(-8.45, -19, 0.8, 13);
  contact(8.45, -19, 0.8, 13);

  add(0, 3.15, -11.62, 2.4, 0.55, 0.08, steel, soft);
  add(-3.4, 2.15, -11.62, 1.5, 0.28, 0.06, dark, soft);
  add(3.4, 2.15, -11.62, 1.5, 0.28, 0.06, dark, soft);
  add(-7.7, 0.16, 19.4, 0.7, 0.28, 0.9, crate, soft);
  add(7.7, 0.14, 13.2, 0.55, 0.22, 0.7, crate, soft);
  add(-7.9, 0.22, 16.2, 0.42, 0.36, 0.42, rust, soft);

  const coilMat = rubber;
  for (const [x, z, turns] of [[-7.55, 20.6, 0.2], [7.85, 11.4, 1.1], [-7.4, 12.8, 0.6]]) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 16), coilMat);
    coil.position.set(x, 0.07, z);
    coil.rotation.x = Math.PI / 2;
    coil.rotation.z = turns;
    coil.castShadow = true;
    coil.receiveShadow = true;
    scene.add(coil);
  }
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.11, 8, 16), rubber);
  tire.position.set(7.9, 0.36, 21.6);
  tire.rotation.y = 0.4;
  tire.castShadow = true;
  tire.receiveShadow = true;
  scene.add(tire);
  const stone = new THREE.DodecahedronGeometry(0.07, 0);
  for (const [x, z, s] of [[2.55, 22.4, 1.1], [-2.35, 20.2, 0.75], [1.7, 17.6, 0.55], [-1.45, 23.4, 0.9]]) {
    const rock = new THREE.Mesh(stone, white);
    rock.position.set(x, 0.04, z);
    rock.scale.setScalar(s);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }

  for (const [x, z, w, d] of [[-6.2, 17.5, 1.4, 0.9], [7.4, 14.2, 1.1, 1.6], [0.2, 6.5, 1.8, 0.7]]) {
    const stain = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: 0x1c1814, transparent: true, opacity: 0.38, roughness: 0.4 }),
    );
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(x, 0.03, z);
    scene.add(stain);
  }
}
