import * as THREE from '../vendor/three.module.js';

const wearMap = makeWearMap();

function makeWearMap() {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgb(118,6,132)';
  g.fillRect(0, 0, size, size);
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    const bright = Math.random() > 0.35;
    g.strokeStyle = bright ? 'rgb(250,2,28)' : 'rgb(40,160,16)';
    g.lineWidth = bright ? 2 + Math.random() * 2.2 : 3;
    g.beginPath();
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 40 + Math.random() * 160;
    const ang = -0.4 + Math.random() * 0.55;
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = 'rgba(24,170,14,0.9)';
    g.beginPath();
    g.ellipse(Math.random() * size, Math.random() * size, 18 + Math.random() * 40, 8 + Math.random() * 16, Math.random(), 0, Math.PI * 2);
    g.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

const FRAGMENT = `
vec3 wearN = abs(normalize(vWearNormal));
wearN = pow(wearN, vec3(4.0));
wearN /= wearN.x + wearN.y + wearN.z;
vec3 wearP = vWearPos * wearScale;
vec3 wear = texture2D(wearMap, wearP.yz).rgb * wearN.x
  + texture2D(wearMap, wearP.xz).rgb * wearN.y
  + texture2D(wearMap, wearP.xy).rgb * wearN.z;
float crease = smoothstep(0.035, 0.28, length(fwidth(normalize(vWearNormal))));
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.74, 0.68), wear.g * 0.35);
diffuseColor.rgb *= mix(1.0, 0.86, crease);
roughnessFactor = clamp(roughnessFactor * mix(1.0, 0.78, crease), 0.18, 1.0);
`;

const BUMP = `
vec3 wearPos = -vViewPosition;
vec3 sigmaX = dFdx(wearPos);
vec3 sigmaY = dFdy(wearPos);
vec3 r1 = cross(sigmaY, normal);
vec3 r2 = cross(normal, sigmaX);
float det = dot(sigmaX, r1);
vec3 surfGrad = sign(det) * (dFdx(wear.r) * r1 + dFdy(wear.r) * r2);
normal = normalize(abs(det) * normal - surfGrad * wearBump);
`;

export function applyWear(material, scale = 8, bump = 0.35) {
  if (!material || !material.isMeshStandardMaterial || material.userData.wear) return;
  if (material.transparent || material.opacity < 0.98) return;
  material.userData.wear = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.wearMap = { value: wearMap };
    shader.uniforms.wearScale = { value: scale };
    shader.uniforms.wearBump = { value: bump };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWearPos;\nvarying vec3 vWearNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWearPos = position;\nvWearNormal = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D wearMap;\nuniform float wearScale;\nuniform float wearBump;\nvarying vec3 vWearPos;\nvarying vec3 vWearNormal;')
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${FRAGMENT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${BUMP}`);
  };
}
