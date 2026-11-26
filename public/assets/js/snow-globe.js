/* Park Pulse: tilt-reactive snow globe under the unexpanded Best Park Right Now card (Pulse screen).
   Loaded by park-parallax.js only while Settings > Tilt effects is on, and only on touch devices.
   Four park icons bounce inside a round globe using the same tilt gravity as the Pulse Easter egg
   (same orientation math, bounce thresholds and ball collisions, scaled to the globe), and light snow falls
   in the direction of gravity. It hides while the Best Park card is expanded and pauses when it is off screen,
   when the tab is hidden, or when Animations / Reduced Motion are off. Decorative only (aria-hidden). */
(() => {
  'use strict';
  if (window.ParkPulseSnowGlobe) return;

  const EMOJI = ['MKEmoji_1_1023x1023.png', 'EPCOTEmoji_1_1023x1023.png', 'HSEmoji_1_1023x1023.png', 'AKEmoji_1_1023x1022.png'];
  const REF = 240; // reference globe width in px; distances and speeds scale from it
  const G = 1500; // gravity at REF size (the Easter egg uses 3800 across a whole screen)
  const E_BALL = 0.7;
  const E_WALL = 0.6;
  const BOUNCE_MIN = 40; // impacts slower than this (at REF size) do not bounce
  const STEP = 1 / 120;
  const ITER = 3;
  const SLOP = 0.2;
  const PUSH = 0.8;
  const MAX_V = 1600;
  const DRAG = 0.25;
  const ROLL = 1.4;
  const TILT_DEAD = 0.08;
  const SMOOTH = 0.18;
  const FLAKES = 44;
  const DEG = Math.PI / 180;

  let root = null;
  let glass = null;
  let cv = null;
  let ctx = null;
  let imgs = null;
  let enabled = false;
  let bound = false;
  let running = false;
  let inView = true;
  let watched = null;
  let size = 0;
  let sc = 1;
  let R = 0;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let clock = 0;
  let gx = 0;
  let gy = 1;
  let balls = [];
  let flakes = [];

  const rnd = (a, b) => a + Math.random() * (b - a);
  const motionOk = () =>
    window.ParkPulseMotion ? !!window.ParkPulseMotion.enabled : !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function addStyles() {
    if (document.getElementById('ppSnowGlobeStyles')) return;
    const style = document.createElement('style');
    style.id = 'ppSnowGlobeStyles';
    style.textContent = [
      '#ppSnowGlobe{box-sizing:border-box;width:min(256px,66vw);margin:16px auto 0;padding:0 6px 10px;max-height:340px;overflow:hidden;opacity:1;transform:none;pointer-events:none;user-select:none;-webkit-user-select:none;transition:opacity .3s ease,max-height .35s ease,margin-top .35s ease,transform .35s ease}',
      '#ppSnowGlobe[hidden]{display:none!important}',
      '#ppSnowGlobe[data-state=hidden]{max-height:0;margin-top:0;padding-bottom:0;opacity:0;transform:translateY(-10px) scale(.96);visibility:hidden;transition:opacity .25s ease,max-height .35s ease,margin-top .35s ease,transform .3s ease,visibility 0s linear .35s}',
      '#ppSnowGlobe .pp-sg-glass{position:relative;width:100%;aspect-ratio:1/1;border-radius:50%;overflow:hidden;isolation:isolate;border:2px solid color-mix(in srgb,var(--teal,#4cd6c0) 55%,transparent);background:radial-gradient(circle at 50% 30%,#245785 0%,#143460 55%,#0a1c38 100%);box-shadow:inset 0 -18px 30px rgba(0,0,0,.35),inset 0 10px 24px rgba(255,255,255,.08),0 10px 24px rgba(0,0,0,.35)}',
      '#ppSnowGlobe .pp-sg-glass::after{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none;background:radial-gradient(ellipse 38% 24% at 30% 20%,rgba(255,255,255,.32),transparent 70%)}',
      '#ppSnowGlobe .pp-sg-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}',
      '#ppSnowGlobe .pp-sg-base{position:relative;z-index:1;width:64%;height:22px;margin:-10px auto 0;border-radius:8px 8px 16px 16px;background:linear-gradient(180deg,color-mix(in srgb,var(--gold,#ffd166) 80%,#000) 0%,color-mix(in srgb,var(--gold-deep,#f4a300) 60%,#000) 100%);box-shadow:0 6px 14px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.35)}',
      '@media (prefers-reduced-motion:reduce){#ppSnowGlobe,#ppSnowGlobe[data-state=hidden]{transition:none}}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function loadImgs() {
    imgs = EMOJI.map((file) => {
      const im = new Image();
      im.src = '/images/' + file;
      return im;
    });
  }

  function ensureRoot() {
    if (root) return true;
    addStyles();
    const el = document.createElement('div');
    el.id = 'ppSnowGlobe';
    el.hidden = true;
    el.dataset.state = 'hidden';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="pp-sg-glass"><canvas class="pp-sg-canvas"></canvas></div><div class="pp-sg-base"></div>';
    const canvas = el.querySelector('canvas');
    const context = canvas.getContext('2d');
    if (!context) return false;
    root = el;
    glass = el.firstChild;
    cv = canvas;
    ctx = context;
    loadImgs();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (entries) => {
          inView = entries[entries.length - 1].isIntersecting;
          evaluate();
        },
        { threshold: 0 },
      ).observe(root);
    }
    return true;
  }

  function initBalls() {
    const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    const xs = [-0.6, -0.2, 0.2, 0.6];
    balls = order.map((k, i) => ({
      k,
      x: R + xs[i] * R,
      y: R - (i % 2 ? 0.28 : 0.55) * R,
      vx: rnd(-40, 40) * sc,
      vy: 0,
      r: 0.105 * size,
      a: rnd(-0.5, 0.5),
      w: 0,
    }));
  }

  function resetFlake(f, anywhere, dx, dy) {
    f.r = rnd(0.9, 2.6) * sc;
    f.s = rnd(14, 30) * sc * (0.6 + f.r / (2.6 * sc));
    f.ph = rnd(0, Math.PI * 2);
    f.sw = rnd(0.5, 1.2);
    f.amp = rnd(6, 14) * sc;
    f.front = f.r > 1.8 * sc;
    if (anywhere) {
      const a = rnd(0, Math.PI * 2);
      const d = Math.sqrt(Math.random()) * R * 0.95;
      f.x = R + Math.cos(a) * d;
      f.y = R + Math.sin(a) * d;
    } else {
      const ang = Math.atan2(-dy, -dx) + rnd(-1.1, 1.1);
      f.x = R + Math.cos(ang) * R * 0.96;
      f.y = R + Math.sin(ang) * R * 0.96;
    }
  }

  function initFlakes() {
    flakes = [];
    for (let i = 0; i < FLAKES; i++) {
      const f = {};
      resetFlake(f, true, 0, 1);
      flakes.push(f);
    }
  }

  function measure() {
    const w = glass ? glass.clientWidth : 0;
    if (!w) return false;
    if (w === size) return true;
    const old = size;
    size = w;
    sc = w / REF;
    R = w / 2;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!balls.length) initBalls();
    else if (old) {
      const k = w / old;
      balls.forEach((b) => {
        b.x *= k;
        b.y *= k;
        b.vx *= k;
        b.vy *= k;
        b.r = 0.105 * size;
      });
      flakes.forEach((f) => {
        f.x *= k;
        f.y *= k;
        f.r *= k;
        f.s *= k;
        f.amp *= k;
      });
    }
    if (!flakes.length) initFlakes();
    return true;
  }

  function collide(p, q) {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const min = p.r + q.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min || d2 === 0) return;
    const d = Math.sqrt(d2);
    const nx = dx / d;
    const ny = dy / d;
    const pen = min - d - SLOP;
    if (pen > 0) {
      const c = (PUSH * pen) / 2;
      p.x -= nx * c;
      p.y -= ny * c;
      q.x += nx * c;
      q.y += ny * c;
    }
    const vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
    if (vn < 0) {
      const e = -vn > BOUNCE_MIN * sc ? E_BALL : 0;
      const j = (-(1 + e) * vn) / 2;
      p.vx -= j * nx;
      p.vy -= j * ny;
      q.vx += j * nx;
      q.vy += j * ny;
      const vt = (p.vx - q.vx) * -ny + (p.vy - q.vy) * nx;
      const spin = (vt * 0.2) / p.r;
      p.w = Math.max(-12, Math.min(12, p.w - spin));
      q.w = Math.max(-12, Math.min(12, q.w - spin));
    }
  }

  function wall(b, h) {
    const dx = b.x - R;
    const dy = b.y - R;
    const d = Math.hypot(dx, dy);
    const lim = R - b.r - 1;
    if (d <= lim || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    b.x = R + nx * lim;
    b.y = R + ny * lim;
    const vn = b.vx * nx + b.vy * ny;
    if (vn > 0) {
      const e = vn > BOUNCE_MIN * sc ? E_WALL : 0;
      b.vx -= (1 + e) * vn * nx;
      b.vy -= (1 + e) * vn * ny;
    }
    const tx = -ny;
    const ty = nx;
    const vt = b.vx * tx + b.vy * ty;
    const f = Math.min(1, ROLL * h);
    b.vx -= vt * f * tx;
    b.vy -= vt * f * ty;
    b.w += (vt / b.r - b.w) * Math.min(1, 10 * h);
  }

  function step(h) {
    const m = Math.hypot(gx, gy);
    const ex = m < TILT_DEAD ? 0 : gx;
    const ey = m < TILT_DEAD ? 0 : gy;
    const g = G * sc;
    const vmax = MAX_V * sc;
    const damp = Math.max(0, 1 - DRAG * h);
    balls.forEach((b) => {
      b.vx = (b.vx + g * ex * h) * damp;
      b.vy = (b.vy + g * ey * h) * damp;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > vmax) {
        b.vx *= vmax / sp;
        b.vy *= vmax / sp;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.a += b.w * h;
      b.w *= Math.max(0, 1 - 0.3 * h);
    });
    const hh = h / ITER;
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) collide(balls[i], balls[j]);
      }
      balls.forEach((b) => wall(b, hh));
    }
  }

  function updateFlakes(dt) {
    const m = Math.hypot(gx, gy);
    const dx = m < 0.15 ? 0 : gx / m;
    const dy = m < 0.15 ? 1 : gy / m;
    clock += dt;
    flakes.forEach((f) => {
      const sway = Math.sin(clock * f.sw + f.ph) * f.amp;
      f.x += (dx * f.s - dy * sway) * dt;
      f.y += (dy * f.s + dx * sway) * dt;
      if (Math.hypot(f.x - R, f.y - R) > R + 4) resetFlake(f, false, dx, dy);
    });
  }

  function drawFlakes(front) {
    ctx.fillStyle = front ? 'rgba(255,255,255,.88)' : 'rgba(255,255,255,.5)';
    ctx.beginPath();
    flakes.forEach((f) => {
      if (f.front !== front) return;
      ctx.moveTo(f.x + f.r, f.y);
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    });
    ctx.fill();
  }

  function drawBall(b) {
    const im = imgs && imgs[b.k];
    const s = b.r * 2.1;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    if (im && im.complete && im.naturalWidth) ctx.drawImage(im, -s / 2, -s / 2, s, s);
    else {
      ctx.fillStyle = 'rgba(143,208,255,.9)';
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, size, size);
    drawFlakes(false);
    balls.forEach(drawBall);
    drawFlakes(true);
  }

  function angle() {
    const a =
      window.screen && screen.orientation && typeof screen.orientation.angle === 'number'
        ? screen.orientation.angle
        : typeof window.orientation === 'number'
          ? window.orientation
          : 0;
    return (a || 0) * DEG;
  }

  /* Same gravity-in-screen-axes math as easter-tilt.js: x right, y down, each -1..1. */
  function onOrient(event) {
    if (event.beta == null || event.gamma == null) return;
    const b = event.beta * DEG;
    const g = event.gamma * DEG;
    const dx = Math.cos(b) * Math.sin(g);
    const dy = -Math.sin(b);
    const a = angle();
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    gx += (dx * ca + dy * sa - gx) * SMOOTH;
    gy += (-dy * ca - dx * sa - gy) * SMOOTH;
  }

  function frame(now) {
    if (!running) return;
    if (!motionOk()) {
      evaluate();
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    acc += dt;
    while (acc >= STEP) {
      step(STEP);
      acc -= STEP;
    }
    updateFlakes(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function run() {
    if (running || !measure()) return;
    running = true;
    last = performance.now();
    acc = 0;
    window.addEventListener('deviceorientation', onOrient);
    raf = requestAnimationFrame(frame);
  }

  function halt() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('deviceorientation', onOrient);
  }

  function watch(banner) {
    if (watched === banner) return;
    watched = banner;
    new MutationObserver(evaluate).observe(banner, {
      attributes: true,
      attributeFilter: ['aria-expanded', 'hidden', 'class'],
      subtree: true,
      childList: true,
    });
  }

  function evaluate() {
    if (!enabled || !motionOk() || !ensureRoot()) {
      halt();
      if (root) {
        root.hidden = true;
        root.dataset.state = 'hidden';
      }
      return;
    }
    const banner = document.getElementById('bestParkBanner');
    if (!banner) {
      halt();
      root.hidden = true;
      return;
    }
    watch(banner);
    if (root.previousElementSibling !== banner) banner.after(root);
    root.hidden = false;
    const ready = !banner.hidden && !!banner.querySelector('.pp-best-toggle');
    const expanded = !!banner.querySelector('.pp-best-toggle[aria-expanded="true"]');
    const show = ready && !expanded;
    root.dataset.state = show ? 'shown' : 'hidden';
    if (show && inView && !document.hidden) run();
    else halt();
  }

  function bind() {
    if (bound) return;
    bound = true;
    window.addEventListener('hashchange', () => requestAnimationFrame(evaluate));
    window.addEventListener('pageshow', evaluate);
    window.addEventListener('resize', () => {
      if (root && !root.hidden) measure();
    });
    document.addEventListener('visibilitychange', evaluate);
    window.addEventListener('pagehide', halt);
    window.addEventListener('parkpulsemotionchange', evaluate);
    window.addEventListener('parkpulse:motionchange', evaluate);
  }

  function setActive(on) {
    enabled = !!on;
    if (enabled) bind();
    evaluate();
  }

  window.ParkPulseSnowGlobe = Object.freeze({ version: '1.0.0', setActive, isRunning: () => running });
})();
