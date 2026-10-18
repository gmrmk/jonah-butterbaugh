// One-shot 3D rubber stamp: a turned wooden handle, a brass ferrule and a rubber pad press
// "Reply requested" onto the transmission, then lift away. Built from the 3d-wood-material,
// 3d-metal-material and 3d-retina-resolution recipes; the canvas is removed when the press ends.
import * as THREE from './vendor/three.module.min.js';

const NOISE = /* glsl */`
float h31(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int k = 0; k < 4; k++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
`;

function patchVertex(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
}

// Wood: rings with per-ring latewood, pores and fibres, each faded by its own screen footprint.
// ponytail: colour and roughness only, no bump relief; the stamp is ~200 px on screen, add the skill's bumpNormal if it is ever shown at macro.
function woodMaterial({ axis, seed, ring, off, envMap }) {
  const pale = new THREE.Color('#8a5f38');
  const dark = new THREE.Color('#3d2412');
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.62, ior: 1.43, specularIntensity: 0.72, clearcoat: 0.22, clearcoatRoughness: 0.38, envMap, envMapIntensity: 0.8 });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uPale: { value: pale }, uDark: { value: dark }, uSeed: { value: new THREE.Vector3(seed, seed * 1.7, seed * 0.3) },
      uRing: { value: ring }, uOff: { value: off }, uAxis: { value: axis },
    });
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vOP; uniform vec3 uPale; uniform vec3 uDark; uniform vec3 uSeed; uniform float uRing; uniform float uOff; uniform int uAxis;
${NOISE}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 wp = vOP * 2.2 + uSeed;
float along = uAxis == 0 ? wp.x : (uAxis == 1 ? wp.y : wp.z);
vec2 cr = uAxis == 0 ? wp.yz : (uAxis == 1 ? wp.xz : wp.xy);
float wob = (fbm(vec3(cr * 0.6, along * 0.25)) - 0.5) * 1.25;
float growth = length((cr + vec2(-0.3, uOff)) * vec2(1.0, 0.56)) * uRing + wob;
float phase = fract(growth);
float annual = vn(vec3(floor(growth) * 1.7, 0.0, uSeed.x));
float lw = 0.065 + annual * 0.21;
float late = smoothstep(0.94 - lw, 0.97 - lw, phase) * (1.0 - smoothstep(0.965, 1.0, phase));
late = mix(late, 0.15, smoothstep(0.16, 0.72, fwidth(growth)));
vec2 pq = vec2((cr.x + cr.y) * 68.0, along * 7.5);
float pores = smoothstep(0.59, 0.75, vn(vec3(pq, 1.3)));
pores *= 1.0 - smoothstep(0.15, 0.8, length(fwidth(pq)) * 0.5);
vec2 fq = vec2((cr.x + cr.y) * 160.0, along * 2.4);
float fib = vn(vec3(fq, 4.1)) * (1.0 - smoothstep(0.15, 0.8, length(fwidth(fq)) * 0.5));
float broad = fbm(wp * 0.8);
float tone = 0.075 + late * 0.40 + pores * 0.25 - fib * 0.16 + (broad - 0.5) * 0.23;
vec3 woodCol = mix(uPale, uDark, clamp(tone, 0.035, 0.83)) * (0.93 + annual * 0.095);
float woodRough = 0.91 + late * 0.13 + pores * 0.19 + (broad - 0.5) * 0.20;
diffuseColor.rgb *= woodCol;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * woodRough, 0.35, 1.0);`);
  };
  mat.customProgramCacheKey = () => 'wood-' + axis + '-' + seed;
  return mat;
}

// Brass: a conductor (F0 in colour, metalness 1) whose roughness varies with smears and fine grain.
function brassMaterial(envMap) {
  const mat = new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.15, envMap, envMapIntensity: 1.7 });
  mat.color.setRGB(0.89, 0.72, 0.36, THREE.LinearSRGBColorSpace);
  mat.onBeforeCompile = (shader) => {
    patchVertex(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vOP;
${NOISE}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float smear = smoothstep(0.45, 0.8, fbm(vOP * 3.0 + 7.0));
vec3 gq = vOP * 260.0;
float grain = (vn(gq) - 0.5) * (1.0 - smoothstep(0.15, 0.8, length(fwidth(gq))));
roughnessFactor = clamp(roughnessFactor + smear * 0.11 + grain * 0.05, 0.06, 0.6);`);
  };
  mat.customProgramCacheKey = () => 'brass';
  return mat;
}

// A box with rounded arrises (normals from the rounded corner), so every edge catches a highlight.
function roundedBox(w, h, d, r) {
  const seg = (s) => Math.max(4, Math.ceil(s / (r * 0.5)));
  const g = new THREE.BoxGeometry(w, h, d, seg(w), seg(h), seg(d));
  const pos = g.attributes.position, nor = g.attributes.normal;
  const inner = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
  const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(THREE.MathUtils.clamp(v.x, -inner.x, inner.x), THREE.MathUtils.clamp(v.y, -inner.y, inner.y), THREE.MathUtils.clamp(v.z, -inner.z, inner.z));
    n.subVectors(v, c);
    if (n.lengthSq() < 1e-12) n.fromBufferAttribute(nor, i);
    n.normalize();
    v.copy(c).addScaledVector(n, r);
    pos.setXYZ(i, v.x, v.y, v.z);
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// A dark room with a few bright HDR cards, prefiltered once: metal needs something bright to reflect.
function studio(renderer) {
  const room = new THREE.Scene();
  room.background = new THREE.Color().setRGB(0.045, 0.05, 0.06, THREE.LinearSRGBColorSpace);
  const card = (w, h, rgb, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }));
    m.material.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) card(1.08, 1.2, [3.8, 3.55, 3.05], [-5 + (i - 1.5) * 1.3, 4.2 + (j - 1) * 1.47, 4.8]);
  card(3.0, 5.4, [0.52, 0.68, 0.9], [6, 1.6, 2]);
  card(2.0, 4.6, [1.5, 1.22, 0.88], [2.5, 2.2, -5.5]);
  card(7.5, 2.2, [0.52, 0.55, 0.6], [0, 6, 0]);
  card(9, 9, [0.18, 0.12, 0.07], [0, -4, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.006);
  pmrem.dispose();
  room.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return env;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(27,26,23,0.75)');
  g.addColorStop(1, 'rgba(27,26,23,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const easeIn2 = (t) => t * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

export function play(stage, onContact) {
  return new Promise((resolve) => {
    // Centre the canvas on the impression so the stamp lands on it.
    const zone = stage.parentElement;
    const imp = zone.querySelector('.impression').getBoundingClientRect();
    const zr = zone.getBoundingClientRect();
    const W = 380, H = 460;
    Object.assign(stage.style, { inset: 'auto', left: (imp.left + imp.width / 2 - zr.left - W / 2) + 'px', top: (imp.top + imp.height / 2 - zr.top - H / 2) + 'px', width: W + 'px', height: H + 'px' });

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    // 3d-retina-resolution, Auto mode: follow the display, capped at 2x; CSS owns the displayed size.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // ponytail: built-in ACES instead of the skill's HalfFloat target and hand pass; fine for a one-second shot.
    stage.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const envRT = studio(renderer);
    const env = envRT.texture;
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 60);
    const D = 9.9, tilt = THREE.MathUtils.degToRad(56);
    camera.position.set(0, D * Math.sin(tilt), D * Math.cos(tilt));
    camera.lookAt(0, 0, 0);

    const key = new THREE.DirectionalLight(0xfff1dc, 3.2);
    key.position.set(-4, 7, 5);
    scene.add(key, new THREE.HemisphereLight(0xfffaf0, 0x6a5238, 1.1));

    const stamp = new THREE.Group();
    const rubber = new THREE.Mesh(roundedBox(2.6, 0.12, 0.92, 0.035), new THREE.MeshStandardMaterial({ color: 0x4a0f0c, roughness: 0.88 }));
    rubber.position.y = 0.06;
    const block = new THREE.Mesh(roundedBox(2.72, 0.55, 1.04, 0.07), woodMaterial({ axis: 0, seed: 3.1, ring: 9, off: 0.75, envMap: env }));
    block.position.y = 0.12 + 0.275;
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.36, 0.26, 64), brassMaterial(env));
    ferrule.position.y = 0.67 + 0.13;
    const profile = [[0.30, 0], [0.24, 0.08], [0.2, 0.35], [0.21, 0.55], [0.3, 0.72], [0.44, 0.9], [0.48, 1.05], [0.44, 1.2], [0.3, 1.32], [0.12, 1.38], [0.001, 1.39]].map(([r, y]) => new THREE.Vector2(r, y));
    const handle = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), woodMaterial({ axis: 1, seed: 8.4, ring: 14, off: 1.6, envMap: env }));
    handle.position.y = 0.93;
    stamp.add(rubber, block, ferrule, handle);
    stamp.rotation.y = THREE.MathUtils.degToRad(9);
    scene.add(stamp);

    const shadowTex = shadowTexture();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    scene.add(shadow);

    // Timeline in seconds: fall, contact and squash, a short hold, lift away up and to the right.
    const T_FALL = 0.3, T_SQUASH = 0.38, T_HOLD = 0.52, T_END = 1.1, TOP = 3.8;
    let contacted = false, t0 = null;

    function teardown() {
      scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      shadowTex.dispose();
      envRT.dispose();
      renderer.forceContextLoss();
      renderer.dispose();
      renderer.domElement.remove();
    }

    function frame(now) {
      try { step(now); } catch (e) { if (!contacted) onContact(); teardown(); resolve(); }
    }

    function step(now) {
      if (t0 === null) t0 = now;
      const t = (now - t0) / 1000;
      let y, x = 0, rz = 0, sy = 1;
      if (t < T_FALL) { const k = easeIn2(clamp01(t / T_FALL)); y = TOP * (1 - k); rz = 0.1 * (1 - k); }
      else if (t < T_HOLD) {
        if (!contacted) { contacted = true; onContact(); }
        const k = clamp01((t - T_FALL) / (T_SQUASH - T_FALL));
        sy = 1 - 0.035 * Math.sin(Math.PI * Math.min(k, 1)); y = -0.02 * sy;
      } else { const k = easeInOut(clamp01((t - T_HOLD) / (T_END - T_HOLD))); y = TOP * k; x = 2.2 * k; rz = -0.28 * k; }
      stamp.position.set(x, y, 0);
      stamp.rotation.z = rz;
      stamp.scale.set(1 + (1 - sy) * 0.3, sy, 1 + (1 - sy) * 0.3);
      const near = 1 - clamp01(y / TOP);
      shadow.material.opacity = 0.08 + 0.6 * near * near;
      shadow.scale.setScalar(1.6 - 0.6 * near);
      shadow.position.x = x * 0.6;
      renderer.render(scene, camera);
      if (t < T_END) { requestAnimationFrame(frame); return; }
      if (!contacted) onContact();
      teardown();
      resolve();
    }

    // Compile the shaders and draw the start pose first, so the compile hitch is not charged to the clock.
    stamp.position.y = TOP;
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    requestAnimationFrame(() => requestAnimationFrame(frame));
  });
}
