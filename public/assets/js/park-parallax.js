/* Park Pulse: opt-in tilt parallax for the artwork on the expanded park card (Overview).
   While #ppParkExpand is open and the Settings toggle is on, the artwork shifts a few pixels as the phone tilts.
   Touch devices only. Loaded lazily by park-expand.js. Its styles are injected here and only apply while
   #ppParkExpand[data-parallax=on], so nothing changes when the feature is off.
   Tilt, not shake: the Easter egg input lives separately in easter-tilt.js. */
(() => {
  'use strict';
  if (window.ParkPulseParallax) return;

  const KEY = 'pp_parallax';
  const AMP = 28; // px of shift per unit of gravity change
  const MAX = 14; // px; stays under the 16px overhang the artwork gets while active
  const EASE = 0.12; // per-frame smoothing
  const RECENTER = 0.002; // per reading: slowly treats the current pose as neutral
  const DEG = Math.PI / 180;
  const DEFAULT_HELP = 'The park card artwork shifts slightly as you tilt your phone. Uses your motion sensors.';
  const ON_HELP = 'On. Open a park card and tilt your phone.';
  const DENIED_HELP = 'Motion access was denied. To try again, quit and reopen Safari, then turn this on and allow it.';
  const OFF_HELP = 'Turn on animations in Settings to use tilt effects.';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  let enabled = false;
  let granted = false;
  let active = false;
  let ref = null;
  let raf = 0;
  let overlay = null;
  let input = null;
  let help = null;
  const cur = { x: 0, y: 0 };
  const tgt = { x: 0, y: 0 };

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
    overlay.style.setProperty('--pp-px', cur.x.toFixed(2) + 'px');
    overlay.style.setProperty('--pp-py', cur.y.toFixed(2) + 'px');
    raf = requestAnimationFrame(frame);
  }

  function run() {
    if (active || !overlay) return;
    active = true;
    ref = null;
    cur.x = cur.y = tgt.x = tgt.y = 0;
    overlay.dataset.parallax = 'on';
    window.addEventListener('deviceorientation', onOrientation);
    raf = requestAnimationFrame(frame);
  }

  function halt() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('deviceorientation', onOrientation);
    if (overlay) {
      delete overlay.dataset.parallax;
      overlay.style.removeProperty('--pp-px');
      overlay.style.removeProperty('--pp-py');
    }
  }

  function sync() {
    if (overlay && !overlay.hidden && enabled && granted && motionOk()) run();
    else halt();
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
      '<label class="pp-parallax-row"><input type="checkbox" id="ppParallaxSwitch"><span>Park card artwork follows your tilt</span></label>' +
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

  function watchOverlay() {
    const found = document.getElementById('ppParkExpand');
    if (!found) return false;
    overlay = found;
    new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
    sync();
    return true;
  }

  function addStyles() {
    const style = document.createElement('style');
    style.id = 'ppParallaxStyles';
    style.textContent = [
      'html body #ppParkExpand[data-parallax=on] #parkGrid .park-card{overflow:hidden}',
      'html body #ppParkExpand[data-parallax=on] #parkGrid .park-card::before{inset:-16px;transform:translate3d(var(--pp-px,0px),var(--pp-py,0px),0);will-change:transform}',
      'html body #ppParkExpand[data-parallax=on] #parkGrid .pulse-identity>img{translate:calc(var(--pp-px,0px)*-.2) calc(var(--pp-py,0px)*-.2);will-change:translate}',
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

    // iOS asks again per session: the card tap is the user gesture that can request it.
    document.addEventListener(
      'click',
      (event) => {
        if (!enabled || granted || !event.target.closest) return;
        if (!event.target.closest('#ppCompactOverview .pp1b-card[data-park]')) return;
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
    if (!watchOverlay()) {
      const waitOverlay = new MutationObserver(() => {
        if (watchOverlay()) waitOverlay.disconnect();
      });
      waitOverlay.observe(document.body, { childList: true });
    }
    window.addEventListener('parkpulsemotionchange', refreshSettings);
    if (reduced.addEventListener) reduced.addEventListener('change', refreshSettings);
    window.addEventListener('pagehide', halt);
  }

  window.ParkPulseParallax = Object.freeze({ version: '1.0.0', isRunning: () => active });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
