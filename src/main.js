import * as THREE from '../vendor/three.module.js';
import { createAudio } from './audio.js';
import { buildMap, createCrate, moveCircle, rollItem, RARITY_HEX } from './world.js?v=38';
import { applyAtmosphere, finish, surface } from './materials.js?v=38';
import { createViewmodel, gunsReady } from './viewmodel.js?v=48';
import { claimCrate, claimOperator, dressShelves, dressYard, onCrate, onOperators } from './props.js?v=42';

const SAVE_KEY = 'fireline-save-v1';
const EXTRACT_TIME = 6;
const HEAL_TIME = 2.8;
const WEAPONS = [
  { name: 'CAR-15 突击步枪', auto: true, magSize: 30, reserve: 120, damage: 27, rpm: 640, spread: 0.011, reload: 2.2, mode: '全自动' },
  { name: 'G17 手枪', auto: false, magSize: 17, reserve: 51, damage: 21, rpm: 420, spread: 0.016, reload: 1.45, mode: '半自动' },
  { name: 'MP5 冲锋枪', auto: true, magSize: 30, reserve: 90, damage: 18, rpm: 780, spread: 0.02, reload: 1.85, mode: '全自动' },
];
const ROLES = {
  rifle: { label: '步枪手', hp: 100, armor: 35, damage: 11, range: 28, prefer: 12, fire: 0.55, spread: 0.05, color: 0x2c3542 },
  shotgun: { label: '霰弹手', hp: 120, armor: 45, damage: 24, range: 11, prefer: 6, fire: 1, spread: 0.12, color: 0x3c4632 },
  marksman: { label: '射手', hp: 80, armor: 20, damage: 19, range: 42, prefer: 18, fire: 1.2, spread: 0.018, color: 0x3a4046 },
};

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc5d0d4);
scene.fog = new THREE.Fog(0xc5d0d4, 40, 125);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.08, 220);
camera.rotation.order = 'YXZ';
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xcfe6fb, 0x8d7b62, 0.7);
scene.add(hemi);
scene.add(new THREE.AmbientLight(0xfff8ef, 0.14));
const sun = new THREE.DirectionalLight(0xfff3dc, 4.05);
const fill = new THREE.DirectionalLight(0xc5d6e8, 1.7);
fill.position.set(-22, 30, -12);
scene.add(fill);
sun.position.set(24, 46, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near = 6;
sun.shadow.camera.far = 120;
sun.shadow.camera.left = -42;
sun.shadow.camera.right = 42;
sun.shadow.camera.top = 42;
sun.shadow.camera.bottom = -42;
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 0.025;
scene.add(sun, sun.target);
const lane = new THREE.PointLight(0xfff3d8, 70, 24, 2);
lane.position.set(0, 3.8, 16);
scene.add(lane);

const map = buildMap(scene);
applyAtmosphere(scene, renderer);
dressShelves(scene);
dressYard(scene);
const audio = createAudio();

const viewGuns = [createViewmodel('rifle'), createViewmodel('pistol'), createViewmodel('smg')];
camera.add(...viewGuns);
const flash = new THREE.PointLight(0xffe2b5, 0, 5.5, 2);
scene.add(flash);
const viewFill = new THREE.PointLight(0xfff4e4, 1.05, 2.8, 2);
viewFill.position.set(-0.15, 0.05, -0.25);
camera.add(viewFill);
const shellMat = finish('brass');
const shells = Array.from({ length: 10 }, () => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.024, 6), shellMat);
  mesh.visible = false;
  mesh.castShadow = false;
  scene.add(mesh);
  return mesh;
});
let shellCursor = 0;

const decalGeo = new THREE.BoxGeometry(0.16, 0.16, 0.015);
const decalMat = new THREE.MeshBasicMaterial({ color: 0x211c17 });
const decals = Array.from({ length: 24 }, () => {
  const mesh = new THREE.Mesh(decalGeo, decalMat);
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
});
let decalCursor = 0;

const tracers = Array.from({ length: 12 }, () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffe2a8 }));
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);
  return line;
});
let tracerCursor = 0;

const down = new Set();
const was = new Set();
let dragging = false;
let aiming = false;
let mouseHeld = false;
let semiShot = false;
let state = 'menu';
let time = 0;
let ended = false;
let inventoryOpen = false;
let frozen = false;
let deathTimer = 0;
let radioUntil = 0;
let hitUntil = 0;
let hitKill = false;
let recoil = 0;
let crates = [];
let enemies = [];
let backpack = [];
let feed = [];
let save = loadSave();

const player = resetPlayer();
const raycaster = new THREE.Raycaster();
const muzzle = new THREE.Vector3();
const aimPoint = new THREE.Vector3();

function loadSave() {
  try {
    return Object.assign({ money: 0, raids: 0, extracts: 0 }, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'));
  } catch {
    return { money: 0, raids: 0, extracts: 0 };
  }
}

function persist() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function fmt(value) {
  return Math.max(0, Math.floor(value)).toLocaleString('zh-CN');
}

function resetPlayer() {
  return {
    x: 0,
    z: 26,
    yaw: 0,
    pitch: 0,
    hp: 100,
    armor: 50,
    vx: 0,
    vz: 0,
    crouch: false,
    sprint: false,
    aim: false,
    weapon: 0,
    guns: freshGuns(),
    reloadUntil: 0,
    reloading: false,
    fireUntil: 0,
    switchUntil: 0,
    hurt: 0,
    step: 0,
    heal: 0,
    extract: 0,
    search: 0,
    searchTarget: null,
    hitAngle: 0,
    hitUntil: 0,
    shot: false,
    alive: true,
  };
}

function freshGuns() {
  return WEAPONS.map((weapon) => ({ ...weapon, mag: weapon.magSize, reserve: weapon.reserve }));
}

function showViewGuns() {
  const on = state === 'raid' || state === 'paused';
  viewGuns.forEach((gun, index) => {
    gun.visible = on && player.weapon === index;
  });
}

function show(id) {
  for (const screen of ['screen-menu', 'screen-brief', 'screen-raid', 'screen-pause', 'screen-result']) {
    $(screen).hidden = screen !== id;
  }
}

function renderStash() {
  $('stash-money').textContent = fmt(save.money);
  $('stash-raids').textContent = String(save.raids);
  $('stash-extracts').textContent = String(save.extracts);
}

function carriedValue() {
  return backpack.reduce((sum, item) => sum + (item.brought ? 0 : item.value), 0);
}

function clearRaid() {
  for (const crate of crates) {
    scene.remove(crate.mesh);
    const index = map.rayMeshes.indexOf(crate.mesh);
    if (index >= 0) map.rayMeshes.splice(index, 1);
    crate.mesh.traverse((obj) => {
      const list = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      for (const material of list) if (material?.userData?.owned) material.dispose();
    });
  }
  crates = [];
  for (const enemy of enemies) {
    scene.remove(enemy.mesh);
    enemy.mesh.traverse((obj) => {
      const list = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
      for (const material of list) if (material?.userData?.owned) material.dispose();
    });
  }
  enemies = [];
  for (const decal of decals) decal.visible = false;
  for (const tracer of tracers) tracer.visible = false;
}

function makeEnemy(x, z, id, roleName = 'rifle') {
  const role = ROLES[roleName] || ROLES.rifle;
  const group = new THREE.Group();
  const cloth = surface('fabric', '#' + role.color.toString(16).padStart(6, '0')).clone();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc4a07a, roughness: 0.7 });
  const armorMat = finish('black');
  const helmetMat = finish('park');
  const visorMat = new THREE.MeshStandardMaterial({ color: 0xff8a3a, emissive: 0xff6a1a, emissiveIntensity: 0.85 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.7, 0.3), cloth);
  body.position.set(0, 1.12, 0);
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), skin);
  head.position.set(0, 1.62, 0);
  head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), helmetMat);
  helmet.position.set(0, 1.66, -0.01);
  helmet.scale.set(1.05, 0.72, 1.12);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.04), visorMat);
  visor.position.set(0, 1.5, -0.13);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.08), armorMat);
  vest.position.set(0, 1.12, -0.12);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.1), armorMat);
  pack.position.set(0, 1.12, 0.16);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.14), cloth);
    leg.position.set(side * 0.1, 0.31, 0);
    leg.castShadow = true;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.4, 0.09), cloth);
    arm.position.set(side * 0.24, 1.05, -0.04);
    group.add(leg, arm);
  }
  const barrelLength = roleName === 'marksman' ? 0.62 : roleName === 'shotgun' ? 0.42 : 0.4;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, barrelLength, 8), helmetMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.16, 1.02, -0.22 - barrelLength * 0.25);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, barrelLength * 0.45), armorMat);
  handguard.position.set(0.16, 1.0, -0.12);
  body.userData = { eid: id, part: 'body' };
  head.userData = helmet.userData = { eid: id, part: 'head' };
  group.add(body, head, helmet, visor, vest, pack, barrel, handguard);
  group.position.set(x, 0, z);
  scene.add(group);
  return {
    id,
    x,
    z,
    role: roleName,
    label: role.label,
    hp: role.hp,
    armor: role.armor,
    damage: role.damage,
    range: role.range,
    prefer: role.prefer,
    fire: role.fire,
    spread: role.spread,
    alive: true,
    mesh: group,
    body,
    head,
    helmet,
    barrel,
    handguard,
    cloth,
    cooldown: 0.4 + Math.random(),
    state: 'patrol',
    path: [],
    repath: 0,
    lost: 0,
    lastX: x,
    lastZ: z,
    loot: null,
    lootTaken: false,
    hitFlash: 0,
  };
}

function startRaid() {
  clearRaid();
  ended = false;
  time = 0;
  inventoryOpen = false;
  $('inventory').hidden = true;
  feed = [];
  Object.assign(player, resetPlayer());
  player.x = map.spawn.x;
  player.z = map.spawn.z;
  player.yaw = map.spawn.yaw;
  backpack = [{ name: '制式急救包', value: 0, rarity: 1, weight: 0.4, heal: 40, brought: true }];
  crates = map.crateSlots.map((slot) => {
    const crate = createCrate(slot.tier, { key: slot.key, lock: slot.lock });
    crate.x = slot.x;
    crate.z = slot.z;
    crate.mesh.position.set(slot.x, crate.mesh.userData.grounded ? 0.02 : 0, slot.z);
    scene.add(crate.mesh);
    map.rayMeshes.push(crate.mesh);
    return crate;
  });
  enemies = map.enemySpawns.map((spot, index) => makeEnemy(spot.x, spot.z, index, spot.role));
  for (const enemy of enemies) equipEnemy(enemy);
  onOperators(() => {
    for (const enemy of enemies) equipEnemy(enemy);
  });
  onCrate(() => {
    for (const crate of crates) {
      if (crate.mesh.userData.grounded) continue;
      const visual = claimCrate();
      if (!visual) continue;
      if (crate.mesh.userData.fallback) crate.mesh.remove(crate.mesh.userData.fallback);
      crate.mesh.add(visual);
      crate.mesh.userData.grounded = true;
      crate.mesh.position.y = 0.02;
    }
  });
  state = 'raid';
  show('screen-raid');
  radio('指挥：西仓有调度室门禁卡。保险柜在调度室。负重过 26 公斤会变慢。东侧快艇至少 80,000 哈夫币。');
  renderFeed();
  renderInventory();
  syncHud();
}

function radio(text) {
  const node = $('radio');
  node.hidden = false;
  node.textContent = text;
  radioUntil = time + 9;
}

function pushFeed(text) {
  feed.unshift({ text, until: time + 3.4 });
  feed = feed.slice(0, 4);
  renderFeed();
}

function renderFeed() {
  $('feed').innerHTML = feed.map((item) => `<li>${item.text}</li>`).join('');
}

function renderInventory() {
  const list = $('inventory-list');
  const items = [...backpack].sort((a, b) => b.value - a.value);
  if (!items.length) {
    list.innerHTML = '<li>空的</li>';
    return;
  }
  list.innerHTML = items
    .map((item) => `<li style="color:${RARITY_HEX[item.rarity]}">${item.name}<small>${item.brought ? '携带' : `${fmt(item.value)} · ${item.weight || 0}kg`}</small></li>`)
    .join('');
}

function carriedWeight() {
  return backpack.reduce((sum, item) => sum + (item.weight || 0), 0);
}

function hasKey() {
  return backpack.some((item) => item.key);
}

function takeItems(items, label) {
  for (const item of items) {
    backpack.push({ ...item });
    if (item.rounds) {
      const gun = player.guns[item.gun ?? 0];
      if (gun) gun.reserve = Math.min(gun.reserve + item.rounds, gun.magSize * 8);
    }
  }
  audio.pickup();
  renderInventory();
  pushFeed(`${label}：${items.map((item) => item.name).slice(0, 3).join('、')}`);
}

function lootCrate(crate) {
  if (crate.looted) return;
  crate.looted = true;
  crate.mesh.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of list) {
      if (material.emissive) material.emissiveIntensity = 0;
      if (material.color) material.color.multiplyScalar(0.62);
    }
  });
  takeItems(crate.items, `搜到 ${crate.items.length} 件物资`);
}

function equipEnemy(enemy) {
  if (enemy.dressed) return;
  const figure = claimOperator(enemy.role);
  if (!figure) return;
  figure.rotation.y = Math.PI;
  enemy.mesh.add(figure);
  enemy.dressed = true;
  const ghost = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  ghost.userData.owned = true;
  for (const part of [enemy.body, enemy.head, enemy.helmet]) {
    part.material = ghost.clone();
    part.material.userData.owned = true;
  }
  for (const child of enemy.mesh.children) {
    if (child === figure || child === enemy.body || child === enemy.head || child === enemy.helmet) continue;
    child.visible = false;
  }
}

function lootBody(enemy) {
  if (enemy.lootTaken || !enemy.loot) return;
  enemy.lootTaken = true;
  takeItems(enemy.loot, '搜刮了敌对干员');
}

function endRaid(success) {
  if (ended) return;
  ended = true;
  state = 'result';
  aiming = false;
  mouseHeld = false;
  if (document.pointerLockElement) document.exitPointerLock();
  const value = success ? carriedValue() : 0;
  if (success) {
    save.money += value;
    save.extracts += 1;
    audio.success();
  } else if (player.alive) {
    audio.fail();
  }
  player.alive = false;
  save.raids += 1;
  persist();
  $('result-kicker').textContent = success ? '烽火地带 · 结算' : '烽火地带 · 失败';
  $('result-title').textContent = success ? '撤离成功' : '行动失败';
  $('result-copy').textContent = success
    ? value > 0
      ? '干员，人回来了，货也回来了。哈夫币已经入账。'
      : '你活着离开灰港，但这包是空的。'
    : '你倒在灰港。背包留在原地，哈夫币没有入账。';
  const gained = success ? backpack.filter((item) => !item.brought && item.value > 0) : [];
  $('result-list').innerHTML = gained.length
    ? gained
        .slice()
        .sort((a, b) => b.value - a.value)
        .map((item) => `<li style="color:${RARITY_HEX[item.rarity]}">${item.name}　${fmt(item.value)}</li>`)
        .join('')
    : '<li>没有带出物资</li>';
  $('result-value').textContent = fmt(value);
  $('result-stash').textContent = fmt(save.money);
  show('screen-result');
  renderStash();
}

function syncCamera() {
  const eye = player.crouch ? 1.12 : 1.62;
  const moving = Math.hypot(player.vx, player.vz) > 0.4;
  const bob = moving && state === 'raid' ? Math.sin(time * (player.sprint ? 14 : 9)) * 0.018 : 0;
  camera.position.set(player.x, eye + bob, player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch - recoil;
  const fov = player.aim ? 46 : 63;
  camera.fov = THREE.MathUtils.damp(camera.fov, fov, 16, 0.016);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

function shootTargets() {
  const list = map.rayMeshes.slice();
  for (const enemy of enemies) {
    if (enemy.alive) list.push(enemy.body, enemy.head, enemy.helmet);
  }
  return list;
}

function shoot() {
  const gun = player.guns[player.weapon];
  if (!player.alive || time < player.switchUntil) return;
  if (player.reloading) return;
  if (gun.mag <= 0) {
    audio.dry();
    player.fireUntil = time + 0.22;
    return;
  }
  gun.mag -= 1;
  player.fireUntil = time + 60 / gun.rpm;
  player.shot = true;
  audio.shot();
  recoil = Math.min(0.09, recoil + (player.aim ? 0.008 : 0.014));
  flash.intensity = 14;
  const fired = viewGuns[player.weapon];
  for (const sprite of fired.userData.flashes || []) {
    sprite.rotation.z = Math.random() * Math.PI;
    sprite.scale.setScalar(0.75 + Math.random() * 0.7);
  }
  syncCamera();
  for (const enemy of enemies) {
    if (enemy.alive) enemy.mesh.updateMatrixWorld(true);
  }
  const spread = (player.aim ? gun.spread * 0.4 : gun.spread) + (player.sprint ? 0.03 : 0) + (Math.hypot(player.vx, player.vz) > 1 ? 0.008 : 0);
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const dir = raycaster.ray.direction;
  dir.x += (Math.random() - 0.5) * spread;
  dir.y += (Math.random() - 0.5) * spread;
  dir.z += (Math.random() - 0.5) * spread;
  dir.normalize();
  raycaster.set(camera.getWorldPosition(aimPoint), dir);
  raycaster.far = 90;
  const hits = raycaster.intersectObjects(shootTargets(), false);
  let hitPoint = camera.position.clone().addScaledVector(dir, 36);
  if (hits.length) {
    const hit = hits[0];
    hitPoint = hit.point.clone();
    const enemy = enemies[hit.object.userData.eid];
    if (enemy?.alive) {
      const amount = gun.damage * (hit.object.userData.part === 'head' ? 1.9 : 1);
      damageEnemy(enemy, amount, hit.object.userData.part === 'head');
    } else if (hit.face) {
      spawnDecal(hit);
    }
  }
  const gunMesh = viewGuns[player.weapon];
  muzzle.copy(gunMesh.userData.muzzle);
  gunMesh.localToWorld(muzzle);
  flash.position.copy(muzzle);
  ejectShell();
  spawnTracer(muzzle, hitPoint);
}

function ejectShell() {
  const shell = shells[shellCursor % shells.length];
  shellCursor += 1;
  shell.visible = true;
  shell.position.copy(muzzle);
  shell.position.y -= 0.04;
  const right = new THREE.Vector3(1, 0.2, 0).applyQuaternion(camera.quaternion);
  shell.userData.v = right.multiplyScalar(1.8);
  shell.userData.v.y += 1.4;
  shell.userData.life = 1.35;
}

function stepShells(dt) {
  for (const shell of shells) {
    if (!shell.visible) continue;
    shell.userData.life -= dt;
    shell.userData.v.y -= 9.2 * dt;
    shell.position.addScaledVector(shell.userData.v, dt);
    shell.rotation.x += dt * 14;
    shell.rotation.z += dt * 9;
    if (shell.userData.life <= 0 || shell.position.y < 0.02) shell.visible = false;
  }
}

function damageEnemy(enemy, amount, headshot) {
  let left = amount;
  if (enemy.armor > 0) {
    const absorbed = Math.min(enemy.armor, left * 0.5);
    enemy.armor -= absorbed;
    left -= absorbed;
  }
  enemy.hp -= left;
  enemy.hitFlash = 0.08;
  enemy.state = 'combat';
  enemy.lastX = player.x;
  enemy.lastZ = player.z;
  enemy.lost = 0;
  flashHit(headshot);
  audio.hit();
  if (enemy.hp <= 0) {
    enemy.alive = false;
    enemy.hp = 0;
    enemy.loot = [rollItem(1), rollItem(Math.random() < 0.5 ? 1 : 0)];
    audio.kill();
    pushFeed(headshot ? '爆头击倒 敌对干员' : '击倒 敌对干员');
    flashHit(true);
  }
}

function flashHit(kill) {
  hitUntil = time + 0.08;
  hitKill = kill;
}

function spawnDecal(hit) {
  const mesh = decals[decalCursor];
  decalCursor = (decalCursor + 1) % decals.length;
  mesh.visible = true;
  mesh.position.copy(hit.point).addScaledVector(hit.face.normal, 0.02);
  mesh.lookAt(hit.point.clone().add(hit.face.normal));
}

function spawnTracer(from, to) {
  const line = tracers[tracerCursor];
  tracerCursor = (tracerCursor + 1) % tracers.length;
  const position = line.geometry.attributes.position;
  position.setXYZ(0, from.x, from.y, from.z);
  position.setXYZ(1, to.x, to.y, to.z);
  position.needsUpdate = true;
  line.visible = true;
  line.userData.until = time + 0.05;
}

function damagePlayer(amount, fromX, fromZ) {
  if (!player.alive || ended) return;
  let left = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, left * 0.72);
    player.armor -= absorbed;
    left -= absorbed;
  }
  player.hp -= left;
  player.hurt = 1;
  if (fromX != null) {
    player.hitAngle = Math.atan2(fromX - player.x, -(fromZ - player.z)) - player.yaw;
    player.hitUntil = time + 0.45;
  }
  audio.hurt();
  if (player.hp <= 0) {
    player.hp = 0;
    player.alive = false;
    deathTimer = 0.85;
    audio.fail();
  }
}

function lineBlocked(x0, y0, z0, x1, y1, z1) {
  aimPoint.set(x1 - x0, y1 - y0, z1 - z0);
  const dist = aimPoint.length();
  if (dist < 0.05) return false;
  aimPoint.multiplyScalar(1 / dist);
  raycaster.set(new THREE.Vector3(x0, y0, z0), aimPoint);
  raycaster.far = Math.max(0.1, dist - 0.35);
  return raycaster.intersectObjects(map.rayMeshes, false).length > 0;
}

function extrasExcept(self) {
  const list = [];
  for (const enemy of enemies) {
    if (enemy.alive && enemy !== self) list.push({ x: enemy.x, z: enemy.z, r: 0.42 });
  }
  list.push({ x: player.x, z: player.z, r: 0.34 });
  return list;
}

function followPath(enemy, dt, speed) {
  if (!enemy.path?.length) return;
  const waypoint = enemy.path[0];
  const dx = waypoint.x - enemy.x;
  const dz = waypoint.z - enemy.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.75) {
    enemy.path.shift();
    return;
  }
  const step = Math.min(speed * dt, dist);
  const beforeX = enemy.x;
  const beforeZ = enemy.z;
  const moved = moveCircle(map.colliders, extrasExcept(enemy), enemy.x, enemy.z, (dx / dist) * step, (dz / dist) * step, 0.4);
  enemy.x = moved.x;
  enemy.z = moved.z;
  if (Math.hypot(enemy.x - beforeX, enemy.z - beforeZ) < 0.004) enemy.path.shift();
}

function updateEnemy(enemy, dt) {
  if (!enemy.alive) {
    enemy.mesh.position.y = THREE.MathUtils.damp(enemy.mesh.position.y, 0.42, 7, dt);
    enemy.mesh.rotation.z = THREE.MathUtils.damp(enemy.mesh.rotation.z, Math.PI / 2, 7, dt);
    return;
  }
  const dx = player.x - enemy.x;
  const dz = player.z - enemy.z;
  const dist = Math.hypot(dx, dz) || 0.001;
  const eye = player.crouch ? 0.85 : 1.25;
  const sight = enemy.range + 6;
  const los = dist < sight && !lineBlocked(enemy.x, 1.5, enemy.z, player.x, eye, player.z);
  if ((los && dist < enemy.range) || (player.shot && dist < sight)) {
    enemy.state = 'combat';
    enemy.lastX = player.x;
    enemy.lastZ = player.z;
    enemy.lost = 0;
  } else if (enemy.state === 'combat') {
    enemy.lost += dt;
    if (enemy.lost > 4.5) enemy.state = 'patrol';
  }

  enemy.repath -= dt;
  if (enemy.state === 'combat') {
    if (los && dist < enemy.prefer * 0.45) {
      const step = 2.6 * dt;
      const moved = moveCircle(map.colliders, extrasExcept(enemy), enemy.x, enemy.z, (-dx / dist) * step, (-dz / dist) * step, 0.4);
      enemy.x = moved.x;
      enemy.z = moved.z;
    } else if (los && dist < enemy.prefer) {
      const side = Math.sin(time * 1.5 + enemy.id) > 0 ? 1 : -1;
      const step = 2.3 * dt;
      const moved = moveCircle(map.colliders, extrasExcept(enemy), enemy.x, enemy.z, (-dz / dist) * side * step, (dx / dist) * side * step, 0.4);
      enemy.x = moved.x;
      enemy.z = moved.z;
    } else {
      if (enemy.repath <= 0) {
        const goal = los ? { x: player.x, z: player.z } : { x: enemy.lastX, z: enemy.lastZ };
        enemy.path = map.nav.findPath(enemy.x, enemy.z, goal.x, goal.z);
        enemy.repath = 0.8;
      }
      followPath(enemy, dt, enemy.role === 'shotgun' ? 3.8 : 3.3);
    }
    enemy.mesh.lookAt(player.x, 0, player.z);
  } else {
    if (enemy.repath <= 0 || !enemy.path.length) {
      const point = map.nav.randomPoint();
      enemy.path = point ? map.nav.findPath(enemy.x, enemy.z, point.x, point.z) : [];
      enemy.repath = 4 + Math.random() * 2;
    }
    followPath(enemy, dt, 2.4);
    if (enemy.path[0]) enemy.mesh.lookAt(enemy.path[0].x, 0, enemy.path[0].z);
  }

  enemy.mesh.position.x = enemy.x;
  enemy.mesh.position.z = enemy.z;
  enemy.cloth.emissive.setHex(enemy.hitFlash > 0 ? 0xffffff : 0x000000);
  enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  enemy.cooldown -= dt;
  if (enemy.state === 'combat' && los && dist < enemy.range && enemy.cooldown <= 0 && player.alive) {
    enemy.cooldown = enemy.fire;
    enemyShoot(enemy);
  }
}

function enemyShoot(enemy) {
  const origin = new THREE.Vector3(enemy.x, 1.48, enemy.z);
  const aimY = player.crouch ? 0.8 : 1.15;
  const dir = new THREE.Vector3(player.x - origin.x, aimY - origin.y, player.z - origin.z);
  dir.normalize();
  const spread = enemy.spread || 0.05;
  dir.x += (Math.random() - 0.5) * spread;
  dir.y += (Math.random() - 0.5) * spread * 0.7;
  dir.z += (Math.random() - 0.5) * spread;
  dir.normalize();
  raycaster.set(origin, dir);
  raycaster.far = 42;
  const wall = raycaster.intersectObjects(map.rayMeshes, false)[0];
  const toX = player.x - origin.x;
  const toY = aimY - origin.y;
  const toZ = player.z - origin.z;
  const travel = toX * dir.x + toY * dir.y + toZ * dir.z;
  if (travel < 0) return;
  const missX = origin.x + dir.x * travel - player.x;
  const missY = origin.y + dir.y * travel - aimY;
  const missZ = origin.z + dir.z * travel - player.z;
  if (missX * missX + missY * missY + missZ * missZ > 0.45 * 0.45) return;
  if (wall && wall.distance < travel - 0.2) return;
  damagePlayer(enemy.damage || 12, enemy.x, enemy.z);
}

function crateBoxes() {
  return crates.map((crate) => ({
    minx: crate.x - 0.48,
    maxx: crate.x + 0.48,
    miny: 0,
    maxy: 0.7,
    minz: crate.z - 0.38,
    maxz: crate.z + 0.38,
  }));
}

function nearestInteract() {
  let crate = null;
  let body = null;
  let best = 2.2;
  for (const item of crates) {
    if (item.looted) continue;
    const dist = Math.hypot(item.x - player.x, item.z - player.z);
    if (dist < best) {
      best = dist;
      crate = item;
      body = null;
    }
  }
  for (const enemy of enemies) {
    if (enemy.alive || enemy.lootTaken || !enemy.loot) continue;
    const dist = Math.hypot(enemy.x - player.x, enemy.z - player.z);
    if (dist < best) {
      best = dist;
      body = enemy;
      crate = null;
    }
  }
  return { crate, body };
}

function currentZone() {
  for (const zone of map.extracts) {
    if (Math.hypot(zone.x - player.x, zone.z - player.z) <= zone.r) return zone;
  }
  return null;
}

function startReload() {
  const gun = player.guns[player.weapon];
  if (player.reloading || gun.mag >= gun.magSize || gun.reserve <= 0) return;
  player.reloading = true;
  player.reloadUntil = time + gun.reload;
}

function finishReload() {
  const gun = player.guns[player.weapon];
  const need = gun.magSize - gun.mag;
  const take = Math.min(need, gun.reserve);
  gun.mag += take;
  gun.reserve -= take;
  player.reloading = false;
  player.reloadUntil = 0;
}

function switchWeapon(index) {
  if (player.weapon === index || time < player.switchUntil) return;
  player.weapon = index;
  player.switchUntil = time + 0.32;
  player.reloading = false;
  player.reloadUntil = 0;
}

function updatePlayer(dt, edge) {
  const forward = (down.has('KeyW') ? 1 : 0) - (down.has('KeyS') ? 1 : 0);
  const strafe = (down.has('KeyD') ? 1 : 0) - (down.has('KeyA') ? 1 : 0);
  const movingInput = forward !== 0 || strafe !== 0;
  const healing = player.heal > 0;
  player.crouch = down.has('KeyC');
  player.sprint = down.has('ShiftLeft') && movingInput && !player.crouch && !healing;
  player.aim = aiming && !player.sprint;

  let speed = 4.6;
  if (player.crouch) speed = 2.15;
  else if (player.aim) speed = 2.65;
  else if (player.sprint) speed = 7.15;
  if (healing) speed *= 0.55;
  const kilos = carriedWeight();
  if (kilos > 26) speed *= Math.max(0.48, 1 - (kilos - 26) * 0.028);

  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);
  let wishX = -sin * forward + cos * strafe;
  let wishZ = -cos * forward - sin * strafe;
  const length = Math.hypot(wishX, wishZ);
  if (length > 0) {
    wishX = (wishX / length) * speed;
    wishZ = (wishZ / length) * speed;
  } else {
    wishX = 0;
    wishZ = 0;
  }
  player.vx = THREE.MathUtils.damp(player.vx, wishX, 14, dt);
  player.vz = THREE.MathUtils.damp(player.vz, wishZ, 14, dt);
  const bodies = enemies.filter((enemy) => enemy.alive).map((enemy) => ({ x: enemy.x, z: enemy.z, r: 0.42 }));
  const moved = moveCircle(
    map.colliders.concat(crateBoxes()),
    bodies,
    player.x,
    player.z,
    player.vx * dt,
    player.vz * dt,
    0.32,
  );
  player.x = Math.max(-33.3, Math.min(33.3, moved.x));
  player.z = Math.max(-33.3, Math.min(33.3, moved.z));

  if (Math.hypot(player.vx, player.vz) > 1.2) {
    player.step -= dt;
    if (player.step <= 0) {
      audio.step();
      player.step = player.sprint ? 0.28 : player.crouch ? 0.58 : 0.44;
    }
  }

  if (edge.r) startReload();
  if (player.reloading && time >= player.reloadUntil) finishReload();
  if (edge.one) switchWeapon(0);
  if (edge.two) switchWeapon(1);
  if (edge.three) switchWeapon(2);

  const gun = player.guns[player.weapon];
  if (mouseHeld && !player.sprint) {
    if (gun.auto) {
      if (time >= player.fireUntil) shoot();
    } else if (!semiShot) {
      semiShot = true;
      if (time >= player.fireUntil) shoot();
    }
  }
  if (!mouseHeld) semiShot = false;

  const med = backpack.find((item) => item.heal && player.hp < 100);
  if (down.has('KeyG') && med && !player.sprint) {
    player.heal += dt;
    if (player.heal >= HEAL_TIME) {
      player.hp = Math.min(100, player.hp + med.heal);
      backpack.splice(backpack.indexOf(med), 1);
      player.heal = 0;
      audio.pickup();
      renderInventory();
      pushFeed('使用了急救包');
    }
  } else player.heal = 0;

  const interact = nearestInteract();
  const zone = currentZone();
  const prompt = $('prompt');
  const locked = interact.crate?.lock && !hasKey();
  let channelRatio = 0;
  let channelText = '';
  if (zone && down.has('KeyF')) {
    player.search = 0;
    player.searchTarget = null;
    if (zone.need && carriedValue() < zone.need) {
      player.extract = 0;
      prompt.textContent = `${zone.name}需要携带 ${fmt(zone.need)} 哈夫币`;
    } else {
      player.extract += dt;
      prompt.textContent = `正在从${zone.name}撤离`;
      channelRatio = player.extract / EXTRACT_TIME;
      channelText = '撤离中';
      if (Math.floor(player.extract * 4) !== Math.floor((player.extract - dt) * 4)) audio.tick();
      if (player.extract >= EXTRACT_TIME) endRaid(true);
    }
  } else if ((interact.crate || interact.body) && down.has('KeyF') && !locked) {
    player.extract = 0;
    const target = interact.crate || interact.body;
    const duration = interact.crate ? 1.35 : 0.9;
    if (player.searchTarget !== target) {
      player.searchTarget = target;
      player.search = 0;
    }
    player.search += dt;
    prompt.textContent = interact.crate ? (interact.crate.lock ? '正在开启保险柜' : '正在搜刮集装箱') : `正在搜刮${interact.body.label || '干员'}`;
    channelRatio = player.search / duration;
    channelText = interact.crate ? '搜刮中' : '检查中';
    if (player.search >= duration) {
      if (interact.crate) lootCrate(interact.crate);
      else lootBody(interact.body);
      player.search = 0;
      player.searchTarget = null;
    }
  } else {
    player.extract = 0;
    player.search = 0;
    player.searchTarget = null;
    if (locked) prompt.textContent = '保险柜锁着，需要调度室门禁卡';
    else if (interact.crate) prompt.textContent = interact.crate.lock ? '按住 F 开启保险柜' : '按住 F 搜刮集装箱';
    else if (interact.body) prompt.textContent = `按住 F 搜刮${interact.body.label}`;
    else if (zone) prompt.textContent = zone.need ? `条件撤离 · ${zone.name}` : `按住 F · ${zone.name}`;
    else prompt.textContent = '';
  }
  prompt.hidden = !prompt.textContent;
  if (player.heal > 0) {
    channelRatio = player.heal / HEAL_TIME;
    channelText = '包扎中';
  }
  const channel = $('channel');
  channel.hidden = channelRatio <= 0;
  if (channelRatio > 0) {
    $('channel-fill').style.width = `${Math.min(100, channelRatio * 100)}%`;
    $('channel-label').textContent = channelText;
  }
}

function syncHud() {
  const gun = player.guns[player.weapon];
  $('hp-num').textContent = String(Math.max(0, Math.ceil(player.hp)));
  $('hp-bar').style.width = `${Math.max(0, player.hp)}%`;
  $('armor-bar').style.width = `${Math.max(0, (player.armor / 50) * 100)}%`;
  $('ammo-mag').textContent = String(gun.mag);
  $('ammo-res').textContent = `/ ${gun.reserve}`;
  $('weapon-name').textContent = gun.name;
  $('firemode').textContent = player.reloading ? '换弹' : gun.mode;
  const kilos = carriedWeight();
  $('objective-value').textContent = `背包 ${fmt(carriedValue())} 哈夫币 · ${kilos.toFixed(1)}kg`;
  $('objective-value').classList.toggle('heavy', kilos > 26);
  $('stance').textContent = player.sprint ? '冲刺' : player.crouch ? '蹲伏' : player.aim ? '瞄准' : kilos > 26 ? '负重' : '站立';
  $('crosshair').classList.toggle('aim', player.aim);
  showViewGuns();
  const pose = viewGuns[player.weapon];
  const drop = player.sprint ? 0.12 : 0;
  const reloadWave = player.reloading ? Math.sin((player.reloadUntil - time) * 9) * 0.22 : 0;
  const targetBlend = player.aim ? 1 : 0;
  pose.userData.blend = THREE.MathUtils.damp(pose.userData.blend || 0, targetBlend, 14, 0.016);
  const blend = pose.userData.blend;
  const rest = pose.userData.rest;
  const aimPose = pose.userData.aim;
  const moving = Math.hypot(player.vx, player.vz);
  const bob = moving > 0.45 && !player.aim ? Math.sin(time * (player.sprint ? 13 : 8.5)) : 0;
  pose.position.set(
    THREE.MathUtils.lerp(rest.x, aimPose.x, blend) + bob * 0.012,
    THREE.MathUtils.lerp(rest.y, aimPose.y, blend) - drop - Math.abs(bob) * 0.02,
    THREE.MathUtils.lerp(rest.z, aimPose.z, blend) + recoil * 0.55,
  );
  pose.rotation.x = drop * 0.8 + reloadWave + recoil * 1.15;
  pose.rotation.z = bob * -0.03 + (player.aim ? 0 : -0.04);
  pose.rotation.y = player.aim ? 0 : 0.06;
  muzzle.copy(pose.userData.muzzle);
  pose.localToWorld(muzzle);
  flash.position.copy(muzzle);
  const blasting = flash.intensity > 1.2 && pose.visible;
  for (const gun of viewGuns) {
    for (const sprite of gun.userData.flashes || []) sprite.visible = blasting && gun === pose;
  }
  const plateCount = Math.ceil(player.armor / (50 / 3));
  $('plates').querySelectorAll('i').forEach((plate, index) => {
    plate.className = index < plateCount ? 'on' : '';
  });
  const hitdir = $('hitdir');
  hitdir.style.opacity = time < player.hitUntil ? '1' : '0';
  hitdir.style.transform = `translate(-50%, -50%) rotate(${player.hitAngle}rad)`;
  let degrees = Math.round(THREE.MathUtils.radToDeg(-player.yaw) % 360);
  if (degrees < 0) degrees += 360;
  $('compass-deg').textContent = String(degrees).padStart(3, '0');
  $('compass-dir').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
  $('hurt').style.opacity = String(Math.max(player.hp < 32 ? 0.25 : 0, player.hurt * 0.85));
  $('hitmarker').classList.toggle('show', time < hitUntil);
  $('hitmarker').classList.toggle('kill', hitKill);
  $('hint-keys').hidden = time > 8;
  $('radio').hidden = time > radioUntil;
  $('inventory').hidden = !inventoryOpen;
  drawMap();
}

function drawMap() {
  const node = $('minimap');
  const ctx = node.getContext('2d');
  const size = node.width;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(14, 20, 18, 0.88)';
  ctx.fillRect(0, 0, size, size);
  const scale = size / 86;
  const px = (x) => size / 2 + x * scale;
  const py = (z) => size / 2 + z * scale;
  ctx.fillStyle = 'rgba(92, 108, 102, 0.95)';
  for (const shape of map.footprints) {
    ctx.fillRect(px(shape.x - shape.w / 2), py(shape.z - shape.d / 2), shape.w * scale, shape.d * scale);
  }
  for (const zone of map.extracts) {
    ctx.fillStyle = zone.need ? '#e0b15a' : '#3dba6a';
    ctx.beginPath();
    ctx.arc(px(zone.x), py(zone.z), 5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const crate of crates) {
    if (crate.looted) continue;
    ctx.fillStyle = RARITY_HEX[crate.best];
    ctx.fillRect(px(crate.x) - 2, py(crate.z) - 2, 4, 4);
  }
  ctx.translate(px(player.x), py(player.z));
  ctx.rotate(-player.yaw);
  ctx.fillStyle = '#f7f3ea';
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function orbit() {
  camera.position.set(Math.sin(time * 0.13) * 34, 18, Math.cos(time * 0.13) * 34);
  camera.lookAt(0, 0.5, 0);
  camera.fov = 58;
  camera.updateProjectionMatrix();
  showViewGuns();
}

function tick(dt, edge = {}) {
  time += dt;
  flash.intensity = THREE.MathUtils.damp(flash.intensity, 0, 22, dt);
  recoil = THREE.MathUtils.damp(recoil, 0, 8, dt);
  stepShells(dt);
  for (const tracer of tracers) {
    if (tracer.visible && time > tracer.userData.until) tracer.visible = false;
  }
  if (state === 'menu' || state === 'brief' || state === 'result') {
    orbit();
    renderer.render(scene, camera);
    return;
  }
  if (frozen && state === 'raid') {
    syncCamera();
    syncHud();
    renderer.render(scene, camera);
    return;
  }
  if (state === 'paused') {
    showViewGuns();
    renderer.render(scene, camera);
    return;
  }

  if (!player.alive) {
    deathTimer -= dt;
    player.hurt = Math.max(0, player.hurt - dt);
    syncCamera();
    syncHud();
    renderer.render(scene, camera);
    if (deathTimer <= 0) endRaid(false);
    return;
  }

  updatePlayer(dt, edge);
  if (ended) {
    renderer.render(scene, camera);
    return;
  }
  for (const enemy of enemies) updateEnemy(enemy, dt);
  player.shot = false;
  player.hurt = Math.max(0, player.hurt - dt * 1.4);
  feed = feed.filter((item) => item.until > time);
  if (feed.length !== $('feed').children.length) renderFeed();
  syncCamera();
  syncHud();
  renderer.render(scene, camera);
}

function lockPointer() {
  try {
    const pending = canvas.requestPointerLock();
    if (pending?.catch) pending.catch(() => {});
  } catch {
    /* drag-look still works when the browser blocks pointer lock */
  }
}

function fillBrief() {
  const lines = [
    '干员，欢迎进入烽火地带。按住 F 才会搜完一个箱子。',
    '西仓里有调度室门禁卡，保险柜在调度室里面。',
    '负重超过 26 公斤会跑不动。北停机坪、西闸门随时可撤，东侧快艇要 80,000 哈夫币。',
  ];
  $('brief-lines').innerHTML = lines.map((line) => `<li>${line}</li>`).join('');
}

$('btn-deploy').addEventListener('click', () => {
  audio.unlock();
  audio.click();
  fillBrief();
  state = 'brief';
  show('screen-brief');
});

$('btn-insert').addEventListener('click', () => {
  audio.unlock();
  startRaid();
  lockPointer();
});

$('btn-resume').addEventListener('click', () => {
  if (ended) return;
  state = 'raid';
  show('screen-raid');
  lockPointer();
});

$('btn-abort').addEventListener('click', () => endRaid(false));
$('btn-again').addEventListener('click', () => {
  audio.click();
  fillBrief();
  state = 'brief';
  show('screen-brief');
});
$('btn-base').addEventListener('click', () => {
  clearRaid();
  state = 'menu';
  show('screen-menu');
  renderStash();
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Tab' || event.code === 'Space') event.preventDefault();
  if (event.repeat) return;
  down.add(event.code);
  if (event.code === 'Tab' && state === 'raid') {
    inventoryOpen = !inventoryOpen;
    renderInventory();
  }
});
window.addEventListener('keyup', (event) => down.delete(event.code));
window.addEventListener('blur', () => {
  down.clear();
  mouseHeld = false;
  aiming = false;
  dragging = false;
});

canvas.addEventListener('mousedown', (event) => {
  if (state !== 'raid') return;
  if (event.button === 0) {
    mouseHeld = true;
    dragging = document.pointerLockElement !== canvas;
  }
  if (event.button === 2) aiming = true;
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) {
    mouseHeld = false;
    dragging = false;
  }
  if (event.button === 2) aiming = false;
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('mousemove', (event) => {
  if (state !== 'raid') return;
  const locked = document.pointerLockElement === canvas;
  if (!locked && !dragging) return;
  const sens = player.aim ? 0.00135 : 0.00205;
  player.yaw -= event.movementX * sens;
  player.pitch -= event.movementY * sens;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch));
});
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  document.body.classList.toggle('locked', locked);
  if (!locked && state === 'raid') {
    state = 'paused';
    show('screen-pause');
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

show('screen-menu');
renderStash();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const edge = {
    f: down.has('KeyF') && !was.has('KeyF'),
    r: down.has('KeyR') && !was.has('KeyR'),
    one: down.has('Digit1') && !was.has('Digit1'),
    two: down.has('Digit2') && !was.has('Digit2'),
    three: down.has('Digit3') && !was.has('Digit3'),
  };
  was.clear();
  for (const code of down) was.add(code);
  tick(dt, edge);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.__fireline = {
  start: startRaid,
  freeze(value) {
    frozen = Boolean(value);
    if (frozen) {
      player.hp = 100;
      player.armor = 50;
      player.alive = true;
    }
  },
  teleport(x, z) {
    player.x = x;
    player.z = z;
  },
  lookAt(x, y, z) {
    const eye = player.crouch ? 1.12 : 1.62;
    const dx = x - player.x;
    const dy = y - eye;
    const dz = z - player.z;
    const horiz = Math.hypot(dx, dz) || 0.001;
    player.yaw = Math.atan2(-dx, -dz);
    player.pitch = Math.atan2(dy, horiz);
  },
  probe() {
    syncCamera();
    for (const enemy of enemies) enemy.mesh.updateMatrixWorld(true);
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const dir = raycaster.ray.direction;
    const hits = raycaster.intersectObjects(shootTargets(), false).slice(0, 3).map((hit) => ({
      d: Number(hit.distance.toFixed(2)),
      eid: hit.object.userData.eid ?? null,
      part: hit.object.userData.part || 'world',
    }));
    return {
      yaw: Number(player.yaw.toFixed(3)),
      pitch: Number(player.pitch.toFixed(3)),
      dir: { x: Number(dir.x.toFixed(3)), y: Number(dir.y.toFixed(3)), z: Number(dir.z.toFixed(3)) },
      hits,
    };
  },
  hurt(amount) {
    damagePlayer(amount);
    if (player.hp > 0) player.alive = true;
  },
  shoot() {
    const previous = player.fireUntil;
    player.fireUntil = 0;
    player.reloading = false;
    shoot();
    player.fireUntil = Math.max(player.fireUntil, previous);
  },
  hold(code, pressed) {
    if (pressed) down.add(code);
    else down.delete(code);
  },
  step(dt) {
    tick(dt, { f: false, r: false, one: false, two: false });
  },
  lootNearest() {
    const interact = nearestInteract();
    if (interact.crate) lootCrate(interact.crate);
    if (interact.body) lootBody(interact.body);
    return { value: carriedValue(), items: backpack.map((item) => item.name) };
  },
  status() {
    return {
      state,
      x: player.x,
      z: player.z,
      hp: player.hp,
      alive: player.alive,
      value: carriedValue(),
      save: { ...save },
      enemies: enemies.map((enemy) => ({ id: enemy.id, hp: Math.round(enemy.hp), alive: enemy.alive, x: enemy.x, z: enemy.z })),
      guns: gunsReady(),
      paths: {
        north: map.nav.findPath(map.spawn.x, map.spawn.z, map.extracts[0].x, map.extracts[0].z).length,
        west: map.nav.findPath(map.spawn.x, map.spawn.z, map.extracts[1].x, map.extracts[1].z).length,
        office: map.nav.findPath(map.spawn.x, map.spawn.z, 0, -19).length,
        westInside: map.nav.findPath(map.spawn.x, map.spawn.z, -20, 8).length,
      },
    };
  },
};
