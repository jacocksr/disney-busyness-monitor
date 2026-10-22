/* Park Pulse: click-local decorative fireworks. Load after the gauge module. */
(() => {
  'use strict';
  if (window.ParkPulseFireworks) return;

  const SETTINGS = Object.freeze({
    particleCount: 16,
    cleanupMs: 1800,
    easterEggTaps: 3,
    easterEggWindowMs: 2000,
    celebrationCount: 6,
    celebrationCooldownMs: 4000
  });
  const PARK_KEYS = new Set(['magic_kingdom', 'epcot', 'hollywood_studios', 'animal_kingdom']);
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  function motionDisabled() {
    return preference.matches || window.ParkPulseMotion?.enabled === false;
  }
  const COLORS = ['var(--pp-fw-gold)', 'var(--pp-fw-pink)', 'var(--pp-fw-teal)', 'var(--pp-fw-purple)'];
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let active = null;
  let pendingFrame = 0;
  let pendingLaunch = null;
  let generation = 0;
  let nextTrailId = 0;
  let tapSourceId = '';
  let tapTimes = [];
  let celebrationCooldownUntil = 0;

  function resetTapSequence() {
    tapSourceId = '';
    tapTimes = [];
  }

  function removeEffect(effect) {
    for (const animation of effect.animations) animation.cancel();
    effect.root.remove();
  }

  function clearEffect() {
    generation += 1;
    if (pendingFrame) cancelAnimationFrame(pendingFrame);
    pendingFrame = 0;
    pendingLaunch = null;
    if (!active) return;
    const group = active;
    active = null;
    clearTimeout(group.timer);
    for (const effect of group.effects) removeEffect(effect);
  }

  function clearInteraction() {
    resetTapSequence();
    clearEffect();
  }

  function visible(element) {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    const r = element.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
      r.top < window.innerHeight && r.left < document.documentElement.clientWidth;
  }

  function viewingDetails() {
    if (document.hidden) return true;
    for (const modal of document.querySelectorAll('.modal-overlay.active, dialog[open], [role="dialog"][aria-modal="true"]')) {
      if (modal.getAttribute('aria-hidden') !== 'true' && visible(modal)) return true;
    }
    for (const body of document.querySelectorAll('details[open] > :not(summary)')) {
      if (visible(body)) return true;
    }
    return false;
  }

  function identifySource(target) {
    if (!(target instanceof Element)) return null;
    const button = target.closest('button.park-select-btn[data-park-key]');
    if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && !button.closest('[inert]')) {
      const key = button.dataset.parkKey;
      const image = button.querySelector('img');
      if (!PARK_KEYS.has(key) || !image) return null;
      const container = button.parentElement?.closest('[id]');
      return { kind: 'selector', key, image, containerId: container?.id || '' };
    }
    const image = target.closest('#parkGrid .park-card .pulse-identity > img');
    if (!image || image.closest('[inert]')) return null;
    const card = image.closest('.park-card[data-park-key]');
    const key = card?.dataset.parkKey;
    return PARK_KEYS.has(key) ? { kind: 'card', key, image, containerId: 'parkGrid' } : null;
  }

  function resolveImage(source) {
    if (source.image.isConnected) return source.image;
    const container = document.getElementById(source.containerId);
    if (!container) return null;
    if (source.kind === 'card') {
      for (const card of container.querySelectorAll('.park-card[data-park-key]')) {
        if (card.dataset.parkKey === source.key) return card.querySelector('.pulse-identity > img');
      }
    } else {
      for (const button of container.querySelectorAll('button.park-select-btn[data-park-key]')) {
        if (button.dataset.parkKey === source.key && !button.disabled) return button.querySelector('img');
      }
    }
    return null;
  }

  function sourceId(source) {
    return source.kind + '|' + source.containerId + '|' + source.key;
  }

  function recordActivation(id, now) {
    if (now < celebrationCooldownUntil) {
      resetTapSequence();
      return false;
    }
    if (tapSourceId !== id) {
      tapSourceId = id;
      tapTimes = [];
    }
    tapTimes = tapTimes.filter(time => now - time <= SETTINGS.easterEggWindowMs);
    tapTimes.push(now);
    if (tapTimes.length < SETTINGS.easterEggTaps) return false;
    resetTapSequence();
    return true;
  }

  function animate(effect, element, keyframes, options) {
    const animation = element.animate(keyframes, { fill: 'both', ...options });
    effect.animations.push(animation);
    animation.finished.catch(() => {});
  }

  function addParticle(effect, className, color) {
    const particle = document.createElement('span');
    particle.className = className;
    particle.style.color = color;
    effect.root.appendChild(particle);
    return particle;
  }

  function svgElement(tag, attributes) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes || {})) element.setAttribute(key, String(value));
    return element;
  }

  function addFlight(effect, rect, start, end, control1, control2, flightMs, scale) {
    const svg = svgElement('svg', {
      class: 'pp-fw-flight', viewBox: '0 0 ' + rect.width + ' ' + rect.height,
      width: rect.width, height: rect.height, 'aria-hidden': 'true', focusable: 'false'
    });
    svg.style.left = (-end.x) + 'px';
    svg.style.top = (-end.y) + 'px';
    const defs = svgElement('defs');
    const gradientId = 'pp-fw-trail-' + (++nextTrailId);
    const gradient = svgElement('linearGradient', {
      id: gradientId, gradientUnits: 'userSpaceOnUse',
      x1: start.x, y1: start.y, x2: end.x, y2: end.y
    });
    const colorIndex = Math.floor(Math.random() * COLORS.length);
    const color1 = COLORS[colorIndex];
    const color2 = COLORS[(colorIndex + 1 + Math.floor(Math.random() * 3)) % COLORS.length];
    for (const [offset, color, opacity] of [[0, color1, 0.35], [0.55, color1, 0.95], [1, color2, 1]]) {
      const stop = svgElement('stop', { offset, 'stop-opacity': opacity });
      stop.style.stopColor = color;
      gradient.appendChild(stop);
    }
    defs.appendChild(gradient);
    svg.appendChild(defs);
    const pathData = 'M' + start.x + ' ' + start.y + ' C' + control1.x + ' ' + control1.y +
      ' ' + control2.x + ' ' + control2.y + ' ' + end.x + ' ' + end.y;
    const glow = svgElement('path', { d: pathData, class: 'pp-fw-trail-glow', stroke: 'url(#' + gradientId + ')' });
    const line = svgElement('path', { d: pathData, class: 'pp-fw-trail', stroke: 'url(#' + gradientId + ')' });
    svg.append(glow, line);
    effect.root.appendChild(svg);
    const length = line.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) throw new Error('Invalid decorative flight path');
    const tailLength = Math.max(15, Math.min(32 * scale, length * 0.38));
    const fadeMs = 220;
    const flightOffset = flightMs / (flightMs + fadeMs);
    for (const [path, peak] of [[glow, 0.19], [line, 0.9]]) {
      path.style.strokeDasharray = tailLength + ' ' + (length * 2);
      path.style.strokeDashoffset = String(tailLength);
      animate(effect, path, [
        { strokeDashoffset: String(tailLength), opacity: 0 },
        { strokeDashoffset: String(tailLength - length * 0.1), opacity: peak, offset: flightOffset * 0.1 },
        { strokeDashoffset: String(tailLength - length), opacity: peak, offset: flightOffset },
        { strokeDashoffset: String(tailLength - length), opacity: 0 }
      ], { duration: flightMs + fadeMs, easing: 'linear' });
    }
    const head = addParticle(effect, 'pp-fw-comet-head', color2);
    const frames = [];
    const samples = 28;
    for (let i = 0; i <= samples; i += 1) {
      const point = line.getPointAtLength(length * i / samples);
      frames.push({
        offset: i / samples,
        transform: 'translate3d(' + (point.x - end.x).toFixed(2) + 'px,' + (point.y - end.y).toFixed(2) + 'px,0)',
        opacity: i === 0 || i === samples ? 0 : 0.95
      });
    }
    animate(effect, head, frames, { duration: flightMs, easing: 'linear' });
  }

  function launchOne(rect, group) {
    const w = rect.width;
    const h = rect.height;
    const side = Math.random() < 0.5 ? -1 : 1;
    const clampX = x => Math.max(w * 0.06, Math.min(w * 0.94, x));
    const start = { x: w * (0.24 + Math.random() * 0.52), y: h * (0.88 + Math.random() * 0.08) };
    // Owner-approved upper-left/upper-right sky coordinates.
    const end = {
      x: w * (
        side < 0
          ? 0.05 + Math.random() * 0.22
          : 0.75 + Math.random() * 0.22
      ),
      y: h * (0.05 + Math.random() * 0.07)
    };
    const control1 = { x: clampX(start.x + side * w * (0.18 + Math.random() * 0.12)), y: start.y - h * 0.32 };
    const control2 = { x: clampX(end.x + side * w * (0.12 + Math.random() * 0.08)), y: end.y + h * 0.14 };
    const root = document.createElement('div');
    root.className = 'pp-park-firework';
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('inert', '');
    root.style.left = (rect.left + end.x) + 'px';
    root.style.top = (rect.top + end.y) + 'px';
    document.body.appendChild(root);
    const effect = { root, animations: [] };
    group.effects.push(effect);
    const scale = Math.max(0.78, Math.min(1.15, rect.width / 80));
    const flightMs = 360 + Math.random() * 120;
    const glint = addParticle(effect, 'pp-fw-glint', COLORS[0]);

    try {
      addFlight(effect, rect, start, end, control1, control2, flightMs, scale);
      animate(effect, glint, [
        { transform: 'scale(.3) rotate(0deg)', opacity: 0 },
        { transform: 'scale(1) rotate(20deg)', opacity: 0.85, offset: 0.2 },
        { transform: 'scale(.6) rotate(55deg)', opacity: 0 }
      ], { delay: flightMs, duration: 400, easing: 'ease-out' });

      for (let i = 0; i < SETTINGS.particleCount; i += 1) {
        const angle = (i / SETTINGS.particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.21;
        const radius = (28 + Math.random() * 20) * scale;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        const rotation = angle * 180 / Math.PI + 90;
        const drift = (10 + Math.random() * 11) * scale;
        const star = i % 4 === 0;
        const particle = addParticle(effect, 'pp-fw-spark' + (star ? ' pp-fw-spark--star' : ''), COLORS[i % COLORS.length]);
        if (!star) particle.style.height = (5 + Math.random() * 4) + 'px';
        const move = (x, y, size) => 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0) rotate(' + rotation.toFixed(1) + 'deg) scale(' + size + ')';
        animate(effect, particle, [
          { transform: move(0, 0, 0.3), opacity: 0 },
          { transform: move(dx * 0.36, dy * 0.36, 1), opacity: 0.95, offset: 0.18 },
          { transform: move(dx * 0.86, dy * 0.86 + drift * 0.22, 0.8), opacity: 0.8, offset: 0.58 },
          { transform: move(dx, dy + drift, 0.2), opacity: 0 }
        ], {
          delay: flightMs + Math.random() * 45,
          duration: 640 + Math.random() * 210,
          easing: 'cubic-bezier(.15,.65,.3,1)'
        });
      }
    } catch (error) {
      console.error('[ParkPulse Fireworks] Launch failed:', error);
      removeEffect(effect);
      group.effects = group.effects.filter(item => item !== effect);
      // A failed decorative launch must not affect the original click behavior.
    }
  }

  function launchGroup(rect, source, id, celebration) {
    if (motionDisabled()) { clearInteraction(); return; }
    const group = { effects: [], timer: 0, sourceId: id, key: source.key, celebration };
    active = group;
    const count = celebration ? SETTINGS.celebrationCount : 1;
    for (let i = 0; i < count; i += 1) launchOne(rect, group);
    if (!group.effects.length) {
      if (active === group) clearEffect();
      return;
    }
    if (celebration) {
     celebrationCooldownUntil =
       performance.now() + SETTINGS.celebrationCooldownMs;

     // Trigger the gauge flourish once per Easter egg celebration.
     try {
       window.ParkPulseScoreGauge?.celebrate?.(source.key);
     } catch (error) {
       console.warn(
         '[ParkPulse Fireworks] Gauge celebration could not start:',
         error
       );
     }
   }
    group.timer = setTimeout(() => {
      if (active === group) clearEffect();
    }, SETTINGS.cleanupMs);
  }

  function handleClick(event) {
    if (!event.isTrusted || (typeof event.button === 'number' && event.button !== 0)) return;
    const source = identifySource(event.target);
    if (!source) {
      resetTapSequence();
      const control = event.target instanceof Element
        ? event.target.closest('button.park-select-btn[data-park-key], #parkGrid .park-card[data-park-key]')
        : null;
      const key = control?.dataset.parkKey;
      const currentKey = active?.key || pendingLaunch?.key;
      if (PARK_KEYS.has(key) && currentKey && currentKey !== key) clearEffect();
      return;
    }
    if (motionDisabled() || viewingDetails() || !visible(source.image) ||
        typeof Element.prototype.animate !== 'function') {
      clearInteraction();
      return;
    }
    if (getComputedStyle(document.documentElement).getPropertyValue('--pp-park-fireworks-ready').trim() !== '1') {
      clearInteraction();
      return;
    }
    const id = sourceId(source);
    if ((active?.celebration && active.sourceId === id) ||
        (pendingLaunch?.celebration && pendingLaunch.sourceId === id)) {
      resetTapSequence();
      return;
    }
    const celebration = recordActivation(id, performance.now());
    clearEffect();
    const token = generation;
    const request = { sourceId: id, key: source.key, celebration };
    pendingLaunch = request;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      if (generation !== token || pendingLaunch !== request) return;
      pendingLaunch = null;
      if (motionDisabled() || viewingDetails()) {
        resetTapSequence();
        return;
      }
      if (typeof activeParkKey !== 'undefined' && activeParkKey !== source.key) {
        resetTapSequence();
        return;
      }
      const image = resolveImage(source);
      if (!visible(image)) {
        resetTapSequence();
        return;
      }
      launchGroup(image.getBoundingClientRect(), source, id, celebration);
    });
  }

  // Capture the source before existing selection handlers can replace its markup.
  document.addEventListener('click', handleClick, { capture: true, passive: true });
  document.addEventListener('scroll', clearInteraction, { capture: true, passive: true });
  window.addEventListener('scroll', clearInteraction, { passive: true });
  window.addEventListener('resize', clearInteraction, { passive: true });
  window.addEventListener('pagehide', clearInteraction);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearInteraction(); });
  document.addEventListener('toggle', () => { if (viewingDetails()) clearInteraction(); }, true);
  const preferenceChanged = () => {
    if (motionDisabled()) {
      celebrationCooldownUntil = 0;
      clearInteraction();
    }
  };
  if (preference.addEventListener) preference.addEventListener('change', preferenceChanged);
  else preference.addListener(preferenceChanged);
  window.addEventListener('parkpulse:motionchange', preferenceChanged);

  if (typeof MutationObserver === 'function' && document.body) {
    const observer = new MutationObserver(records => {
      if (!active && !pendingFrame && !tapTimes.length) return;
      if (records.some(record => record.target instanceof Element &&
          record.target.matches('details, dialog, .modal-overlay, [role="dialog"]')) && viewingDetails()) {
        clearInteraction();
      }
    });
    observer.observe(document.body, {
      subtree: true, attributes: true,
      attributeFilter: ['class', 'open', 'aria-hidden', 'aria-modal']
    });
  }
  window.ParkPulseFireworks = Object.freeze({ version: '1.3.0', settings: SETTINGS });
})();
