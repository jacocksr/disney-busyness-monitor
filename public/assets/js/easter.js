/* Park Pulse easter egg: tap the center Pulse dock button 5 times within 2 seconds.
   Park emojis rain down and pile up with physics. Firework buttons then appear.
   Each button's emoji shows how many rockets it fires: sparkler = 1, firecracker = 2, fireworks = 3.
   The rockets arc downward and explode on the floor as real firework shells (peony, chrysanthemum, willow, ring,
   crossette), blasting the emojis away. Some shells get a second burst a moment later.
   The floor stays closed until HOLD_MS after the last rocket explodes.
   If no firework is fired, the floor drops by itself FLOOR_MAX after the trigger.
   Self-contained: no libraries, no CSS file. Respects reduced-motion and the Animations setting. */
(function () {
  'use strict';
  var NEED = 5, WINDOW = 2000, COUNT = 30, MAX_SETS = 10, SPAWN = 1000, HOLD_MS = 1000, FLOOR_MAX = 7000, HARD_STOP = 16000;
  var G = 3800, E_BALL = 0.7, E_WALL = 0.7, E_FLOOR = 0.65, MU = 0.35, INERTIA = 2 / 3, KF = 1 + 1 / INERTIA;
  var BOUNCE_MIN = 40, STEP = 1 / 240, ITER = 5, SLOP = 0.2, PUSH = 0.8;
  var REST_V = 50, REST_W = 40, ROLL_K = 4, ROLL_DEC = 280, SPIN_K = 4;
  var WAKE_V = 80, SWIPE_R = 16, MAX_V = 2200, MIN_SWIPE = 150;
  var BTN_DELAY = 1000, BLAST = 3400, LIFT = 1200, MAXB = 3600, UPBIAS = 0.3;
  var ROCKET_R = 9, ROCKET_GRAV = 6000, ROCKET_V = 1800, SAFETY_S = 2;
  var DRIFT_MIN = 50, DRIFT_MAX = 130, TRAIL_N = 6;
  var STAGGER_MIN = 80, STAGGER_MAX = 220;
  var FX_FLASH_S = 0.5, SECOND_BURST_P = 0.5;
  var SHELLS = ['peony', 'chrysanthemum', 'willow', 'ring', 'crossette'];
  var FW_EMOJI = ['\uD83C\uDF87', '\uD83E\uDDE8', '\uD83C\uDF86'];
  var EMOJI_FILES = ['MKEmoji_1_1023x1023.png', 'EPCOTEmoji_1_1023x1023.png', 'HSEmoji_1_1023x1023.png', 'AKEmoji_1_1023x1023.png'];
  var EMOJI_FILES_FIX = { 3: 'AKEmoji_1_1023x1022.png' };
  var FW_VARS = ['--pp-fw-gold', '--pp-fw-pink', '--pp-fw-teal', '--pp-fw-purple'];
  var FW_FALLBACK = [[255, 209, 102], [255, 111, 181], [76, 214, 192], [180, 140, 255]];
  var WHITE = [255, 255, 255];
  var taps = [], running = false, show = null, imgs = null, probe = null;

  function motionOff() {
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return reduced || (window.ParkPulseMotion && window.ParkPulseMotion.enabled === false);
  }

  function loadImgs() {
    if (imgs) return;
    imgs = EMOJI_FILES.map(function (f, i) {
      var im = new Image();
      im.src = '/images/' + (EMOJI_FILES_FIX[i] || f);
      return im;
    });
  }

  /* The center dock tab is created by nav.js after load, so listen on the document. */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('#ppNavigation a.pp-tab-center') : null;
    if (!a) return;
    var now = Date.now();
    loadImgs();
    taps.push(now);
    taps = taps.filter(function (t) { return now - t <= WINDOW; });
    if (taps.length >= NEED) {
      taps = [];
      if (!running) start();
      else if (show && show.sets < MAX_SETS) show.add();
    }
  }, true);

  function bounce(e, v) {
    var s = (v - BOUNCE_MIN) / 300;
    return s <= 0 ? 0 : Math.min(e, e * s);
  }
  function wake(b) { if (b.sleep) { b.sleep = false; b.rest = 0; } }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function rgba(c, a) { return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + a + ')'; }
  function mix(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  /* Equal 1/3 chance of 1, 2 or 3 rockets. */
  function pickCount() {
    return 1 + Math.floor(Math.random() * 3);
  }

  /* Reads the same theme-aware firework colors as the park-icon fireworks, as [r,g,b] arrays. */
  function toRGB(color, fallback) {
    try {
      if (!probe) {
        var c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        probe = c.getContext('2d', { willReadFrequently: true });
      }
      probe.clearRect(0, 0, 1, 1);
      probe.fillStyle = color;
      probe.fillRect(0, 0, 1, 1);
      var d = probe.getImageData(0, 0, 1, 1).data;
      return d[3] ? [d[0], d[1], d[2]] : fallback;
    } catch (err) { return fallback; }
  }
  function fwPalette() {
    var cs = getComputedStyle(document.documentElement);
    return FW_VARS.map(function (name, i) {
      var v = cs.getPropertyValue(name).trim();
      return v ? toRGB(v, FW_FALLBACK[i]) : FW_FALLBACK[i];
    });
  }

  function start() {
    if (motionOff()) return;
    running = true;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = window.innerWidth, H = window.innerHeight;
    /* Shells scale with the screen so a burst fills a phone without leaving it. */
    var FXS = Math.max(0.7, Math.min(1.3, Math.min(W, H * 0.8) / 600));
    var cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:101';
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    document.body.appendChild(cv);
    var ctx = cv.getContext('2d');
    var prevTouch = document.documentElement.style.touchAction;
    document.documentElement.style.touchAction = 'none';

    var balls = [], rockets = [], fxs = [], btns = [], box = null, btnArmed = true, ceilOn = false;
    var t0 = performance.now(), last = t0, floorOn = true, closeAt = 0, acc = 0, raf = 0, lp = null, simT = 0, setAt = 0, trigAt = 0;

    function spawnSet(base) {
      for (var i = 0; i < COUNT; i++) {
        var r = 17 + Math.random() * 9;
        balls.push({
          x: r + Math.random() * Math.max(1, W - 2 * r), y: -r - Math.random() * 60,
          vx: (Math.random() - 0.5) * 240, vy: Math.random() * 200,
          r: r, m: r * r, a: (Math.random() - 0.5) * 1.2, w: (Math.random() - 0.5) * 6,
          at: base + (i * SPAWN) / COUNT + Math.random() * 40,
          k: Math.floor(Math.random() * EMOJI_FILES.length),
          live: false, gone: false, floor: false, touch: false, sleep: false, rest: 0, freed: false, rocket: false
        });
      }
    }
    spawnSet(0);
    show = {
      sets: 1,
      add: function () {
        var el = performance.now() - t0;
        show.sets++;
        setAt = el; trigAt = el; btnArmed = true; ceilOn = false;
        spawnSet(el);
        if (!floorOn) {
          floorOn = true;
          balls.forEach(function (b) {
            if (!b.live || b.gone) return;
            if (b.y > H - b.r) b.gone = true;
            else if (b.x > b.r && b.x < W - b.r) b.freed = false;
          });
        }
      }
    };

    function collide(p, q) {
      if (p.rocket || q.rocket) return;
      var dx = q.x - p.x, dy = q.y - p.y, min = p.r + q.r, d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) return;
      var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      var vn = (q.vx - p.vx) * nx + (q.vy - p.vy) * ny;
      if (vn < -WAKE_V) { wake(p); wake(q); }
      var ip = p.sleep ? 0 : 1 / p.m, iq = q.sleep ? 0 : 1 / q.m, sum = ip + iq;
      if (sum === 0) return;
      var pen = min - d - SLOP;
      if (pen > 0) {
        var c = (PUSH * pen) / sum;
        p.x -= nx * c * ip; p.y -= ny * c * ip;
        q.x += nx * c * iq; q.y += ny * c * iq;
      }
      p.touch = true; q.touch = true;
      var jn = 0;
      if (vn < 0) {
        jn = (-(1 + bounce(E_BALL, -vn)) * vn) / sum;
        p.vx -= jn * ip * nx; p.vy -= jn * ip * ny;
        q.vx += jn * iq * nx; q.vy += jn * iq * ny;
      }
      var tx = -ny, ty = nx;
      var vt = (p.vx - q.vx) * tx + (p.vy - q.vy) * ty + p.w * p.r + q.w * q.r;
      var jt = -vt / (KF * sum), lim = MU * jn;
      if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
      p.vx += jt * ip * tx; p.vy += jt * ip * ty;
      q.vx -= jt * iq * tx; q.vy -= jt * iq * ty;
      if (!p.sleep) p.w += jt / (INERTIA * p.m * p.r);
      if (!q.sleep) q.w += jt / (INERTIA * q.m * q.r);
    }

    function bounds() {
      for (var k = 0; k < balls.length; k++) {
        var b = balls[k];
        if (!b.live || b.gone || b.sleep) continue;
        if (b.rocket) {
          if (b.y > H - b.r) { b.y = H - b.r; b.vy = 0; if (b.hitAt === null) b.hitAt = simT; }
          continue;
        }
        if (!b.freed) {
          if (b.x < b.r) { b.x = b.r; if (b.vx < 0) b.vx = -b.vx * bounce(E_WALL, -b.vx); }
          else if (b.x > W - b.r) { b.x = W - b.r; if (b.vx > 0) b.vx = -b.vx * bounce(E_WALL, b.vx); }
        }
        if (ceilOn && b.y < b.r) { b.y = b.r; if (b.vy < 0) b.vy = -b.vy * bounce(E_WALL, -b.vy); }
        if (floorOn && b.y > H - b.r) {
          b.y = H - b.r;
          var jn = 0;
          if (b.vy > 0) {
            var e = bounce(E_FLOOR, b.vy);
            jn = (1 + e) * b.vy * b.m;
            b.vy = -e * b.vy;
          }
          var vs = b.vx - b.w * b.r;
          var jt = (-vs * b.m) / KF, lim = MU * jn;
          if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
          b.vx += jt / b.m;
          b.w -= jt / (INERTIA * b.m * b.r);
          b.floor = true;
        }
      }
    }

    function step(h, el) {
      var k, m, b, it, dv, dw;
      simT += h;
      for (k = 0; k < balls.length; k++) {
        b = balls[k];
        if (b.gone || b.sleep) continue;
        if (!b.live) { if (el >= b.at) b.live = true; else continue; }
        b.vy += (b.rocket ? ROCKET_GRAV : G) * h;
        if (b.rocket) b.vx += b.ax * h;
        if (!b.rocket) {
          b.vx *= 1 - 0.1 * h;
          b.w *= 1 - 0.1 * h;
          if (b.floor) {
            b.vx *= 1 - ROLL_K * h;
            b.w *= 1 - ROLL_K * h;
          }
          if (b.floor || b.touch) {
            dv = ROLL_DEC * h;
            dw = dv / b.r;
            b.vx = b.vx > dv ? b.vx - dv : (b.vx < -dv ? b.vx + dv : 0);
            b.w = b.w > dw ? b.w - dw : (b.w < -dw ? b.w + dw : 0);
          }
          if (b.touch) b.w *= 1 - SPIN_K * h;
          if ((b.floor || b.touch) && b.vx * b.vx + b.vy * b.vy < REST_V * REST_V && Math.abs(b.w * b.r) < REST_W) b.rest += h;
          else b.rest = 0;
          if (b.rest > 0.25) { b.sleep = true; b.vx = 0; b.vy = 0; b.w = 0; }
        }
        b.floor = false; b.touch = false;
        if (b.sleep) continue;
        b.x += b.vx * h; b.y += b.vy * h; b.a += b.w * h;
      }
      for (it = 0; it < ITER; it++) {
        for (k = 0; k < balls.length; k++) {
          if (!balls[k].live || balls[k].gone) continue;
          for (m = k + 1; m < balls.length; m++) {
            if (balls[m].live && !balls[m].gone) collide(balls[k], balls[m]);
          }
        }
        bounds();
      }
    }

    function hit(ax, ay, px, py, pvx, pvy) {
      for (var k = 0; k < balls.length; k++) {
        var b = balls[k];
        if (!b.live || b.gone || b.rocket) continue;
        if (segDist(b.x, b.y, ax, ay, px, py) > b.r + SWIPE_R) continue;
        wake(b);
        b.vx += (pvx * 0.8 - b.vx) * 0.6;
        b.vy += (pvy * 0.8 - b.vy) * 0.6;
        var sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; sp = MAX_V; }
        b.w += (((px - b.x) * pvy - (py - b.y) * pvx) / (b.r * b.r)) * 0.3;
        if (sp > 500) b.freed = true;
      }
    }
    function onDown(e) { lp = { x: e.clientX, y: e.clientY, t: performance.now() }; }
    function onMove(e) {
      var now = performance.now(), x = e.clientX, y = e.clientY;
      if (lp && now > lp.t) {
        var dt = Math.max(now - lp.t, 8) / 1000;
        var vx = (x - lp.x) / dt, vy = (y - lp.y) / dt;
        if (Math.hypot(vx, vy) > MIN_SWIPE) hit(lp.x, lp.y, x, y, vx, vy);
      }
      lp = { x: x, y: y, t: now };
    }
    function onEnd() { lp = null; }
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onEnd, { passive: true });
    window.addEventListener('pointercancel', onEnd, { passive: true });

    function openFloor() {
      floorOn = false;
      ceilOn = false;
      balls.forEach(function (b) {
        if (b.gone) return;
        wake(b);
        b.vx += (Math.random() - 0.5) * 120;
      });
    }

    function hideBtns(slide) {
      var list = btns, wrap = box;
      btns = [];
      box = null;
      list.forEach(function (el, i) {
        el.style.pointerEvents = 'none';
        if (!el.animate) return;
        if (slide) el.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(170%)', opacity: 1 }], { duration: 380, delay: i * 30, easing: 'cubic-bezier(.5,0,.9,.4)', fill: 'forwards' });
        else el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.6)' }], { duration: 180, fill: 'forwards' });
      });
      setTimeout(function () { if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap); }, slide ? 440 + list.length * 30 : 220);
    }
    function pressBtn(el) {
      var at = btns.indexOf(el);
      if (at < 0) return;
      var n = parseInt(el.dataset.fw, 10) || 1;
      btns.splice(at, 1);
      el.style.pointerEvents = 'none';
      if (el.animate) el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.6)' }], { duration: 180, fill: 'forwards' });
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
      if (!btns.length && box) {
        var wrap = box;
        box = null;
        setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 220);
      }
      volley(n);
    }
    function showBtns() {
      var n = Math.max(1, Math.min(show ? show.sets : 1, MAX_SETS));
      var add = n - btns.length, i, el, cnt;
      btnArmed = false;
      if (add <= 0) return;
      if (!box) {
        box = document.createElement('div');
        box.style.cssText = 'position:fixed;right:12px;top:24%;z-index:102;display:flex;flex-direction:column;flex-wrap:wrap-reverse;align-items:flex-end;gap:8px;max-height:56vh;pointer-events:none';
        document.body.appendChild(box);
      }
      for (i = 0; i < add; i++) {
        /* The rocket count is decided now, and the emoji tells the player: sparkler 1, firecracker 2, fireworks 3. */
        cnt = pickCount();
        el = document.createElement('button');
        el.type = 'button';
        el.dataset.fw = String(cnt);
        el.textContent = FW_EMOJI[cnt - 1];
        el.setAttribute('aria-label', 'Launch ' + cnt + (cnt === 1 ? ' firework' : ' fireworks'));
        /* Theme variables make the button follow light and dark mode automatically. */
        el.style.cssText = 'width:64px;height:64px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid var(--teal,#4cd6c0);background:var(--card-bg-solid,#16294a);color:var(--text,#fff);font-size:2.1rem;line-height:1;box-shadow:0 6px 18px rgba(0,0,0,.35);cursor:pointer;touch-action:manipulation;pointer-events:auto';
        el.addEventListener('click', pressBtn.bind(null, el));
        box.appendChild(el);
        btns.push(el);
        if (el.animate) el.animate([{ transform: 'scale(0) rotate(-12deg)', opacity: 0 }, { transform: 'scale(1.15) rotate(3deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1) rotate(0deg)', opacity: 1 }], { duration: 420, delay: i * 60, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'both' });
      }
    }

    /* Launches n rockets, a little apart in time, each with its own colors and landing spot. */
    function volley(n) {
      var i, delay = 0;
      for (i = 0; i < n; i++) {
        dropRocket(delay);
        delay += STAGGER_MIN + Math.random() * (STAGGER_MAX - STAGGER_MIN);
      }
    }

    /* A rocket falls fast on a gentle arc, ignores the emojis on the way down, and explodes the moment it hits the floor. */
    function dropRocket(delayMs) {
      var pal = fwPalette();
      var i = Math.floor(Math.random() * pal.length);
      var j = (i + 1 + Math.floor(Math.random() * (pal.length - 1))) % pal.length;
      var r = ROCKET_R, d = H + 10;
      var tFall = (-ROCKET_V + Math.sqrt(ROCKET_V * ROCKET_V + 2 * ROCKET_GRAV * d)) / ROCKET_GRAV;
      var x0 = W * 0.1 + Math.random() * W * 0.8;
      var drift = (Math.random() < 0.5 ? -1 : 1) * (DRIFT_MIN + Math.random() * (DRIFT_MAX - DRIFT_MIN));
      if (x0 + drift < 20 || x0 + drift > W - 20) drift = -drift;
      var vx0 = drift / (0.6 * tFall);
      var b = {
        x: x0, y: -r - 10, vx: vx0, vy: ROCKET_V, ax: -0.8 * vx0 / tFall,
        r: r, m: 1, a: 0, w: 0, at: (performance.now() - t0) + delayMs, live: false, gone: false, floor: false, touch: false,
        sleep: false, rest: 0, freed: false, rocket: true, hitAt: null, born: simT + delayMs / 1000, fuse: tFall + SAFETY_S,
        c1: pal[i], c2: pal[j], pal: pal, trail: []
      };
      rockets.push(b);
      balls.push(b);
    }

    /* ---- Firework shells ----
       Every spark is a particle with drag, gravity, a fading trail and an optional glitter flicker. Most sparks
       fly upward because the shell goes off on the floor. */

    function upDir() {
      return Math.random() < 0.85 ? -Math.PI * (0.03 + Math.random() * 0.94) : Math.random() * 6.2832;
    }

    function spark(list, x, y, ang, speed, o) {
      list.push({
        x: x, y: y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        col: o.col, size: o.size || 2.4, drag: o.drag || 1.5, grav: o.grav === undefined ? 380 : o.grav,
        life: o.life, max: o.life, age: 0, trail: [], trailN: o.trailN === undefined ? 10 : o.trailN,
        glitter: !!o.glitter, hot: !!o.hot, ph: Math.random() * 6.2832,
        splitAt: o.splitAt || 0, splitCol: o.splitCol || null
      });
    }

    function burst(f, type, scale, swap) {
      var x = f.x, y = f.y - 4, S = FXS * scale, list = f.parts, i, n, a;
      var c1 = swap ? f.c2 : f.c1, c2 = swap ? f.c1 : f.c2;
      var pale1 = mix(c1, WHITE, 0.35), pale2 = mix(c2, WHITE, 0.35);

      if (type === 'pistil') {
        /* Small white core that pops first. */
        for (i = 0; i < 24; i++) spark(list, x, y, upDir(), rnd(90, 260) * S, { col: WHITE, size: 2, drag: 2.4, grav: 300, life: rnd(0.35, 0.7), trailN: 4, hot: true });
      } else if (type === 'peony') {
        /* Clean round burst in two colors with a few white stars. */
        n = Math.round(72 * scale);
        for (i = 0; i < n; i++) spark(list, x, y, upDir(), rnd(380, 560) * S, { col: i % 5 === 0 ? WHITE : (i % 2 ? c1 : c2), size: 2.6, drag: 1.5, life: rnd(1.1, 1.6), trailN: 8 });
      } else if (type === 'chrysanthemum') {
        /* Dense burst with long trails and glittering tips. */
        n = Math.round(88 * scale);
        for (i = 0; i < n; i++) spark(list, x, y, upDir(), rnd(300, 580) * S, { col: i % 2 ? c1 : pale2, size: 2.2, drag: 1.35, life: rnd(1.5, 2.2), trailN: 16, glitter: i % 4 === 0 });
      } else if (type === 'willow') {
        /* Slow pale sparks that droop in long golden streamers. */
        n = Math.round(58 * scale);
        for (i = 0; i < n; i++) spark(list, x, y, upDir(), rnd(260, 470) * S, { col: i % 3 ? pale1 : WHITE, size: 2.4, drag: 2.1, grav: 240, life: rnd(2.2, 3), trailN: 22 });
      } else if (type === 'ring') {
        /* An outer arch and an inner arch in the two colors. */
        n = Math.max(8, Math.round(40 * scale));
        for (i = 0; i < n; i++) {
          a = -Math.PI - 0.12 + (i / (n - 1)) * (Math.PI + 0.24);
          spark(list, x, y, a, 520 * S, { col: c1, size: 2.8, drag: 1.6, life: rnd(1.1, 1.4), trailN: 9 });
        }
        n = Math.max(6, Math.round(26 * scale));
        for (i = 0; i < n; i++) {
          a = -Math.PI - 0.12 + (i / (n - 1)) * (Math.PI + 0.24);
          spark(list, x, y, a, 300 * S, { col: c2, size: 2.4, drag: 1.6, life: rnd(1, 1.3), trailN: 7 });
        }
      } else if (type === 'crossette') {
        /* Bright stars that each split into four smaller glittering stars. */
        n = Math.round(18 * scale);
        for (i = 0; i < n; i++) spark(list, x, y, upDir(), rnd(380, 520) * S, { col: c1, size: 3, drag: 1.5, life: 1.4, trailN: 10, splitAt: rnd(0.5, 0.7), splitCol: c2 });
      }
    }

    function explode(b, now) {
      var bx = b.x, by = b.y, reach = Math.max(W, H) * 0.9;
      var at = rockets.indexOf(b);
      if (at >= 0) rockets.splice(at, 1);
      b.gone = true;
      ceilOn = true;
      closeAt = now + HOLD_MS;
      setAt = (now - t0) - SPAWN;
      balls.forEach(function (o) {
        if (o.gone || !o.live || o.rocket) return;
        wake(o);
        var dx = o.x - bx, dy = o.y - by, d = Math.hypot(dx, dy) || 1;
        var f = Math.max(0.3, 1 - d / reach);
        var ux = dx / d, uy = dy / d - UPBIAS, un = Math.hypot(ux, uy) || 1;
        ux /= un; uy /= un;
        o.vx += ux * BLAST * f;
        o.vy += uy * BLAST * f - LIFT * f;
        var sp = Math.hypot(o.vx, o.vy);
        if (sp > MAXB) { o.vx *= MAXB / sp; o.vy *= MAXB / sp; }
        o.w += (Math.random() - 0.5) * 20;
        o.freed = false;
      });

      var fx = { x: bx, y: by, t: now, last: now, c1: b.c1, c2: b.c2, pal: b.pal, parts: [], queue: [] };
      var main = SHELLS[Math.floor(Math.random() * SHELLS.length)];
      burst(fx, 'pistil', 1, false);
      burst(fx, main, 1, false);
      if (Math.random() < SECOND_BURST_P) {
        var other = SHELLS[(SHELLS.indexOf(main) + 1 + Math.floor(Math.random() * (SHELLS.length - 1))) % SHELLS.length];
        fx.queue.push({ at: 0.18 + Math.random() * 0.14, type: other, scale: 0.65, done: false });
      }
      fxs.push(fx);
      if (navigator.vibrate) { try { navigator.vibrate(80); } catch (e) {} }
    }

    function draw(b) {
      var im = imgs && imgs[b.k], s = b.r * 2.1;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      if (im && im.complete && im.naturalWidth) {
        ctx.drawImage(im, -s / 2, -s / 2, s, s);
      } else {
        ctx.fillStyle = 'rgba(143,208,255,0.9)';
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 6.2832); ctx.fill();
      }
      ctx.restore();
    }

    /* The trail follows the rocket's recent positions, so it bends with the arc. */
    function drawRocket(b) {
      var tr = b.trail, i, f, n;
      tr.push([b.x, b.y]);
      if (tr.length > TRAIL_N) tr.shift();
      n = tr.length;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (i = 1; i < n; i++) {
        f = i / (n - 1);
        ctx.strokeStyle = rgba(mix(b.c2, b.c1, f), 0.15 + 0.8 * f);
        ctx.lineWidth = 2 + 5 * f;
        ctx.beginPath(); ctx.moveTo(tr[i - 1][0], tr[i - 1][1]); ctx.lineTo(tr[i][0], tr[i][1]); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.1 + 0.75 * f) + ')';
        ctx.lineWidth = 1 + 1.6 * f;
        ctx.beginPath(); ctx.moveTo(tr[i - 1][0], tr[i - 1][1]); ctx.lineTo(tr[i][0], tr[i][1]); ctx.stroke();
      }
      var h = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 1.8);
      h.addColorStop(0, '#ffffff');
      h.addColorStop(0.35, rgba(b.c2, 0.9));
      h.addColorStop(1, rgba(b.c2, 0));
      ctx.fillStyle = h;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.8, 0, 6.2832); ctx.fill();
      ctx.restore();
    }

    /* Advances and draws one explosion: the flash and shock ring first, then every spark with its trail.
       Returns false when nothing is left to show. */
    function drawFx(f, now) {
      var el = (now - f.t) / 1000, dt = Math.min(0.05, (now - f.last) / 1000);
      var i, j, p, q, a, fade, tr, from, drag, keep = [], born = [], pending = false;
      f.last = now;

      for (i = 0; i < f.queue.length; i++) {
        q = f.queue[i];
        if (!q.done && el >= q.at) {
          q.done = true;
          burst(f, q.type, q.scale, true);
          f.flashAt = el;
        }
        if (!q.done) pending = true;
      }

      var fl = el / FX_FLASH_S;
      if (fl < 1) {
        var rad = fl * Math.max(W, H) * 0.55 + 1;
        var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
        g.addColorStop(0, 'rgba(255,255,255,' + 0.85 * (1 - fl) + ')');
        g.addColorStop(0.35, rgba(f.c1, 0.5 * (1 - fl)));
        g.addColorStop(1, rgba(f.c2, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = rgba(f.c2, 0.8 * (1 - fl));
        ctx.lineWidth = 5 * (1 - fl) + 1;
        ctx.beginPath();
        ctx.arc(f.x, f.y, rad * 0.9, 0, 6.2832);
        ctx.stroke();
      }
      /* A small soft flash when the second burst goes off. */
      if (f.flashAt !== undefined && el - f.flashAt < 0.18) {
        var k2 = (el - f.flashAt) / 0.18;
        var g2 = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 90 + 140 * k2);
        g2.addColorStop(0, 'rgba(255,255,255,' + 0.5 * (1 - k2) + ')');
        g2.addColorStop(1, rgba(f.c2, 0));
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(f.x, f.y, 90 + 140 * k2, 0, 6.2832);
        ctx.fill();
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (i = 0; i < f.parts.length; i++) {
        p = f.parts[i];
        p.age += dt;
        p.life -= dt;
        drag = Math.exp(-p.drag * dt);
        p.vx *= drag;
        p.vy = p.vy * drag + p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.trailN) {
          p.trail.push(p.x, p.y);
          if (p.trail.length > p.trailN * 2) p.trail.splice(0, 2);
        }

        if (p.splitAt && p.age >= p.splitAt) {
          a = Math.atan2(p.vy, p.vx);
          for (j = 0; j < 4; j++) {
            spark(born, p.x, p.y, a + 0.785 + j * 1.5708, 190 * FXS, { col: p.splitCol || p.col, size: 2.2, drag: 1.8, life: rnd(0.5, 0.85), trailN: 7, glitter: true });
          }
          continue;
        }
        if (p.life <= 0 || p.y > H + 4) continue;
        keep.push(p);

        a = Math.max(0, p.life / p.max);
        fade = p.glitter
          ? (0.3 + 0.7 * Math.abs(Math.sin(p.age * 26 + p.ph))) * Math.min(1, a * 2)
          : Math.min(1, a * 1.7);

        tr = p.trail;
        if (tr.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(tr[0], tr[1]);
          for (j = 2; j < tr.length; j += 2) ctx.lineTo(tr[j], tr[j + 1]);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = rgba(p.col, 0.22 * fade);
          ctx.lineWidth = p.size * 1.8;
          ctx.stroke();

          from = (tr.length >> 2) << 1;
          ctx.beginPath();
          ctx.moveTo(tr[from], tr[from + 1]);
          for (j = from + 2; j < tr.length; j += 2) ctx.lineTo(tr[j], tr[j + 1]);
          ctx.lineTo(p.x, p.y);
          ctx.strokeStyle = rgba(p.col, 0.6 * fade);
          ctx.lineWidth = p.size * 0.9;
          ctx.stroke();
        }
        ctx.fillStyle = rgba(p.hot ? WHITE : mix(p.col, WHITE, 0.4), fade);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.55 + 0.45 * a), 0, 6.2832);
        ctx.fill();
      }
      ctx.restore();

      f.parts = keep.concat(born);
      return f.parts.length > 0 || pending || fl < 1;
    }

    function finish() {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      document.documentElement.style.touchAction = prevTouch;
      if (box && box.parentNode) box.parentNode.removeChild(box);
      box = null;
      btns = [];
      if (cv.parentNode) cv.parentNode.removeChild(cv);
      show = null;
      running = false;
    }

    function frame(now) {
      var dt = Math.min((now - last) / 1000, 0.05), k, b;
      last = now;
      var el = now - t0;
      acc += dt;
      while (acc >= STEP) { step(STEP, el); acc -= STEP; }
      rockets.slice().forEach(function (o) {
        if (o.gone) { var i = rockets.indexOf(o); if (i >= 0) rockets.splice(i, 1); return; }
        if (o.hitAt !== null || simT - o.born >= o.fuse) explode(o, now);
      });
      if (floorOn && btnArmed && (btns.length || el - setAt > BTN_DELAY)) showBtns();
      if (btns.length && !floorOn) hideBtns(true);
      /* The floor opens HOLD_MS after the last rocket has exploded. Each new explosion restarts the timer. */
      if (floorOn && closeAt && !rockets.length && now >= closeAt) {
        closeAt = 0;
        openFloor();
      }
      /* If nobody fires a rocket, the floor still drops FLOOR_MAX after the trigger so the emojis fall away. */
      if (floorOn && !closeAt && !rockets.length && el - trigAt > FLOOR_MAX) openFloor();
      for (k = 0; k < balls.length; k++) {
        b = balls[k];
        if (!b.live || b.gone) continue;
        if (b.x < -b.r - 30 || b.x > W + b.r + 30 || b.y < -H * 3 || (!floorOn && !b.rocket && b.y > H + b.r + 20)) b.gone = true;
      }
      if (balls.length > 40) balls = balls.filter(function (x) { return !x.gone; });
      var alive = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      fxs = fxs.filter(function (f) { return drawFx(f, now); });
      for (k = 0; k < balls.length; k++) {
        b = balls[k];
        if (b.gone) continue;
        alive++;
        if (b.live) { if (b.rocket) drawRocket(b); else draw(b); }
      }
      if ((alive === 0 && !fxs.length) || el - setAt > HARD_STOP) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
})();
