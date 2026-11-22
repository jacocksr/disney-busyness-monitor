/* Park Pulse decorative effects: score gauges and park-icon fireworks.
   Both respect the Animations preference and prefers-reduced-motion. */

/* ==========================================================================
 * Score gauges (PPUI.gauges, window.ParkPulseScoreGauge)
 * ========================================================================== */
/* Park Pulse: presentation-only park score gauges. Load after existing scripts. */
(() => {
  'use strict';
  if (window.ParkPulseScoreGauge) return;

  const SETTINGS = Object.freeze({
    visibleRatio: 0.9,
    viewportInset: 48,
    entranceDelayMs: 300,
    entranceMs: 2400,
    updateMs: 1800,
    minimumOvershoot: 0.9,
    maximumOvershoot: 1.65,
    returnRatio: 0.65,
    selectionDelayMs: 180,
    selectionMs: 1500,
  });
  const states = new Map();
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  function motionDisabled() {
    return motionPreference.matches || window.ParkPulseMotion?.enabled === false;
  }
  let nextId = 0;
  let fallbackFrame = 0;
  let missingStyleWarned = false;
  let pendingSelection = null;
  let selectionDepth = 0;

  function sufficientlyVisible(node) {
    if (!node.isConnected || document.hidden) return false;
    const r = node.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const bottom = Math.max(0, window.innerHeight - SETTINGS.viewportInset);
    const width = Math.max(0, Math.min(r.right, document.documentElement.clientWidth) - Math.max(r.left, 0));
    const height = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, 0));
    return (width * height) / (r.width * r.height) >= SETTINGS.visibleRatio;
  }

  function overlapsViewport(element) {
    if (!element.getClientRects().length) return false;
    const r = element.getBoundingClientRect();
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < window.innerHeight &&
      r.left < document.documentElement.clientWidth
    );
  }

  function detailsAreBeingViewed() {
    if (document.hidden) return true;
    for (const modal of document.querySelectorAll(
      '.modal-overlay.active, dialog[open], [role="dialog"][aria-modal="true"]',
    )) {
      if (modal.getAttribute('aria-hidden') !== 'true' && overlapsViewport(modal)) return true;
    }
    for (const body of document.querySelectorAll('details[open] > :not(summary)')) {
      if (overlapsViewport(body)) return true;
    }
    return false;
  }

  function clearEntrance(state) {
    if (state.entranceTimer) clearTimeout(state.entranceTimer);
    state.entranceTimer = 0;
  }

  function cancelMotion(state) {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
    state.motion = null;
  }

  function positionNeedle(state, score) {
    state.position = score;
    state.needle.setAttribute('transform', 'rotate(' + (score * 18).toFixed(3) + ' 60 53)');
  }

  function settle(state) {
    clearEntrance(state);
    cancelMotion(state);
    if (state.valid && state.started) {
      positionNeedle(state, state.target);
      state.node.dataset.status = 'available';
    }
  }

  function animateToTarget(state, duration) {
    cancelMotion(state);
    const distance = state.target - state.position;
    if (
      motionDisabled() ||
      detailsAreBeingViewed() ||
      !state.visible ||
      !sufficientlyVisible(state.node) ||
      Math.abs(distance) < 0.00001
    ) {
      settle(state);
      return;
    }
    const direction = Math.sign(distance);
    const amplitude = Math.min(
      SETTINGS.maximumOvershoot,
      Math.max(SETTINGS.minimumOvershoot, Math.abs(distance) * 0.3),
    );
    const clamp = (value) => Math.max(0, Math.min(10, value));
    const motion = {
      from: state.position,
      over: clamp(state.target + direction * amplitude),
      under: clamp(state.target - direction * amplitude * SETTINGS.returnRatio),
      to: state.target,
      start: performance.now(),
      duration,
      kind: 'score',
    };
    state.motion = motion;
    function interpolate(a, b, progress) {
      return a + (b - a) * progress;
    }
    function smooth(progress) {
      return progress * progress * (3 - 2 * progress);
    }
    function step(now) {
      if (state.motion !== motion) return;
      if (
        motionDisabled() ||
        !state.valid ||
        !state.node.isConnected ||
        detailsAreBeingViewed() ||
        !state.visible
      ) {
        settle(state);
        return;
      }
      const progress = Math.max(0, Math.min(1, (now - motion.start) / motion.duration));
      let position;
      if (progress < 0.5) {
        const p = progress / 0.5;
        position = interpolate(motion.from, motion.over, 1 - Math.pow(1 - p, 3));
      } else if (progress < 0.82) {
        position = interpolate(motion.over, motion.under, smooth((progress - 0.5) / 0.32));
      } else {
        position = interpolate(motion.under, motion.to, smooth((progress - 0.82) / 0.18));
      }
      positionNeedle(state, position);
      if (progress < 1) state.frame = requestAnimationFrame(step);
      else {
        state.frame = 0;
        state.motion = null;
        positionNeedle(state, state.target);
      }
    }
    state.frame = requestAnimationFrame(step);
  }

  function beginEntrance(state) {
    if (
      !state.valid ||
      state.started ||
      detailsAreBeingViewed() ||
      !state.visible ||
      !sufficientlyVisible(state.node)
    )
      return;
    state.started = true;
    state.node.dataset.status = 'available';
    positionNeedle(state, 0);
    animateToTarget(state, SETTINGS.entranceMs);
  }

  function revealOnce(state) {
    if (pendingSelection?.key === state.key) {
      clearEntrance(state);
      return;
    }
    if (
      !state.valid ||
      state.started ||
      detailsAreBeingViewed() ||
      !state.visible ||
      !sufficientlyVisible(state.node)
    ) {
      clearEntrance(state);
      return;
    }
    if (motionDisabled()) {
      clearEntrance(state);
      beginEntrance(state);
      return;
    }
    if (state.entranceTimer) return;
    state.entranceTimer = setTimeout(() => {
      state.entranceTimer = 0;
      beginEntrance(state);
    }, SETTINGS.entranceDelayMs);
  }

  const observer =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const state = states.get(entry.target.dataset.ppScorePark);
              if (!state || state.node !== entry.target) continue;
              state.visible = entry.isIntersecting && entry.intersectionRatio >= SETTINGS.visibleRatio;
              if (!state.visible || detailsAreBeingViewed()) settle(state);
              else revealOnce(state);
            }
            tryPendingSelection();
          },
          {
            threshold: [0, SETTINGS.visibleRatio, 1],
            rootMargin: '0px 0px -' + SETTINGS.viewportInset + 'px 0px',
          },
        )
      : null;

  function cancelPendingSelection() {
    if (pendingSelection?.timer) clearTimeout(pendingSelection.timer);
    pendingSelection = null;
  }

  function startSelectionMotion(state) {
    clearEntrance(state);
    cancelMotion(state);
    state.started = true;
    state.node.dataset.status = 'available';
    if (motionDisabled() || detailsAreBeingViewed() || !sufficientlyVisible(state.node)) {
      settle(state);
      return;
    }
    const motion = { kind: 'selection', from: state.position, start: performance.now() };
    state.motion = motion;
    const smooth = (p) => p * p * (3 - 2 * p);
    const mix = (a, b, p) => a + (b - a) * p;
    function step(now) {
      if (state.motion !== motion) return;
      if (
        motionDisabled() ||
        !state.valid ||
        !state.node.isConnected ||
        !state.visible ||
        !sufficientlyVisible(state.node) ||
        detailsAreBeingViewed()
      ) {
        settle(state);
        return;
      }
      const p = Math.max(0, Math.min(1, (now - motion.start) / SETTINGS.selectionMs));
      const finalOver = Math.min(10, state.target + 0.35);
      let position;
      if (p < 0.24) {
        const t = p / 0.24;
        position = mix(motion.from, 10, 1 - Math.pow(1 - t, 3));
      } else if (p < 0.54) {
        position = mix(10, 0, smooth((p - 0.24) / 0.3));
      } else if (p < 0.86) {
        position = mix(0, finalOver, smooth((p - 0.54) / 0.32));
      } else {
        position = mix(finalOver, state.target, smooth((p - 0.86) / 0.14));
      }
      positionNeedle(state, position);
      if (p < 1) state.frame = requestAnimationFrame(step);
      else {
        state.frame = 0;
        state.motion = null;
        positionNeedle(state, state.target);
      }
    }
    state.frame = requestAnimationFrame(step);
  }

  function tryPendingSelection() {
    const pending = pendingSelection;
    if (!pending) return;
    const state = states.get(pending.key);
    if (activeParkKey !== pending.key || (state && !state.valid)) {
      cancelPendingSelection();
      return;
    }
    if (!state || !state.visible || !sufficientlyVisible(state.node) || detailsAreBeingViewed()) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = 0;
      return;
    }
    if (motionDisabled()) {
      cancelPendingSelection();
      state.started = true;
      settle(state);
      return;
    }
    if (pending.timer) return;
    pending.timer = setTimeout(() => {
      pending.timer = 0;
      if (pendingSelection !== pending || activeParkKey !== pending.key) return;
      if (!state.valid) {
        cancelPendingSelection();
        return;
      }
      if (!state.visible || !sufficientlyVisible(state.node) || detailsAreBeingViewed()) return;
      pendingSelection = null;
      startSelectionMotion(state);
    }, SETTINGS.selectionDelayMs);
  }

  function queueSelection(key) {
    cancelPendingSelection();
    for (const state of states.values()) {
      if (state.motion?.kind === 'selection') settle(state);
    }
    const state = states.get(key);
    if (!state || !state.valid) return;
    clearEntrance(state);
    cancelMotion(state);
    pendingSelection = { key, timer: 0 };
    if (motionDisabled()) {
      cancelPendingSelection();
      state.started = true;
      settle(state);
      return;
    }
    tryPendingSelection();
  }

  function makeState(key) {
    const node = document.createElement('span');
    const gradientId = 'pp-score-gradient-' + ++nextId;
    node.className = 'score-badge pp-score-gauge';
    node.dataset.ppScorePark = key;
    node.dataset.status = 'unavailable';
    node.setAttribute('role', 'img');
    const star = 'M27 46.2 L29.4 50.6 L33.8 53 L29.4 55.4 L27 59.8 L24.6 55.4 L20.2 53 L24.6 50.6 Z';
    node.innerHTML =
      '<svg class="pp-score-dial" viewBox="0 0 120 80" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' +
      gradientId +
      '" gradientUnits="userSpaceOnUse" x1="14" y1="53" x2="106" y2="53">' +
      '<stop offset="0" class="pp-score-stop-green"/>' +
      '<stop offset="0.42" class="pp-score-stop-yellow"/>' +
      '<stop offset="0.72" class="pp-score-stop-orange"/>' +
      '<stop offset="1" class="pp-score-stop-red"/>' +
      '</linearGradient></defs>' +
      '<path class="pp-score-track" d="M14 53 A46 46 0 0 1 106 53"/>' +
      '<path class="pp-score-arc" d="M14 53 A46 46 0 0 1 106 53" stroke="url(#' +
      gradientId +
      ')"/>' +
      '<g class="pp-score-pointer" transform="rotate(0 60 53)">' +
      '<path class="pp-score-wand-outline" d="M60 53 L27 53"/>' +
      '<path class="pp-score-wand" d="M60 53 L27 53"/>' +
      '<path class="pp-score-star-outline" d="' +
      star +
      '"/>' +
      '<path class="pp-score-star" d="' +
      star +
      '"/>' +
      '</g><circle class="pp-score-pivot" cx="60" cy="53" r="3.3"/>' +
      '</svg><span class="pp-score-reading" aria-hidden="true"><span class="pp-score-value"></span>' +
      '<span class="pp-score-denominator"> / 10</span></span>';
    return {
      key,
      node,
      needle: node.querySelector('.pp-score-pointer'),
      value: node.querySelector('.pp-score-value'),
      target: null,
      position: 0,
      valid: false,
      started: false,
      visible: false,
      frame: 0,
      motion: null,
      observed: false,
      entranceTimer: 0,
    };
  }

  function updateState(state, score, valid, parkName) {
    const wasValid = state.valid;
    const changed = state.target !== score;
    state.valid = valid;
    state.target = valid ? score : null;
    const label =
      parkName + (valid ? ': busyness score ' + score + ' out of 10' : ': busyness score unavailable');
    state.node.setAttribute('aria-label', label);
    state.node.title = label;
    state.value.textContent = valid ? String(score) : 'N/A';
    if (!valid) {
      clearEntrance(state);
      cancelMotion(state);
      state.node.dataset.status = 'unavailable';
      return;
    }
    if (motionDisabled()) {
      state.started = true;
      settle(state);
      return;
    }
    if (!state.started) {
      state.node.dataset.status = 'pending';
      revealOnce(state);
      return;
    }
    state.node.dataset.status = 'available';
    if (!wasValid) settle(state);
    else if (state.motion?.kind === 'selection' || pendingSelection?.key === state.key) {
      // A changing live target is read by the selection animation without restarting it.
      return;
    } else if (changed) animateToTarget(state, SETTINGS.updateMs);
  }

  function syncGauges() {
    const grid = document.getElementById('parkGrid');
    if (!grid) return;
    if (
      getComputedStyle(document.documentElement).getPropertyValue('--pp-score-gauge-ready').trim() !== '1'
    ) {
      if (!missingStyleWarned) {
        console.warn('Park Pulse score gauge stylesheet is missing; original score badges retained.');
        missingStyleWarned = true;
      }
      return;
    }
    for (const card of grid.querySelectorAll('.park-card[data-park-key]')) {
      const key = card.dataset.parkKey;
      const park = parkData?.parks?.[key];
      const badge = card.querySelector('.score-badge');
      if (!park || !badge) continue;
      let state = states.get(key);
      if (!state) {
        state = makeState(key);
        states.set(key, state);
      }
      // Preserve the effective renderer's N/A decision.
      const suppressed =
        badge === state.node
          ? state.node.dataset.status === 'unavailable'
          : badge.classList.contains('score-na');
      const score = park.crowd_score;
      const valid =
        !suppressed && typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 10;
      if (badge !== state.node) badge.replaceWith(state.node);
      updateState(state, score, valid, park.name || key);
      if (observer && !state.observed) {
        observer.observe(state.node);
        state.observed = true;
      }
    }
    for (const state of states.values()) {
      if (!state.node.isConnected) {
        state.visible = false;
        settle(state);
      }
    }
    if (!observer) scheduleFallbackVisibility();
    tryPendingSelection();
  }

  function refreshVisibility() {
    const blocked = detailsAreBeingViewed();
    for (const state of states.values()) {
      state.visible = sufficientlyVisible(state.node);
      if (!state.visible || blocked) settle(state);
      else revealOnce(state);
    }
    tryPendingSelection();
  }

  function scheduleFallbackVisibility() {
    if (fallbackFrame) return;
    fallbackFrame = requestAnimationFrame(() => {
      fallbackFrame = 0;
      refreshVisibility();
    });
  }

  // Called from core renderCards() / selectPark().
  PPUI.gauges = {
    sync: syncGauges,
    enterSelection() {
      selectionDepth += 1;
    },
    exitSelection() {
      selectionDepth -= 1;
    },
    afterSelection,
  };

  function afterSelection(key) {
    if (selectionDepth === 0 && typeof key === 'string' && activeParkKey === key) {
      // Ordinary selection cancels an old park's flourish; it never starts a new one.
      if (pendingSelection && pendingSelection.key !== key) cancelPendingSelection();
      for (const state of states.values()) {
        if (state.key !== key && state.motion?.kind === 'selection') settle(state);
      }
    }
  }

  function celebratePark(key) {
    if (motionDisabled()) return false;
    if (typeof key !== 'string' || activeParkKey !== key || !parkData?.parks?.[key]) return false;
    const state = states.get(key);
    if (!state || !state.valid) return false;
    queueSelection(key);
    return true;
  }

  // Also resume a held selection when expanded detail content scrolls out of view.
  window.addEventListener('scroll', scheduleFallbackVisibility, { passive: true });
  window.addEventListener('resize', scheduleFallbackVisibility, { passive: true });
  document.addEventListener('scroll', scheduleFallbackVisibility, { capture: true, passive: true });
  document.addEventListener('toggle', scheduleFallbackVisibility, true);
  if (typeof MutationObserver === 'function' && document.body) {
    const detailObserver = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.target instanceof Element &&
            record.target.matches('details, dialog, .modal-overlay, [role="dialog"]'),
        )
      ) {
        scheduleFallbackVisibility();
      }
    });
    detailObserver.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'open', 'aria-hidden', 'aria-modal'],
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (pendingSelection?.timer) clearTimeout(pendingSelection.timer);
      if (pendingSelection) pendingSelection.timer = 0;
      for (const state of states.values()) settle(state);
    } else refreshVisibility();
  });
  const handleMotionPreference = () => {
    if (motionDisabled()) {
      cancelPendingSelection();
      for (const state of states.values()) {
        if (state.valid) state.started = true;
        settle(state);
      }
    }
    refreshVisibility();
  };
  if (motionPreference.addEventListener) motionPreference.addEventListener('change', handleMotionPreference);
  else motionPreference.addListener(handleMotionPreference);
  window.addEventListener('parkpulse:motionchange', handleMotionPreference);
  window.addEventListener('pagehide', () => {
    if (pendingSelection?.timer) clearTimeout(pendingSelection.timer);
    if (pendingSelection) pendingSelection.timer = 0;
    for (const state of states.values()) settle(state);
  });
  window.addEventListener('pageshow', refreshVisibility);

  window.ParkPulseScoreGauge = Object.freeze({
    version: '1.5.0',
    settings: SETTINGS,
    celebrate: celebratePark,
  });
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', syncGauges, { once: true });
  else syncGauges();
})();

/* ==========================================================================
 * Park-icon fireworks
 * ========================================================================== */
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
    celebrationCooldownMs: 4000,
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
    return (
      r.width > 0 &&
      r.height > 0 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.top < window.innerHeight &&
      r.left < document.documentElement.clientWidth
    );
  }

  function viewingDetails() {
    if (document.hidden) return true;
    for (const modal of document.querySelectorAll(
      '.modal-overlay.active, dialog[open], [role="dialog"][aria-modal="true"]',
    )) {
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
    if (
      button &&
      !button.disabled &&
      button.getAttribute('aria-disabled') !== 'true' &&
      !button.closest('[inert]')
    ) {
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
    tapTimes = tapTimes.filter((time) => now - time <= SETTINGS.easterEggWindowMs);
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
      class: 'pp-fw-flight',
      viewBox: '0 0 ' + rect.width + ' ' + rect.height,
      width: rect.width,
      height: rect.height,
      'aria-hidden': 'true',
      focusable: 'false',
    });
    svg.style.left = -end.x + 'px';
    svg.style.top = -end.y + 'px';
    const defs = svgElement('defs');
    const gradientId = 'pp-fw-trail-' + ++nextTrailId;
    const gradient = svgElement('linearGradient', {
      id: gradientId,
      gradientUnits: 'userSpaceOnUse',
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    });
    const colorIndex = Math.floor(Math.random() * COLORS.length);
    const color1 = COLORS[colorIndex];
    const color2 = COLORS[(colorIndex + 1 + Math.floor(Math.random() * 3)) % COLORS.length];
    for (const [offset, color, opacity] of [
      [0, color1, 0.35],
      [0.55, color1, 0.95],
      [1, color2, 1],
    ]) {
      const stop = svgElement('stop', { offset, 'stop-opacity': opacity });
      stop.style.stopColor = color;
      gradient.appendChild(stop);
    }
    defs.appendChild(gradient);
    svg.appendChild(defs);
    const pathData =
      'M' +
      start.x +
      ' ' +
      start.y +
      ' C' +
      control1.x +
      ' ' +
      control1.y +
      ' ' +
      control2.x +
      ' ' +
      control2.y +
      ' ' +
      end.x +
      ' ' +
      end.y;
    const glow = svgElement('path', {
      d: pathData,
      class: 'pp-fw-trail-glow',
      stroke: 'url(#' + gradientId + ')',
    });
    const line = svgElement('path', {
      d: pathData,
      class: 'pp-fw-trail',
      stroke: 'url(#' + gradientId + ')',
    });
    svg.append(glow, line);
    effect.root.appendChild(svg);
    const length = line.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) throw new Error('Invalid decorative flight path');
    const tailLength = Math.max(15, Math.min(32 * scale, length * 0.38));
    const fadeMs = 220;
    const flightOffset = flightMs / (flightMs + fadeMs);
    for (const [path, peak] of [
      [glow, 0.19],
      [line, 0.9],
    ]) {
      path.style.strokeDasharray = tailLength + ' ' + length * 2;
      path.style.strokeDashoffset = String(tailLength);
      animate(
        effect,
        path,
        [
          { strokeDashoffset: String(tailLength), opacity: 0 },
          { strokeDashoffset: String(tailLength - length * 0.1), opacity: peak, offset: flightOffset * 0.1 },
          { strokeDashoffset: String(tailLength - length), opacity: peak, offset: flightOffset },
          { strokeDashoffset: String(tailLength - length), opacity: 0 },
        ],
        { duration: flightMs + fadeMs, easing: 'linear' },
      );
    }
    const head = addParticle(effect, 'pp-fw-comet-head', color2);
    const frames = [];
    const samples = 28;
    for (let i = 0; i <= samples; i += 1) {
      const point = line.getPointAtLength((length * i) / samples);
      frames.push({
        offset: i / samples,
        transform:
          'translate3d(' + (point.x - end.x).toFixed(2) + 'px,' + (point.y - end.y).toFixed(2) + 'px,0)',
        opacity: i === 0 || i === samples ? 0 : 0.95,
      });
    }
    animate(effect, head, frames, { duration: flightMs, easing: 'linear' });
  }

  function launchOne(rect, group) {
    const w = rect.width;
    const h = rect.height;
    const side = Math.random() < 0.5 ? -1 : 1;
    const clampX = (x) => Math.max(w * 0.06, Math.min(w * 0.94, x));
    const start = { x: w * (0.24 + Math.random() * 0.52), y: h * (0.88 + Math.random() * 0.08) };
    // Owner-approved upper-left/upper-right sky coordinates.
    const end = {
      x: w * (side < 0 ? 0.05 + Math.random() * 0.22 : 0.75 + Math.random() * 0.22),
      y: h * (0.05 + Math.random() * 0.07),
    };
    const control1 = { x: clampX(start.x + side * w * (0.18 + Math.random() * 0.12)), y: start.y - h * 0.32 };
    const control2 = { x: clampX(end.x + side * w * (0.12 + Math.random() * 0.08)), y: end.y + h * 0.14 };
    const root = document.createElement('div');
    root.className = 'pp-park-firework';
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('inert', '');
    root.style.left = rect.left + end.x + 'px';
    root.style.top = rect.top + end.y + 'px';
    document.body.appendChild(root);
    const effect = { root, animations: [] };
    group.effects.push(effect);
    const scale = Math.max(0.78, Math.min(1.15, rect.width / 80));
    const flightMs = 360 + Math.random() * 120;
    const glint = addParticle(effect, 'pp-fw-glint', COLORS[0]);

    try {
      addFlight(effect, rect, start, end, control1, control2, flightMs, scale);
      animate(
        effect,
        glint,
        [
          { transform: 'scale(.3) rotate(0deg)', opacity: 0 },
          { transform: 'scale(1) rotate(20deg)', opacity: 0.85, offset: 0.2 },
          { transform: 'scale(.6) rotate(55deg)', opacity: 0 },
        ],
        { delay: flightMs, duration: 400, easing: 'ease-out' },
      );

      for (let i = 0; i < SETTINGS.particleCount; i += 1) {
        const angle = (i / SETTINGS.particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.21;
        const radius = (28 + Math.random() * 20) * scale;
        const dx = Math.cos(angle) * radius;
        const dy = Math.sin(angle) * radius;
        const rotation = (angle * 180) / Math.PI + 90;
        const drift = (10 + Math.random() * 11) * scale;
        const star = i % 4 === 0;
        const particle = addParticle(
          effect,
          'pp-fw-spark' + (star ? ' pp-fw-spark--star' : ''),
          COLORS[i % COLORS.length],
        );
        if (!star) particle.style.height = 5 + Math.random() * 4 + 'px';
        const move = (x, y, size) =>
          'translate3d(' +
          x.toFixed(2) +
          'px,' +
          y.toFixed(2) +
          'px,0) rotate(' +
          rotation.toFixed(1) +
          'deg) scale(' +
          size +
          ')';
        animate(
          effect,
          particle,
          [
            { transform: move(0, 0, 0.3), opacity: 0 },
            { transform: move(dx * 0.36, dy * 0.36, 1), opacity: 0.95, offset: 0.18 },
            { transform: move(dx * 0.86, dy * 0.86 + drift * 0.22, 0.8), opacity: 0.8, offset: 0.58 },
            { transform: move(dx, dy + drift, 0.2), opacity: 0 },
          ],
          {
            delay: flightMs + Math.random() * 45,
            duration: 640 + Math.random() * 210,
            easing: 'cubic-bezier(.15,.65,.3,1)',
          },
        );
      }
    } catch (error) {
      console.error('[ParkPulse Fireworks] Launch failed:', error);
      removeEffect(effect);
      group.effects = group.effects.filter((item) => item !== effect);
      // A failed decorative launch must not affect the original click behavior.
    }
  }

  function launchGroup(rect, source, id, celebration) {
    if (motionDisabled()) {
      clearInteraction();
      return;
    }
    const group = { effects: [], timer: 0, sourceId: id, key: source.key, celebration };
    active = group;
    const count = celebration ? SETTINGS.celebrationCount : 1;
    for (let i = 0; i < count; i += 1) launchOne(rect, group);
    if (!group.effects.length) {
      if (active === group) clearEffect();
      return;
    }
    if (celebration) {
      celebrationCooldownUntil = performance.now() + SETTINGS.celebrationCooldownMs;

      // Trigger the gauge flourish once per Easter egg celebration.
      try {
        window.ParkPulseScoreGauge?.celebrate?.(source.key);
      } catch (error) {
        console.warn('[ParkPulse Fireworks] Gauge celebration could not start:', error);
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
      const control =
        event.target instanceof Element
          ? event.target.closest('button.park-select-btn[data-park-key], #parkGrid .park-card[data-park-key]')
          : null;
      const key = control?.dataset.parkKey;
      const currentKey = active?.key || pendingLaunch?.key;
      if (PARK_KEYS.has(key) && currentKey && currentKey !== key) clearEffect();
      return;
    }
    if (
      motionDisabled() ||
      viewingDetails() ||
      !visible(source.image) ||
      typeof Element.prototype.animate !== 'function'
    ) {
      clearInteraction();
      return;
    }
    if (
      getComputedStyle(document.documentElement).getPropertyValue('--pp-park-fireworks-ready').trim() !== '1'
    ) {
      clearInteraction();
      return;
    }
    const id = sourceId(source);
    if (
      (active?.celebration && active.sourceId === id) ||
      (pendingLaunch?.celebration && pendingLaunch.sourceId === id)
    ) {
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearInteraction();
  });
  document.addEventListener(
    'toggle',
    () => {
      if (viewingDetails()) clearInteraction();
    },
    true,
  );
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
    const observer = new MutationObserver((records) => {
      if (!active && !pendingFrame && !tapTimes.length) return;
      if (
        records.some(
          (record) =>
            record.target instanceof Element &&
            record.target.matches('details, dialog, .modal-overlay, [role="dialog"]'),
        ) &&
        viewingDetails()
      ) {
        clearInteraction();
      }
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'open', 'aria-hidden', 'aria-modal'],
    });
  }
  window.ParkPulseFireworks = Object.freeze({ version: '1.3.0', settings: SETTINGS });
})();
