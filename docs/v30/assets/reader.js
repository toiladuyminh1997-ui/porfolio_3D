/* Trang đọc — hai cách đọc cùng một chương:
   "Đọc"      cuộn kiểu phim: mỗi trang đôi là một cảnh, ảnh của trang làm nền, chữ của trang trượt lên;
   "Dàn trang" lật từng trang đôi đúng bản InDesign (phím ← →, vuốt, bấm để phóng to).
   Chung: tiến độ, cỡ chữ / nền, nhớ chỗ đọc, chuyển qua lại vẫn giữ đúng trang. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const n = window.CHAPTER;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { } },
  };
  const body = document.body, root = document.documentElement;
  const prose = $('#prose');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- tuỳ chỉnh ---------- */
  const SIZES = [1, 1.08, 1.16, 1.26, 1.38, 1.5];
  const prefs = Object.assign({ size: 2, theme: 'night' }, store.get('gtr:prefs') || {});
  const apply = () => {
    root.style.setProperty('--fs', SIZES[prefs.size] + 'rem');
    body.classList.toggle('paper', prefs.theme === 'paper');
    $$('[data-theme]').forEach(b => b.classList.toggle('on', b.dataset.theme === prefs.theme));
    store.set('gtr:prefs', prefs);
  };
  apply();
  const panel = $('#settings');
  $('#settings-btn').addEventListener('click', e => { e.stopPropagation(); panel.hidden = !panel.hidden; });
  document.addEventListener('click', e => { if (!panel.contains(e.target)) panel.hidden = true; });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.size) prefs.size = Math.max(0, Math.min(SIZES.length - 1, prefs.size + +b.dataset.size));
    if (b.dataset.theme) prefs.theme = b.dataset.theme;
    apply();
  });

  const bar = $('.bar'), prog = $('.progress i');
  const isBook = () => root.classList.contains('mode-book');
  // máy tính (màn ngang): đọc bằng trang đôi chuyển động (#mvs); điện thoại / màn dọc: ảnh + chữ chảy (#prose)
  const deskMQ = matchMedia('(min-width: 900px) and (orientation: landscape)');
  const mvs = $('#mvs');
  const desk = () => deskMQ.matches && !!mvs;
  const readEl = () => desk() ? mvs : prose;

  /* ================= ĐỌC: cuộn kiểu phim ================= */
  const scenes = $$('.cs'), bgs = $$('.cbg'), bgWrap = $('.cine-bg');
  const loadBg = i => {
    if (!bgs[i]) return;
    $$('img[data-src]', bgs[i]).forEach(im => {   // ảnh chính + ảnh mờ lót nền
      if (im.dataset.srcset) im.srcset = im.dataset.srcset;
      im.src = im.dataset.src;
      delete im.dataset.src;
    });
  };
  let active = null;
  const activate = sc => {
    if (sc === active) return;
    active = sc;
    const i = +sc.dataset.bg;
    // trang không có hình: giữ ảnh trước nhưng làm tối đi (khung ảnh không bị trống)
    if (i >= 0) bgs.forEach((b, k) => b.classList.toggle('on', k === i));
    if (bgWrap) bgWrap.classList.toggle('idle', i < 0);
    const si = scenes.indexOf(sc);
    scenes.slice(si, si + 3).forEach(s => loadBg(+s.dataset.bg));   // tải trước ảnh của cảnh kế tiếp
  };
  if (scenes.length) activate(scenes[0]);
  // cảnh đang đọc = cảnh cắt ngang vạch ở ~55% chiều cao màn hình
  const sceneIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) activate(e.target); }),
    { rootMargin: '-55% 0px -44% 0px' });
  scenes.forEach(s => sceneIO.observe(s));

  /* tiến độ + thanh trên */
  let lastY = scrollY, ticking = false;
  const ratio = () => {
    const pr = readEl(), top = pr.offsetTop, h = pr.offsetHeight - innerHeight * .6;
    return Math.max(0, Math.min(1, (scrollY - top + innerHeight * .3) / h));
  };
  const onScroll = () => {
    ticking = false;
    if (isBook()) return;
    const y = scrollY;
    prog.style.transform = `scaleX(${ratio()})`;
    bar.classList.toggle('solid', y > innerHeight * .6);
    bar.classList.toggle('hide', y > lastY && y > innerHeight);
    lastY = y;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

  /* nhớ chỗ đọc */
  let saveT;
  addEventListener('scroll', () => {
    if (isBook()) return;
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const r = ratio();
      store.set('gtr:pos:' + n, r);
      if (r > .02) store.set('gtr:last', { n, r, url: location.pathname });
    }, 400);
  }, { passive: true });

  /* ---------- ảnh "sống": cây lay, nước gợn, người thở, chiều sâu theo chuột ----------
     Mỗi ảnh lớn có bản đồ chuyển động (tools/motion_maps.py: R cây lá, G người/thú, B độ gần, A 1 - nước).
     Một <canvas> WebGL phủ đúng lên ảnh, uốn điểm ảnh theo bản đồ — ảnh gốc vẫn nằm dưới nếu WebGL lỗi.
     Chỉ ảnh của vài trang đôi gần nhất có canvas (trình duyệt giới hạn số ngữ cảnh WebGL). */
  const living = (() => {
    const VS = 'attribute vec2 p; varying vec2 uv; void main() { uv = vec2(p.x, -p.y) * .5 + .5; gl_Position = vec4(p, 0., 1.); }';
    const FS = `precision mediump float;
      varying vec2 uv; uniform sampler2D img, map; uniform float t, amp, asp; uniform vec2 mouse, mrect;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y) * 2. - 1.; }
      void main() {
        vec4 m = texture2D(map, vec2(uv.x, mrect.x + clamp(uv.y, .004, .996) * mrect.y));   // vùng của ảnh này trong atlas
        float fol = m.r, cre = m.g, dep = m.b, wat = 1. - m.a;
        vec2 q = uv * vec2(asp, 1.);
        // chiều sâu: lớp gần lệch nhiều hơn lớp xa khi rê chuột
        vec2 d = -mouse * (dep - .45) * .010;
        // gió: cơn gió chậm, lá ở trên ngọn lay nhiều hơn gốc
        float gust = .55 + .45 * sin(t * .37) * sin(t * .23 + 1.3);
        vec2 w = vec2(sin(t * 1.3 + q.y * 4. + q.x * 2.) * .7 + n(q * 7. + vec2(t * .8, t * .3)),
                      n(q * 7. + 19. - vec2(t * .5, t * .9)) * .6);
        d += w * .0032 * fol * gust * (.55 + .45 * (1. - uv.y));
        // nước: gợn lăn tăn ngang
        d += vec2(sin(uv.y * 150. + t * 2.1 + sin(uv.x * 25. + t) * 2.) * .0011,
                  sin(uv.x * 80. - t * 1.6) * .0007) * wat;
        // người / con vật: thở (nhô lên hạ xuống) + đung đưa rất nhẹ
        d += cre * vec2(sin(t * .8 + 1.) * .0009, sin(t * 1.5) * .0022);
        vec2 s = .5 + (uv + d * amp - .5) / 1.015;   // phóng nhẹ để mép ảnh không lộ khi uốn
        gl_FragColor = texture2D(img, clamp(s, .001, .999));
      }`;
    const live = new Map();   // .sp-img -> { gl, cv, ... }
    const order = [];
    let raf = 0, t0 = performance.now(), msx = 0, msy = 0;
    const tex = (gl, src, unit) => {
      const tx = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    };
    const atlases = new Map();   // nhiều ảnh dùng chung một atlas: tải một lần
    const loadImg = src => {
      if (!atlases.has(src)) atlases.set(src, new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; }));
      return atlases.get(src);
    };
    async function make(box) {
      const img = box.querySelector('img');
      if (!img) return;
      if (!img.complete) await new Promise(r => img.addEventListener('load', r, { once: true }));
      const map = await loadImg(box.dataset.motion).catch(() => null);
      if (!map || !live.has(box)) return;
      const cv = document.createElement('canvas');
      if (img.getAttribute('style')) cv.setAttribute('style', img.getAttribute('style'));   // ảnh lật ngang/dọc như bản dàn
      const gl = cv.getContext('webgl', { premultipliedAlpha: false, antialias: false });
      if (!gl) return;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      tex(gl, img, 0);
      tex(gl, map, 1);
      gl.uniform1i(gl.getUniformLocation(pr, 'img'), 0);
      gl.uniform1i(gl.getUniformLocation(pr, 'map'), 1);
      const mr = (box.dataset.mrect || '0,1').split(',').map(Number);
      gl.uniform2f(gl.getUniformLocation(pr, 'mrect'), mr[0], mr[1]);
      const L = { cv, gl, t: gl.getUniformLocation(pr, 't'), amp: gl.getUniformLocation(pr, 'amp'),
                  asp: gl.getUniformLocation(pr, 'asp'), mouse: gl.getUniformLocation(pr, 'mouse'), a: 0, w: 0, h: 0 };
      if (!live.has(box)) return gl.getExtension('WEBGL_lose_context')?.loseContext();
      live.set(box, L);
      box.append(cv);
      loop();
    }
    function drop(box) {
      const L = live.get(box);
      live.delete(box);
      if (L && L.gl) { L.cv.remove(); L.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
    }
    function frame() {
      raf = 0;
      if (document.hidden || isBook()) return;
      const t = (performance.now() - t0) / 1000, dpr = Math.min(devicePixelRatio || 1, 1.5);
      msx += (mx - msx) * .06; msy += (my - msy) * .06;
      let any = false;
      live.forEach((L, box) => {
        if (!L || !L.gl || !box.closest('.mv.on')) return;
        any = true;
        const r = box.getBoundingClientRect(), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
        if (w !== L.w || h !== L.h) { L.cv.width = L.w = w; L.cv.height = L.h = h; L.gl.viewport(0, 0, w, h); }
        L.a = Math.min(1, L.a + .012);   // chuyển động tăng dần sau khi tới trang
        L.gl.uniform1f(L.t, t);
        L.gl.uniform1f(L.amp, L.a);
        L.gl.uniform1f(L.asp, r.width / r.height);
        L.gl.uniform2f(L.mouse, msx, msy);
        L.gl.drawArrays(L.gl.TRIANGLE_STRIP, 0, 4);
        L.cv.classList.add('ready');
      });
      if (any) loop();
    }
    const loop = () => { if (!raf) raf = requestAnimationFrame(frame); };
    document.addEventListener('visibilitychange', loop);
    return {
      attach(mv) {
        if (reduced) return;
        $$('.sp-img[data-motion]', mv).forEach(box => {
          if (live.has(box)) return;
          live.set(box, null);
          order.push(box);
          make(box);
        });
        while (order.length > 8) drop(order.shift());   // giữ tối đa 8 ảnh "sống" (khoảng 3 trang đôi)
        live.forEach(L => { if (L) L.a = Math.min(L.a, .2); });
        loop();
      },
    };
  })();

  /* ================= ĐỌC (máy tính): trang đôi chuyển động ================= */
  // Lấy sẵn bảng trang đôi trước khi ensureBook() chuyển nội dung <template> sang bản lật trang.
  const tplEl = $('#bv-tpl');
  const spByPage = new Map(tplEl ? $$('.spread', tplEl.content).map(s => [s.dataset.page, s]) : []);
  const mvList = $$('.mv');
  let mvCur = null;
  const fillMv = mv => {   // nhân bản trang đôi + ảnh nền mờ khi sắp cuộn tới
    if (mv.dataset.filled) return;
    mv.dataset.filled = 1;
    const s = spByPage.get(mv.dataset.page);
    if (s) {
      const c = s.cloneNode(true);
      c.classList.add('cur');
      $$('.sp-ln', c).forEach((l, i) => l.style.setProperty('--i', Math.min(i, 70)));
      $$('img', c).forEach(im => { im.loading = 'eager'; });
      $('.mv-sp', mv).append(c);
    }
    if (mv.dataset.amb) $('.mv-amb', mv).style.backgroundImage = `url("${mv.dataset.amb}")`;
  };
  const fillIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { fillMv(e.target); fillIO.unobserve(e.target); }
  }), { rootMargin: '120% 0px' });
  const onIO = new IntersectionObserver(es => es.forEach(e => {
    e.target.classList.toggle('on', e.isIntersecting);
    if (e.isIntersecting) { mvCur = e.target; fillMv(e.target); e.target.classList.add('seen'); living.attach(e.target); }
  }), { threshold: .55 });
  mvList.forEach(mv => { fillIO.observe(mv); onIO.observe(mv); });
  // chuột: lớp ảnh lệch theo con trỏ (CSS dùng --mx / --my), chỉ trên trang đang xem
  let mx = 0, my = 0, mvRaf = 0;
  addEventListener('pointermove', e => {
    if (!desk() || isBook() || e.pointerType === 'touch') return;
    mx = e.clientX / innerWidth * 2 - 1;
    my = e.clientY / innerHeight * 2 - 1;
    if (!mvRaf) mvRaf = requestAnimationFrame(() => {
      mvRaf = 0;
      if (mvCur) { mvCur.style.setProperty('--mx', mx.toFixed(3)); mvCur.style.setProperty('--my', my.toFixed(3)); }
    });
  }, { passive: true });
  // lăn chuột: mỗi nấc sang đúng một trang đôi (khoá ~0,9 giây để quán tính bàn di chuột không nhảy nhiều trang);
  // trước trang đầu / sau trang cuối thì cuộn bình thường (tới phần chuyển chương)
  let wheelLock = 0;
  addEventListener('wheel', e => {
    if (!desk() || isBook() || e.ctrlKey || !mvCur || Math.abs(e.deltaY) < 4) return;
    const i = mvList.indexOf(mvCur), dir = Math.sign(e.deltaY), to = mvList[i + dir];
    const r = mvCur.getBoundingClientRect();
    if (!to || Math.abs(r.top) > innerHeight * .5) return;
    e.preventDefault();
    if (performance.now() < wheelLock) return;
    wheelLock = performance.now() + 900;
    scrollTo({ top: to.offsetTop, behavior: reduced ? 'auto' : 'smooth' });
  }, { passive: false });
  // bấm vào trang đôi: mở bản dàn trang đúng trang đó (phóng to, lật trang)
  mvList.forEach(mv => $('.mv-sp', mv).addEventListener('click', () => setMode('book', +mv.dataset.page)));
  const snap = () => root.classList.toggle('mv-on', desk() && !isBook());
  deskMQ.addEventListener('change', snap);
  snap();

  /* hiện dần khung chữ */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -12% 0px' });
  $$('[data-reveal]').forEach(el => io.observe(el));

  /* ================= DÀN TRANG: lật trang ================= */
  const book = $('#book'), stage = $('#bv-stage');
  let sps = [];
  const ensureBook = () => {   // dựng bản dàn trang từ <template> ở lần mở đầu tiên
    const tpl = $('#bv-tpl');
    if (tpl) { stage.append(tpl.content); tpl.remove(); }
    if (!sps.length && stage) sps = $$(':scope > .spread', stage);
  };
  const range = $('#bv-range'), count = $('#bv-count'), zoomBtn = $('#bv-zoom');
  const prevBtn = $('.bv-prev'), nextBtn = $('.bv-next');
  let cur = 0, half = 0, single = false, busy = false, zoomed = false;

  const ar = () => {
    const v = (sps[0] && sps[0].style.getPropertyValue('--ar') || '3/1').split('/');
    return +v[0] / +v[1];
  };
  const fit = () => {
    if (!stage) return;
    single = innerHeight > innerWidth;      // màn dọc: từng trang đơn; xoay ngang: cả trang đôi
    const pa = single ? ar() / 2 : ar();
    const small = innerWidth < 900;
    const aw = innerWidth - (single ? 16 : small ? 24 : 150), ah = innerHeight - (small && !single ? 48 + 48 : 56 + 72);
    const w = Math.min(aw, ah * pa);
    stage.style.setProperty('--sw', w + 'px');
    stage.style.setProperty('--sh', w / pa + 'px');
    stage.style.setProperty('--spw', (single ? 2 * w : w) + 'px');
    stage.classList.toggle('single', single);
  };
  const warm = i => [i - 1, i, i + 1, i + 2].forEach(k => sps[k] && $$('img', sps[k]).forEach(im => { im.loading = 'eager'; }));
  const update = () => {
    const total = sps.length;
    count.textContent = single ? `Trang ${cur * 2 + half + 1} / ${total * 2}` : `Trang đôi ${cur + 1} / ${total}`;
    range.max = total - 1;
    range.value = cur;
    prevBtn.disabled = cur === 0 && half === 0;
    prog.style.transform = `scaleX(${(cur + (single ? half / 2 : 0) + 1) / total})`;
    store.set('gtr:book:' + n, cur);
    try { history.replaceState(null, '', '#trang-' + sps[cur].dataset.page); } catch { }
  };
  const show = (i, h = 0) => {
    sps.forEach((s, k) => s.classList.toggle('cur', k === i));
    cur = i;
    half = h;
    stage.style.setProperty('--half', h);
    warm(i);
    update();
  };
  const goNext = () => { const a = $('.ch-nav .next'); if (a) location.href = a.href; };
  const setZoom = (z, e) => {
    zoomed = z;
    if (z) {   // khung trang lúc chưa phóng to: mốc để tính điểm phóng / kéo
      const r = stage.getBoundingClientRect();
      stage.style.transformOrigin = e ? `${(e.clientX - r.left) / r.width * 100}% ${(e.clientY - r.top) / r.height * 100}%` : '50% 50%';
      stage.dataset.r = JSON.stringify([r.left, r.top, r.width, r.height]);
    }
    stage.classList.toggle('zoomed', z);
    book.classList.toggle('zoomed', z);
    zoomBtn.textContent = z ? 'Thu nhỏ' : 'Phóng to';
  };
  const face = (sp, cls, left) => {
    const f = document.createElement('div');
    f.className = 'face ' + cls;
    const c = sp.cloneNode(true);
    c.classList.add('cur');
    c.classList.remove('top');
    c.style.clipPath = '';
    c.style.left = left;
    f.append(c);
    return f;
  };
  const turn = dir => {
    if (busy || !sps.length) return;
    if (zoomed) setZoom(false);
    if (single) {   // trang đơn: trượt sang nửa kia, hết trang đôi thì sang trang đôi kế
      const h = half + dir;
      if (h === 0 || h === 1) { half = h; stage.style.setProperty('--half', h); update(); return; }
      const to = cur + dir;
      if (to < 0) return;
      if (to >= sps.length) return goNext();
      show(to, dir > 0 ? 0 : 1);
      if (!reduced) stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
      return;
    }
    const to = cur + dir;
    if (to < 0) return;
    if (to >= sps.length) return goNext();
    if (reduced) return show(to);
    busy = true;
    const A = sps[cur], B = sps[to], fwd = dir > 0;
    // tờ giấy: mặt trước = nửa trang đang lật của A, mặt sau = nửa trang tương ứng của B
    const leaf = document.createElement('div');
    leaf.className = 'leaf ' + (fwd ? 'fwd' : 'back');
    leaf.append(face(A, 'f', fwd ? '-100%' : '0'), face(B, 'b', fwd ? '0' : '-100%'));
    B.classList.add('cur');
    A.classList.add('top');
    A.style.clipPath = fwd ? 'inset(0 50% 0 0)' : 'inset(0 0 0 50%)';
    stage.append(leaf);
    warm(to);
    leaf.animate([{ transform: 'rotateY(0deg)' }, { transform: `rotateY(${fwd ? -180 : 180}deg)` }],
      { duration: 950, easing: 'cubic-bezier(.5, .05, .25, 1)' }).finished.then(() => {
      leaf.remove();
      A.classList.remove('top');
      A.style.clipPath = '';
      busy = false;
      show(to);
    });
  };

  if (book) {
    prevBtn.addEventListener('click', () => turn(-1));
    nextBtn.addEventListener('click', () => turn(1));
    range.addEventListener('input', () => { if (zoomed) setZoom(false); show(+range.value); });
    zoomBtn.addEventListener('click', () => setZoom(!zoomed));
    let down = null, lastTap = null;
    const clampPct = v => Math.max(0, Math.min(100, v));
    book.addEventListener('pointerdown', e => {
      if (e.target.closest('button, input')) return;
      const o = getComputedStyle(stage).transformOrigin.split(' ').map(parseFloat);
      const r = stage.dataset.r ? JSON.parse(stage.dataset.r) : [0, 0, 1, 1];
      down = { x: e.clientX, y: e.clientY, ox: o[0] / r[2] * 100, oy: o[1] / r[3] * 100 };
    });
    book.addEventListener('pointerup', e => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down = null;
      if (!zoomed && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) return turn(dx < 0 ? 1 : -1);   // vuốt
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8 || !e.target.closest('#bv-stage')) return;
      // bấm / chạm một lần: nửa trái = trang trước, nửa phải = trang sau.
      // Phóng to / thu nhỏ chỉ bằng nút "Phóng to" hoặc bấm đúp — không còn lẫn với lật trang.
      const now = Date.now();
      if (lastTap && now - lastTap.t < 320 && Math.abs(e.clientX - lastTap.x) < 30) {   // bấm đúp: huỷ lần lật vừa rồi
        clearTimeout(lastTap.timer);
        lastTap = null;
        return setZoom(!zoomed, e);
      }
      const r = stage.getBoundingClientRect(), dir = (e.clientX - r.left) / r.width < .5 ? -1 : 1;
      lastTap = { t: now, x: e.clientX, timer: setTimeout(() => { lastTap = null; if (!zoomed) turn(dir); }, 260) };
    });
    stage.addEventListener('pointermove', e => {   // con trỏ chỉ hướng lật
      if (zoomed || e.pointerType === 'touch') return;
      const r = stage.getBoundingClientRect();
      stage.dataset.side = (e.clientX - r.left) / r.width < .5 ? 'prev' : 'next';
    });
    book.addEventListener('pointermove', e => {
      if (!zoomed || !stage.dataset.r) return;
      const [l, t, w, h] = JSON.parse(stage.dataset.r);
      if (e.pointerType === 'touch') {   // cảm ứng: kéo để xem quanh trang (kéo sang trái -> xem phần bên phải)
        if (!down) return;
        stage.style.transformOrigin = `${clampPct(down.ox - (e.clientX - down.x) / w * 100 * 0.8)}% ${clampPct(down.oy - (e.clientY - down.y) / h * 100 * 0.8)}%`;
        return;
      }
      stage.style.transformOrigin = `${clampPct((e.clientX - l) / w * 100)}% ${clampPct((e.clientY - t) / h * 100)}%`;   // chuột: rê để xem quanh
    });
    addEventListener('keydown', e => {
      if (!isBook() || e.target.closest('input, textarea')) return;
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); turn(1); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); turn(-1); }
      if (e.key === 'Escape') zoomed ? setZoom(false) : setMode('read');
    });
    addEventListener('resize', () => { if (isBook()) { fit(); stage.style.setProperty('--half', half); update(); } });
  }

  /* ================= chuyển cách đọc ================= */
  const sceneOf = page => {
    let sc = scenes[0];
    scenes.forEach(s => { if (+s.dataset.page <= page) sc = s; });
    return sc;
  };
  function setMode(m, page) {
    const bk = m === 'book' && !!book;
    if (!bk && isBook() && sps[cur]) {          // rời dàn trang: cuộn tới đúng cảnh của trang đang xem
      root.classList.remove('mode-book');
      book.hidden = true;
      const pg = +sps[cur].dataset.page;
      const sc = sceneOf(pg);
      const mv = desk() && mvList.find(v => +v.dataset.page === pg);
      if (mv) {
        snap();
        scrollTo(0, mv.offsetTop);
      } else if (sc) {
        const t = sc.querySelector('.cs-text') || sc;
        scrollTo(0, t.getBoundingClientRect().top + scrollY - innerHeight * .18);
      }
      try { history.replaceState(null, '', location.pathname + location.search); } catch { }
    }
    root.classList.toggle('mode-book', bk);
    if (book) book.hidden = !bk;
    $$('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === (bk ? 'book' : 'read')));
    store.set('gtr:mode', bk ? 'book' : 'read');
    snap();
    if (bk) {
      ensureBook();
      bar.classList.remove('hide');
      bar.classList.add('solid');
      fit();
      const now = desk() ? mvCur : active;
      const p = page || +(now && now.dataset.page) || 0;
      const i = sps.findIndex(s => +s.dataset.page >= p);
      show(Math.max(0, i), 0);
    } else {
      onScroll();
      if (mvCur && desk()) living.attach(mvCur);   // chạy lại ảnh "sống" sau khi đóng bản dàn trang
    }
  }
  $$('.mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $$('.cs-pg').forEach(b => b.addEventListener('click', () => setMode('book', +b.dataset.goto)));

  /* mở trang: #trang-N → dàn trang tại trang N; nếu lần trước đọc kiểu dàn trang thì mở lại kiểu đó */
  const hm = location.hash.match(/^#trang-(\d+)/);
  const lastBook = store.get('gtr:book:' + n);
  if (hm && book) setMode('book', +hm[1]);
  else if (store.get('gtr:mode') === 'book' && book) {
    ensureBook();
    setMode('book', sps[lastBook] ? +sps[lastBook].dataset.page : 0);
  }
  else {
    onScroll();
    const saved = store.get('gtr:pos:' + n);
    if (typeof saved === 'number' && saved > .04 && saved < .97 && !location.hash) {
      const box = $('#resume');
      box.hidden = false;
      $('#resume-yes').onclick = () => {
        const pr = readEl(), h = pr.offsetHeight - innerHeight * .6;
        scrollTo({ top: pr.offsetTop - innerHeight * .3 + saved * h, behavior: 'smooth' });
        box.hidden = true;
      };
      $('#resume-no').onclick = () => { box.hidden = true; };
      setTimeout(() => { box.hidden = true; }, 12000);
    }
  }

  const jump = new URLSearchParams(location.search).get('y');   // ?y=1200: mở sẵn ở vị trí cuộn (để chụp màn hình)
  if (jump) scrollTo(0, +jump);
})();
