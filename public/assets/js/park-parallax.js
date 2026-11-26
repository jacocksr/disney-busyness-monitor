/* Park Pulse: opt-in tilt parallax for park artwork (Overview).
   Targets: the expanded park card (#ppParkExpand) and the expanded Best Park Right Now card (#bestParkBanner).
   While a target is showing and the Settings toggle is on, its artwork shifts as the phone tilts.
   Touch devices only. Loaded lazily by park-expand.js. Its styles are injected here and only apply while a target
   has data-parallax=on, so nothing changes when the feature is off.
   Tilt, not shake: the Easter egg input lives separately in easter-tilt.js. */
(() => {
  'use strict';
  if (window.ParkPulseParallax) return;

  const KEY = 'pp_parallax';
  const AMP = 40; // px of shift per unit of gravity change
  const MAX = 22; // px; must stay under OVERHANG
  const OVERHANG = 26; // px the artwork extends past its card while active
  const EASE = 0.12; // per-frame smoothing
  const RECENTER = 0.002; // per reading: slowly treats the current pose as neutral
  const DEG = Math.PI / 180;
  const DEFAULT_HELP = 'The artwork on park cards and the Best Park card shifts slightly as you tilt your phone. Uses your motion sensors.';
  const ON_HELP = 'On. Open a park card or the Best Park card and tilt your phone.';
  const DENIED_HELP = 'Motion access was denied. To try again, quit and reopen Safari, then turn this on and allow it.';
  const OFF_HELP = 'Turn on animations in Settings to use tilt effects.';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  let enabled = false;
  let granted = false;
  let active = false;
  let ref = null;
  let raf = 0;
  let input = null;
  let help = null;
  const cur = { x: 0, y: 0 };
  const tgt = { x: 0, y: 0 };

  const overlayOpen = () => {
    const overlay = document.getElementById('ppParkExpand');
    return !!overlay && !overlay.hidden;
  };
  const targets = [
    {
      find: () => document.getElementById('ppParkExpand'),
      isOn: (el) => !el.hidden,
      observe: { attributes: true, attributeFilter: ['hidden'] },
      el: null,
      on: false,
      watched: false,
    },
    {
      find: () => document.getElementById('bestParkBanner'),
      isOn: (el) =>
        !el.hidden &&
        el.classList.contains('pp-best-evidence-card') &&
        !!el.querySelector('.pp-best-toggle[aria-expanded="true"]') &&
        el.offsetParent !== null &&
        !overlayOpen(),
      observe: { attributes: true, attributeFilter: ['aria-expanded', 'class', 'hidden'], subtree: true, childList: true },
      el: null,
      on: false,
      watched: false,
    },
  ];

  const supported = () =>
    window.isSecureContext !== false &&
    typeof window.DeviceOrientationEvent !== 'undefined' &&
    window.matchMedia('(pointer: coarse)').matches;
  const needsPermission = () => typeof window.DeviceOrientationEvent.requestPermission === 'function';
  const motionOk = () => (window.ParkPulseMotion ? !!window.ParkPulseMotion.enabled : !reduced.matches);
  const clamp = (v) => Math.max(-MAX, Math.min(MAX, v));
  const readPref = () => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch (error) {
      return false;
    }
  };
  const savePref = (on) => {
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch (error) {
      /* storage unavailable */
    }
  };
  const angle = () => {
    const a =
      window.screen && screen.orientation && typeof screen.orientation.angle === 'number'
        ? screen.orientation.angle
        : typeof window.orientation === 'number'
          ? window.orientation
          : 0;
    return (a || 0) * DEG;
  };

  /* Must run inside a user gesture on iOS. Resolves 'granted' or 'denied'. */
  function ask() {
    if (!needsPermission()) return Promise.resolve('granted');
    try {
      return Promise.resolve(window.DeviceOrientationEvent.requestPermission()).catch(() => 'denied');
    } catch (error) {
      return Promise.resolve('denied');
    }
  }

  function onOrientation(event) {
    if (event.beta == null || event.gamma == null) return;
    const b = event.beta * DEG;
    const g = event.gamma * DEG;
    // Gravity in screen axes (x right, y down), the same math easter-tilt.js uses.
    const dx = Math.cos(b) * Math.sin(g);
    const dy = -Math.sin(b);
    const a = angle();
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const x = dx * ca + dy * sa;
    const y = -dy * ca - dx * sa;
    if (!ref) ref = { x, y };
    ref.x += (x - ref.x) * RECENTER;
    ref.y += (y - ref.y) * RECENTER;
    // The artwork moves against the tilt so it reads as sitting behind the card.
    tgt.x = clamp(-(x - ref.x) * AMP);
    tgt.y = clamp(-(y - ref.y) * AMP);
  }

  function frame() {
    if (!active) return;
    cur.x += (tgt.x - cur.x) * EASE;
    cur.y += (tgt.y - cur.y) * EASE;
    const px = cur.x.toFixed(2) + 'px';
    const py = cur.y.toFixed(2) + 'px';
    targets.forEach((t) => {
      if (!t.on || !t.el) return;
      t.el.style.setProperty('--pp-px', px);
      t.el.style.setProperty('--pp-py', py);
    });
    raf = requestAnimationFrame(frame);
  }

  function run() {
    if (active) return;
    active = true;
    ref = null;
    cur.x = cur.y = tgt.x = tgt.y = 0;
    window.addEventListener('deviceorientation', onOrientation);
    raf = requestAnimationFrame(frame);
  }

  function halt() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('deviceorientation', onOrientation);
  }

  function clearTarget(el) {
    if (!el) return;
    delete el.dataset.parallax;
    el.style.removeProperty('--pp-px');
    el.style.removeProperty('--pp-py');
  }

  function sync() {
    const allowed = enabled && granted && motionOk();
    let any = false;
    targets.forEach((t) => {
      if (!t.el || !t.el.isConnected) t.el = t.find();
      const on = allowed && !!t.el && t.isOn(t.el);
      if (on && !t.on) {
        t.on = true;
        t.el.dataset.parallax = 'on';
      } else if (!on && t.on) {
        t.on = false;
        clearTarget(t.el);
      }
      any = any || t.on;
    });
    if (any) run();
    else halt();
  }

  function stopAll() {
    targets.forEach((t) => {
      if (t.on) {
        t.on = false;
        clearTarget(t.el);
      }
    });
    halt();
  }

  function setHelp(text) {
    if (help && help.textContent !== text) help.textContent = text;
  }

  function refreshSettings() {
    if (!input) return;
    const ok = motionOk();
    input.disabled = !ok;
    if (!ok) setHelp(OFF_HELP);
    else setHelp(enabled ? ON_HELP : DEFAULT_HELP);
    sync();
  }

  function onToggle() {
    if (input.checked) {
      input.disabled = true;
      ask().then((result) => {
        input.disabled = !motionOk();
        if (result === 'granted') {
          enabled = true;
          granted = true;
          savePref(true);
          setHelp(ON_HELP);
        } else {
          input.checked = false;
          enabled = false;
          savePref(false);
          setHelp(DENIED_HELP);
        }
        sync();
      });
    } else {
      enabled = false;
      savePref(false);
      setHelp(DEFAULT_HELP);
      sync();
    }
  }

  function mountSettings() {
    const dialog = document.getElementById('ppGlobalSettingsDialog');
    if (!dialog) return false;
    if (document.getElementById('ppParallaxSwitch')) return true;
    const section = document.createElement('section');
    section.className = 'pp-settings-section';
    section.setAttribute('aria-labelledby', 'ppParallaxTitle');
    section.innerHTML =
      '<h3 id="ppParallaxTitle">Tilt effects</h3>' +
      '<label class="pp-parallax-row"><input type="checkbox" id="ppParallaxSwitch"><span>Park artwork follows your tilt</span></label>' +
      '<p id="ppParallaxHelp" role="status"></p>';
    const motion = dialog.querySelector('#ppSettingsMotionHost');
    const anchor = motion && motion.closest('.pp-settings-section');
    if (anchor) anchor.after(section);
    else dialog.append(section);
    input = section.querySelector('#ppParallaxSwitch');
    help = section.querySelector('#ppParallaxHelp');
    input.checked = enabled;
    input.addEventListener('change', onToggle);
    refreshSettings();
    return true;
  }

  /* Attaches an observer to each target as it appears; returns true once all are watched. */
  function watchTargets() {
    let missing = false;
    let added = false;
    targets.forEach((t) => {
      if (t.watched) return;
      const el = t.find();
      if (!el) {
        missing = true;
        return;
      }
      t.watched = true;
      t.el = el;
      added = true;
      new MutationObserver(sync).observe(el, t.observe);
    });
    if (added) sync();
    return !missing;
  }

  function addStyles() {
    const over = '-' + OVERHANG + 'px';
    const style = document.createElement('style');
    style.id = 'ppParallaxStyles';
    style.textContent = [
      'html body #ppParkExpand[data-parallax=on] #parkGrid .park-card{overflow:hidden}',
      'html body #ppParkExpand[data-parallax=on] #parkGrid .park-card::before{inset:' + over + ';transform:translate3d(var(--pp-px,0px),var(--pp-py,0px),0);will-change:transform}',
      'html body #ppParkExpand[data-parallax=on] #parkGrid .pulse-identity>img{translate:calc(var(--pp-px,0px)*-.25) calc(var(--pp-py,0px)*-.25);will-change:translate}',
      'html body #bestParkBanner[data-parallax=on]::before{inset:' + over + ';transform:translate3d(var(--pp-px,0px),var(--pp-py,0px),0);will-change:transform}',
      '#ppGlobalSettingsDialog .pp-parallax-row{display:flex;align-items:center;gap:10px;min-height:44px;color:var(--text);font-size:.9rem;cursor:pointer}',
      '#ppGlobalSettingsDialog .pp-parallax-row input{flex:0 0 20px;width:20px;height:20px;accent-color:var(--teal)}',
      '#ppGlobalSettingsDialog .pp-parallax-row:focus-within{outline:3px solid var(--teal);outline-offset:3px;border-radius:8px}',
    ].join('\n');
    document.head.appendChild(style);
  }

  function start() {
    if (!supported()) return;
    enabled = readPref();
    granted = !needsPermission();
    addStyles();

    // iOS asks again per session: a card tap is the user gesture that can request it.
    document.addEventListener(
      'click',
      (event) => {
        if (!enabled || granted || !event.target.closest) return;
        if (!event.target.closest('#ppCompactOverview .pp1b-card[data-park], #bestParkBanner .pp-best-toggle')) return;
        ask().then((result) => {
          if (result === 'granted') {
            granted = true;
            sync();
          }
        });
      },
      true,
    );

    if (!mountSettings()) {
      const waitDialog = new MutationObserver(() => {
        if (mountSettings()) waitDialog.disconnect();
      });
      waitDialog.observe(document.body, { childList: true });
    }
    if (!watchTargets()) {
      const waitTargets = new MutationObserver(() => {
        if (watchTargets()) waitTargets.disconnect();
      });
      waitTargets.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('parkpulsemotionchange', refreshSettings);
    if (reduced.addEventListener) reduced.addEventListener('change', refreshSettings);
    // Tabs change which target is on screen; check after the new view has laid out.
    window.addEventListener('hashchange', () => requestAnimationFrame(sync));
    window.addEventListener('pageshow', sync);
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('pagehide', stopAll);
  }

  window.ParkPulseParallax = Object.freeze({ version: '1.1.0', isRunning: () => active });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
