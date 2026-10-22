/* Portfolio 3D — một thế giới tối: cây Yggdrasil bằng hạt sáng ở giữa, các dự án là những tấm kính
   xếp xoắn ốc quanh thân cây. Trang đầu: biểu tượng vòng + ngôi sao giữa tán cây.
   Cuộn / kéo / phím ← → để đi dọc thân cây từ tán xuống rễ; bấm tấm kính đang giữa để mở dự án. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const D = window.PORTFOLIO, P = D.projects, N = P.length;
const $ = (s, r = document) => r.querySelector(s);
const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;

/* ---------------- bố cục thế giới ---------------- */
const R = mobile ? 3.2 : 4.4;          // bán kính vòng xoắn của các tấm kính
const A_STEP = 0.95;                   // góc giữa hai dự án liên tiếp
const Y_STEP = 3.4;                    // khoảng cách dọc
const CARD_W = mobile ? 2.7 : 4.6, CARD_H = CARD_W / 1.6;
const HOME_Y = -8.5;                   // trang đầu: nhìn vào tán cây
const Y_TOP = 9, Y_BOT = -(N - 1) * Y_STEP - 7;

/* ---------------- dựng hình ---------------- */
const canvas = $('#gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
} catch (e) {
  body.classList.remove('is-loading');
  $('#home').insertAdjacentHTML('beforeend', '<p class="home-k">Máy không chạy được WebGL — <a href="../">đọc sách trực tuyến</a></p>');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

/* màu hiện tại (nền + nhấn), đổi mượt theo dự án */
const HOME_BG = new THREE.Color('#06141a'), HOME_AC = new THREE.Color('#9fe3d6');
const colBg = HOME_BG.clone(), colAc = HOME_AC.clone();
const wantBg = new THREE.Color(), wantAc = new THREE.Color();
const projBg = P.map(p => new THREE.Color(p.bg)), projAc = P.map(p => new THREE.Color(p.accent));

/* ---------- nền: dải sáng mờ + vân, vẽ trước mọi thứ ---------- */
const bgMat = new THREE.ShaderMaterial({
  depthTest: false, depthWrite: false,
  uniforms: { uBg: { value: colBg }, uAc: { value: colAc }, uT: { value: 0 }, uM: { value: new THREE.Vector2() }, uAsp: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 1., 1.); }',
  fragmentShader: `precision highp float; varying vec2 vUv; uniform vec3 uBg, uAc; uniform float uT, uAsp; uniform vec2 uM;
    float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
    void main(){
      vec2 p = vUv - .5; p.x *= uAsp;
      vec3 c = uBg * .35;
      c += uBg * 1.4 * smoothstep(.95, .0, length(p - vec2(-.55, -.45) - uM * .03));
      c += uAc * .16 * smoothstep(.8, .0, length(p - vec2(.6, .5) + uM * .02));
      c += uAc * .07 * smoothstep(.6, .0, length(p - vec2(.1 * sin(uT * .05), -.7)));
      c *= 1. - .55 * smoothstep(.45, 1.2, length(p));
      c += (h(vUv * 900. + uT) - .5) * .012;
      gl_FragColor = vec4(c, 1.);
    }`,
});
const bgQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat);
bgQuad.frustumCulled = false;
bgQuad.renderOrder = -10;
scene.add(bgQuad);

/* ---------- cây Yggdrasil bằng hạt sáng ---------- */
const world = new THREE.Group();
scene.add(world);
const COUNT = mobile ? 16000 : 70000;
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
function buildTree() {
  const pos = new Float32Array(COUNT * 3), rnd = new Float32Array(COUNT * 4);
  const clumps = Array.from({ length: 11 }, (_, i) => {
    const a = i / 11 * Math.PI * 2 + Math.random() * .4, r = 2 + Math.random() * 4.2;
    return [Math.cos(a) * r, Y_TOP - 1.5 + Math.random() * 3.5, Math.sin(a) * r, 1 + Math.random() * 1.6];
  });
  for (let i = 0; i < COUNT; i++) {
    const u = Math.random();
    let x, y, z, kind;
    if (u < .42) {          // thân: hình trụ xoắn, phình ở gốc
      y = Y_BOT + 2 + Math.random() * (Y_TOP - Y_BOT - 2);
      const flare = 1 + Math.max(0, (Y_BOT + 8 - y) / 6) * 1.6 + Math.max(0, (y - (Y_TOP - 3)) / 3) * .8;
      const r = (.55 + .18 * Math.sin(y * 1.7) + .1 * Math.sin(y * .6 + 1)) * flare;
      const a = Math.random() * Math.PI * 2 + y * .45;
      const rr = r * (.75 + .25 * Math.sqrt(Math.random()));
      x = Math.cos(a) * rr + gauss() * .05; z = Math.sin(a) * rr + gauss() * .05; kind = 0;
    } else if (u < .64) {   // tán: các chùm sáng
      const c = clumps[(Math.random() * clumps.length) | 0];
      x = c[0] + gauss() * c[3]; y = c[1] + gauss() * c[3] * .6; z = c[2] + gauss() * c[3]; kind = 1;
    } else if (u < .76) {   // cành nối thân lên các chùm
      const c = clumps[(Math.random() * clumps.length) | 0], t = Math.random();
      x = c[0] * t + gauss() * .08; y = (Y_TOP - 4) + (c[1] - (Y_TOP - 4)) * Math.pow(t, .7) + gauss() * .08; z = c[2] * t + gauss() * .08; kind = 1;
    } else if (u < .86) {   // rễ toả ra ở đáy
      const a = ((Math.random() * 9) | 0) / 9 * Math.PI * 2 + gauss() * .08, t = Math.pow(Math.random(), .8);
      x = Math.cos(a) * t * 8; z = Math.sin(a) * t * 8; y = Y_BOT + 1 - t * 2.4 + Math.sin(t * 9 + a) * .3 + gauss() * .06; kind = 2;
    } else {                // bụi sáng lơ lửng khắp nơi
      x = (Math.random() - .5) * 34; y = Y_BOT - 4 + Math.random() * (Y_TOP - Y_BOT + 10); z = (Math.random() - .5) * 26 - 3; kind = 3;
    }
    pos.set([x, y, z], i * 3);
    rnd.set([Math.random(), Math.random(), Math.random(), kind], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(rnd, 4));
  return g;
}
const treeMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uT: { value: 0 }, uPx: { value: 1 }, uAc: { value: colAc }, uBg: { value: colBg }, uFade: { value: 1 } },
  vertexShader: `attribute vec4 aR; uniform float uT, uPx; varying vec4 vR; varying float vTw;
    void main(){
      vec3 p = position; float k = aR.w;
      float s = aR.x * 6.2831;
      p += vec3(sin(uT * .23 + s), sin(uT * .31 + s * 1.3), cos(uT * .19 + s)) * (k > 2.5 ? .35 : (k > .5 ? .07 : .025));
      vec4 mv = modelViewMatrix * vec4(p, 1.);
      float size = k > 2.5 ? mix(1.5, 5., aR.y * aR.y) : (k > .5 && k < 1.5 ? mix(1.6, 9., pow(aR.y, 4.)) : mix(1.2, 3.4, aR.y));
      gl_PointSize = max(size * uPx / -mv.z, 1.2);   // không nhỏ hơn ~1 điểm ảnh
      gl_Position = projectionMatrix * mv;
      vR = aR; vTw = .55 + .45 * sin(uT * (1. + aR.z * 2.5) + s);
    }`,
  fragmentShader: `precision highp float; uniform vec3 uAc, uBg; uniform float uFade; varying vec4 vR; varying float vTw;
    void main(){
      float d = length(gl_PointCoord - .5);
      if (d > .5) discard;
      float a = smoothstep(.5, .05, d), core = smoothstep(.18, .0, d);
      vec3 warm = vec3(1., .86, .55), c = mix(uAc, mix(uBg * 3. + .1, vec3(.65, 1., .9), .4), vR.y);
      c = mix(c, warm, step(.93, vR.z) * .8);                 // vài đốm lửa ấm như tàn lò rèn
      c = mix(c, vec3(1.), step(.985, vR.x));                  // vài đốm trắng
      float k = vR.w, al = k > 2.5 ? .9 : (k > 1.5 ? .85 : (k > .5 ? .8 : .6));   // thân dày hạt -> mỗi hạt mờ hơn
      gl_FragColor = vec4(c * (a * .7 + core * 1.3), 1.) * al * vTw * uFade;
    }`,
});
const tree = new THREE.Points(buildTree(), treeMat);
tree.frustumCulled = false;
world.add(tree);

/* ---------- biểu tượng trang đầu: vòng + ngôi sao bốn cánh ---------- */
const emblem = new THREE.Group();
{
  const metal = new THREE.MeshPhysicalMaterial({
    color: 0xb9fff0, metalness: .85, roughness: .16, envMap: envTex, envMapIntensity: 1.6,
    iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 620], clearcoat: 1, clearcoatRoughness: .1,
    transparent: true,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, .075, 40, 220), metal);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.42, .018, 16, 220), metal);
  const s = new THREE.Shape(), pts = 8;
  for (let i = 0; i <= pts; i++) {
    const a = i / pts * Math.PI * 2 + Math.PI / 2, r = i % 2 ? .2 : .82;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const starG = new THREE.ExtrudeGeometry(s, { depth: .16, bevelEnabled: true, bevelThickness: .08, bevelSize: .05, bevelSegments: 6, curveSegments: 4 });
  starG.center();
  const star = new THREE.Mesh(starG, metal);
  emblem.add(ring, ring2, star);
  emblem.userData = { ring, ring2, star, mat: metal };
  const kl = new THREE.PointLight(0x9fe3d6, 30, 12); kl.position.set(-2.5, 2, 3);
  const kr = new THREE.PointLight(0xb08cff, 26, 12); kr.position.set(2.5, -1.5, 2.5);
  emblem.add(kl, kr);
  scene.add(emblem);
}

/* ---------- các tấm kính dự án ---------- */
const cardVS = `uniform float uT, uHover, uVel; uniform vec2 uHit; varying vec2 vUv; varying float vBend;
  void main(){
    vUv = uv; vec3 p = position;
    float bow = (uv.x - .5) * (uv.x - .5);
    p.z += -bow * .5 + bow * uVel * 14.;                         // tấm kính cong nhẹ, cong thêm khi đang lướt
    float d = distance(uv, uHit);
    p.z += sin(d * 22. - uT * 5.) * .035 * uHover * smoothstep(.6, .0, d);   // gợn khi rê chuột
    p.y += sin(uT * .8 + position.x * .6) * .03;
    vBend = bow;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
  }`;
const cardFS = `precision highp float; uniform sampler2D uTex; uniform float uT, uAct, uHover, uVel, uAlpha; uniform vec3 uAc; uniform vec2 uHit;
  varying vec2 vUv; varying float vBend;
  float box(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r; }
  void main(){
    vec2 p = vUv - .5; p.x *= 1.6;
    float sd = box(p, vec2(.8, .5), .055);
    float shape = smoothstep(.003, -.003, sd);
    if (shape < .01) discard;
    // khúc xạ: lệch ảnh theo khoảng cách tới mép + tách màu khi lướt nhanh
    vec2 dir = normalize(p + 1e-4);
    float edge = smoothstep(-.09, 0., sd);
    vec2 uv = vUv - dir * edge * .012;
    float ca = .0005 + abs(uVel) * .1 + uHover * .0015;
    vec3 c = vec3(texture2D(uTex, uv + dir * ca).r, texture2D(uTex, uv).g, texture2D(uTex, uv - dir * ca).b);
    // chưa chọn: tối và nhạt đi như kính mờ
    float g = dot(c, vec3(.299, .587, .114));
    c = mix(mix(vec3(g), uAc * g * 1.4, .35) * .42, c, .25 + .75 * uAct);
    // vệt sáng chéo trôi trên mặt kính
    float band = smoothstep(.09, .0, abs(vUv.x + vUv.y * .6 - fract(uT * .06) * 2.2 + .3));
    c += band * .07 * (.4 + uAct);
    // viền kính sáng theo màu dự án
    float rim = smoothstep(.022, .0, abs(sd + .006));
    c += uAc * rim * (.55 + .6 * uAct) + vec3(.8, 1., .95) * smoothstep(.006, .0, abs(sd + .002)) * .35;
    c += uAc * .25 * uHover * smoothstep(.4, .0, distance(vUv, uHit));
    c *= 1. - vBend * .5;
    gl_FragColor = vec4(c, shape * uAlpha * (.86 + .14 * uAct));
  }`;
const cards = P.map((p, i) => {
  const tex = new THREE.Texture();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTex: { value: tex }, uT: { value: 0 }, uAct: { value: 0 }, uHover: { value: 0 }, uVel: { value: 0 },
                uAlpha: { value: 0 }, uAc: { value: projAc[i] }, uHit: { value: new THREE.Vector2(.5, .5) } },
    vertexShader: cardVS, fragmentShader: cardFS,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W, CARD_H, 40, 26), mat);
  const a = i * A_STEP;
  m.position.set(Math.sin(a) * R, -i * Y_STEP, Math.cos(a) * R);
  m.rotation.y = a;
  m.userData.i = i;
  world.add(m);
  return m;
});

/* ảnh bìa tấm kính: ghép ảnh + tên dự án bằng canvas 2D */
const loadImg = src => new Promise((ok, no) => { const im = new Image(); im.decoding = 'async'; im.onload = () => ok(im); im.onerror = no; im.src = src; });
function wrap(ctx, text, maxW) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
async function cardTexture(p) {
  const W = 1280, H = 800, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
  if (p.cover) {
    const im = await loadImg(`img/${p.cover.f}-card.webp`);
    const s = Math.max(W / im.width, H / im.height);
    ctx.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s);
  } else if (p.cutouts) {   // bộ nhân vật: ba nhân vật đứng cạnh nhau trên nền tối có quầng sáng
    const g = ctx.createRadialGradient(W / 2, H * .62, 20, W / 2, H * .62, W * .55);
    g.addColorStop(0, p.accent + '55'); g.addColorStop(1, p.bg);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const pick = [...p.gallery].sort((a, b) => b.h / b.w - a.h / a.w).slice(0, 3);
    const ims = await Promise.all(pick.map(c => loadImg(`img/${c.f}-card.webp`)));
    ims.forEach((im, k) => {
      const h = H * (k === 1 ? .92 : .78), w = im.width * h / im.height;
      const cx = W * [.24, .5, .76][k];
      ctx.globalAlpha = k === 1 ? 1 : .85;
      ctx.drawImage(im, cx - w / 2, H - h, w, h);
    });
    ctx.globalAlpha = 1;
  }
  // làm tối để chữ nổi
  const v = ctx.createLinearGradient(0, 0, 0, H);
  v.addColorStop(0, 'rgba(0,0,0,.15)'); v.addColorStop(.5, 'rgba(0,0,0,.42)'); v.addColorStop(1, 'rgba(0,0,0,.25)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 30;
  ctx.font = '500 30px "Chakra Petch"';
  ctx.letterSpacing = '9px';
  ctx.globalAlpha = .85;
  ctx.fillText(p.label.toUpperCase(), W / 2, H * .3);
  ctx.globalAlpha = 1;
  ctx.font = '600 104px "Chakra Petch"';
  ctx.letterSpacing = '4px';
  const lines = wrap(ctx, p.title.toUpperCase(), W * .8);
  const lh = 108, y0 = H * .52 - (lines.length - 1) * lh / 2;
  lines.forEach((l, k) => ctx.fillText(l, W / 2, y0 + k * lh));
  ctx.font = '400 26px "Chakra Petch"';
  ctx.letterSpacing = '7px';
  ctx.globalAlpha = .7;
  ctx.fillText(p.en.toUpperCase(), W / 2, y0 + (lines.length - 1) * lh + 92);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

/* ---------------- trạng thái + điều khiển ---------------- */
let mode = 'home';              // home | work | contact
let modeT = 0, modeTo = 0;      // 0 = trang đầu, 1 = vòng dự án
let pos = 0, target = 0, vel = 0, lastWheel = 0, opened = null;
const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
const clamp = v => Math.max(0, Math.min(N - 1, v));
const cur = () => Math.round(clamp(pos));

function go(i) { target = clamp(i); }

addEventListener('wheel', e => {
  if (mode !== 'work' || opened) return;
  e.preventDefault();
  target = clamp(target + e.deltaY * .0016);
  lastWheel = performance.now();
}, { passive: false });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#lb').hidden) return closeLb(); if (opened || mode === 'contact') return route('#/du-an'); }
  if (mode === 'home' && ['ArrowDown', 'Enter', ' '].includes(e.key)) return route('#/du-an');
  if (mode !== 'work' || opened) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) go(Math.round(target) + 1);
  if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) go(Math.round(target) - 1);
  if (e.key === 'Enter') openProject(cur());
});
// kéo (chuột / cảm ứng): lên-xuống hoặc trái-phải đều đi dọc vòng xoắn
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, t: target, moved: 0 }; });
addEventListener('pointermove', e => {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (!drag || mode !== 'work' || opened) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
  target = clamp(drag.t - (Math.abs(dx) > Math.abs(dy) ? dx : dy) * (mobile ? .008 : .004));
});
addEventListener('pointerup', e => {
  const d = drag; drag = null;
  if (!d) return;
  if (d.moved > 8) { target = clamp(Math.round(target + (target - d.t) * .15)); return; }
  if (mode === 'home') return;
  if (mode !== 'work' || opened) return;
  const hit = pick(e.clientX, e.clientY);   // bấm: tấm kính giữa -> mở; tấm khác -> đưa về giữa
  if (hit != null) hit === cur() ? openProject(hit) : go(hit);
});
const ray = new THREE.Raycaster();
function pick(x, y) {
  ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  const h = ray.intersectObjects(cards, false)[0];
  return h ? h.object.userData.i : null;
}

/* ---------------- giao diện chữ ---------------- */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-/<>✦';
function scramble(el, text) {
  if (reduce) { el.textContent = text; return; }
  const from = el.textContent, len = Math.max(from.length, text.length), start = performance.now();
  cancelAnimationFrame(el._raf);
  const step = () => {
    const k = Math.min(1, (performance.now() - start) / 650);
    let s = '';
    for (let i = 0; i < len; i++) {
      const rev = i / len < k * 1.15;
      s += rev ? (text[i] || '') : (text[i] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0]);
    }
    el.textContent = s;
    if (k < 1) el._raf = requestAnimationFrame(step);
  };
  step();
}
const list = $('#index-list');
P.forEach((p, i) => {
  const li = document.createElement('li');
  li.innerHTML = `<button data-i="${i}">${p.n != null ? (p.n ? 'Ch.' + p.n : 'Prologue') + ' · ' : ''}${p.title}</button>`;
  list.append(li);
});
list.addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(+b.dataset.i); });
$('#prev').addEventListener('click', () => go(Math.round(target) - 1));
$('#next').addEventListener('click', () => go(Math.round(target) + 1));
$('.home-go').addEventListener('click', () => route('#/du-an'));
let shown = -1;
function updateUI() {
  const i = cur();
  if (i === shown) return;
  shown = i;
  const p = P[i];
  scramble($('#pager-t'), `${String(i + 1).padStart(2, '0')} · ${p.title}`.toUpperCase());
  scramble($('#cap-k'), `${p.kind} · ${p.label}`.toUpperCase());
  scramble($('#cap-t'), p.en.toUpperCase());
  list.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
  document.documentElement.style.setProperty('--accent', p.accent);
}

/* chi tiết dự án */
function openProject(i) {
  const p = P[i];
  history.pushState(null, '', '#/du-an/' + p.slug);
  showDetail(p);
}
function showDetail(p) {
  opened = p;
  $('#d-k').textContent = `${p.kind} · ${p.label}`;
  $('#d-t').textContent = p.title;
  $('#d-en').textContent = p.en;
  $('#d-meta').innerHTML = `<dt>Loại</dt><dd>${p.kind}</dd><dt>Minh hoạ</dt><dd>${p.gallery.length} hình</dd>`
    + `<dt>Công cụ</dt><dd>Blender · ZBrush · Photoshop</dd><dt>Thuộc</dt><dd>${D.title}</dd>`;
  const i = P.indexOf(p), nx = P[(i + 1) % N];
  $('#d-act').innerHTML = (p.read ? `<a class="btn" href="${p.read}">Đọc chương →</a>` : '')
    + `<a class="btn" href="#/du-an/${nx.slug}">Tiếp: ${nx.title}</a>`;
  const g = $('#d-g');
  g.className = 'detail-g' + (p.cutouts ? ' cut' : '');
  g.innerHTML = p.gallery.map((im, k) => `<button data-full="img/${im.f}-full.webp" style="animation-delay:${Math.min(k, 12) * 60}ms">`
    + `<img src="img/${im.f}-thumb.webp" width="${im.w}" height="${im.h}" alt="" loading="lazy" decoding="async"></button>`).join('');
  $('#detail').hidden = false;
  $('#detail').scrollTop = 0;
  go(i);
}
$('#d-g').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const lb = $('#lb');
  lb.querySelector('img').src = b.dataset.full;
  lb.hidden = false;
});
const closeLb = () => { $('#lb').hidden = true; };
$('#lb').addEventListener('click', closeLb);
$('#d-x').addEventListener('click', () => route('#/du-an'));
$('#c-x').addEventListener('click', () => route('#/du-an'));

/* điều hướng theo địa chỉ: #/ · #/du-an · #/du-an/<dự án> · #/lien-he */
function route(h) {
  if (h != null && location.hash !== h) { history.pushState(null, '', h); }
  const hash = location.hash || '#/';
  const m = hash.match(/^#\/du-an(?:\/([\w-]+))?/);
  $('#detail').hidden = true;
  $('#contact').hidden = true;
  opened = null;
  if (hash.startsWith('#/lien-he')) { mode = 'contact'; modeTo = 1; $('#contact').hidden = false; }
  else if (m) {
    mode = 'work'; modeTo = 1;
    const p = m[1] && P.find(x => x.slug === m[1]);
    if (p) { showDetail(p); if (modeT < .5) pos = target; }
  } else { mode = 'home'; modeTo = 0; }
  body.classList.toggle('mode-home', mode === 'home');
  body.classList.toggle('mode-work', mode === 'work');
  body.classList.toggle('mode-contact', mode === 'contact');
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === mode));
  $('#pager').hidden = $('#index').hidden = $('#cap').hidden = mode !== 'work';
  if (mode === 'home') document.documentElement.style.removeProperty('--accent');
  else { shown = -1; updateUI(); }
}
addEventListener('popstate', () => route());
addEventListener('hashchange', () => route());
document.querySelectorAll('a[href^="#/"]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); route(a.getAttribute('href')); }));
// trang đầu: lăn chuột / vuốt xuống để bước vào
addEventListener('wheel', e => { if (mode === 'home' && e.deltaY > 20) route('#/du-an'); }, { passive: true });
let touchY = null;
addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', e => { if (mode === 'home' && touchY != null && touchY - e.touches[0].clientY > 40) { touchY = null; route('#/du-an'); } }, { passive: true });

/* ---------------- khung hình ---------------- */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 48 : 36;
  camera.updateProjectionMatrix();
  bgMat.uniforms.uAsp.value = w / h;
  treeMat.uniforms.uPx.value = h * renderer.getPixelRatio() * .014;   // cỡ hạt tính theo chiều cao màn hình
}
resize();
addEventListener('resize', resize);

const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clock = new THREE.Clock();
const camTarget = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const dt = Math.min(clock.getDelta(), .05), t = reduce ? 0 : clock.elapsedTime;
  // vào/ra vòng dự án
  modeT += (modeTo - modeT) * (1 - Math.pow(.02, dt));
  const mt = ease(Math.min(1, Math.max(0, modeT)));
  // trượt dọc vòng xoắn (có quán tính), tự dừng đúng một tấm khi thôi lăn
  if (!drag && performance.now() - lastWheel > 160) target += (Math.round(target) - target) * (1 - Math.pow(.004, dt));
  const prev = pos;
  pos += (target - pos) * (1 - Math.pow(.006, dt));
  vel += ((pos - prev) - vel) * .3;
  mouseS.lerp(mouse, 1 - Math.pow(.05, dt));

  world.rotation.y = -pos * A_STEP + mouseS.x * .04;
  world.position.y = THREE.MathUtils.lerp(HOME_Y, pos * Y_STEP, mt);
  camera.position.set(mouseS.x * .35, .2 + mouseS.y * .25, THREE.MathUtils.lerp(R + 15, R + (mobile ? 6.6 : 7.4), mt));
  camTarget.set(0, THREE.MathUtils.lerp(.4, 0, mt), THREE.MathUtils.lerp(0, R - 1.5, mt));
  camera.lookAt(camTarget);

  // màu theo dự án đang giữa
  const ci = cur();
  wantBg.copy(HOME_BG).lerp(projBg[ci], mt); wantAc.copy(HOME_AC).lerp(projAc[ci], mt);
  colBg.lerp(wantBg, 1 - Math.pow(.15, dt)); colAc.lerp(wantAc, 1 - Math.pow(.15, dt));
  bgMat.uniforms.uT.value = t; bgMat.uniforms.uM.value.copy(mouseS);
  treeMat.uniforms.uT.value = t;
  treeMat.uniforms.uFade.value = opened || mode === 'contact' ? .55 : 1;

  // biểu tượng: xoay chậm, nghiêng theo chuột, thu nhỏ bay lên khi vào vòng dự án
  const e = emblem.userData;
  emblem.visible = mt < .98;
  emblem.position.set(0, .45 + mt * 4, R + 1.5 - mt * 2);
  emblem.scale.setScalar(1 - mt * .6);
  emblem.rotation.set(-mouseS.y * .25, mouseS.x * .35 + Math.sin(t * .3) * .15, 0);
  e.star.rotation.z = t * .25;
  e.ring2.rotation.x = Math.sin(t * .4) * .35; e.ring2.rotation.y = t * .2;
  e.mat.opacity = 1 - mt;

  // tấm kính: tấm giữa sáng rõ, gợn khi rê chuột
  let hover = null;
  if (mode === 'work' && !opened && !drag && !mobile) {
    ray.setFromCamera(mouse, camera);
    const h = ray.intersectObject(cards[ci], false)[0];
    if (h) { hover = h; cards[ci].material.uniforms.uHit.value.lerp(h.uv, .2); }
  }
  canvas.style.cursor = hover ? 'pointer' : (mode === 'work' ? 'grab' : '');
  cards.forEach((c, i) => {
    const u = c.material.uniforms, d = Math.abs(i - pos);
    u.uT.value = t;
    u.uAct.value += ((d < .5 ? 1 : 0) - u.uAct.value) * (1 - Math.pow(.02, dt));
    u.uHover.value += ((hover && i === ci ? 1 : 0) - u.uHover.value) * .08;
    u.uVel.value = THREE.MathUtils.clamp(vel, -.06, .06);
    u.uAlpha.value = mt * THREE.MathUtils.clamp(1.6 - d * .45, 0, 1) * (opened ? .35 : 1);
    c.visible = u.uAlpha.value > .005;
  });
  if (mode === 'work') updateUI();
  renderer.render(scene, camera);
}

/* ---------------- tải ---------------- */
(async () => {
  const fontOk = Promise.race([document.fonts.load('600 104px "Chakra Petch"'), new Promise(r => setTimeout(r, 2500))]);
  await fontOk;
  let done = 0;
  const n = $('#loader-n');
  const bump = () => { done++; n.textContent = String(Math.round(done / N * 100)).padStart(3, '0'); };
  await Promise.all(P.map(async (p, i) => {
    try { cards[i].material.uniforms.uTex.value = await cardTexture(p); } catch (e) { console.warn('Không tải được ảnh', p.slug, e); }
    bump();
  }));
  route();
  if (mode === 'work' && !opened) modeT = 0;   // mở thẳng #/du-an: vẫn lướt từ tán cây xuống
  body.classList.remove('is-loading');
  scramble($('.home-t'), D.title_en.toUpperCase());
})();
frame();
