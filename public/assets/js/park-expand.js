/* Park Pulse park card expansion (Overview): a Pulse park card grows into its detailed card.
   The real #parkGrid (and its handlers) is moved into the panel while open and returned on close.
   While an animation plays, #ppParkExpand gets data-motion=run so park-expand.css turns blur off.
   On touch devices it also lazy-loads park-parallax.js (opt-in tilt effects: artwork parallax and the snow globe).
   Load after app-shell.js and snapshot.js. Styles live in assets/css/park-expand.css. */
(() => {
  'use strict';
  if (window.ParkPulseParkExpand) return;

  const OPEN_MS = 420;
  const CLOSE_MS = 300;
  const EASE_OPEN = 'cubic-bezier(.22,1,.36,1)';
  const EASE_CLOSE = 'cubic-bezier(.4,0,.2,1)';
  const NAMES = {
    magic_kingdom: 'Magic Kingdom',
    epcot: 'EPCOT',
    hollywood_studios: 'Hollywood Studios',
    animal_kingdom: 'Animal Kingdom',
  };
  const INERT_IDS = ['ppNavigationHeader', 'ppNavigationContent', 'ppNavigation'];
  const FOCUSABLE = 'a[href],button:not([disabled]),summary,input:not([disabled]),select:not([disabled]),[tabindex="0"]';

  let home = null;
  let overlay = null;
  let backdrop = null;
  let panel = null;
  let toolbar = null;
  let closeButton = null;
  let scroller = null;
  let actions = null;
  let state = 'closed';
  let token = 0;
  let anims = [];
  let activeKey = null;
  let sourceCard = null;
  let gridHome = null;
  let gridNext = null;
  let previousOverflow = '';
  let inertRestore = [];
  let pendingWeather = false;

  function motionOn() {
    const allowed = window.ParkPulseMotion
      ? window.ParkPulseMotion.enabled
      : !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return allowed && !!panel && typeof panel.animate === 'function';
  }

  function overlayZ() {
    const modal = document.getElementById('parkWaitModalOverlay');
    const z = modal ? parseInt(getComputedStyle(modal).zIndex, 10) : NaN;
    return Number.isFinite(z) && z > 101 ? Math.min(150, z - 1) : 150;
  }

  function setMotion(on) {
    if (!overlay) return;
    if (on) overlay.dataset.motion = 'run';
    else delete overlay.dataset.motion;
  }

  function build() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'ppParkExpand';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="pp-expand-backdrop" aria-hidden="true"></div>' +
      '<div class="pp-expand-panel" role="dialog" aria-modal="true" tabindex="-1">' +
      '<div class="pp-expand-toolbar"><span class="pp-expand-eyebrow">Park details</span>' +
      '<button type="button" class="pp-expand-close" aria-label="Close park details">\u2715</button></div>' +
      '<div class="pp-expand-scroll"></div>' +
      '<div class="pp-expand-actions">' +
      '<a class="pp-expand-action" data-target="attractions">View attractions \u2192</a>' +
      '<a class="pp-expand-action" data-target="trends">Wait trends \u2192</a></div>' +
      '</div>';
    document.body.appendChild(overlay);
    backdrop = overlay.querySelector('.pp-expand-backdrop');
    panel = overlay.querySelector('.pp-expand-panel');
    toolbar = overlay.querySelector('.pp-expand-toolbar');
    closeButton = overlay.querySelector('.pp-expand-close');
    scroller = overlay.querySelector('.pp-expand-scroll');
    actions = overlay.querySelector('.pp-expand-actions');

    backdrop.addEventListener('click', () => close());
    closeButton.addEventListener('click', () => close());
    actions.addEventListener('click', (event) => {
      if (event.target.closest('.pp-expand-action')) close({ immediate: true, noFocus: true });
    });
    // Weather links inside the card used to scroll to the weather panel; send them to the More tab instead.
    panel.addEventListener(
      'click',
      (event) => {
        if (!event.target.closest('.pulse-weather-details, .pulse-weather-pill')) return;
        event.preventDefault();
        event.stopPropagation();
        openWeather();
      },
      true,
    );
  }

  function hideLegacy() {
    const legacy = document.getElementById('ppDetailedParkConditions');
    if (legacy && !legacy.hidden) {
      legacy.open = false;
      legacy.hidden = true;
      legacy.inert = true;
    }
  }

  function decorate() {
    if (!home) return;
    home.querySelectorAll('.pp1b-card[data-park]').forEach((card) => {
      if (card.dataset.ppExpand) return;
      card.dataset.ppExpand = '1';
      card.setAttribute('role', 'button');
      card.setAttribute('aria-haspopup', 'dialog');
      card.setAttribute('aria-expanded', 'false');
      card.setAttribute('aria-description', 'Opens the detailed park card');
    });
    const more = home.querySelector('.pp1b-more');
    if (more && /Detailed park conditions/.test(more.textContent)) more.textContent = 'Weather, closures and tools \u2192';
  }

  function setInert(on) {
    if (on) {
      inertRestore = INERT_IDS.map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((el) => ({ el, was: el.inert }));
      inertRestore.forEach((item) => {
        item.el.inert = true;
      });
    } else {
      inertRestore.forEach((item) => {
        item.el.inert = item.was;
      });
      inertRestore = [];
    }
  }

  function disableCardClicks() {
    const grid = document.getElementById('parkGrid');
    if (!grid) return;
    // The card's own click handler selects the park and navigates; inside the panel it must do nothing.
    grid.querySelectorAll('.park-card').forEach((card) => {
      card.onclick = null;
    });
  }

  function restoreGrid() {
    const grid = document.getElementById('parkGrid');
    if (!grid || !gridHome || grid.parentNode === gridHome) return;
    if (gridNext && gridNext.parentNode === gridHome) gridHome.insertBefore(grid, gridNext);
    else gridHome.appendChild(grid);
  }

  function cancelAnims() {
    anims.forEach((animation) => {
      try {
        animation.cancel();
      } catch (error) {
        /* already finished */
      }
    });
    anims = [];
  }

  function geometry() {
    const src = sourceCard.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const dx = src.left + src.width / 2 - (box.left + box.width / 2);
    const dy = src.top + src.height / 2 - (box.top + box.height / 2);
    const ix = Math.max(0, (box.width - src.width) / 2);
    const iy = Math.max(0, (box.height - src.height) / 2);
    return {
      from: {
        transform: 'translate(' + dx + 'px,' + dy + 'px)',
        clipPath: 'inset(' + iy + 'px ' + ix + 'px ' + iy + 'px ' + ix + 'px round 14px)',
      },
      to: { transform: 'translate(0px,0px)', clipPath: 'inset(0px 0px 0px 0px round 24px)' },
    };
  }

  function playOpen(t) {
    const g = geometry();
    const parts = [toolbar, scroller, actions];
    setMotion(true);
    anims = [
      panel.animate([g.from, g.to], { duration: OPEN_MS, easing: EASE_OPEN, fill: 'backwards' }),
      ...parts.map((el) =>
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 140, easing: 'ease-out', fill: 'backwards' }),
      ),
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'backwards' }),
    ];
    Promise.all(anims.map((animation) => animation.finished))
      .then(() => {
        if (t !== token) return;
        setMotion(false);
        if (state === 'opening') state = 'open';
      })
      .catch(() => {});
  }

  function playClose(t) {
    cancelAnims();
    const g = geometry();
    const parts = [toolbar, scroller, actions];
    setMotion(true);
    anims = [
      panel.animate([g.to, g.from], { duration: CLOSE_MS, easing: EASE_CLOSE, fill: 'forwards' }),
      ...parts.map((el) =>
        el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-in', fill: 'forwards' }),
      ),
      backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, delay: 40, easing: 'ease-in', fill: 'forwards' }),
    ];
    Promise.all(anims.map((animation) => animation.finished))
      .then(() => {
        if (t === token) finalize(true);
      })
      .catch(() => {});
  }

  function finalize(focus) {
    token += 1;
    cancelAnims();
    setMotion(false);
    const card = sourceCard;
    state = 'closed';
    if (overlay) overlay.hidden = true;
    restoreGrid();
    document.body.style.overflow = previousOverflow;
    setInert(false);
    if (card) {
      card.classList.remove('pp-expand-source');
      card.setAttribute('aria-expanded', 'false');
      if (focus && card.isConnected) card.focus({ preventScroll: true });
    }
    sourceCard = null;
    activeKey = null;
  }

  function openFor(card) {
    if (state !== 'closed') return;
    const key = card.dataset.park;
    const grid = document.getElementById('parkGrid');
    const live =
      !!grid &&
      !isDataUnavailable() &&
      !!grid.querySelector('.park-card[data-park-key="' + key + '"]');
    if (!live) {
      // No detailed card to show (feed unavailable): keep the old behavior and go to Attractions.
      location.hash = card.getAttribute('href') || '#/park/' + key + '/attractions';
      return;
    }
    build();
    hideLegacy();
    activeKey = key;
    sourceCard = card;
    gridHome = grid.parentNode;
    gridNext = grid.nextSibling;
    scroller.appendChild(grid);
    disableCardClicks();
    overlay.dataset.park = key;
    overlay.style.zIndex = String(overlayZ());
    panel.setAttribute('aria-label', (NAMES[key] || 'Park') + ' details');
    actions.querySelectorAll('.pp-expand-action').forEach((link) => {
      link.setAttribute('href', '#/park/' + key + '/' + link.dataset.target);
    });
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setInert(true);
    card.setAttribute('aria-expanded', 'true');
    card.classList.add('pp-expand-source');
    overlay.hidden = false;
    scroller.scrollTop = 0;
    token += 1;
    const t = token;
    if (motionOn()) {
      state = 'opening';
      playOpen(t);
    } else {
      state = 'open';
    }
    closeButton.focus({ preventScroll: true });
  }

  function close(options) {
    if (state === 'closed' || state === 'closing') return;
    const opts = options || {};
    if (opts.immediate || !motionOn()) {
      finalize(!opts.noFocus);
      return;
    }
    state = 'closing';
    token += 1;
    playClose(token);
  }

  function revealWeather() {
    const weather = document.getElementById('weatherPanel');
    if (!weather) return;
    weather.open = true;
    weather.scrollIntoView({ behavior: motionOn() ? 'smooth' : 'auto', block: 'start' });
  }

  function openWeather() {
    const key = activeKey;
    if (!key) return;
    const target = '#/park/' + key + '/more';
    close({ immediate: true, noFocus: true });
    if (location.hash === target) {
      revealWeather();
    } else {
      pendingWeather = true;
      location.hash = target;
    }
  }

  document.addEventListener('click', (event) => {
    if (!home || !event.target.closest) return;
    const card = event.target.closest('#ppCompactOverview .pp1b-card[data-park]');
    if (!card || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openFor(card);
  });

  document.addEventListener('keydown', (event) => {
    if (state === 'closed') {
      if ((event.key === ' ' || event.key === 'Spacebar') && home && event.target.matches && event.target.matches('.pp1b-card[data-park]')) {
        event.preventDefault();
        openFor(event.target);
      }
      return;
    }
    if (document.querySelector('.modal-overlay.active')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab' && panel) {
      const nodes = [...panel.querySelectorAll(FOCUSABLE)].filter((node) => node.getClientRects().length);
      if (!nodes.length) {
        event.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener('hashchange', () => {
    close({ immediate: true, noFocus: true });
    if (pendingWeather) {
      pendingWeather = false;
      requestAnimationFrame(() => requestAnimationFrame(revealWeather));
    }
  });
  window.addEventListener('pagehide', () => close({ immediate: true, noFocus: true }));

  function start() {
    home = document.getElementById('ppCompactOverview');
    if (!home) {
      const waiter = new MutationObserver(() => {
        if (document.getElementById('ppCompactOverview')) {
          waiter.disconnect();
          start();
        }
      });
      waiter.observe(document.body, { childList: true, subtree: true });
      return;
    }
    decorate();
    hideLegacy();
    new MutationObserver(decorate).observe(home, { childList: true, subtree: true });
    const grid = document.getElementById('parkGrid');
    if (grid) {
      new MutationObserver(() => {
        if (state !== 'closed') disableCardClicks();
      }).observe(grid, { childList: true });
    }
  }

  // Opt-in tilt effects: only fetched on touch devices that report motion events.
  // The ?v= value is bumped with park-parallax.js so a phone never keeps running an older cached copy.
  function loadParallax() {
    if (window.ParkPulseParallax || !window.DeviceOrientationEvent || !window.matchMedia('(pointer: coarse)').matches) return;
    const script = document.createElement('script');
    script.src = '/assets/js/park-parallax.js?v=1.2.0';
    script.async = true;
    document.head.appendChild(script);
  }

  window.ParkPulseParkExpand = Object.freeze({
    version: '1.0.0',
    open: (key) => {
      const card = home && home.querySelector('.pp1b-card[data-park="' + key + '"]');
      if (card) openFor(card);
    },
    close: () => close(),
    isOpen: () => state !== 'closed',
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => queueMicrotask(start), { once: true });
  } else {
    queueMicrotask(start);
  }
  loadParallax();
})();
