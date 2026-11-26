/* Park Pulse: park score gauge (PPUI.gauges, window.ParkPulseScoreGauge).
   Draws the crowd-score dial on each park card: a colored semicircle with a wand needle that points at the
   score. The needle is always drawn at its true position, whether or not a dialog is open. It glides only when a
   live refresh changes the score (it jumps straight there when Animations are off or Reduced Motion is on).
   There is no entrance sweep and no selection or repeat-press animation.
   Load after core.js and before effects.js. effects.js still holds the older gauge block, which stops at once
   when window.ParkPulseScoreGauge already exists. TODO: delete that block (the first IIFE) from effects.js.
   Markup and class names match the "Card score gauge" styles in effects.css. Only the data-status values
   'available' and 'unavailable' are used, so the old 'pending' hiding rule never applies. */
(() => {
  'use strict';
  if (window.ParkPulseScoreGauge) return;

  const GLIDE_MS = 700;
  const DEGREES_PER_POINT = 18;
  const states = new Map();
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let nextId = 0;
  let missingStyleWarned = false;

  function motionDisabled() {
    return motionPreference.matches || window.ParkPulseMotion?.enabled === false;
  }

  function place(state, score) {
    state.position = score;
    state.needle.setAttribute('transform', 'rotate(' + (score * DEGREES_PER_POINT).toFixed(3) + ' 60 53)');
  }

  function stopGlide(state) {
    if (state.frame) cancelAnimationFrame(state.frame);
    state.frame = 0;
  }

  function settle(state) {
    stopGlide(state);
    if (state.valid) place(state, state.target);
  }

  function glideTo(state, target) {
    stopGlide(state);
    if (motionDisabled() || document.hidden || Math.abs(target - state.position) < 0.001) {
      place(state, target);
      return;
    }
    const from = state.position;
    const start = performance.now();
    function step(now) {
      const progress = Math.min(1, (now - start) / GLIDE_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      place(state, from + (target - from) * eased);
      state.frame = progress < 1 ? requestAnimationFrame(step) : 0;
    }
    state.frame = requestAnimationFrame(step);
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
      placed: false,
      na: false,
      frame: 0,
    };
  }

  function updateState(state, score, valid, parkName) {
    state.valid = valid;
    state.target = valid ? score : null;
    const label =
      parkName + (valid ? ': busyness score ' + score + ' out of 10' : ': busyness score unavailable');
    state.node.setAttribute('aria-label', label);
    state.node.title = label;
    state.value.textContent = valid ? String(score) : 'N/A';
    if (!valid) {
      stopGlide(state);
      state.node.dataset.status = 'unavailable';
      return;
    }
    state.node.dataset.status = 'available';
    if (!state.placed) {
      state.placed = true;
      place(state, score);
    } else {
      glideTo(state, score);
    }
  }

  function sync() {
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
      // The card renderer decides N/A (for example a closed park); keep that decision.
      if (badge !== state.node) state.na = badge.classList.contains('score-na');
      const score = park.crowd_score;
      const valid =
        !state.na && typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 10;
      if (badge !== state.node) badge.replaceWith(state.node);
      updateState(state, score, valid, park.name || key);
    }
  }

  function settleAll() {
    for (const state of states.values()) settle(state);
  }

  // Called from core renderCards() / selectPark(). The selection hooks are kept so those call sites stay valid.
  PPUI.gauges = {
    sync,
    enterSelection() {},
    exitSelection() {},
    afterSelection() {},
    celebrate: () => false,
  };

  function watchGrid() {
    const grid = document.getElementById('parkGrid');
    if (!grid || typeof MutationObserver !== 'function') return;
    // Safety net: if cards are ever redrawn without the render hook, put the gauges back.
    new MutationObserver(() => {
      if (grid.querySelector('.park-card .score-badge:not(.pp-score-gauge)')) sync();
    }).observe(grid, { childList: true });
  }

  if (motionPreference.addEventListener) motionPreference.addEventListener('change', settleAll);
  else motionPreference.addListener(settleAll);
  window.addEventListener('parkpulse:motionchange', settleAll);
  window.addEventListener('parkpulsemotionchange', settleAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) settleAll();
  });
  window.addEventListener('pagehide', settleAll);

  window.ParkPulseScoreGauge = Object.freeze({ version: '2.0.0', celebrate: () => false });

  function start() {
    sync();
    watchGrid();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
