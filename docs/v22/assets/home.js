/* Trang chủ: sương mù, chữ tiêu đề, cuộn mượt, mục lục kiểu Immersive Garden */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  };

  /* ---------- "Đọc tiếp" ---------- */
  const last = store.get('gtr:last');
  if (last && typeof last.n === 'number') {
    const a = $('#continue-link');
    a.href = last.url || (window.CH_URL || '/chuong/{n}/').replace('{n}', last.n);
    a.hidden = false;
  }

  /* ---------- sương mù (canvas 2D, nhẹ) — chỉ có ở phần đầu dạng ảnh ---------- */
  const cv = $('#fog');
  if (cv && !reduce) {
    const ctx = cv.getContext('2d');
    let W, H, dpr, mx = 0, my = 0;
    const puffs = Array.from({ length: 22 }, (_, i) => ({
      x: Math.random(), y: .35 + Math.random() * .75, r: .25 + Math.random() * .35,
      s: (.00003 + Math.random() * .00008) * (i % 2 ? 1 : -1), a: .025 + Math.random() * .045, d: .3 + Math.random() * .7,
    }));
    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = cv.width = cv.clientWidth * dpr; H = cv.height = cv.clientHeight * dpr;
    };
    size(); addEventListener('resize', size);
    addEventListener('pointermove', e => { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; });
    let visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(cv);
    const tick = t => {
      requestAnimationFrame(tick);
      if (!visible) return;
      ctx.clearRect(0, 0, W, H);
      for (const p of puffs) {
        p.x += p.s * 16; if (p.x > 1.4) p.x = -.4; if (p.x < -.4) p.x = 1.4;
        const x = (p.x + mx * .04 * p.d) * W, y = (p.y + Math.sin(t / 4000 + p.r * 9) * .015 + my * .03 * p.d) * H;
        const r = p.r * Math.max(W, H);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(225,230,238,${p.a})`);
        g.addColorStop(1, 'rgba(225,230,238,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    };
    requestAnimationFrame(tick);
  }

  /* ---------- mục lục: ảnh theo con trỏ + đổi màu nền ---------- */
  const list = $('.toc-list');
  const ci = $('#cursor-img');
  const ciImg = ci && $('img', ci);
  const body = document.body;
  const baseBg = getComputedStyle(body).backgroundColor;
  let tx = innerWidth / 2, ty = innerHeight / 2, cx = tx, cy = ty;
  addEventListener('pointermove', e => { tx = e.clientX; ty = e.clientY; });
  (function follow() {
    cx += (tx - cx) * .12; cy += (ty - cy) * .12;
    if (ci) ci.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%) rotate(${(tx - cx) * .02}deg)`;
    requestAnimationFrame(follow);
  })();
  $$('a.toc-row').forEach(row => {
    row.addEventListener('pointerenter', () => {
      list.classList.add('hovering');
      body.style.backgroundColor = row.dataset.bg;
      body.style.setProperty('--accent', row.dataset.accent);
      if (row.dataset.img && ciImg) { ciImg.src = row.dataset.img; ci.classList.add('on'); }
    });
    row.addEventListener('pointerleave', () => {
      list.classList.remove('hovering');
      body.style.backgroundColor = baseBg;
      ci && ci.classList.remove('on');
    });
  });

  /* ---------- bản lợn rừng: các hiệu ứng học từ Dogstudio ---------- */
  if ($('#boar')) {
    // 1) mục lục sáng theo vị trí cuộn: chương nằm giữa màn hình sáng rõ, còn lại mờ;
    //    cảnh nhuộm màu chương đó (hero-boar.js đọc .toc-row.is-active)
    const rows = $$('a.toc-row');
    let activeRow = null, ticking = false;
    const pick = () => {
      ticking = false;
      const r = list.getBoundingClientRect(), mid = innerHeight / 2;
      let best = null;
      if (r.top < mid && r.bottom > mid) {
        let bd = Infinity;
        for (const row of rows) {
          const b = row.getBoundingClientRect(), d = Math.abs(b.top + b.height / 2 - mid);
          if (d < bd) { bd = d; best = row; }
        }
      }
      if (best === activeRow) return;
      activeRow && activeRow.classList.remove('is-active');
      activeRow = best;
      list.classList.toggle('scrolling', !!best);
      if (best) {
        best.classList.add('is-active');
        if (!list.classList.contains('hovering')) {
          body.style.backgroundColor = best.dataset.bg;
          body.style.setProperty('--accent', best.dataset.accent);
        }
      } else if (!list.classList.contains('hovering')) {
        body.style.backgroundColor = baseBg;
      }
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(pick); } }, { passive: true });
    pick();

    // 2) con trỏ vòng tròn, to ra khi đưa lên chữ bấm được
    if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
      const dot = document.createElement('div');
      dot.className = 'cursor-ring';
      document.body.appendChild(dot);
      body.classList.add('has-cursor');
      let x = -100, y = -100, sx = x, sy = y;
      addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; });
      document.addEventListener('pointerover', e => dot.classList.toggle('big', !!e.target.closest('a, button')));
      document.addEventListener('pointerleave', () => { x = y = -100; });
      (function move() {
        sx += (x - sx) * .2; sy += (y - sy) * .2;
        dot.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%)`;
        requestAnimationFrame(move);
      })();
    }
  }

  /* ---------- GSAP: tiêu đề, cuộn ---------- */
  // chờ phông tiêu đề tải xong (tối đa 1,5s) rồi mới hiện chữ: tránh tiêu đề nhảy dòng khi đổi phông
  const fontsReady = Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise(r => setTimeout(r, 1500))]);
  fontsReady.then(() => document.documentElement.classList.add('fonts-ok'));
  if (!window.gsap || reduce) return;
  document.documentElement.classList.add('js-anim');
  gsap.registerPlugin(ScrollTrigger);

  if (window.Lenis) {
    const lenis = new Lenis({ lerp: .09 });
    const jump = new URLSearchParams(location.search).get('y');   // ?y=1200: mở sẵn ở vị trí cuộn (để chụp màn hình)
    if (jump) requestAnimationFrame(() => lenis.scrollTo(+jump, { immediate: true }));
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (id.length > 1) { e.preventDefault(); lenis.scrollTo(id, { offset: -40 }); }
    }));
  }

  const intro = gsap.timeline({ defaults: { ease: 'expo.out' }, paused: true });
  fontsReady.then(() => intro.play());
  if ($('.haze')) {   // phần đầu 3D
    intro.from('.haze', { opacity: 0, duration: 3, ease: 'power2.out' }, 0)
      .from('.hero-title .ch', { yPercent: 110, opacity: 0, rotate: 6, duration: 1.6, stagger: .035 }, .6)
      .from('.hero-kicker, .hero-en', { opacity: 0, y: 20, duration: 1.4, stagger: .15 }, 1.2)
      .from('.hero .scroll-cue', { opacity: 0, duration: 1 }, 1.8);
    gsap.to('.hero-text', { yPercent: -60, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: '70% top', scrub: true } });
    gsap.to('.hero-kicker', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: '30% top', scrub: true } });
  } else {            // phần đầu ảnh + sương
    intro.from('.hero-img img', { scale: 1.35, duration: 3.2, ease: 'power3.out' }, 0)
      .from('.hero-title .ch', { yPercent: 110, opacity: 0, rotate: 6, duration: 1.6, stagger: .035 }, .3)
      .from('.hero-kicker, .hero-en', { opacity: 0, y: 20, duration: 1.4, stagger: .15 }, 1)
      .from('.hero .scroll-cue', { opacity: 0, duration: 1 }, 1.6);
    gsap.to('.hero-img img', { yPercent: 18, scale: 1.25, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    // bản lợn rừng (#boar): chữ cuộn lên tự nhiên qua con lợn, không mờ đi
    if (!$('#boar')) gsap.to('.hero-text', { yPercent: -40, opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: '70% top', scrub: true } });
    if ($('#fog')) gsap.to('#fog', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: '40% top', end: 'bottom top', scrub: true } });
  }

  gsap.to('.quote-text .w', {
    opacity: 1, stagger: .1, ease: 'none',
    scrollTrigger: { trigger: '.quote', start: 'top 70%', end: 'center 45%', scrub: true },
  });
  gsap.from('.quote .btn', { opacity: 0, y: 30, duration: 1, scrollTrigger: { trigger: '.quote .btn', start: 'top 90%' } });

  $$('.toc-row').forEach(row => gsap.from(row, {
    opacity: .3, y: 50, duration: 1.2, ease: 'expo.out', clearProps: 'opacity,transform',   // để CSS làm mờ/sáng chương
    scrollTrigger: { trigger: row, start: 'top 92%' },
  }));

  // chữ trượt lên khi cuộn tới (kiểu "appear-fade-up" của Dogstudio)
  if ($('#boar')) {
    intro.from('.hero-intro', { opacity: 0, y: 30, duration: 1.4 }, 1.4);
    $$('.toc-head h2, .toc-head span, .foot > div').forEach(el => gsap.from(el, {
      yPercent: 60, opacity: 0, duration: 1.4, ease: 'expo.out', clearProps: 'all',
      scrollTrigger: { trigger: el, start: 'top bottom' },   // 'bottom' để chữ sát đáy trang vẫn hiện
    }));
  }
})();
