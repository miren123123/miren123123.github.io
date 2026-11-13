import * as THREE from '../vendor/three.module.js';
import { addDetail } from './detail.js?v=19';
import { finish, surface } from './materials.js?v=38';
import { claimCrate, YARD_CONTAINERS } from './props.js';

const CELL = 2;
const ORIGIN = -40;
const COLS = 40;

function segments(a, b, holes) {
  let cuts = [{ a, b }];
  for (const hole of holes) {
    const hs = hole.at - hole.width / 2;
    const he = hole.at + hole.width / 2;
    const next = [];
    for (const cut of cuts) {
      if (he <= cut.a || hs >= cut.b) {
        next.push(cut);
        continue;
      }
      if (hs > cut.a + 0.05) next.push({ a: cut.a, b: hs });
      if (he < cut.b - 0.05) next.push({ a: he, b: cut.b });
    }
    cuts = next;
  }
  return cuts.filter((cut) => cut.b - cut.a > 0.25);
}

class Heap {
  constructor() {
    this.a = [];
  }
  push(value) {
    const a = this.a;
    a.push(value);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent].f <= a[i].f) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      i = parent;
    }
  }
  pop() {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if (left < a.length && a[left].f < a[smallest].f) smallest = left;
        if (right < a.length && a[right].f < a[smallest].f) smallest = right;
        if (smallest === i) break;
        [a[smallest], a[i]] = [a[i], a[smallest]];
        i = smallest;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

function buildNav(colliders) {
  const blocked = new Uint8Array(COLS * COLS);
  const free = [];
  const centerOf = (index) => ORIGIN + (index + 0.5) * CELL;

  for (let r = 0; r < COLS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = centerOf(c);
      const z = centerOf(r);
      let hit = false;
      for (const box of colliders) {
        if (box.maxy < 0.3 || box.miny > 1.6) continue;
        if (x + 0.46 > box.minx && x - 0.46 < box.maxx && z + 0.46 > box.minz && z - 0.46 < box.maxz) {
          hit = true;
          break;
        }
      }
      if (Math.abs(x) > 33.2 || Math.abs(z) > 33.2) hit = true;
      blocked[r * COLS + c] = hit ? 1 : 0;
      if (!hit) free.push({ x, z });
    }
  }

  function nearest(x, z) {
    let best = null;
    let bestDist = Infinity;
    const c0 = Math.max(0, Math.min(COLS - 1, Math.floor((x - ORIGIN) / CELL)));
    const r0 = Math.max(0, Math.min(COLS - 1, Math.floor((z - ORIGIN) / CELL)));
    for (let r = Math.max(0, r0 - 6); r <= Math.min(COLS - 1, r0 + 6); r++) {
      for (let c = Math.max(0, Math.min(COLS - 1, c0 - 6)); c <= Math.min(COLS - 1, c0 + 6); c++) {
        if (blocked[r * COLS + c]) continue;
        const cx = centerOf(c);
        const cz = centerOf(r);
        const dist = (cx - x) ** 2 + (cz - z) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          best = { c, r, x: cx, z: cz };
        }
      }
    }
    return best;
  }

  function findPath(x0, z0, x1, z1) {
    const start = nearest(x0, z0);
    const goal = nearest(x1, z1);
    if (!start || !goal) return [];
    if (start.c === goal.c && start.r === goal.r) return [{ x: goal.x, z: goal.z }];

    const startId = start.r * COLS + start.c;
    const goalId = goal.r * COLS + goal.c;
    const open = new Heap();
    const gScore = new Map([[startId, 0]]);
    const came = new Map();
    const closed = new Uint8Array(COLS * COLS);
    open.push({ id: startId, f: 0 });

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [1, -1, 1.414],
      [-1, 1, 1.414],
      [-1, -1, 1.414],
    ];

    while (open.size) {
      const current = open.pop();
      if (closed[current.id]) continue;
      if (current.id === goalId) {
        const path = [{ x: goal.x, z: goal.z }];
        let cursor = goalId;
        while (came.has(cursor)) {
          cursor = came.get(cursor);
          const c = cursor % COLS;
          const r = (cursor - c) / COLS;
          path.push({ x: centerOf(c), z: centerOf(r) });
        }
        path.pop();
        path.reverse();
        return path;
      }
      closed[current.id] = 1;
      const c = current.id % COLS;
      const r = (current.id - c) / COLS;
      const base = gScore.get(current.id) ?? Infinity;
      for (const [dc, dr, cost] of dirs) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= COLS) continue;
        const nid = nr * COLS + nc;
        if (blocked[nid] || closed[nid]) continue;
        if (dc !== 0 && dr !== 0 && (blocked[r * COLS + nc] || blocked[nr * COLS + c])) continue;
        const nextG = base + cost;
        if (nextG >= (gScore.get(nid) ?? Infinity)) continue;
        came.set(nid, current.id);
        gScore.set(nid, nextG);
        const heur = Math.hypot(nc - goal.c, nr - goal.r);
        open.push({ id: nid, f: nextG + heur });
      }
    }
    return [];
  }

  return {
    free,
    findPath,
    randomPoint() {
      return free[(Math.random() * free.length) | 0];
    },
  };
}

export function collide(colliders, x, z, radius) {
  for (const box of colliders) {
    if (box.maxy < 0.25 || box.miny > 1.7) continue;
    if (x + radius > box.minx && x - radius < box.maxx && z + radius > box.minz && z - radius < box.maxz) return box;
  }
  return null;
}

export function moveCircle(colliders, extras, x, z, dx, dz, radius) {
  let nx = x + dx;
  if (collide(colliders, nx, z, radius) || hitExtra(extras, nx, z, radius)) nx = x;
  let nz = z + dz;
  if (collide(colliders, nx, nz, radius) || hitExtra(extras, nx, nz, radius)) nz = z;
  return { x: nx, z: nz };
}

function hitExtra(extras, x, z, radius) {
  for (const extra of extras) {
    const reach = radius + extra.r;
    if ((extra.x - x) ** 2 + (extra.z - z) ** 2 < reach * reach) return true;
  }
  return false;
}

export const LOOT_TABLE = {
  0: [
    { name: '旧绷带', value: 800, rarity: 0, weight: 0.2 },
    { name: '民用电池', value: 1600, rarity: 0, weight: 0.4 },
    { name: '工具组', value: 2400, rarity: 0, weight: 1.6 },
    { name: '5.56 弹药', value: 2200, rarity: 0, weight: 0.5, rounds: 30, gun: 0 },
    { name: '9mm 弹药', value: 1400, rarity: 0, weight: 0.3, rounds: 20, gun: 1 },
  ],
  1: [
    { name: '军用电池', value: 12000, rarity: 1, weight: 1.1 },
    { name: '精密零件', value: 18000, rarity: 1, weight: 0.8 },
    { name: '急救包', value: 8000, rarity: 1, weight: 0.6, heal: 45 },
    { name: '加密U盘', value: 26000, rarity: 2, weight: 0.15 },
    { name: '光学镜片', value: 21000, rarity: 2, weight: 0.4 },
  ],
  2: [
    { name: '金条', value: 62000, rarity: 3, weight: 1.8 },
    { name: '显卡', value: 84000, rarity: 3, weight: 0.7 },
    { name: '实验芯片', value: 128000, rarity: 4, weight: 0.2 },
    { name: '原型供能单元', value: 186000, rarity: 4, weight: 2.4 },
    { name: '航海日志', value: 46000, rarity: 2, weight: 0.3 },
  ],
};

export function rollItem(tier) {
  const pool = LOOT_TABLE[tier] || LOOT_TABLE[0];
  return { ...pool[(Math.random() * pool.length) | 0] };
}

export function buildMap(scene) {
  const colliders = [];
  const rayMeshes = [];
  const footprints = [];

  const concrete = surface('concrete');
  const wall = surface('panel', '#8e948c');
  const olive = surface('panel', '#6c7356');
  const blue = surface('panel', '#667480');
  const metal = surface('corrugated', '#5e6866');
  const asphalt = surface('asphalt');
  const yard = surface('yard');
  const waterMat = surface('water');
  const trim = finish('polyTan');
  const dirt = surface('dirt');

  function addBox(x, y, z, w, h, d, material, { block = true, foot = false, ray = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (ray) rayMeshes.push(mesh);
    if (block) {
      colliders.push({
        minx: x - w / 2,
        maxx: x + w / 2,
        miny: y - h / 2,
        maxy: y + h / 2,
        minz: z - d / 2,
        maxz: z + d / 2,
      });
    }
    if (foot) footprints.push({ x, z, w, d });
    return mesh;
  }

  function addBuilding(x0, x1, z0, z1, h, material, doors) {
    const t = 0.42;
    const y = h / 2;
    const sides = [
      { axis: 'z', fixed: z0, a: x0, b: x1, side: 's' },
      { axis: 'z', fixed: z1, a: x0, b: x1, side: 'n' },
      { axis: 'x', fixed: x0, a: z0, b: z1, side: 'w' },
      { axis: 'x', fixed: x1, a: z0, b: z1, side: 'e' },
    ];
    for (const side of sides) {
      const holes = doors.filter((door) => door.side === side.side);
      for (const cut of segments(side.a, side.b, holes)) {
        const length = cut.b - cut.a;
        const mid = (cut.a + cut.b) / 2;
        if (side.axis === 'z') addBox(mid, y, side.fixed, length, h, t, material);
        else addBox(side.fixed, y, mid, t, h, length, material);
      }
    }
    addBox((x0 + x1) / 2, h + 0.16, (z0 + z1) / 2, x1 - x0, 0.32, z1 - z0, material, { block: false });
    footprints.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 });
    const light = new THREE.PointLight(0xffc98a, 7, 14, 2);
    light.position.set((x0 + x1) / 2, 2.4, (z0 + z1) / 2);
    scene.add(light);
  }

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), dirt);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  rayMeshes.push(ground);

  addBox(0, 0.012, 16, 20, 0.02, 28, yard, { block: false, ray: false });
  addBox(0, 0.02, 4, 7.5, 0.04, 58, asphalt, { block: false, ray: false });
  const paint = new THREE.MeshBasicMaterial({
    color: 0xd6b25a,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  for (const x of [0, -3.2, 3.2]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(x === 0 ? 0.16 : 0.08, 0.012, 52), paint);
    line.position.set(x, 0.05, 4);
    line.castShadow = false;
    line.receiveShadow = false;
    scene.add(line);
  }
  addBox(46, -0.08, 0, 22, 0.2, 78, waterMat, { block: false, ray: false });
  addBox(0, 0.016, 8, 22, 0.02, 24, yard, { block: false, ray: false });

  addBox(0, 1.6, -34, 68, 3.2, 0.6, metal, { foot: true });
  addBox(0, 1.6, 34, 68, 3.2, 0.6, metal, { foot: true });
  addBox(-34, 1.6, -19, 0.6, 3.2, 30, metal, { foot: true });
  addBox(-34, 1.6, 19, 0.6, 3.2, 30, metal, { foot: true });
  addBox(34, 1.6, -19, 0.6, 3.2, 30, metal, { foot: true });
  addBox(34, 1.6, 19, 0.6, 3.2, 30, metal, { foot: true });

  addBuilding(-28, -12, -4, 16, 5.2, olive, [{ side: 'e', at: 6, width: 3 }]);
  addBuilding(12, 28, -4, 16, 5.2, blue, [{ side: 'w', at: 6, width: 3 }]);
  addBuilding(-8, 8, -26, -12, 6.2, wall, [{ side: 's', at: 0, width: 3 }]);

  const covers = [
    [0, 12, 2.6, 1.3, 1.5],
    [-6, 2, 1.4, 1.2, 2.4],
    [6, 2, 1.4, 1.2, 2.4],
    [0, -6, 3.2, 1.15, 1.3],
  ];
  const plank = surface('wood');
  for (const [x, z, w, h, d] of covers) {
    addBox(x, h / 2, z, w, h, d, concrete, { foot: true });
    addBox(x, h + 0.08, z, w * 0.92, 0.16, d * 0.2, trim, { block: false, ray: false });
    const face = z + d / 2 + 0.03;
    for (let i = 0; i < 4; i++) {
      addBox(x, 0.18 + i * (h / 4.2), face, w * 0.96, h / 5.2, 0.05, plank, { block: false, ray: false });
    }
  }

  const pad = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.5, 28),
    new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: 0.7, metalness: 0.2 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.05, -30);
  scene.add(pad);
  addBox(0, 0.08, -30, 0.4, 0.08, 1.6, trim, { block: false, ray: false });
  addDetail(scene, addBox);

  function beam(x, z, color) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 16, 8),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.85,
        transparent: true,
        opacity: 0.35,
      }),
    );
    mesh.position.set(x, 8, z);
    scene.add(mesh);
    const light = new THREE.PointLight(color, 8, 10, 2);
    light.position.set(x, 1.5, z);
    scene.add(light);
    return mesh;
  }

  const extracts = [
    { id: 'north', name: '北停机坪', x: 0, z: -30.5, r: 2.8, need: 0, beam: beam(0, -30.5, 0x37d67a) },
    { id: 'west', name: '西闸门', x: -31, z: 0, r: 2.2, need: 0, beam: beam(-31, 0, 0x37d67a) },
    { id: 'east', name: '东侧快艇', x: 31, z: 0, r: 2.2, need: 80000, beam: beam(31, 0, 0xe0b15a) },
  ];

  const crateSlots = [
    { x: -20, z: 8, tier: 1, key: true },
    { x: -22, z: 0, tier: 1 },
    { x: -16, z: 12, tier: 2 },
    { x: 20, z: 8, tier: 1 },
    { x: 22, z: 0, tier: 1 },
    { x: 16, z: 12, tier: 2 },
    { x: -3, z: -18, tier: 2, lock: true },
    { x: 3, z: -20, tier: 2 },
    { x: 0, z: -16, tier: 1 },
    { x: 0, z: 18, tier: 0 },
    { x: -8, z: 22, tier: 0 },
    { x: 8, z: 20, tier: 0 },
    { x: 6, z: -27.2, tier: 2 },
    { x: -24, z: 4, tier: 0 },
  ];

  const enemySpawns = [
    { x: -20, z: 6, role: 'rifle' },
    { x: -22, z: 12, role: 'shotgun' },
    { x: 20, z: 8, role: 'rifle' },
    { x: 0, z: -19, role: 'marksman' },
    { x: 12, z: -20, role: 'rifle' },
    { x: -16, z: -18, role: 'shotgun' },
  ];

  for (const box of YARD_CONTAINERS) {
    colliders.push({
      minx: box.x - box.w / 2,
      maxx: box.x + box.w / 2,
      miny: 0,
      maxy: box.h,
      minz: box.z - box.d / 2,
      maxz: box.z + box.d / 2,
    });
    footprints.push({ x: box.x, z: box.z, w: box.w, d: box.d });
  }

  return {
    colliders,
    rayMeshes,
    footprints,
    extracts,
    crateSlots,
    enemySpawns,
    spawn: { x: 0, z: 26, yaw: 0 },
    nav: buildNav(colliders),
  };
}

const RARITY_COLOR = [0xc8c8c8, 0x3dba6a, 0x4aa3ff, 0xb05cff, 0xe2b340];

export function createCrate(tier, extra = {}) {
  const count = tier === 0 ? 2 : tier === 1 ? 3 : 4;
  const items = [];
  for (let i = 0; i < count; i++) items.push(rollItem(Math.random() < 0.72 ? tier : Math.max(0, tier - 1)));
  if (extra.key) items.push({ name: '调度室门禁卡', value: 4500, rarity: 2, weight: 0.05, key: true });
  const best = items.reduce((max, item) => Math.max(max, item.rarity), 0);
  const color = RARITY_COLOR[best];
  const root = new THREE.Group();
  const visual = claimCrate();
  if (visual) {
    root.add(visual);
    root.userData.grounded = true;
  } else {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.48, 0.64),
      extra.lock ? finish('park') : surface('case'),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.y = 0.28;
    root.add(mesh);
    root.userData.fallback = mesh;
  }
  if (extra.lock) {
    const lamp = new THREE.PointLight(0xe0b15a, 0.6, 2.2, 2);
    lamp.position.y = 0.4;
    root.add(lamp);
  }
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.035, 0.04),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7 }),
  );
  stripe.position.set(0, 0.5, 0.22);
  root.add(stripe);
  return { tier, items, mesh: root, looted: false, best, lock: Boolean(extra.lock) };
}

export const RARITY_HEX = ['#d5d5d5', '#3dba6a', '#4aa3ff', '#c58bff', '#e2b340'];
