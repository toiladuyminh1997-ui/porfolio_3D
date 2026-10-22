/* Phần đầu trang chủ: đầu lợn rừng 3D (kiểu Dogstudio) + đàn quạ bay trên nền đen (kiểu Immersive Garden).
   Đầu lợn quay theo con trỏ, ánh sáng viền đổi màu theo đoạn cuộn; đàn quạ bay theo bầy, né con trỏ. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const canvas = document.getElementById('scene');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = innerWidth < 760;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  console.warn('WebGL không khả dụng — dùng ảnh tĩnh', e);
}

if (renderer) {
  document.body.classList.add('has-3d');
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050506, 7, 17);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  camera.position.set(0, 0, 6);

  /* ---------------- ánh sáng ---------------- */
  const hemi = new THREE.HemisphereLight(0x8a96b0, 0x050403, 0.25);
  const key = new THREE.SpotLight(0xfff1dc, 60, 20, 0.5, 0.6, 1.6);
  key.position.set(-2.6, 3.2, 4.2);
  const rimL = new THREE.PointLight(0x7fa6ff, 40, 12, 1.8);
  rimL.position.set(-3, 1.4, -2.4);
  const rimR = new THREE.PointLight(0xff7a3c, 40, 12, 1.8);
  rimR.position.set(3, 0.6, -2.2);
  const cursorLight = new THREE.PointLight(0xffffff, 6, 6, 2);
  cursorLight.position.set(0, 0, 2.5);
  scene.add(hemi, key, key.target, rimL, rimR, cursorLight);

  /* ---------------- đầu lợn rừng ---------------- */
  const boar = new THREE.Group();
  scene.add(boar);
  const fresnel = { value: new THREE.Color(0x9fb8d9) };
  const boarMat = new THREE.MeshStandardMaterial({
    color: 0x2a2724, roughness: 0.58, metalness: 0.25, transparent: true,
  });
  boarMat.onBeforeCompile = sh => {
    sh.uniforms.uRim = fresnel;
    sh.uniforms.uFade = { value: 0 };
    boarMat.userData.sh = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vLocalY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim; uniform float uFade; varying float vLocalY;')
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vViewPosition)), 0.0, 1.0), 2.6);
        gl_FragColor.rgb += uRim * rim * 0.55;
        // phần cổ tan dần vào bóng tối (như con chó của Dogstudio)
        gl_FragColor.a *= smoothstep(-0.53, -0.18, vLocalY) * (1.0 - uFade);`);
  };
  new GLTFLoader().load(window.MODEL_URL, g => {
    g.scene.traverse(o => { if (o.isMesh) { o.material = boarMat; o.renderOrder = 2; } });
    g.scene.rotation.x = 0.08;
    boar.add(g.scene);
    document.body.classList.add('boar-ready');
  }, undefined, e => console.warn('Không tải được đầu lợn', e));

  /* ---------------- đàn quạ ---------------- */
  // Hình quạ dựng bằng tam giác: thân, đuôi xoè, hai cánh (trong + ngoài, lông cánh xẻ ở đầu).
  function ravenGeometry() {
    const P = [], I = [];
    const v = (x, y, z) => (P.push(x, y, z), P.length / 3 - 1);
    const tri = (a, b, c) => I.push(a, b, c);
    // thân (hướng bay = +Z)
    const nose = v(0, 0.01, 0.55), beak = v(0, -0.01, 0.68), top = v(0, 0.07, 0.12), bot = v(0, -0.08, 0.1);
    const sl = v(-0.07, 0, 0.12), sr = v(0.07, 0, 0.12), tail = v(0, 0, -0.32);
    [[nose, sl, top], [nose, top, sr], [nose, bot, sl], [nose, sr, bot], [tail, top, sl], [tail, sr, top],
     [tail, sl, bot], [tail, bot, sr], [beak, nose, sl], [beak, sr, nose]].forEach(t => tri(...t));
    // đuôi xoè
    const t0 = v(0, 0, -0.26), tl = v(-0.14, 0, -0.62), tm = v(0, 0, -0.56), tr = v(0.14, 0, -0.62);
    tri(t0, tl, tm); tri(t0, tm, tr);
    // cánh
    for (const s of [-1, 1]) {
      const r0 = v(s * 0.06, 0, 0.2), r1 = v(s * 0.06, 0, -0.12);
      const m0 = v(s * 0.48, 0.02, 0.14), m1 = v(s * 0.48, 0.02, -0.16);
      const f = [[0.62, 0.1], [0.78, 0.0], [0.92, -0.08], [1.02, -0.16], [0.86, -0.22], [0.68, -0.24]]
        .map(([x, z]) => v(s * x, 0.03, z));
      tri(r0, m0, r1); tri(r1, m0, m1);
      let prev = m0;
      for (const fi of f) { tri(prev, fi, m1); prev = fi; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    g.scale(0.44, 0.44, 0.44);
    return g;
  }

  const N = small ? 70 : 150;
  const geo = ravenGeometry();
  const phase = new Float32Array(N), speed = new Float32Array(N);
  for (let i = 0; i < N; i++) { phase[i] = Math.random() * 6.28; speed[i] = 7 + Math.random() * 4; }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speed, 1));
  // quạ: bóng đen in trên màn sương, có ánh xanh dầu nhẹ trên lông
  const ravenMat = new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.4, metalness: 0.1, side: THREE.DoubleSide, fog: false });
  const time = { value: 0 };
  ravenMat.onBeforeCompile = sh => {
    sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float aPhase; attribute float aSpeed;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ax = abs(transformed.x) / 0.44;
        float w = uTime * aSpeed + aPhase;
        float flap = sin(w) * 0.85 + 0.15;
        float inner = max(ax - 0.06, 0.0);
        float outer = max(ax - 0.48, 0.0);
        transformed.y += (inner * flap + outer * sin(w - 0.9) * 0.6) * 0.44;
        transformed.x *= 1.0 - 0.18 * abs(flap) * step(0.06, ax);`);
  };
  const flock = new THREE.InstancedMesh(geo, ravenMat, N);
  flock.frustumCulled = false;
  scene.add(flock);

  const pos = [], vel = [];
  const B = { x: 7, y: 3.6, zMin: -9, zMax: -1.2 };
  for (let i = 0; i < N; i++) {
    pos.push(new THREE.Vector3((Math.random() - .5) * 2 * B.x, (Math.random() - .5) * 2 * B.y, B.zMin + Math.random() * (B.zMax - B.zMin)));
    vel.push(new THREE.Vector3(Math.random() - .5, (Math.random() - .5) * .3, Math.random() - .5).setLength(1.4));
  }

  /* ---------------- tương tác ---------------- */
  const mouse = new THREE.Vector2(0, 0), mouseS = new THREE.Vector2(0, 0);
  const mouseWorld = new THREE.Vector3(999, 999, 0);
  const ray = new THREE.Raycaster();
  addEventListener('pointermove', e => {
    mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  });
  let scatter = 0, lastScroll = scrollY;

  // các "trạng thái" theo đoạn cuộn: hero -> trích dẫn -> mục lục
  const STATES = [
    { x: 0, y: 0.18, z: 0, ry: 0, s: 1, rim: 0x9fb8d9, rimL: 0x7fa6ff, rimR: 0xff7a3c, fade: 0 },
    { x: 1.15, y: -0.1, z: 0.3, ry: -0.75, s: 1.05, rim: 0xff9a5c, rimL: 0xff5a1f, rimR: 0xffb347, fade: 0 },
    { x: 0.6, y: 1.6, z: -1.5, ry: -0.3, s: 0.8, rim: 0x6c7a99, rimL: 0x30406a, rimR: 0x6a3a20, fade: 0.9 },
  ];
  const cA = new THREE.Color(), cB = new THREE.Color();
  const mixC = (a, b, t, out) => out.copy(cA.set(a)).lerp(cB.set(b), t);
  const sections = ['.hero', '.quote', '.toc'].map(s => document.querySelector(s));
  function scrollState() {
    // tiến độ liên tục 0..2 giữa các phần
    const y = scrollY + innerHeight * 0.5;
    let k = 0;
    for (let i = 0; i < sections.length - 1; i++) {
      const a = sections[i], b = sections[i + 1];
      if (!a || !b) continue;
      const ca = a.offsetTop + a.offsetHeight / 2, cb = b.offsetTop + Math.min(b.offsetHeight, innerHeight) / 2;
      if (y >= cb) k = i + 1;
      else if (y > ca) { k = i + (y - ca) / (cb - ca); break; } else break;
    }
    return k;
  }
  const ease = t => t * t * (3 - 2 * t);

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w < h ? 8.2 : 6;   // điện thoại: lùi máy quay để thấy trọn đầu lợn
    camera.updateProjectionMatrix();
  }
  resize();
  addEventListener('resize', resize);

  /* ---------------- vòng lặp ---------------- */
  const clock = new THREE.Clock();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qRoll = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, 1), sc = new THREE.Vector3();
  const tmp = new THREE.Vector3(), steer = new THREE.Vector3(), coh = new THREE.Vector3(), ali = new THREE.Vector3(), sep = new THREE.Vector3();
  const look = new THREE.Matrix4(), origin = new THREE.Vector3();
  const prevDir = vel.map(v => v.clone().normalize());
  let intro = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    time.value = t;
    intro = Math.min(1, intro + dt * 0.45);

    const k = scrollState();
    const i0 = Math.min(Math.floor(k), STATES.length - 2), f = ease(Math.min(1, k - i0));
    const A = STATES[i0], Bs = STATES[i0 + 1];
    const L = (p) => A[p] + (Bs[p] - A[p]) * f;
    const op = Math.max(0, 1 - Math.max(0, k - 1.6) * 0.9);
    canvas.style.opacity = String(op);
    if (op === 0 || document.hidden) return;   // đã cuộn sâu vào mục lục: dừng vẽ cho nhẹ máy

    // con trỏ (trễ mềm) + đèn theo con trỏ
    mouseS.lerp(mouse, 0.06);
    ray.setFromCamera(mouseS, camera);
    cursorLight.position.copy(ray.ray.at(4.2, tmp));
    ray.setFromCamera(mouse, camera);
    const dz = -4 - camera.position.z;
    mouseWorld.copy(ray.ray.origin).addScaledVector(ray.ray.direction, dz / ray.ray.direction.z);

    // đầu lợn: vị trí theo phần cuộn + quay theo con trỏ + thở nhẹ
    const s = L('s') * (0.92 + 0.08 * ease(intro));
    boar.scale.setScalar(s * (1 + Math.sin(t * 1.3) * 0.006));
    boar.position.set(L('x'), L('y') + Math.sin(t * 0.9) * 0.025 - (1 - ease(intro)) * 0.4, L('z'));
    const ry = L('ry') + mouseS.x * 0.55, rx = -mouseS.y * 0.28;
    boar.rotation.y += (ry - boar.rotation.y) * 0.08;
    boar.rotation.x += (rx - boar.rotation.x) * 0.08;
    boar.rotation.z += (-mouseS.x * 0.06 - boar.rotation.z) * 0.08;
    mixC(A.rim, Bs.rim, f, fresnel.value);
    mixC(A.rimL, Bs.rimL, f, rimL.color);
    mixC(A.rimR, Bs.rimR, f, rimR.color);
    key.intensity = 60 * ease(intro);
    if (boarMat.userData.sh) boarMat.userData.sh.uniforms.uFade.value = L('fade');

    // đàn quạ: boids (gắn kết, đồng hướng, tách nhau) + né con trỏ + giữ trong vùng
    const sy = scrollY; scatter = Math.min(2.5, scatter * 0.95 + Math.abs(sy - lastScroll) * 0.004); lastScroll = sy;
    const maxV = (reduce ? 0.7 : 1.6) + scatter * 0.6;
    for (let i = 0; i < N; i++) {
      const p = pos[i], v = vel[i];
      coh.set(0, 0, 0); ali.set(0, 0, 0); sep.set(0, 0, 0);
      let n = 0;
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        const d2 = p.distanceToSquared(pos[j]);
        if (d2 < 2.6) {
          coh.add(pos[j]); ali.add(vel[j]); n++;
          if (d2 < 0.22) sep.add(tmp.subVectors(p, pos[j]).divideScalar(d2 + 0.01));
        }
      }
      steer.set(0, 0, 0);
      if (n) {
        steer.addScaledVector(coh.divideScalar(n).sub(p), 0.35);
        steer.addScaledVector(ali.divideScalar(n).sub(v), 0.5);
      }
      steer.addScaledVector(sep, 0.35);
      // né con trỏ
      const md = tmp.subVectors(p, mouseWorld); md.z *= 0.4;
      const mdl = md.length();
      if (mdl < 2.2) steer.addScaledVector(md.normalize(), (2.2 - mdl) * 3.2);
      // không bay vào đầu lợn
      const bd = tmp.subVectors(p, boar.position); const bdl = bd.length();
      if (bdl < 2.3) steer.addScaledVector(bd.normalize(), (2.3 - bdl) * 2.5);
      // vùng bay
      if (p.x > B.x) steer.x -= (p.x - B.x) * 1.5; if (p.x < -B.x) steer.x -= (p.x + B.x) * 1.5;
      if (p.y > B.y) steer.y -= (p.y - B.y) * 1.5; if (p.y < -B.y) steer.y -= (p.y + B.y) * 1.5;
      if (p.z > B.zMax) steer.z -= (p.z - B.zMax) * 1.5; if (p.z < B.zMin) steer.z -= (p.z - B.zMin) * 1.5;
      steer.y -= v.y * 0.4;   // bay gần như nằm ngang
      v.addScaledVector(steer, dt);
      const sp = v.length();
      if (sp > maxV) v.multiplyScalar(maxV / sp); else if (sp < 0.8) v.multiplyScalar(0.8 / sp);
      p.addScaledVector(v, dt);

      // hướng + nghiêng cánh khi rẽ
      const dir = tmp.copy(v).normalize();
      const turn = prevDir[i].clone().cross(dir).y;
      prevDir[i].lerp(dir, 0.2);
      look.lookAt(origin, prevDir[i].clone().negate(), up);
      q.setFromRotationMatrix(look);
      qRoll.setFromAxisAngle(fwd, THREE.MathUtils.clamp(-turn * 40, -0.8, 0.8));
      q.multiply(qRoll);
      sc.setScalar(0.85 + (i % 7) * 0.05);
      m4.compose(p, q, sc);
      flock.setMatrixAt(i, m4);
    }
    flock.instanceMatrix.needsUpdate = true;

    renderer.render(scene, camera);
  }
  frame();
}
