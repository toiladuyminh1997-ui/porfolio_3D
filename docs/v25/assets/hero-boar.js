/* Trang chủ kiểu Dogstudio: lợn rừng 3D (web/lon rung) đi theo người đọc suốt trang.
   - Mỗi phần (đầu trang, trích dẫn, mục lục, chân trang) có một "góc máy" riêng; cuộn tới đâu,
     con lợn lướt mượt (có quán tính) sang vị trí/góc xoay/kích thước của phần đó.
   - Ánh sáng đổi màu theo phần; rê chuột lên một chương trong mục lục -> nhuộm màu chương đó.
   - Đầu lợn cử động theo vòng lặp + nhìn theo con trỏ (uốn bằng shader, mô hình không có xương).
   - Cành cây/lá văng quanh trôi lững lờ. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('boar');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
// điện thoại / máy cảm ứng: mô hình nhẹ (ít lưới, texture 1024), độ phân giải dựng hình thấp hơn
const light = matchMedia('(max-width: 900px), (pointer: coarse)').matches;

// Toạ độ mô hình (tools/blender_boar2.py): thân dài theo X, mũi ở +X, lưng +Y
const NECK = new THREE.Vector3(0.45, 0.18, 0);
// Tâm quay = trọng tâm thân lợn (không lấy tâm khung bao, vì khung bao kéo dài theo đuôi và cành lá văng)
const PIVOT = new THREE.Vector3(0.15, 0.1, 0);

/* Góc máy cho từng phần: vị trí (x, y, z), xoay quanh trục đứng (ry), cúi/ngẩng (rx), cỡ (s),
   màu đèn viền trái/phải, độ sáng. ry = -π/2: mũi hướng thẳng về người xem. */
// fade: độ rõ của con lợn (1 = rõ). Mục lục có 2 điểm (đầu + cuối) để con lợn đứng yên một chỗ suốt danh sách.
const KEYS = [
  { sel: '.hero',  x: 1.1,  y: -0.3,  z: 1.9,  ry: -1.25, rx: 0.06, s: 1.0,  rimL: 0x7a5cff, rimR: 0x2ec5ff, light: 1.0, fade: 1 },     // cận đầu, bên phải
  { sel: '.quote', x: -1.25, y: -0.1, z: 0.2,  ry: -3.0,  rx: 0.0,  s: 0.95, rimL: 0x9b6bff, rimR: 0xff7a3c, light: 1.0, fade: 1 },     // toàn thân nhảy, bên trái
  // mục lục (như danh sách dự án Dogstudio): con lợn nhỏ lại, đứng bên phải sau danh sách, đổi màu theo chương
  { sel: '.toc',   x: 1.55, y: -0.2, z: -0.5, ry: -2.0,  rx: 0.05, s: 0.8,  rimL: 0x3a7bff, rimR: 0x7a5cff, light: 0.9, fade: 0.9 },
  { sel: '.toc', end: true, x: 1.5, y: -0.1, z: -0.6, ry: -2.5, rx: 0.05, s: 0.8, rimL: 0x3a7bff, rimR: 0x7a5cff, light: 0.9, fade: 0.9 },
  { sel: '.foot',  x: 0.1,  y: 0.35, z: 1.6,  ry: -6.0,  rx: -0.1, s: 1.0,  rimL: 0xff7a3c, rimR: 0x7a5cff, light: 1.0, fade: 1 },     // cận cảnh cuối trang, rõ lại
];

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !light, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  console.warn('WebGL không khả dụng — dùng ảnh tĩnh', e);
}

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, light ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);

  const key = new THREE.SpotLight(0xd8d0ff, 70, 20, 0.6, 0.7, 1.5);
  key.position.set(-2.2, 3.6, 4.6);
  const rimL = new THREE.PointLight(0x7a5cff, 70, 12, 1.6);
  rimL.position.set(-3, 1.6, -2.2);
  const rimR = new THREE.PointLight(0x2ec5ff, 70, 12, 1.6);
  rimR.position.set(3, 0.8, -2);
  const fill = new THREE.HemisphereLight(0x6a70c0, 0x050408, 0.35);
  scene.add(key, key.target, rimL, rimR, fill);

  const boar = new THREE.Group();
  scene.add(boar);

  const U = {
    uHead: { value: new THREE.Vector3() },
    uNeck: { value: NECK },
    uTime: { value: 0 },
    uRim: { value: new THREE.Color(0x8f8cff) },
    uTint: { value: new THREE.Color(0xffffff) },   // màu chương đang chọn
    uTintAmt: { value: 0 },                          // 0 = màu gốc, 1 = nhuộm hẳn màu chương
  };
  // headOn = 1: thân lợn (đầu được uốn); 0: cành/lá (trôi lững lờ, không uốn theo đầu)
  function patch(mat, headOn) {
    mat.envMapIntensity = 0.7;
    mat.transparent = true;
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U, { uHeadOn: { value: headOn } });
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec3 uHead; uniform vec3 uNeck; uniform float uHeadOn; uniform float uTime; varying float vLocalY;
          mat3 rotXYZ(vec3 a) {
            float cy = cos(a.x), sy = sin(a.x), cz = cos(a.y), sz = sin(a.y), cx = cos(a.z), sx = sin(a.z);
            mat3 ry = mat3(cy, 0., -sy, 0., 1., 0., sy, 0., cy);
            mat3 rz = mat3(cz, sz, 0., -sz, cz, 0., 0., 0., 1.);
            mat3 rx = mat3(1., 0., 0., 0., cx, sx, 0., -sx, cx);
            return ry * rz * rx;
          }
          float headW(vec3 p) {
            return smoothstep(uNeck.x - 0.08, uNeck.x + 0.2, p.x) * smoothstep(-0.22, -0.06, p.y);
          }`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          float hw = headW(position) * uHeadOn;
          mat3 HR = rotXYZ(uHead * hw);
          objectNormal = HR * objectNormal;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed = HR * (transformed - uNeck) + uNeck;
          // cành/lá: trôi lững lờ, mỗi chỗ một nhịp
          float leaf = 1.0 - uHeadOn;
          vec3 ph = position * 3.1;
          transformed += leaf * vec3(sin(uTime * 0.7 + ph.y) * 0.025, sin(uTime * 0.9 + ph.x) * 0.035, cos(uTime * 0.6 + ph.z) * 0.025);
          vLocalY = position.y;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform vec3 uTint; uniform float uTintAmt; varying float vLocalY;')
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          // nhuộm màu chương: giữ độ sáng tối của lông / bùn, thay sắc màu bằng màu chương
          float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uTint * lum * 1.9, uTintAmt);
          float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.4);
          gl_FragColor.rgb += uRim * rim * (0.45 + uTintAmt * 0.6);
          gl_FragColor.a *= smoothstep(-0.66, -0.42, vLocalY);`);
    };
    mat.customProgramCacheKey = () => 'boar-' + headOn;
  }

  let ready = false;
  new GLTFLoader().load((light && window.MODEL_URL_M) || window.MODEL_URL, g => {
    g.scene.traverse(o => {
      if (o.isMesh) {
        const isBody = /body/i.test(o.name) || /body/i.test(o.parent?.name || '');
        o.material = o.material.clone();
        patch(o.material, isBody ? 1 : 0);
        o.frustumCulled = false;
      }
    });
    g.scene.position.copy(PIVOT).negate();   // dời mô hình để trọng tâm thân nằm đúng tâm xoay của nhóm
    boar.add(g.scene);
    ready = true;
    document.body.classList.add('has-3d');
  }, undefined, e => console.warn('Không tải được mô hình lợn rừng', e));

  /* ---------- con trỏ + màu theo chương ---------- */
  const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
  addEventListener('pointermove', e => mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
  let tint = null;
  document.querySelectorAll('a.toc-row').forEach(r => {
    r.addEventListener('pointerenter', () => { tint = new THREE.Color(r.dataset.accent); });
    r.addEventListener('pointerleave', () => { tint = null; });
  });

  /* ---------- vòng lặp cử động đầu ---------- */
  const TAU = Math.PI * 2;
  function idle(t) {
    const p = t / 12;
    const look = Math.sin(TAU * p) * 0.34 + Math.sin(TAU * p * 2.6) * 0.06;
    const sniffEnv = Math.pow(Math.max(0, Math.sin(TAU * t / 3.4)), 10);
    const sniff = sniffEnv * (0.2 + Math.sin(t * 22) * 0.03);
    const nod = Math.sin(TAU * p * 2) * 0.06;
    return { yaw: look, pitch: sniff + nod, roll: look * 0.25, breathe: Math.sin(t * 1.5) };
  }

  /* ---------- góc máy theo vị trí cuộn ---------- */
  const secs = KEYS.map(k => document.querySelector(k.sel));
  function anchor(i) {   // điểm "đến": giữa màn hình đầu tiên của phần (hoặc màn hình cuối nếu end)
    const el = secs[i];
    if (KEYS[i].end) return el.offsetTop + el.offsetHeight - Math.min(el.offsetHeight, innerHeight) / 2;
    return el.offsetTop + Math.min(el.offsetHeight, innerHeight) / 2;
  }
  function scrollK() {
    const y = scrollY + innerHeight / 2;
    for (let i = 0; i < secs.length - 1; i++) {
      const a = anchor(i), b = anchor(i + 1);
      if (y < b) return i + THREE.MathUtils.clamp((y - a) / (b - a), 0, 1);
    }
    return secs.length - 1;
  }
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // easeInOutCubic
  const cur = { x: KEYS[0].x, y: KEYS[0].y, z: KEYS[0].z, ry: KEYS[0].ry, rx: KEYS[0].rx, s: KEYS[0].s, light: 1, fade: 1 };
  const cL = new THREE.Color(), cR = new THREE.Color(), tmpA = new THREE.Color(), tmpB = new THREE.Color(), actColor = new THREE.Color();
  const WHITE = new THREE.Color(0xffffff), KEY0 = key.color.clone(), FILL0 = fill.color.clone();

  let portrait = false;
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    portrait = innerWidth < innerHeight;
    camera.position.set(0, 0.2, portrait ? 9 : 6);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  const clock = new THREE.Clock();
  const head = new THREE.Vector3();
  let exposure = 0, odd = false;
  const actRow = () => document.querySelector('.toc-row.is-active');
  function frame() {
    requestAnimationFrame(frame);
    // con lợn gần như ẩn (sau mục lục): vẽ cách một khung hình, đỡ tốn pin
    odd = !odd;
    if (odd && cur.fade < 0.12) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!ready || document.hidden) return;
    const t = reduce ? 0 : clock.elapsedTime;
    U.uTime.value = t;
    exposure = Math.min(1.25, exposure + dt * 0.5);

    // nội suy giữa hai góc máy gần nhất, rồi đuổi theo mềm (cảm giác có trọng lượng như Dogstudio)
    const k = scrollK();
    const i = Math.min(Math.floor(k), KEYS.length - 2), f = ease(k - i);
    const A = KEYS[i], B = KEYS[i + 1];
    const damp = 1 - Math.pow(0.0025, dt);   // ~ chậm dần đều, độc lập tốc độ khung hình
    for (const p of ['x', 'y', 'z', 'ry', 'rx', 's', 'light', 'fade']) {
      let target = A[p] + (B[p] - A[p]) * f;
      if (portrait && p === 'x') target *= 0.35;   // điện thoại: giữ con lợn gần giữa
      cur[p] += (target - cur[p]) * damp;
    }
    // màu: chương đang rê chuột > chương đang sáng theo cuộn > màu của góc máy
    const act = actRow();
    const want = tint || (act ? actColor.set(act.dataset.accent) : null);
    tmpA.set(A.rimL).lerp(tmpB.set(B.rimL), f); cL.lerp(want || tmpA, 0.06); rimL.color.copy(cL);
    tmpA.set(A.rimR).lerp(tmpB.set(B.rimR), f); cR.lerp(want || tmpA, 0.06); rimR.color.copy(cR);
    U.uRim.value.copy(cL).lerp(cR, 0.5);
    // Dogstudio: cả con vật đổi màu theo dự án -> thân lợn, đèn chính, ánh sáng nền cùng ngả sang màu chương
    if (want) U.uTint.value.lerp(want, 0.08);
    U.uTintAmt.value += ((want ? 0.62 : 0) - U.uTintAmt.value) * 0.07;
    key.color.lerp(want ? tmpA.copy(want).lerp(WHITE, 0.45) : KEY0, 0.06);
    fill.color.lerp(want || FILL0, 0.06);
    renderer.toneMappingExposure = exposure * cur.light;
    canvas.style.opacity = cur.fade.toFixed(3);   // mờ đi trong mục lục

    // con trỏ: cả con lợn nghiêng nhẹ theo (parallax), đầu nhìn theo
    mouseS.lerp(mouse, 0.05);
    const a = idle(t);
    head.x += (a.yaw * 0.6 + mouseS.x * 0.35 - head.x) * 0.08;
    head.y += (a.pitch + mouseS.y * 0.2 - head.y) * 0.1;
    head.z += (a.roll - head.z) * 0.08;
    U.uHead.value.copy(head);

    boar.position.set(cur.x + mouseS.x * 0.08, cur.y + mouseS.y * 0.05 + Math.sin(t * 0.8) * 0.02, cur.z);
    boar.rotation.set(cur.rx - mouseS.y * 0.04, cur.ry + mouseS.x * 0.08, 0);
    boar.scale.set(cur.s, cur.s * (1 + a.breathe * 0.006), cur.s * (1 + a.breathe * 0.01));
    renderer.render(scene, camera);
  }
  frame();
}
