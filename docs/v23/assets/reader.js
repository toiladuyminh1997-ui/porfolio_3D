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
    const top = prose.offsetTop, h = prose.offsetHeight - innerHeight * .6;
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

  /* trang sách đúng bản dàn (máy tính): nhân bản trang đôi từ <template> khi khung sắp lộ ra.
     Lấy sẵn bảng trang trước khi ensureBook() chuyển nội dung template sang bản lật trang. */
  const tplEl = $('#bv-tpl');
  const spByPage = new Map(tplEl ? $$('.spread', tplEl.content).map(s => [s.dataset.page, s]) : []);
  const sheetIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    sheetIO.unobserve(e.target);
    const s = spByPage.get(e.target.dataset.sp);
    if (s) { const c = s.cloneNode(true); c.classList.add('cur'); e.target.append(c); }
  }), { rootMargin: '150% 0px' });
  $$('.cs-sheet').forEach(el => sheetIO.observe(el));

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
      const sc = sceneOf(+sps[cur].dataset.page);
      if (sc) {
        const t = sc.querySelector('.cs-text') || sc;
        scrollTo(0, t.getBoundingClientRect().top + scrollY - innerHeight * .18);
      }
      try { history.replaceState(null, '', location.pathname + location.search); } catch { }
    }
    root.classList.toggle('mode-book', bk);
    if (book) book.hidden = !bk;
    $$('.mode button').forEach(b => b.classList.toggle('on', b.dataset.mode === (bk ? 'book' : 'read')));
    store.set('gtr:mode', bk ? 'book' : 'read');
    if (bk) {
      ensureBook();
      bar.classList.remove('hide');
      bar.classList.add('solid');
      fit();
      const p = page || +(active && active.dataset.page) || 0;
      const i = sps.findIndex(s => +s.dataset.page >= p);
      show(Math.max(0, i), 0);
    } else {
      onScroll();
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
        const h = prose.offsetHeight - innerHeight * .6;
        scrollTo({ top: prose.offsetTop - innerHeight * .3 + saved * h, behavior: 'smooth' });
        box.hidden = true;
      };
      $('#resume-no').onclick = () => { box.hidden = true; };
      setTimeout(() => { box.hidden = true; }, 12000);
    }
  }

  const jump = new URLSearchParams(location.search).get('y');   // ?y=1200: mở sẵn ở vị trí cuộn (để chụp màn hình)
  if (jump) scrollTo(0, +jump);
})();
