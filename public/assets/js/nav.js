/* Park Pulse navigation: hash routes, content panes and the five-tab bottom dock.
   Owns PPUI.navigation. Loads after history.js and before app-shell.js. The older navigation code in
   app-shell.js returns early when #ppNavigation already exists, so only this module builds the shell.
   Tab order below is also the slide direction between panes. */
(() => {
  'use strict';

  const PARKS = {
    magic_kingdom: 'Magic Kingdom',
    epcot: 'EPCOT',
    hollywood_studios: 'Hollywood Studios',
    animal_kingdom: 'Animal Kingdom',
  };

  const TABS = [
    {
      view: 'attractions',
      label: 'Attractions',
      icon: '<path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6Z"/><path d="M14 5v3m0 3v2m0 3v3"/>',
    },
    {
      view: 'trends',
      label: 'Trends',
      icon: '<path d="M4 20V4m0 16h16M8 15l4-5 4 2 5-7"/>',
    },
    {
      view: 'overview',
      label: 'Pulse',
      center: true,
      icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    },
    {
      view: 'history',
      label: 'History',
      icon: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    },
    {
      view: 'more',
      label: 'More',
      dots: true,
      icon: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    },
  ];

  const VIEWS = TABS.map((tab) => tab.view);
  const PARK_VIEWS = VIEWS.filter((view) => view !== 'overview');
  const NEEDS_PARK = ['attractions', 'trends', 'history'];
  const SIMPLE_ROUTE = new RegExp(`^#/(${VIEWS.join('|')})$`);
  const PARK_ROUTE = new RegExp(`^#/park/([a-z_]+)/(${PARK_VIEWS.join('|')})$`);
  const SLIDE_MS = 240;
  const SLIDE_PX = 28;

  const panes = {};
  let current = { view: 'overview', park: null };
  let chosenPark = null;
  let applying = false;
  let routed = false;
  let slide = null;
  let nav;
  let indicator;
  let parkSelect;
  let picker;
  let unavailable;
  let content;
  let ridesPanel;
  let chartPanel;
  let historyPanel;

  const validPark = (key) => Object.prototype.hasOwnProperty.call(PARKS, key);
  const parkAvailable = (key) => !parkData?.unavailable && !!parkData?.parks?.[key];
  const routeKey = (route) => `${route.view}|${route.park || ''}`;

  function parseRoute(hash) {
    const simple = hash.match(SIMPLE_ROUTE);
    if (simple) return { view: simple[1], park: null };

    const selected = hash.match(PARK_ROUTE);
    if (selected && validPark(selected[1])) return { view: selected[2], park: selected[1] };

    return { view: 'overview', park: null };
  }

  function routeURL(view, park) {
    if (view === 'overview') return '#/overview';
    return validPark(park) ? `#/park/${park}/${view}` : `#/${view}`;
  }

  function navigate(view, park, replace = false) {
    const url = routeURL(view, park);

    if (replace || location.hash === url) {
      history.replaceState(history.state, '', url);
      applyRoute(parseRoute(url));
    } else {
      location.hash = url;
    }
  }

  function move(node, destination) {
    if (node) destination.appendChild(node);
  }

  function closeOpenDetails() {
    if (document.getElementById('rideModalOverlay')?.classList.contains('active')) closeRideModal(false);
    if (document.getElementById('hmModalOverlay')?.classList.contains('active')) closeHeatmapRideModal();
    if (document.getElementById('closureModalOverlay')?.classList.contains('active')) closeClosureModal();
    if (document.getElementById('parkWaitModalOverlay')?.classList.contains('active')) closeParkWaitModal();
  }

  function motionOn() {
    return window.ParkPulseMotion
      ? window.ParkPulseMotion.enabled
      : !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ---- Pane slide ---- */

  function endSlide() {
    if (!slide) return;
    const { anims, outgoing } = slide;
    slide = null;
    anims.forEach((a) => a.cancel());
    outgoing.classList.remove('pp-pane-leaving');
    outgoing.inert = false;
    outgoing.hidden = outgoing !== panes[current.view];
    content.classList.remove('pp-panes-sliding');
  }

  function showPane(nextView, previousView) {
    endSlide();

    for (const [view, pane] of Object.entries(panes)) pane.hidden = view !== nextView;

    const incoming = panes[nextView];
    const outgoing = panes[previousView];
    const animate =
      routed &&
      previousView !== nextView &&
      incoming &&
      outgoing &&
      typeof incoming.animate === 'function' &&
      motionOn();

    routed = true;
    if (!animate) return;

    const dir = VIEWS.indexOf(nextView) > VIEWS.indexOf(previousView) ? 1 : -1;
    outgoing.hidden = false;
    outgoing.inert = true;
    outgoing.classList.add('pp-pane-leaving');
    content.classList.add('pp-panes-sliding');

    const timing = { duration: SLIDE_MS, easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'forwards' };
    const anims = [
      outgoing.animate(
        [
          { opacity: 1, transform: 'translateX(0)' },
          { opacity: 0, transform: `translateX(${-dir * SLIDE_PX}px)` },
        ],
        timing,
      ),
      incoming.animate(
        [
          { opacity: 0, transform: `translateX(${dir * SLIDE_PX}px)` },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        timing,
      ),
    ];
    const mine = { anims, outgoing };
    slide = mine;
    Promise.all(anims.map((a) => a.finished))
      .then(() => {
        if (slide === mine) endSlide();
      })
      .catch(() => {});
  }

  /* ---- The heatmap panel serves Trends (Today) and History (Explore History) ---- */

  function placeHistoryPanel(view) {
    if (view !== 'trends' && view !== 'history') return;

    const host = panes[view];
    if (historyPanel.parentElement !== host) host.appendChild(historyPanel);

    const button = document.getElementById(view === 'history' ? 'ppExploreView' : 'ppTodayView');
    if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
  }

  /* ---- Dock ---- */

  function placeIndicator(animate) {
    if (!nav || !indicator) return;

    const active = nav.querySelector('a[aria-current="page"]');
    if (!active || active.classList.contains('pp-tab-center')) {
      indicator.classList.remove('on');
      return;
    }

    const dock = nav.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    if (!rect.width) return;

    const glide = !!animate && indicator.classList.contains('on');
    indicator.classList.toggle('anim', glide);
    indicator.style.width = `${rect.width}px`;
    indicator.style.height = `${rect.height}px`;
    indicator.style.transform = `translate(${rect.left - dock.left - nav.clientLeft}px,${rect.top - dock.top - nav.clientTop}px)`;
    indicator.classList.add('on');
  }

  function measureDock() {
    document.documentElement.style.setProperty('--pp-bottom', `${Math.ceil(nav.getBoundingClientRect().height)}px`);
  }

  function buildDock() {
    nav = document.createElement('nav');
    nav.id = 'ppNavigation';
    nav.className = 'pp-dock';
    nav.setAttribute('aria-label', 'Main navigation');

    indicator = document.createElement('span');
    indicator.className = 'pp-dock-ind';
    indicator.setAttribute('aria-hidden', 'true');
    nav.appendChild(indicator);

    for (const tab of TABS) {
      const link = document.createElement('a');
      link.className = tab.center ? 'pp-tab pp-tab-center' : 'pp-tab';
      link.dataset.tab = tab.view;
      link.innerHTML =
        '<span class="pp-tab-icon"><svg class="pp-ico' + (tab.dots ? ' pp-ico-fill' : '') +
        '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + tab.icon + '</svg></span>' +
        '<span class="pp-tab-label">' + tab.label + '</span>';

      link.addEventListener('click', (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

        event.preventDefault();

        if (tab.center && motionOn()) {
          link.classList.remove('pp-pop');
          void link.offsetWidth;
          link.classList.add('pp-pop');
        }

        navigate(tab.view, chosenPark);
      });

      nav.appendChild(link);
    }
  }

  /* ---- Routing ---- */

  function updateNavigation() {
    nav.querySelectorAll('[data-tab]').forEach((link) => {
      const view = link.dataset.tab;
      link.href = routeURL(view, chosenPark);

      if (view === current.view) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    parkSelect.value = current.park || chosenPark || '';
    parkSelect.parentElement.hidden = current.view === 'overview';

    const needsPark = NEEDS_PARK.includes(current.view);
    const requiresChoice = needsPark && !current.park;

    picker.hidden = !requiresChoice;
    if (requiresChoice) panes[current.view].prepend(picker);

    const missingReport = needsPark && !!current.park && !parkAvailable(current.park);

    unavailable.hidden = !missingReport;
    if (missingReport) {
      panes[current.view].prepend(unavailable);
      unavailable.textContent =
        `${PARKS[current.park]} reports are unavailable. ` +
        'No current waits or operating status are assumed.';
    }

    const blocked = requiresChoice || missingReport;

    ridesPanel.hidden = current.view !== 'attractions' || blocked;
    chartPanel.hidden = current.view !== 'trends' || blocked;
    historyPanel.hidden = !['trends', 'history'].includes(current.view) || blocked;

    placeIndicator(true);
  }

  function applyRoute(next) {
    const previousKey = routeKey(current);
    const previousView = current.view;
    const nextKey = routeKey(next);
    const changed = previousKey !== nextKey;

    if (changed) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      closeOpenDetails();
    }

    applying = true;

    try {
      current = next;

      if (next.park) {
        chosenPark = next.park;
        if (parkAvailable(next.park)) selectPark(next.park);
      }

      placeHistoryPanel(next.view);
      showPane(next.view, previousView);
      updateNavigation();

      requestAnimationFrame(() => {
        if (routeKey(current) !== nextKey) return;

        if (next.view === 'trends' || next.view === 'history') {
          window.dispatchEvent(new Event('resize'));
          if (next.view === 'trends' && chartInstance) chartInstance.resize();
        }

        if (changed) content.focus({ preventScroll: true });
      });
    } finally {
      applying = false;
    }
  }

  /* ---- Setup ---- */

  function initialize() {
    if (document.getElementById('ppNavigation')) return;

    const container = document.querySelector('.container');

    ridesPanel = document.getElementById('ridesPanel');
    chartPanel = document.getElementById('trendChart')?.closest('.panel');
    historyPanel = document.querySelector('.heatmap-panel');

    if (!container || !ridesPanel || !chartPanel || !historyPanel) {
      console.error('Park Pulse navigation: required baseline nodes missing.');
      return;
    }

    const header = document.createElement('header');
    header.id = 'ppNavigationHeader';
    header.innerHTML = `
      <a href="#/overview">PARK PULSE</a>
      <label>
        Park
        <select id="ppNavigationPark" aria-label="Selected park">
          <option value="">Choose park</option>
        </select>
      </label>
    `;

    parkSelect = header.querySelector('select');

    for (const [key, name] of Object.entries(PARKS)) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = name;
      parkSelect.appendChild(option);
    }

    content = document.createElement('main');
    content.id = 'ppNavigationContent';
    content.tabIndex = -1;

    for (const view of VIEWS) {
      const pane = document.createElement('section');
      pane.dataset.ppPane = view;
      pane.setAttribute('aria-label', view);
      pane.hidden = true;
      panes[view] = pane;
      content.appendChild(pane);
    }

    move(container.querySelector('.hero'), panes.overview);
    move(document.getElementById('bestParkBanner'), panes.overview);
    move(container.querySelector('.section-label'), panes.overview);
    move(document.getElementById('hoursNote'), panes.overview);
    move(document.getElementById('parkGrid'), panes.overview);

    move(ridesPanel, panes.attractions);
    move(chartPanel, panes.trends);
    move(historyPanel, panes.trends);

    move(document.getElementById('themeToggleBtn'), panes.more);
    move(document.getElementById('weatherPanel'), panes.more);
    move(document.getElementById('pcAvailabilityPanel'), panes.more);
    move(container.querySelector('footer'), panes.more);

    const oldGrid = container.querySelector('.content-grid');
    if (oldGrid) oldGrid.hidden = true;

    picker = document.createElement('div');
    picker.id = 'ppParkPicker';
    picker.innerHTML = '<h2>Choose your park</h2>';

    for (const [key, name] of Object.entries(PARKS)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.addEventListener('click', () => navigate(current.view, key, true));
      picker.appendChild(button);
    }

    unavailable = document.createElement('p');
    unavailable.id = 'ppNavigationUnavailable';
    unavailable.setAttribute('role', 'status');
    unavailable.hidden = true;

    buildDock();

    container.prepend(header);
    header.after(content);
    document.body.appendChild(nav);
    document.body.classList.add('pp-navigation-enabled');

    parkSelect.addEventListener('change', () => {
      if (!validPark(parkSelect.value)) return;
      navigate(current.view === 'overview' ? 'attractions' : current.view, parkSelect.value);
    });

    // Called from core selectPark() and renderAll().
    PPUI.navigation = {
      canSelect: validPark,
      afterSelect(key) {
        chosenPark = key;
        if (!applying) navigate(current.view === 'overview' ? 'attractions' : current.view, key);
      },
      afterRenderAll() {
        if (current.park && parkAvailable(current.park) && activeParkKey !== current.park) {
          applying = true;
          try {
            selectPark(current.park);
          } finally {
            applying = false;
          }
        }
        updateNavigation();
      },
    };

    window.addEventListener('hashchange', () => applyRoute(parseRoute(location.hash)));
    window.addEventListener('resize', () => placeIndicator(false));

    new ResizeObserver(() => {
      measureDock();
      placeIndicator(false);
    }).observe(nav);

    document.fonts?.ready.then(() => placeIndicator(false));
    measureDock();

    if (!location.hash) history.replaceState(history.state, '', '#/overview');

    applyRoute(parseRoute(location.hash));
  }

  const start = () => queueMicrotask(initialize);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
