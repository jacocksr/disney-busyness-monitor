/* Park Pulse lean-card presentation: Attractions snapshot, Best Park evidence and Overview park-card expansion.
   Load after app-shell.js. Uses existing live stats/comparisons without changing ranking or API logic. */
(() => {
  'use strict';

  const SEP = ' \u00b7 ';
  let snap;
  let avgSrc;
  let cmpSrc;
  let metaSrc;
  let head;
  let trend;
  let meta;
  let matchNote;
  let queued = false;
  let ready = false;

  function leanSchedule(text) {
    return text.replace(/^Scheduled close/, 'Closes').replace(/\b(\d{1,2}):00 ([AP]M)/g, '$1 $2');
  }

  /* "Today · 9:00 AM EST" becomes "Updated 9:00 AM". */
  function leanFresh(text) {
    const m = text.match(
      /^(Today|Yesterday|[A-Z][a-z]{2} \d{1,2}(?:, \d{4})?) \u00b7 (\d{1,2}:\d{2} [AP]M)(?: ([A-Za-z]{2,5}))?$/,
    );
    if (m) {
      const day = m[1] === 'Today' ? '' : m[1] === 'Yesterday' ? 'yesterday ' : m[1] + ', ';
      const zone = m[3] && !/^E[SD]T$/.test(m[3]) ? ' ' + m[3] : '';
      return 'Updated ' + day + m[2] + zone;
    }
    const ago = text.match(/^Snapshot (\d+) min ago$/);
    if (ago) return 'Updated ' + ago[1] + ' min ago';
    return text === 'older report' ? 'Older report' : text;
  }

  function toneOf(text) {
    const t = text.toLowerCase();
    if (/busier|higher|more crowded|above/.test(t)) return 'busy';
    if (/quieter|lower|lighter|less crowded|below/.test(t)) return 'quiet';
    return 'typical';
  }

  function connect() {
    snap = document.getElementById('ppSelectedParkSnapshot');
    if (!snap) return false;
    const a = snap.querySelector('[data-average]');
    const c = snap.querySelector('[data-comparison]');
    const m = snap.querySelector('[data-meta]');
    if (!a || !c || !m) return false;

    if (!ready) {
      avgSrc = a;
      cmpSrc = c;
      metaSrc = m;
      head = document.createElement('div');
      head.className = 'pp-snap-headline';
      trend = document.createElement('div');
      trend.className = 'pp-snap-trend';
      meta = document.createElement('div');
      meta.className = 'pp-snap-meta';
      const explanation = snap.querySelector('.pp1b-explanation');
      matchNote = document.createElement('p');
      matchNote.className = 'pp-snap-match';
      matchNote.hidden = true;
      if (explanation) explanation.append(matchNote);
      const watcher = new MutationObserver(schedule);
      [a, c, m].forEach((node) => watcher.observe(node, { childList: true, characterData: true, subtree: true }));
      new MutationObserver(schedule).observe(snap, { childList: true });
      snap.classList.add('pp-snap-lean');
      ready = true;
    }
    if (head.previousElementSibling !== avgSrc) avgSrc.after(head);
    if (trend.previousElementSibling !== cmpSrc) cmpSrc.after(trend);
    if (meta.previousElementSibling !== metaSrc) metaSrc.after(meta);
    return true;
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function relativeWait(pct) {
    if (pct === 0) return 'At usual levels';
    return Math.abs(pct) + '% ' + (pct < 0 ? 'below' : 'above') + ' usual';
  }

  function pickReason(rows) {
    const pct = rows[0].comp.pctDiff;
    const prefix = pct === 0 ? 'Waits match usual levels' : 'Waits are ' + relativeWait(pct);
    if (rows.length === 1) return prefix + '. Only park with sufficient comparison data.';
    const gap = rows[1].comp.pctDiff - pct;
    if (gap === 0) return prefix + '. Tied for the lowest relative waits on the rounded comparison.';
    if (gap <= 3) return prefix + '. Narrow lead: ' + gap + ' percentage point' + (gap === 1 ? '' : 's') + ' ahead of the next park.';
    if (rows.every((row) => row.comp.pctDiff > 0)) return prefix + '. All compared parks are above usual; this is the smallest increase.';
    return prefix + '\u2014the lowest relative waits among the parks compared.';
  }

  function closingContext(key, park) {
    const hours = normalizeHours(park.hours);
    if (!hours || hours.day !== curveET(new Date()).day) return 'Today\u2019s closing time unverified';
    const match = String(hours.close).match(/^(\d{1,2}):(\d{2})$/);
    if (!match || Number(match[1]) > 47 || Number(match[2]) > 59) return 'Today\u2019s closing time unverified';
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const remaining = Number(match[1]) * 60 + Number(match[2]) - now.getHours() * 60 - now.getMinutes();
    const phase = getParkPhase(key, park);
    if (remaining <= 0 || phase.isSpecialEvent || phase.clearingQueues) return 'Regular hours ended; check event/admission details';
    const h = Math.floor(remaining / 60), m = remaining % 60;
    const left = [h ? h + 'h' : '', m ? m + 'm' : ''].filter(Boolean).join(' ');
    return 'Closes ' + fmtClock(hours.close).replace(':00 ', ' ') + ' ET' + SEP + left + ' left';
  }

  /* Enhance the existing collapsible card after app-shell mounts it. No global function wrapping. */
  function renderBestEvidence() {
    const banner = document.getElementById('bestParkBanner');
    const inner = banner?.querySelector('.pp-best-more-inner');
    if (!inner || isDataUnavailable()) return;
    const rows = PARK_ORDER.map((key) => ({ key, park: parkData.parks[key] }))
      .filter((row) => row.park)
      .map((row) => ({ ...row, comp: getParkComparison(row.key, row.park) }))
      .filter((row) => row.comp.status === 'ready' && Number.isFinite(row.comp.pctDiff))
      .sort((a, b) => a.comp.pctDiff - b.comp.pctDiff);
    if (!rows.length) {
      delete banner.dataset.bestPark;
      return;
    }
    const best = rows[0], runner = rows[1];
    const stamp = Date.parse(parkData.updated_at), now = Date.now();
    const known = Number.isFinite(stamp) && stamp <= now + 60000;
    const age = known ? Math.max(0, Math.floor((now - stamp) / 60000)) : null;
    const olderDay = known && curveET(new Date(stamp)).day !== curveET(new Date(now)).day;
    const delayed = !known || olderDay || age > STALE_THRESHOLD_MINUTES;
    let body = inner.querySelector('.pp-best-evidence');
    if (!body) {
      body = document.createElement('div');
      body.className = 'pp-best-evidence';
      body.innerHTML = '<p class="pp-best-reason"></p><dl class="pp-best-facts"><div data-best-runner-row><dt data-best-runner-label>Next closest</dt><dd data-best-runner></dd></div></dl><p class="pp-best-hours"></p><a class="pp-best-link"></a>';
      inner.replaceChildren(body);
    }
    banner.classList.add('pp-best-evidence-card');
    if (banner.dataset.bestPark !== best.key) banner.dataset.bestPark = best.key;
    setText(banner.querySelector('.best-park-title'), best.park.name);
    setText(banner.querySelector('.best-park-eyebrow'), delayed ? 'Best Park \u00b7 Last Available Report' : 'Best Park Right Now');
    const reason = pickReason(rows);
    setText(body.querySelector('.pp-best-reason'), delayed ? 'Last report: ' + reason.charAt(0).toLowerCase() + reason.slice(1) : reason);
    body.querySelector('[data-best-runner-row]').hidden = !runner;
    if (runner) {
      setText(body.querySelector('[data-best-runner-label]'), runner.comp.pctDiff === best.comp.pctDiff ? 'Also tied' : 'Next closest');
      setText(body.querySelector('[data-best-runner]'), runner.park.name + SEP + relativeWait(runner.comp.pctDiff));
    }
    setText(body.querySelector('.pp-best-hours'), closingContext(best.key, best.park));
    const link = body.querySelector('.pp-best-link');
    const href = '#/park/' + best.key + '/trends';
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
    setText(link, 'See ' + best.park.name + ' wait trends \u2192');
  }

  function render() {
    queued = false;
    renderBestEvidence();
    if (!connect()) return;
    const avg = avgSrc.textContent.trim();
    const i = avg.indexOf(SEP);
    const value = i < 0 ? avg : avg.slice(0, i);
    const label = i < 0 ? '' : avg.slice(i + SEP.length);
    const strong = document.createElement('strong');
    strong.textContent = value;
    const tail = label === 'Average posted wait' ? ' avg wait' : label ? SEP + label : '';
    head.replaceChildren(strong, document.createTextNode(tail));
    const cmp = cmpSrc.textContent.trim();
    const mm = cmp.match(/^(.*?) \u00b7 matched (\d+)\/(\d+) qualifying attractions$/);
    const phrase = mm ? mm[1] : cmp;
    trend.replaceChildren();
    if (phrase) {
      if (/unavailable/i.test(phrase)) {
        const note = document.createElement('span');
        note.className = 'pp-snap-muted';
        note.textContent = phrase;
        trend.append(note);
      } else {
        const pill = document.createElement('span');
        pill.className = 'pp-pill';
        pill.dataset.tone = toneOf(phrase);
        pill.textContent = phrase;
        trend.append(pill);
      }
    }
    if (mm) {
      matchNote.textContent = 'This comparison covers ' + mm[2] + ' of ' + mm[3] + ' qualifying attractions.';
      matchNote.hidden = false;
    } else {
      matchNote.hidden = true;
    }
    const mt = metaSrc.textContent.trim();
    const j = mt.indexOf(SEP);
    const schedule = j < 0 ? mt : mt.slice(0, j);
    const fresh = j < 0 ? '' : mt.slice(j + SEP.length);
    meta.textContent = [leanSchedule(schedule), fresh && leanFresh(fresh)].filter(Boolean).join(SEP);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(render);
  }

  function start() {
    const banner = document.getElementById('bestParkBanner');
    if (banner) new MutationObserver(schedule).observe(banner, { childList: true, characterData: true, subtree: true });
    const source = document.querySelector('#ppCompactOverview [data-source]');
    if (source) new MutationObserver(schedule).observe(source, { childList: true, characterData: true, subtree: true });
    if (connect()) {
      render();
    } else {
      const waiter = new MutationObserver(() => {
        if (connect()) {
          waiter.disconnect();
          render();
        }
      });
      waiter.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('hashchange', schedule);
    window.addEventListener('pageshow', schedule);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => queueMicrotask(start), { once: true });
  } else {
    queueMicrotask(start);
  }
})();

/* ==========================================================================
 * Park card expansion (Overview): a Pulse park card grows into its detailed card.
 * The real #parkGrid (and its handlers) is moved into the panel while open and returned on close.
 * ========================================================================== */
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
    anims = [
      panel.animate([g.from, g.to], { duration: OPEN_MS, easing: EASE_OPEN, fill: 'backwards' }),
      ...parts.map((el) =>
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 140, easing: 'ease-out', fill: 'backwards' }),
      ),
      backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease-out', fill: 'backwards' }),
    ];
    Promise.all(anims.map((animation) => animation.finished))
      .then(() => {
        if (t === token && state === 'opening') state = 'open';
      })
      .catch(() => {});
  }

  function playClose(t) {
    cancelAnims();
    const g = geometry();
    const parts = [toolbar, scroller, actions];
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
})();
