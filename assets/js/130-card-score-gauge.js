/* Park Pulse: presentation-only park score gauges. Load after existing scripts. */
(() => {
  'use strict';
  if (window.ParkPulseScoreGauge) return;

  const SETTINGS = Object.freeze({
    visibleRatio: 0.9, viewportInset: 48, entranceDelayMs: 300,
    entranceMs: 2400, updateMs: 1800,
    minimumOvershoot: 0.9, maximumOvershoot: 1.65, returnRatio: 0.65,
    selectionDelayMs: 180, selectionMs: 1500
  });
  const states = new Map();
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
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
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 &&
      r.top < window.innerHeight && r.left < document.documentElement.clientWidth;
  }

  function detailsAreBeingViewed() {
    if (document.hidden) return true;
    for (const modal of document.querySelectorAll('.modal-overlay.active, dialog[open], [role="dialog"][aria-modal="true"]')) {
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
    if (motionPreference.matches || detailsAreBeingViewed() || !state.visible || !sufficientlyVisible(state.node) ||
        Math.abs(distance) < 0.00001) {
      settle(state);
      return;
    }
    const direction = Math.sign(distance);
    const amplitude = Math.min(SETTINGS.maximumOvershoot,
      Math.max(SETTINGS.minimumOvershoot, Math.abs(distance) * 0.3));
    const clamp = value => Math.max(0, Math.min(10, value));
    const motion = {
      from: state.position,
      over: clamp(state.target + direction * amplitude),
      under: clamp(state.target - direction * amplitude * SETTINGS.returnRatio),
      to: state.target, start: performance.now(), duration, kind: 'score'
    };
    state.motion = motion;
    function interpolate(a, b, progress) { return a + (b - a) * progress; }
    function smooth(progress) { return progress * progress * (3 - 2 * progress); }
    function step(now) {
      if (state.motion !== motion) return;
      if (!state.valid || !state.node.isConnected || detailsAreBeingViewed() || !state.visible) {
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
    if (!state.valid || state.started || detailsAreBeingViewed() || !state.visible || !sufficientlyVisible(state.node)) return;
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
    if (!state.valid || state.started || detailsAreBeingViewed() || !state.visible || !sufficientlyVisible(state.node)) {
      clearEntrance(state);
      return;
    }
    if (motionPreference.matches) {
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

  const observer = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
        for (const entry of entries) {
          const state = states.get(entry.target.dataset.ppScorePark);
          if (!state || state.node !== entry.target) continue;
          state.visible = entry.isIntersecting && entry.intersectionRatio >= SETTINGS.visibleRatio;
          if (!state.visible || detailsAreBeingViewed()) settle(state);
          else revealOnce(state);
        }
        tryPendingSelection();
      }, {
        threshold: [0, SETTINGS.visibleRatio, 1],
        rootMargin: '0px 0px -' + SETTINGS.viewportInset + 'px 0px'
      })
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
    if (motionPreference.matches || detailsAreBeingViewed() || !sufficientlyVisible(state.node)) {
      settle(state);
      return;
    }
    const motion = { kind: 'selection', from: state.position, start: performance.now() };
    state.motion = motion;
    const smooth = p => p * p * (3 - 2 * p);
    const mix = (a, b, p) => a + (b - a) * p;
    function step(now) {
      if (state.motion !== motion) return;
      if (!state.valid || !state.node.isConnected || !state.visible ||
          !sufficientlyVisible(state.node) || detailsAreBeingViewed()) {
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
        position = mix(10, 0, smooth((p - 0.24) / 0.30));
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
    if (motionPreference.matches) {
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
    if (motionPreference.matches) {
      cancelPendingSelection();
      state.started = true;
      settle(state);
      return;
    }
    tryPendingSelection();
  }

  function makeState(key) {
    const node = document.createElement('span');
    const gradientId = 'pp-score-gradient-' + (++nextId);
    node.className = 'score-badge pp-score-gauge';
    node.dataset.ppScorePark = key;
    node.dataset.status = 'unavailable';
    node.setAttribute('role', 'img');
    const star = 'M27 46.2 L29.4 50.6 L33.8 53 L29.4 55.4 L27 59.8 L24.6 55.4 L20.2 53 L24.6 50.6 Z';
    node.innerHTML = '<svg class="pp-score-dial" viewBox="0 0 120 80" aria-hidden="true" focusable="false">' +
      '<defs><linearGradient id="' + gradientId + '" gradientUnits="userSpaceOnUse" x1="14" y1="53" x2="106" y2="53">' +
      '<stop offset="0" class="pp-score-stop-green"/>' +
      '<stop offset="0.42" class="pp-score-stop-yellow"/>' +
      '<stop offset="0.72" class="pp-score-stop-orange"/>' +
      '<stop offset="1" class="pp-score-stop-red"/>' +
      '</linearGradient></defs>' +
      '<path class="pp-score-track" d="M14 53 A46 46 0 0 1 106 53"/>' +
      '<path class="pp-score-arc" d="M14 53 A46 46 0 0 1 106 53" stroke="url(#' + gradientId + ')"/>' +
      '<g class="pp-score-pointer" transform="rotate(0 60 53)">' +
      '<path class="pp-score-wand-outline" d="M60 53 L27 53"/>' +
      '<path class="pp-score-wand" d="M60 53 L27 53"/>' +
      '<path class="pp-score-star-outline" d="' + star + '"/>' +
      '<path class="pp-score-star" d="' + star + '"/>' +
      '</g><circle class="pp-score-pivot" cx="60" cy="53" r="3.3"/>' +
      '</svg><span class="pp-score-reading" aria-hidden="true"><span class="pp-score-value"></span>' +
      '<span class="pp-score-denominator"> / 10</span></span>';
    return {
      key, node, needle: node.querySelector('.pp-score-pointer'),
      value: node.querySelector('.pp-score-value'),
      target: null, position: 0, valid: false, started: false, visible: false,
      frame: 0, motion: null, observed: false, entranceTimer: 0
    };
  }

  function updateState(state, score, valid, parkName) {
    const wasValid = state.valid;
    const changed = state.target !== score;
    state.valid = valid;
    state.target = valid ? score : null;
    const label = parkName + (valid ? ': busyness score ' + score + ' out of 10' : ': busyness score unavailable');
    state.node.setAttribute('aria-label', label);
    state.node.title = label;
    state.value.textContent = valid ? String(score) : 'N/A';
    if (!valid) {
      clearEntrance(state);
      cancelMotion(state);
      state.node.dataset.status = 'unavailable';
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
    if (getComputedStyle(document.documentElement).getPropertyValue('--pp-score-gauge-ready').trim() !== '1') {
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
      const suppressed = badge === state.node
        ? state.node.dataset.status === 'unavailable'
        : badge.classList.contains('score-na');
      const score = park.crowd_score;
      const valid = !suppressed && typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 10;
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

  const previousRenderCards = renderCards;
  renderCards = function(...args) {
    const result = previousRenderCards.apply(this, args);
    syncGauges();
    return result;
  };

  const previousSelectPark = selectPark;
  selectPark = function(...args) {
    selectionDepth += 1;
    let result;
    try {
      result = previousSelectPark.apply(this, args);
    } finally {
      selectionDepth -= 1;
    }
    const key = args[0];
    if (selectionDepth === 0 && typeof key === 'string' && activeParkKey === key && parkData?.parks?.[key]) {
      queueSelection(key);
    }
    return result;
  };

  // Also resume a held selection when expanded detail content scrolls out of view.
  window.addEventListener('scroll', scheduleFallbackVisibility, { passive: true });
  window.addEventListener('resize', scheduleFallbackVisibility, { passive: true });
  document.addEventListener('scroll', scheduleFallbackVisibility, { capture: true, passive: true });
  document.addEventListener('toggle', scheduleFallbackVisibility, true);
  if (typeof MutationObserver === 'function' && document.body) {
    const detailObserver = new MutationObserver(records => {
      if (records.some(record => record.target instanceof Element &&
          record.target.matches('details, dialog, .modal-overlay, [role="dialog"]'))) {
        scheduleFallbackVisibility();
      }
    });
    detailObserver.observe(document.body, {
      subtree: true, attributes: true,
      attributeFilter: ['class', 'open', 'aria-hidden', 'aria-modal']
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
    if (motionPreference.matches) {
      const selected = pendingSelection && states.get(pendingSelection.key);
      cancelPendingSelection();
      if (selected?.valid) selected.started = true;
      for (const state of states.values()) settle(state);
    }
    refreshVisibility();
  };
  if (motionPreference.addEventListener) motionPreference.addEventListener('change', handleMotionPreference);
  else motionPreference.addListener(handleMotionPreference);
  window.addEventListener('pagehide', () => {
    if (pendingSelection?.timer) clearTimeout(pendingSelection.timer);
    if (pendingSelection) pendingSelection.timer = 0;
    for (const state of states.values()) settle(state);
  });
  window.addEventListener('pageshow', refreshVisibility);

  window.ParkPulseScoreGauge = Object.freeze({ version: '1.3.0', settings: SETTINGS });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncGauges, { once: true });
  else syncGauges();
})();
