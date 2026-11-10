/* Park Pulse app shell: hash routing, header and bottom dock, compact overview, freshness badge,
   theme transition, global settings, header logo, park picker and context cards.
   Each section initializes on DOMContentLoaded (in a microtask), in this order. */

/* ==========================================================================
 * Navigation shell and routing (PPUI.navigation)
 * ========================================================================== */
/* Park Pulse — Phase 3, Part 1A.
   Additive navigation foundation.
   Existing feature scripts and data contracts remain unchanged. */

(() => {
  'use strict';

  const PARKS = {
    magic_kingdom: 'Magic Kingdom',
    epcot: 'EPCOT',
    hollywood_studios: 'Hollywood Studios',
    animal_kingdom: 'Animal Kingdom',
  };

  const VIEWS = ['overview', 'attractions', 'trends', 'more'];
  const panes = {};
  const positions = new Map();

  let current = { view: 'overview', park: null };
  let chosenPark = null;
  let applying = false;
  let nav;
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
    const simple = hash.match(/^#\/(overview|attractions|trends|more)$/);

    if (simple) {
      return { view: simple[1], park: null };
    }

    const selected = hash.match(/^#\/park\/([a-z_]+)\/(attractions|trends|more)$/);

    if (selected && validPark(selected[1])) {
      return { view: selected[2], park: selected[1] };
    }

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
    if (document.getElementById('rideModalOverlay')?.classList.contains('active')) {
      closeRideModal(false);
    }

    if (document.getElementById('hmModalOverlay')?.classList.contains('active')) {
      closeHeatmapRideModal();
    }

    if (document.getElementById('closureModalOverlay')?.classList.contains('active')) {
      closeClosureModal();
    }

    if (document.getElementById('parkWaitModalOverlay')?.classList.contains('active')) {
      closeParkWaitModal();
    }
  }

  function updateNavigation() {
    nav.querySelectorAll('[data-view]').forEach((link) => {
      const view = link.dataset.view;
      link.href = routeURL(view, chosenPark);

      if (view === current.view) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    parkSelect.value = current.park || chosenPark || '';
    parkSelect.parentElement.hidden = current.view === 'overview';

    const requiresChoice = ['attractions', 'trends'].includes(current.view) && !current.park;

    picker.hidden = !requiresChoice;

    if (requiresChoice) {
      panes[current.view].prepend(picker);
    }

    const missingReport =
      ['attractions', 'trends'].includes(current.view) && !!current.park && !parkAvailable(current.park);

    unavailable.hidden = !missingReport;

    if (missingReport) {
      panes[current.view].prepend(unavailable);
      unavailable.textContent =
        `${PARKS[current.park]} reports are unavailable. ` +
        'No current waits or operating status are assumed.';
    }

    ridesPanel.hidden = current.view !== 'attractions' || requiresChoice || missingReport;

    chartPanel.hidden = current.view !== 'trends' || requiresChoice || missingReport;

    historyPanel.hidden = current.view !== 'trends' || requiresChoice || missingReport;
  }

  function applyRoute(next) {
    const previousKey = routeKey(current);
    const nextKey = routeKey(next);
    const changed = previousKey !== nextKey;

    if (changed) {
      positions.set(previousKey, window.scrollY);
      closeOpenDetails();
    }

    applying = true;

    try {
      current = next;

      if (next.park) {
        chosenPark = next.park;

        if (parkAvailable(next.park)) {
          selectPark(next.park);
        }
      }

      for (const [view, pane] of Object.entries(panes)) {
        pane.hidden = view !== next.view;
      }

      updateNavigation();

      requestAnimationFrame(() => {
        if (routeKey(current) !== nextKey) return;

        if (next.view === 'trends') {
          window.dispatchEvent(new Event('resize'));

          if (chartInstance) {
            chartInstance.resize();
          }
        }

        if (changed) {
          window.scrollTo({
            top: positions.get(nextKey) || 0,
            behavior: 'auto',
          });

          content.focus({ preventScroll: true });
        }
      });
    } finally {
      applying = false;
    }
  }

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
        <select id="ppNavigationPark"
                aria-label="Selected park">
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

    const hero = container.querySelector('.hero');
    const sectionLabel = container.querySelector('.section-label');

    move(hero, panes.overview);
    move(document.getElementById('bestParkBanner'), panes.overview);
    move(sectionLabel, panes.overview);
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
      button.addEventListener('click', () => {
        navigate(current.view, key, true);
      });
      picker.appendChild(button);
    }

    unavailable = document.createElement('p');
    unavailable.id = 'ppNavigationUnavailable';
    unavailable.setAttribute('role', 'status');
    unavailable.hidden = true;

    nav = document.createElement('nav');
    nav.id = 'ppNavigation';
    nav.setAttribute('aria-label', 'Main navigation');

    for (const view of VIEWS) {
      const link = document.createElement('a');
      link.dataset.view = view;
      link.textContent = view.charAt(0).toUpperCase() + view.slice(1);

      link.addEventListener('click', (event) => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

        event.preventDefault();
        navigate(view, chosenPark);
      });

      nav.appendChild(link);
    }

    container.prepend(header);
    header.after(content);
    document.body.appendChild(nav);
    document.body.classList.add('pp-navigation-enabled');

    parkSelect.addEventListener('change', () => {
      if (!validPark(parkSelect.value)) return;

      navigate(current.view === 'overview' ? 'attractions' : current.view, parkSelect.value);
    });

    // Called from core selectPark() / renderAll().
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

    window.addEventListener('hashchange', () => {
      applyRoute(parseRoute(location.hash));
    });

    const measureNavigation = () => {
      document.documentElement.style.setProperty('--pp-bottom', `${nav.getBoundingClientRect().height}px`);
    };

    new ResizeObserver(measureNavigation).observe(nav);
    measureNavigation();

    if (!location.hash) {
      history.replaceState(history.state, '', '#/overview');
    }

    applyRoute(parseRoute(location.hash));
  }

  const start = () => queueMicrotask(initialize);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {
      once: true,
    });
  } else {
    start();
  }
})();

/* ==========================================================================
 * Compact overview and selected-park snapshot (PPUI.overview)
 * ========================================================================== */
/* Park Pulse Phase 3 Part 1B v1.0.2. Load AFTER 160-navigation-shell.js. */
(() => {
  'use strict';
  if (window.ParkPulsePart1B) return;
  const names = {
    magic_kingdom: 'Magic Kingdom',
    epcot: 'EPCOT',
    hollywood_studios: 'Hollywood Studios',
    animal_kingdom: 'Animal Kingdom',
  };
  const keys = Object.keys(names);
  const cards = new Map();
  let mounted = false,
    queued = false,
    home,
    snapshot,
    zone;
  const text = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };
  function snapshotAge(iso, now = Date.now()) {
    const stamp = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!Number.isFinite(stamp) || stamp > now + 60000)
      return { minutes: null, stale: true, previousDay: false };
    const minutes = Math.max(0, Math.floor((now - stamp) / 60000));
    const previousDay = curveET(new Date(stamp)).day !== curveET(new Date(now)).day;
    return { minutes, stale: minutes > STALE_THRESHOLD_MINUTES || previousDay, previousDay };
  }
  function currentHours(park) {
    const h = normalizeHours(park?.hours);
    if (!h || h.day !== curveET(new Date()).day) return null;
    const clock = (value) => {
      const p = String(value).split(':').map(Number);
      return (
        p.length === 2 &&
        Number.isInteger(p[0]) &&
        Number.isInteger(p[1]) &&
        p[0] >= 0 &&
        p[0] <= 47 &&
        p[1] >= 0 &&
        p[1] < 60
      );
    };
    return clock(h.open) && clock(h.close) ? h : null;
  }
  function model(key) {
    const age = snapshotAge(parkData?.updated_at);
    const park = !parkData?.unavailable ? parkData?.parks?.[key] : null;
    if (!park) {
      const loading = !liveFetchAttempted;
      return {
        park: null,
        age,
        state: loading ? 'loading' : 'unavailable',
        value: loading ? 'Loading…' : 'Unavailable',
        label: loading ? 'Loading wait reports' : 'Wait data unavailable',
        schedule: 'Operating state unverified',
        freshness: loading ? 'Waiting for source reports' : 'No current report',
      };
    }
    let stats = { avgWait: null, longest: null };
    if (Array.isArray(park.rides)) {
      try {
        stats = computeLiveStats(park);
      } catch (error) {
        console.warn('Part 1B: average unavailable', key, error);
      }
    }
    const hours = currentHours(park);
    const phase = hours ? getParkPhase(key, park) : null;
    const outside = !!phase && ['pre-open', 'closed-for-day'].includes(phase.phase);
    let schedule = 'Hours not verified';
    if (hours) {
      if (phase.awaiting) schedule = 'Awaiting today’s reports';
      else if (phase.phase === 'pre-open') schedule = 'Opens ' + fmtClock(hours.open) + ' ET';
      else if (phase.phase === 'early-entry') schedule = 'Early Entry period';
      else if (phase.phase === 'closed-for-day') schedule = 'After scheduled close';
      else if (phase.isSpecialEvent || phase.clearingQueues) schedule = 'After-hours context: see details';
      else schedule = 'Scheduled close ' + fmtClock(hours.close) + ' ET';
    }
    const numeric = Number.isFinite(stats.avgWait);
    const value = outside
      ? 'Not shown'
      : numeric
        ? stats.avgWait + ' min'
        : Array.isArray(park.rides)
          ? 'No qualifying waits'
          : 'Unavailable';
    const label = outside
      ? 'No current park average'
      : !numeric
        ? 'Positive-wait average unavailable'
        : age.minutes === null
          ? 'Reported average · age unknown'
          : age.stale
            ? 'Last reported average'
            : 'Average posted wait';
    const freshness =
      age.minutes === null
        ? 'Snapshot age unknown'
        : age.previousDay
          ? 'Previous-day snapshot'
          : age.stale
            ? age.minutes + ' min old · delayed'
            : 'Snapshot ' + age.minutes + ' min ago';
    return {
      park,
      stats,
      age,
      outside,
      state: age.stale ? 'delayed' : 'current',
      value,
      label,
      schedule,
      freshness,
    };
  }
  function comparison(key, data) {
    if (
      !data.park ||
      data.age.stale ||
      data.age.minutes === null ||
      data.outside ||
      !Number.isFinite(data.stats?.avgWait)
    )
      return 'Typical comparison unavailable';
    try {
      const c = getParkComparison(key, data.park);
      if (c.status !== 'ready' || !Number.isFinite(c.pctDiff)) return 'Typical comparison unavailable';
      return (
        vsTypicalText(c.pctDiff) +
        (Number.isFinite(c.matchedRides) && Number.isFinite(c.eligibleRides)
          ? ' · matched ' + c.matchedRides + '/' + c.eligibleRides + ' qualifying attractions'
          : '')
      );
    } catch (error) {
      console.warn('Part 1B: comparison unavailable', error);
      return 'Typical comparison unavailable';
    }
  }
  /* END DATA HELPERS */

  function refresh() {
    if (!mounted) return;
    keys.forEach((key) => {
      const data = model(key),
        nodes = cards.get(key);
      nodes.card.dataset.state = data.state;
      // Presentation mode is separate from freshness: delayed reports can also lack a number.
      const metricKind = Number.isFinite(data.stats?.avgWait) && !data.outside ? 'number' : 'message';
      if (nodes.card.dataset.ppMetricKind !== metricKind) nodes.card.dataset.ppMetricKind = metricKind;
      text(nodes.value, data.value);
      text(nodes.label, data.label);
      text(nodes.schedule, data.schedule);
      text(nodes.freshness, data.freshness);
      nodes.card.setAttribute(
        'aria-label',
        names[key] +
          '. ' +
          data.value +
          '. ' +
          data.label +
          '. ' +
          data.schedule +
          '. ' +
          data.freshness +
          '. View attractions.',
      );
    });
    const age = snapshotAge(parkData?.updated_at);
    const source = parkData?.unavailable
      ? liveFetchAttempted
        ? 'Wait feed unavailable. All four parks remain selectable.'
        : 'Loading wait reports…'
      : age.minutes === null
        ? 'Snapshot time unavailable; freshness is unverified.'
        : age.previousDay
          ? 'Last snapshot is from a previous Eastern park day.'
          : (age.stale ? 'Reports delayed · snapshot ' : 'Wait snapshot · ') + age.minutes + ' min ago';
    text(home.querySelector('[data-source]'), source);
    const match = location.hash.match(/^#\/park\/([a-z_]+)\/attractions$/);
    const key = match && keys.includes(match[1]) ? match[1] : null;
    snapshot.hidden = !key;
    if (key) {
      const data = model(key);
      snapshot.setAttribute('aria-label', names[key] + ' wait context');
      text(snapshot.querySelector('[data-average]'), data.value + ' · ' + data.label);
      text(snapshot.querySelector('[data-comparison]'), comparison(key, data));
      text(snapshot.querySelector('[data-meta]'), data.schedule + ' · ' + data.freshness);
    }
    if (zone && document.activeElement !== zone) zone.value = selectedTz;
  }
  function scheduleRefresh() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      refresh();
    });
  }
  function makeCard(key) {
    const card = document.createElement('a');
    card.className = 'pp1b-card';
    card.href = '#/park/' + key + '/attractions';
    card.dataset.park = key;
    const identity = document.createElement('div');
    identity.className = 'pp1b-identity';
    const image = document.createElement('img');
    image.src = PARK_EMOJI_IMAGES[key];
    image.alt = '';
    image.width = 40;
    image.height = 40;
    const heading = document.createElement('h2');
    heading.textContent = names[key];
    identity.append(image, heading);
    card.append(identity);
    const nodes = { card };
    for (const field of ['value', 'label', 'schedule', 'freshness']) {
      const node = document.createElement('div');
      node.className = 'pp1b-' + field;
      card.append(node);
      nodes[field] = node;
    }
    const action = document.createElement('span');
    action.className = 'pp1b-action';
    action.textContent = 'View park →';
    card.append(action);
    cards.set(key, nodes);
    return card;
  }
  function initialize() {
    if (mounted || document.getElementById('ppCompactOverview')) return;
    const overview = document.querySelector('[data-pp-pane="overview"]');
    const more = document.querySelector('[data-pp-pane="more"]');
    const attractions = document.querySelector('[data-pp-pane="attractions"]');
    const originalGrid = document.getElementById('parkGrid');
    if (!overview || !more || !attractions || !originalGrid) {
      console.error('Part 1B requires the working Part 1A navigation shell. No panels were moved.');
      return;
    }
    home = document.createElement('section');
    home.id = 'ppCompactOverview';
    home.setAttribute('aria-labelledby', 'pp1bOverviewTitle');
    home.innerHTML = `<h1 id="pp1bOverviewTitle">Your Disney day, at a glance.</h1><p class="pp1b-intro">Compare posted waits. Choose a park.</p><p class="pp1b-source" data-source></p><div class="pp1b-grid"></div><details class="pp1b-method"><summary>About these averages</summary><p>Averages use the existing qualifying standard attractions reported open with positive standby waits. Open zero-minute readings are not closures, but do not enter this average.</p><p>Missing or closed attractions can change which rides contribute. Averages are not attendance, complete-coverage claims, or guaranteed actual waits. Snapshot age describes the feed snapshot, not the exact observation time of every attraction.</p><p>Schedules use Eastern time. Historical context is not a forecast.</p></details><a class="pp1b-more" href="#/more">Detailed park conditions and tools →</a>`;
    keys.forEach((key) => home.querySelector('.pp1b-grid').append(makeCard(key)));
    overview.prepend(home);
    const legacy = document.createElement('details');
    legacy.id = 'ppDetailedParkConditions';
    legacy.innerHTML =
      '<summary>Detailed park cards, comparisons, hours and events</summary><div class="pp1b-legacy-body"></div>';
    const body = legacy.querySelector('.pp1b-legacy-body');
    [...overview.children].forEach((node) => {
      if (node === home) return;
      if (node.classList.contains('hero')) {
        node.hidden = true;
        node.inert = true;
        more.append(node);
      } else body.append(node);
    });
    more.prepend(legacy);

    const preferences = document.createElement('section');
    preferences.id = 'pp1bDisplayPreferences';
    preferences.innerHTML =
      '<h2>Display preferences</h2><label for="pp1bTimeZone">Display time zone</label><select id="pp1bTimeZone"></select><p>Schedules and historical day boundaries remain Eastern park time.</p>';
    zone = preferences.querySelector('select');
    TIMEZONES.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.label;
      zone.append(option);
    });
    zone.addEventListener('change', () => {
      selectedTz = zone.value;
      saveTzPref(selectedTz);
      renderTzOptions();
      updateTimestamp();
      scheduleRefresh();
    });
    const theme = document.getElementById('themeToggleBtn');
    if (theme) preferences.append(theme);
    more.insertBefore(preferences, legacy.nextSibling);
    snapshot = document.createElement('section');
    snapshot.id = 'ppSelectedParkSnapshot';
    snapshot.innerHTML = `<strong data-average></strong><p data-comparison></p><p data-meta></p><button type="button" class="pp1b-about" aria-label="About the park snapshot" aria-expanded="false" aria-controls="pp1bSnapshotExplanation">i</button><div id="pp1bSnapshotExplanation" class="pp1b-explanation" hidden><p>Current averages and historical comparisons can cover different sets of attractions. Comparisons match qualifying rides by weekday/hour and weight matched attractions equally.</p><p>A schedule or missing observation does not prove an attraction's current operation. No reopening time or interruption cause is inferred.</p></div>`;
    const button = snapshot.querySelector('button'),
      explanation = snapshot.querySelector('.pp1b-explanation');
    button.addEventListener('click', () => {
      explanation.hidden = !explanation.hidden;
      button.setAttribute('aria-expanded', String(!explanation.hidden));
    });
    attractions.prepend(snapshot);
    document.getElementById('rideSearch')?.setAttribute('aria-label', 'Search attractions or lands');
    document.body.classList.add('pp-overview-enabled');
    mounted = true;
    PPUI.overview = { scheduleRefresh }; // called from core renderAll/renderCards/updateTimestamp
    new MutationObserver(scheduleRefresh).observe(originalGrid, { childList: true });
    window.addEventListener('hashchange', scheduleRefresh);
    window.addEventListener('pageshow', scheduleRefresh);
    window.ParkPulsePart1B = Object.freeze({ version: '1.0.2', refresh: scheduleRefresh });
    refresh();
  }

  const start = () => queueMicrotask(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* ==========================================================================
 * Brand, freshness wording and park icons
 * ========================================================================== */
/* Park Pulse Part 1B repair 1.0.0. Load after 170-compact-overview.js. */
(() => {
  'use strict';
  if (window.ParkPulseRepairs) return;
  const scriptURL = document.currentScript?.src;
  const base = scriptURL ? new URL('../../', scriptURL) : new URL('.', document.baseURI);
  const paths = {
    magic_kingdom: 'images/MKEmoji_1_1023x1023.png',
    epcot: 'images/EPCOTEmoji_1_1023x1023.png',
    hollywood_studios: 'images/HSEmoji_1_1023x1023.png',
    animal_kingdom: 'images/AKEmoji_1_1023x1022.png',
  };
  const initials = { magic_kingdom: 'MK', epcot: 'E', hollywood_studios: 'HS', animal_kingdom: 'AK' };
  let queued = false,
    home;
  function reportTime(iso, now = Date.now(), preference = selectedTz) {
    const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!Number.isFinite(ms) || ms > now + 60000) return null;
    const zone = preference === 'local' ? undefined : preference;
    function format(useZone) {
      const opts = useZone ? { timeZone: useZone } : {};
      const dayKey = (date) => {
        const p = Object.fromEntries(
          new Intl.DateTimeFormat('en-US', { ...opts, year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(date)
            .map((x) => [x.type, x.value]),
        );
        return p.year + '-' + p.month + '-' + p.day;
      };
      const date = new Date(ms),
        today = new Date(now),
        day = dayKey(date),
        current = dayKey(today);
      const delta = Math.round(
        (Date.parse(current + 'T12:00:00Z') - Date.parse(day + 'T12:00:00Z')) / 86400000,
      );
      const dayLabel =
        delta === 0
          ? 'today'
          : delta === 1
            ? 'yesterday'
            : new Intl.DateTimeFormat('en-US', {
                ...opts,
                month: 'short',
                day: 'numeric',
                ...(day.slice(0, 4) !== current.slice(0, 4) ? { year: 'numeric' } : {}),
              }).format(date);
      const clock = new Intl.DateTimeFormat('en-US', {
        ...opts,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(date);
      const minutes = Math.max(0, Math.floor((now - ms) / 60000));
      const previousParkDay = curveET(date).day !== curveET(today).day;
      return {
        label: dayLabel + ' at ' + clock,
        short: dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1) + ' · ' + clock,
        minutes,
        older: minutes > STALE_THRESHOLD_MINUTES || previousParkDay,
      };
    }
    try {
      return format(zone);
    } catch (error) {
      return format('America/New_York');
    }
  }
  function updateWording() {
    const available =
      parkData && !parkData.unavailable && Object.keys(paths).some((k) => !!parkData.parks?.[k]);
    const stamp = reportTime(parkData?.updated_at);
    let message;
    if (!available)
      message = liveFetchAttempted
        ? 'Current wait reports are unavailable. You can still choose a park.'
        : 'Loading wait reports…';
    else if (!stamp)
      message =
        'Wait reports are available, but their update time is missing or invalid. Freshness cannot be confirmed.';
    else
      message = stamp.older
        ? 'Showing wait reports from ' +
          stamp.label +
          '. These are older reports, not confirmed current waits.'
        : 'Latest available wait reports: ' + stamp.label + ' · ' + stamp.minutes + ' min ago.';
    const source = home.querySelector('[data-source]');
    if (source && source.textContent !== message) source.textContent = message;
    for (const card of home.querySelectorAll('.pp1b-card[data-park]')) {
      if (!available || !parkData.parks?.[card.dataset.park]) continue;
      const node = card.querySelector('.pp1b-freshness');
      const label = stamp ? stamp.short + (stamp.older ? ' · older report' : '') : 'Update time unavailable';
      if (node && node.textContent !== label) node.textContent = label;
      const oldLabel = card.getAttribute('aria-label');
      if (oldLabel) {
        const fixed = oldLabel.replace(
          /Previous-day snapshot|Snapshot age unknown|Snapshot \d+ min ago|\d+ min old · delayed/g,
          label,
        );
        if (fixed !== oldLabel) card.setAttribute('aria-label', fixed);
      }
    }
    const meta = document.querySelector('#ppSelectedParkSnapshot [data-meta]');
    if (meta) {
      const label = stamp ? stamp.short + (stamp.older ? ' · older report' : '') : 'Update time unavailable';
      const next = meta.textContent.replace(
        /Previous-day snapshot|Snapshot age unknown|Snapshot \d+ min ago|\d+ min old · delayed/g,
        label,
      );
      if (next !== meta.textContent) meta.textContent = next;
    }
  }
  /* END WORDING HELPERS */

  function sourceFor(key) {
    const icon = home.querySelector('.pp1b-card[data-park="' + key + '"] .pp1b-identity img');
    if (icon?.complete && icon.naturalWidth > 0) return icon.currentSrc || icon.src;
    return new URL(paths[key], base).href;
  }
  function repairIcons() {
    for (const card of document.querySelectorAll('#parkGrid .park-card[data-park-key]')) {
      const key = card.dataset.parkKey;
      if (!paths[key]) continue;
      const identity = card.querySelector('.pulse-identity');
      if (!identity) continue;
      let image = identity.querySelector(':scope > img');
      if (!image) {
        image = document.createElement('img');
        image.alt = '';
        identity.prepend(image);
      }
      image.width = 80;
      image.height = 80;
      image.decoding = 'async';
      image.loading = 'eager';
      if (!image._ppIconRepair) {
        const fallback = document.createElement('span');
        fallback.className = 'pp-icon-fallback';
        fallback.textContent = initials[key];
        fallback.setAttribute('aria-hidden', 'true');
        fallback.hidden = true;
        image.after(fallback);
        const state = { key, fallback, retried: false };
        image._ppIconRepair = state;
        image.addEventListener('load', () => {
          image.classList.remove('pp-icon-failed');
          fallback.hidden = true;
        });
        image.addEventListener('error', () => {
          if (!state.retried) {
            state.retried = true;
            const retry = new URL(paths[key], base);
            retry.searchParams.set('pp_icon_retry', '1');
            image.src = retry.href;
          } else {
            image.classList.add('pp-icon-failed');
            fallback.hidden = false;
            fallback.title = 'Park icon could not be loaded';
            console.warn('Park Pulse: park icon could not load', { park: key, url: image.src });
          }
        });
      }
      const state = image._ppIconRepair;
      if (!state.retried) {
        const desired = sourceFor(key);
        if (image.src !== desired) image.src = desired;
        if (image.complete && image.naturalWidth === 0) image.dispatchEvent(new Event('error'));
      }
    }
  }
  function repair() {
    if (!home) return;
    updateWording();
    repairIcons();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      repair();
    });
  }
  function initialize() {
    home = document.getElementById('ppCompactOverview');
    if (!home) {
      console.error('Park Pulse repair requires the installed Part 1B overview.');
      return;
    }
    const heading = home.querySelector('#pp1bOverviewTitle');
    if (heading) {
      const warm = document.createElement('span');
      warm.className = 'hero-title-line hero-title-warm';
      warm.textContent = 'Your Best Disney Day';
      const cool = document.createElement('span');
      cool.className = 'hero-title-line hero-title-cool';
      cool.textContent = 'Starts Here';
      heading.replaceChildren(warm, document.createTextNode(' '), cool);
      heading.setAttribute('aria-label', 'Your Best Disney Day Starts Here');
    }
    const intro = home.querySelector('.pp1b-intro');
    if (intro) {
      const first = document.createElement('span');
      first.textContent = 'Live wait times. Smarter park choices.';
      const second = document.createElement('span');
      second.textContent = 'More time for the magic.';
      intro.replaceChildren(first, document.createTextNode(' '), second);
    }

    const options = { childList: true, subtree: true, characterData: true };
    new MutationObserver(schedule).observe(home, options);
    const grid = document.getElementById('parkGrid');
    if (grid) new MutationObserver(schedule).observe(grid, { childList: true, subtree: true });
    const snap = document.getElementById('ppSelectedParkSnapshot');
    if (snap) new MutationObserver(schedule).observe(snap, options);
    window.addEventListener('hashchange', schedule);
    window.addEventListener('pageshow', schedule);
    window.ParkPulseRepairs = Object.freeze({
      version: '1.0.0',
      refresh: schedule,
      icons: () =>
        [...document.querySelectorAll('#parkGrid .pulse-identity > img')].map((img) => ({
          park: img.closest('[data-park-key]')?.dataset.parkKey,
          url: img.currentSrc || img.src,
          loaded: img.complete && img.naturalWidth > 0,
          fallbackVisible: !!img._ppIconRepair && !img._ppIconRepair.fallback.hidden,
        })),
    });
    repair();
  }

  const start = () => queueMicrotask(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* ==========================================================================
 * Status badge and theme transition (PPUI.statusBadge, PPUI.theme)
 * ========================================================================== */
/* Park Pulse focused status-badge/theme repair v1.0.4. Load after 175-brand-freshness-icons.js. */
(() => {
  'use strict';
  if (window.ParkPulseStatusTheme) return;
  // ===== HEADER CONTROL SIZE SETTINGS — fine-tune both controls here =====
  const HEADER_CONTROLS = Object.freeze({
    baseWidthRem: 12,
    extraWidthPercent: 15,
    minInlineWidthRem: 10,
    heightRem: 2.75,
    fontSizeRem: 0.75,
    lineHeight: 1.35,
    radiusPx: 14,
    paddingInlinePx: 8,
    paddingBlockPx: 6,
    headerGapPx: 8,
    minLogoGapPx: 4,
    arrowInsetOffsetPx: 2, // Increase to move the park chevron farther left.
  });
  // ===== END HEADER CONTROL SIZE SETTINGS =====
  let home,
    wrap,
    badge,
    label,
    menu,
    ready = false,
    queued = false;
  let generation = 0,
    finishActive = null,
    nativeTransition = null,
    lastMode = 'none';
  function dateParts(iso, now = Date.now(), preference = selectedTz) {
    const stamp = typeof iso === 'string' ? Date.parse(iso) : NaN;
    if (!Number.isFinite(stamp) || stamp > now + 60000) return null;
    function format(zone) {
      const options = zone ? { timeZone: zone } : {};
      const key = (d) => {
        const p = Object.fromEntries(
          new Intl.DateTimeFormat('en-US', { ...options, year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(d)
            .map((v) => [v.type, v.value]),
        );
        return p.year + '-' + p.month + '-' + p.day;
      };
      const date = new Date(stamp),
        current = new Date(now),
        day = key(date),
        today = key(current);
      const delta = Math.round(
        (Date.parse(today + 'T12:00:00Z') - Date.parse(day + 'T12:00:00Z')) / 86400000,
      );
      const dayLabel =
        delta === 0
          ? 'Today'
          : delta === 1
            ? 'Yesterday'
            : new Intl.DateTimeFormat('en-US', {
                ...options,
                month: 'short',
                day: 'numeric',
                ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
              }).format(date);
      const time = new Intl.DateTimeFormat('en-US', {
        ...options,
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(date);
      const age = Math.max(0, Math.floor((now - stamp) / 60000));
      const old = age > STALE_THRESHOLD_MINUTES || curveET(date).day !== curveET(current).day;
      return { time, dayLabel, age, old };
    }
    try {
      return format(preference === 'local' ? undefined : preference);
    } catch (error) {
      return format('America/New_York');
    }
  }
  function badgeState() {
    if (!parkData || parkData.unavailable)
      return {
        text: liveFetchAttempted ? 'Wait data unavailable' : 'Loading reports…',
        kind: liveFetchAttempted ? 'unknown' : 'loading',
        detail: 'No current feed timestamp is available.',
      };
    const data = dateParts(parkData.updated_at);
    if (!data)
      return {
        text: 'Update time unavailable',
        kind: 'unknown',
        detail: 'The feed timestamp is missing or invalid. Freshness cannot be confirmed.',
      };
    if (isRefreshing)
      return {
        text: 'Updating…',
        kind: 'loading',
        detail: 'Last available report: ' + data.dayLabel + ', ' + data.time + '.',
      };
    return {
      text: data.old ? 'Last report: ' + data.dayLabel + ', ' + data.time : 'Updated: ' + data.time,
      kind: data.old ? 'old' : 'current',
      detail:
        'Latest available feed snapshot: ' +
        data.dayLabel +
        ', ' +
        data.time +
        '; ' +
        data.age +
        ' min ago. This is not the observation time of every attraction.',
    };
  }
  function refreshBadge() {
    if (!ready) return;
    const state = badgeState();
    if (label.textContent !== state.text) label.textContent = state.text;
    badge.dataset.reportState = state.kind;
    badge.classList.toggle('is-stale', state.kind === 'old' || state.kind === 'unknown');
    badge.classList.toggle('is-refreshing', state.kind === 'loading');
    badge.title = state.detail + ' Select to change the display time zone.';
    badge.setAttribute('aria-label', state.text + '. ' + state.detail + ' Change display time zone.');
    syncPopup();
    window.ParkPulseStatusTheme?.resizeHeader?.();
  }
  function queueRefresh() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      refreshBadge();
    });
  }
  function syncPopup() {
    if (!menu || !badge) return;
    const open = menu.classList.contains('open');
    badge.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    menu.querySelectorAll('.tz-option').forEach((option) => {
      option.setAttribute('role', 'button');
      option.tabIndex = 0;
      option.setAttribute('aria-pressed', String(option.classList.contains('selected')));
    });
  }
  function applyExistingTheme(next) {
    try {
      applyTheme(next);
    } finally {
      refreshBadge();
    }
  }
  /* END STATUS HELPERS */

  function installThemeTransition() {
    const root = document.documentElement;
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    PPUI.theme = {
      toggle() {
        // called from core toggleTheme()
        if (themeTransitionBusy) return;
        const next = currentTheme === 'dark' ? 'light' : 'dark';
        if (reduced()) {
          lastMode = 'instant-reduced-motion';
          applyExistingTheme(next);
          return;
        }
        themeTransitionBusy = true;
        const token = ++generation;
        let layer = null,
          timer = null,
          applied = false;
        function change() {
          if (applied) return;
          applied = true;
          applyExistingTheme(next);
        }
        function finish() {
          if (token !== generation) return;
          if (timer) clearTimeout(timer);
          layer?.remove();
          root.classList.remove('pp-theme-blending', 'pp-native-theme-change');
          themeTransitionBusy = false;
          nativeTransition = null;
          finishActive = null;
        }
        finishActive = finish;
        function fallback() {
          lastMode = 'fallback';
          const old = getComputedStyle(document.body);
          layer = document.createElement('div');
          layer.className = 'pp-theme-background-overlay';
          layer.setAttribute('aria-hidden', 'true');
          for (const prop of [
            'backgroundImage',
            'backgroundColor',
            'backgroundPosition',
            'backgroundSize',
            'backgroundRepeat',
          ])
            layer.style[prop] = old[prop];
          document.body.prepend(layer);
          root.classList.add('pp-theme-blending');
          void layer.offsetWidth;
          try {
            change();
          } catch (error) {
            console.error('Park Pulse: theme repaint failed', error);
            finish();
            return;
          }
          requestAnimationFrame(() => {
            if (token === generation && layer) layer.style.opacity = '0';
          });
          timer = setTimeout(finish, 540);
        }
        if (typeof document.startViewTransition === 'function') {
          root.classList.add('pp-native-theme-change');
          lastMode = 'native';
          try {
            nativeTransition = document.startViewTransition(change);
            nativeTransition.finished
              .catch((error) => {
                if (token === generation && !applied) {
                  try {
                    change();
                  } catch (paintError) {
                    console.error('Park Pulse: theme repaint failed', paintError);
                  }
                }
              })
              .finally(finish);
          } catch (error) {
            root.classList.remove('pp-native-theme-change');
            fallback();
          }
        } else fallback();
      },
    };
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = () => {
      if (preference.matches) {
        nativeTransition?.skipTransition?.();
        finishActive?.();
      }
    };
    if (preference.addEventListener) preference.addEventListener('change', changed);
    else preference.addListener(changed);
    window.addEventListener('pagehide', () => {
      nativeTransition?.skipTransition?.();
      finishActive?.();
    });
  }
  function initialize() {
    home = document.getElementById('ppCompactOverview');
    wrap = document.querySelector('.last-updated-wrap');
    badge = document.getElementById('lastUpdated');
    label = document.getElementById('lastUpdatedText');
    menu = document.getElementById('tzDropdown');
    if (!home || !wrap || !badge || !label || !menu) {
      console.error(
        'Status/theme repair requires the original timestamp component and Part 1B overview. Nothing was moved.',
      );
      return;
    }

    const oldSource = home.querySelector('[data-source]');
    if (oldSource) {
      oldSource.hidden = true;
      oldSource.setAttribute('aria-hidden', 'true');
    }
    const tagline = home.querySelector('.pp1b-intro');
    if (tagline) {
      tagline.hidden = true;
      tagline.inert = true;
    }

    const header = document.getElementById('ppNavigationHeader');
    if (header) header.appendChild(wrap);
    else if (oldSource) home.insertBefore(wrap, oldSource);
    else home.append(wrap);
    wrap.inert = false;

    let sizingQueued = false;
    function sizeHeaderControls() {
      sizingQueued = false;
      if (!header) return;
      const c = HEADER_CONTROLS;
      const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const headerRect = header.getBoundingClientRect();
      if (headerRect.width <= 0) return;
      const logo = header.querySelector('#ppHeaderLogoLink') || header.querySelector(':scope > a');
      const gear = document.getElementById('ppGlobalSettingsButton');
      const logoRight = logo?.getBoundingClientRect().right ?? headerRect.left;
      const gearLeft = gear?.getBoundingClientRect().left ?? headerRect.right - 44;
      const safeInlineWidth = Math.max(0, gearLeft - c.headerGapPx - logoRight - c.minLogoGapPx);
      const stacked = safeInlineWidth < c.minInlineWidthRem * rootSize;
      const targetWidth = c.baseWidthRem * rootSize * (1 + c.extraWidthPercent / 100);
      const width = Math.max(1, Math.min(targetWidth, stacked ? headerRect.width : safeInlineWidth));
      header.dataset.ppHeaderControls = stacked ? 'stacked' : 'inline';
      header.style.setProperty('--pp-header-control-width', width.toFixed(2) + 'px');
      header.style.setProperty('--pp-header-gap', c.headerGapPx + 'px');
      header.style.setProperty('--pp-header-radius', c.radiusPx + 'px');
      header.style.setProperty('--pp-header-control-font', c.fontSizeRem + 'rem');
      header.style.setProperty('--pp-header-control-line-height', String(c.lineHeight));
      header.style.setProperty('--pp-header-control-pad-x', c.paddingInlinePx + 'px');
      header.style.setProperty('--pp-header-control-pad-y', c.paddingBlockPx + 'px');
      header.style.setProperty('--pp-header-arrow-offset', c.arrowInsetOffsetPx + 'px');
      const fontSize = c.fontSizeRem * rootSize;
      const auxiliaryWidth = 8 + Math.max(8, fontSize * 0.65) + 8;
      const probe = document.createElement('span');
      probe.setAttribute('aria-hidden', 'true');
      Object.assign(probe.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        display: 'block',
        visibility: 'hidden',
        pointerEvents: 'none',
        width: Math.max(1, width - 2 * c.paddingInlinePx - 2 - auxiliaryWidth) + 'px',
        fontFamily: getComputedStyle(badge).fontFamily,
        fontWeight: getComputedStyle(badge).fontWeight,
        fontSize: fontSize + 'px',
        lineHeight: String(c.lineHeight),
        whiteSpace: 'normal',
        overflowWrap: 'break-word',
        margin: '0',
        padding: '0',
        border: '0',
      });
      probe.textContent = label.textContent || 'Updated';
      document.body.append(probe);
      const contentHeight = probe.getBoundingClientRect().height;
      probe.remove();
      const height = Math.ceil(
        Math.max(44, c.heightRem * rootSize, contentHeight + 2 * c.paddingBlockPx + 2),
      );
      header.style.setProperty('--pp-header-control-height', height + 'px');
    }
    function queueHeaderSizing() {
      if (sizingQueued) return;
      sizingQueued = true;
      requestAnimationFrame(sizeHeaderControls);
    }
    function syncHeaderPill() {
      const path = location.hash.split('?')[0];
      const onOverview = !path || path === '#' || path === '#/' || path === '#/overview';
      wrap.hidden = header ? !onOverview : false;
      if (!onOverview) {
        menu.classList.remove('open');
        syncPopup();
      }
      queueHeaderSizing();
    }
    syncHeaderPill();
    window.addEventListener('hashchange', syncHeaderPill);
    window.addEventListener('resize', queueHeaderSizing, { passive: true });
    if (header) {
      new ResizeObserver(queueHeaderSizing).observe(header);
      header.addEventListener('load', queueHeaderSizing, true);
    }
    document.fonts?.ready.then(queueHeaderSizing);
    badge.setAttribute('role', 'button');
    badge.tabIndex = 0;
    badge.setAttribute('aria-controls', 'tzDropdown');
    badge.setAttribute('aria-haspopup', 'dialog');
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', 'Display time zone');
    badge.addEventListener('click', () => queueMicrotask(syncPopup));
    badge.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        badge.click();
        queueMicrotask(() => {
          if (menu.classList.contains('open'))
            (menu.querySelector('.tz-option.selected') || menu.querySelector('.tz-option'))?.focus();
        });
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopPropagation();
        if (!menu.classList.contains('open')) badge.click();
        queueMicrotask(() => menu.querySelector('.tz-option')?.focus());
      }
    });
    menu.addEventListener('keydown', (event) => {
      const options = [...menu.querySelectorAll('.tz-option')],
        at = options.indexOf(event.target.closest('.tz-option'));
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? options.length - 1
              : (Math.max(0, at) + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options[next]?.focus();
      } else if ((event.key === 'Enter' || event.key === ' ') && at >= 0) {
        event.preventDefault();
        event.stopPropagation();
        options[at].click();
      }
    });
    menu.addEventListener(
      'click',
      (event) => {
        if (event.target.closest('.tz-option'))
          queueMicrotask(() => {
            syncPopup();
            badge.focus({ preventScroll: true });
          });
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && menu.classList.contains('open') && wrap.contains(event.target)) {
          event.preventDefault();
          event.stopPropagation();
          menu.classList.remove('open');
          syncPopup();
          badge.focus({ preventScroll: true });
        }
      },
      true,
    );
    wrap.addEventListener('focusout', () =>
      queueMicrotask(() => {
        if (!wrap.contains(document.activeElement)) {
          menu.classList.remove('open');
          syncPopup();
        }
      }),
    );
    new MutationObserver(syncPopup).observe(menu, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true,
    });
    ready = true;
    PPUI.statusBadge = { refresh: refreshBadge, queueRefresh }; // called from core updateTimestamp/renderAll
    installThemeTransition();
    window.addEventListener('hashchange', queueRefresh);
    window.addEventListener('pageshow', queueRefresh);
    window.ParkPulseStatusTheme = Object.freeze({
      version: '1.0.4',
      refresh: queueRefresh,
      resizeHeader: queueHeaderSizing,
      transitionMode: () => lastMode,
      transitionActive: () => themeTransitionBusy,
    });
    refreshBadge();
    syncPopup();
  }

  const start = () => queueMicrotask(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* ==========================================================================
 * Global settings sheet
 * ========================================================================== */
/* Park Pulse global settings v1.1.1. Replaces 190-global-settings.js. */
(() => {
  'use strict';
  if (window.ParkPulseGlobalSettings) return;
  let dialog,
    opener,
    currentLabel,
    returnFocus = null,
    oldOverflow = '',
    locked = false;
  let state = 'closed',
    animation = null,
    timer = null,
    generation = 0,
    pendingRestore = true;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const allowsMotion = () => !reduced.matches && window.ParkPulseMotion?.enabled !== false;
  function refresh() {
    if (!currentLabel) return;
    const value =
      'Current appearance: ' + (document.documentElement.dataset.theme === 'light' ? 'Light' : 'Dark');
    if (currentLabel.textContent !== value) currentLabel.textContent = value;
  }
  function stopMotion() {
    generation++;
    if (timer) clearTimeout(timer);
    timer = null;
    if (animation) animation.cancel();
    animation = null;
  }
  function settleOpen() {
    stopMotion();
    state = 'open';
    dialog.dataset.motion = 'open';
  }
  function finishClose(restore) {
    stopMotion();
    state = 'closed';
    dialog.dataset.motion = 'closed';
    if (dialog.open) dialog.close();
    if (locked) {
      document.body.style.overflow = oldOverflow;
      locked = false;
    }
    opener.setAttribute('aria-expanded', 'false');
    const target = returnFocus;
    returnFocus = null;
    if (restore && target?.isConnected) target.focus({ preventScroll: true });
  }
  function runMotion(kind, from, to, duration, done) {
    stopMotion();
    state = kind;
    dialog.dataset.motion = kind;
    if (!allowsMotion() || typeof dialog.animate !== 'function') {
      done();
      return;
    }
    const token = generation;
    const complete = () => {
      if (token !== generation) return;
      done();
    };
    try {
      animation = dialog.animate([from, to], {
        duration,
        easing: kind === 'opening' ? 'cubic-bezier(.22,1,.36,1)' : 'cubic-bezier(.4,0,.2,1)',
        fill: 'both',
      });
      animation.finished.then(complete).catch(() => {
        if (token === generation) done();
      });
      timer = setTimeout(complete, duration + 180);
    } catch (error) {
      done();
    }
  }
  function closeSettings(restore = true, immediate = false) {
    if (state === 'closed' && !dialog?.open) return;
    pendingRestore = restore;
    if (immediate || !allowsMotion()) {
      finishClose(restore);
      return;
    }
    if (state === 'closing') return;
    const visual = getComputedStyle(dialog);
    const from = {
      opacity: visual.opacity,
      transform: visual.transform === 'none' ? 'scale(1)' : visual.transform,
    };
    runMotion('closing', from, { opacity: 0, transform: 'scale(.985)' }, 200, () =>
      finishClose(pendingRestore),
    );
  }
  function showSettings() {
    if (state === 'open' || state === 'opening') return;
    refresh();
    if (state === 'closing' && dialog.open) {
      const visual = getComputedStyle(dialog);
      runMotion(
        'opening',
        { opacity: visual.opacity, transform: visual.transform === 'none' ? 'scale(1)' : visual.transform },
        { opacity: 1, transform: 'scale(1)' },
        260,
        settleOpen,
      );
      return;
    }
    if (document.querySelector('.modal-overlay.active, dialog[open]')) return;
    returnFocus = document.activeElement;
    oldOverflow = document.body.style.overflow;
    try {
      dialog.showModal();
    } catch (error) {
      console.warn('Park Pulse: settings could not open', error);
      returnFocus = null;
      return;
    }
    locked = true;
    document.body.style.overflow = 'hidden';
    opener.setAttribute('aria-expanded', 'true');
    dialog.querySelector('[data-pp-close-settings]').focus({ preventScroll: true });
    runMotion(
      'opening',
      { opacity: 0, transform: 'scale(.975)' },
      { opacity: 1, transform: 'scale(1)' },
      260,
      settleOpen,
    );
  }

  function motionPreferenceChanged() {
    refresh();
    if (allowsMotion()) return;
    if (state === 'closing') finishClose(pendingRestore);
    else if (state === 'opening') settleOpen();
  }
  function initialize() {
    if (document.getElementById('ppGlobalSettingsButton')) return;
    const header = document.getElementById('ppNavigationHeader');
    const theme = document.getElementById('themeToggleBtn');
    const motion = document.getElementById('ppAnimationsSwitch')?.closest('.pp-motion-settings');
    const candidate = document.createElement('dialog');
    if (!header || !theme || !motion) {
      console.error(
        'Global settings requires Part 1A and the original theme/animation controls. Existing controls were left in place.',
      );
      return;
    }
    if (typeof candidate.showModal !== 'function') {
      console.warn('Settings dialog is unsupported; existing preferences remain under More.');
      return;
    }
    dialog = candidate;
    dialog.id = 'ppGlobalSettingsDialog';
    dialog.setAttribute('aria-labelledby', 'ppGlobalSettingsTitle');
    dialog.setAttribute('aria-describedby', 'ppGlobalSettingsDescription');
    dialog.dataset.motion = 'closed';
    dialog.innerHTML = `<div class="pp-settings-heading"><h2 id="ppGlobalSettingsTitle">Settings</h2><button type="button" class="pp-settings-close" data-pp-close-settings aria-label="Close settings">✕</button></div><p id="ppGlobalSettingsDescription">Display preferences apply across all parks and tabs.</p><section class="pp-settings-section" aria-labelledby="ppSettingsAppearanceTitle"><h3 id="ppSettingsAppearanceTitle">Appearance</h3><p id="ppSettingsCurrentTheme"></p><div id="ppSettingsThemeHost"></div></section><section class="pp-settings-section" aria-labelledby="ppSettingsMotionTitle"><h3 id="ppSettingsMotionTitle">Decorative animations</h3><div id="ppSettingsMotionHost"></div></section>`;
    currentLabel = dialog.querySelector('#ppSettingsCurrentTheme');
    document.body.append(dialog);
    dialog.querySelector('#ppSettingsThemeHost').append(theme);
    dialog.querySelector('#ppSettingsMotionHost').append(motion);
    opener = document.createElement('button');
    opener.id = 'ppGlobalSettingsButton';
    opener.type = 'button';
    opener.title = 'Settings';
    opener.setAttribute('aria-label', 'Settings');
    opener.setAttribute('aria-haspopup', 'dialog');
    opener.setAttribute('aria-controls', dialog.id);
    opener.setAttribute('aria-expanded', 'false');
    opener.innerHTML =
      '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="m9.5 3-.7 2.3-2 .9L4.6 5.6 2.8 8.7l1.7 1.7v2.3l-1.7 1.7 1.8 3.1 2.2-.6 2 .9.7 2.3h3.6l.7-2.3 2-.9 2.2.6 1.8-3.1-1.7-1.7v-2.3l1.7-1.7-1.8-3.1-2.2.6-2-.9-.7-2.3Z"/><circle cx="11.3" cy="11.6" r="3.2"/></svg>';
    header.append(opener);
    opener.addEventListener('click', showSettings);
    dialog.querySelector('[data-pp-close-settings]').addEventListener('click', () => closeSettings());
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeSettings();
      }
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeSettings();
    });
    dialog.addEventListener('close', () => {
      if (!dialog.open && state !== 'closed') finishClose(false);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        closeSettings();
    });
    window.addEventListener('hashchange', () => closeSettings(false, true));
    window.addEventListener('pagehide', () => closeSettings(false, true));
    new MutationObserver(refresh).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    window.addEventListener('parkpulse:motionchange', motionPreferenceChanged);
    if (reduced.addEventListener) reduced.addEventListener('change', motionPreferenceChanged);
    else reduced.addListener(motionPreferenceChanged);
    const more =
      document.getElementById('pp1bDisplayPreferences') || document.querySelector('[data-pp-pane="more"]');
    if (more) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pp-open-display-settings';
      button.textContent = 'Open display settings';
      button.addEventListener('click', showSettings);
      more.append(button);
    }

    window.ParkPulseGlobalSettings = Object.freeze({
      version: '1.1.1',
      open: showSettings,
      close: () => closeSettings(),
      isOpen: () => dialog.open,
      state: () => state,
    });
    refresh();
  }

  const start = () => queueMicrotask(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* ==========================================================================
 * Theme-aware header logo
 * ========================================================================== */
/* Park Pulse theme-aware shared header logo v1.0.0. Load after global settings. */
(() => {
  'use strict';
  if (window.ParkPulseHeaderLogo) return;
  const scriptURL = document.currentScript?.src;
  const base = scriptURL ? new URL('../../', scriptURL) : new URL('.', document.baseURI);
  const urls = {
    light: new URL('images/logo_light.png', base).href,
    dark: new URL('images/logo_dark.png', base).href,
  };
  const images = {};
  let link, fallback;
  function theme() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }
  function refresh() {
    if (!link) return;
    const mode = theme(),
      active = images[mode];
    const loaded = active.complete && active.naturalWidth > 0;
    for (const [key, image] of Object.entries(images)) image.hidden = key !== mode || !loaded;
    fallback.hidden = loaded;
    link.dataset.logoTheme = mode;
  }
  function initialize() {
    const header = document.getElementById('ppNavigationHeader');
    link = header?.querySelector(':scope > a[href="#/overview"]') || header?.querySelector(':scope > a');
    if (!link) {
      console.error(
        'Park Pulse header logo requires the Part 1A shared header. No existing content was changed.',
      );
      return;
    }
    if (link.id === 'ppHeaderLogoLink') return;
    link.id = 'ppHeaderLogoLink';
    link.setAttribute('aria-label', 'Park Pulse — return to Overview');
    link.title = 'Park Pulse — Overview';
    fallback = document.createElement('span');
    fallback.className = 'pp-logo-fallback';
    fallback.textContent = 'Park Pulse';
    fallback.setAttribute('aria-hidden', 'true');
    const nodes = [];
    for (const mode of ['light', 'dark']) {
      const image = document.createElement('img');
      image.className = 'pp-header-logo';
      image.alt = '';
      image.decoding = 'async';
      image.loading = 'eager';
      image.hidden = true;
      image.dataset.logoMode = mode;
      image.addEventListener('load', refresh);
      image.addEventListener('error', () => {
        console.warn('Park Pulse: header logo could not load', { theme: mode, url: urls[mode] });
        refresh();
      });
      images[mode] = image;
      nodes.push(image);
      image.src = urls[mode];
    }
    link.replaceChildren(...nodes, fallback);

    new MutationObserver(refresh).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    window.addEventListener('pageshow', refresh);
    window.ParkPulseHeaderLogo = Object.freeze({
      version: '1.0.0',
      refresh,
      diagnostics: () => ({
        theme: theme(),
        logos: Object.fromEntries(
          Object.entries(images).map(([key, image]) => [
            key,
            { url: image.currentSrc || image.src, loaded: image.complete && image.naturalWidth > 0 },
          ]),
        ),
      }),
    });
    refresh();
  }
  const start = () => queueMicrotask(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* ==========================================================================
 * Dock and park-picker polish
 * ========================================================================== */
/* Park Pulse dock and park-picker polish v1.0.0. Load after 200-header-logo.js. */
(() => {
  'use strict';
  if (window.ParkPulseDockPicker) return;
  const scriptURL = document.currentScript?.src;
  const base = scriptURL ? new URL('../../', scriptURL) : new URL('.', document.baseURI);
  const parks = {
    magic_kingdom: { name: 'Magic Kingdom', file: 'MKEmoji_1_1023x1023.png', emoji: '🏰' },
    epcot: { name: 'EPCOT', file: 'EPCOTEmoji_1_1023x1023.png', emoji: '🌐' },
    hollywood_studios: { name: 'Hollywood Studios', file: 'HSEmoji_1_1023x1023.png', emoji: '🎬' },
    animal_kingdom: { name: 'Animal Kingdom', file: 'AKEmoji_1_1023x1022.png', emoji: '🌳' },
  };
  const drawings = {
    overview:
      '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    attractions: '<path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6Z"/><path d="M14 5v3m0 3v2m0 3v3"/>',
    trends: '<path d="M4 20V4m0 16h16M8 15l4-5 4 2 5-7"/>',
    more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  };
  let nav,
    queued = false;
  const svg = (body) =>
    '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true" focusable="false">' + body + '</svg>';
  function measure() {
    if (nav)
      document.documentElement.style.setProperty('--pp-bottom', nav.getBoundingClientRect().height + 'px');
  }
  function decorateDock() {
    for (const link of nav.querySelectorAll('a[data-view],a[data-pp-view]')) {
      const key = link.dataset.view || link.dataset.ppView;
      if (!drawings[key] || link.dataset.ppDockDecorated) return;
      const icon = document.createElement('span');
      icon.className = 'pp-dock-symbol';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = svg(drawings[key]);
      const label = document.createElement('span');
      label.className = 'pp-dock-label';
      label.textContent = key[0].toUpperCase() + key.slice(1);
      link.replaceChildren(icon, label);
      link.setAttribute('aria-label', label.textContent);
      link.dataset.ppDockDecorated = 'true';
    }
    requestAnimationFrame(measure);
  }
  function parkKey(button) {
    if (parks[button.dataset.ppPickerKey]) return button.dataset.ppPickerKey;
    const text = button.textContent.trim().toLowerCase().replace(/[’']/g, '');
    return Object.keys(parks).find(
      (key) =>
        text === parks[key].name.toLowerCase() || text === ('disneys ' + parks[key].name).toLowerCase(),
    );
  }
  function decoratePicker() {
    const picker = document.getElementById('ppParkPicker');
    if (!picker) return;
    picker.classList.add('pp-branded-picker');
    const route = location.hash.split('?')[0];
    const mode = route === '#/trends' ? 'trends' : route === '#/attractions' ? 'attractions' : null;
    const heading = picker.querySelector('h1,h2');
    if (heading && heading.textContent !== 'Choose your park') heading.textContent = 'Choose your park';
    let help = picker.querySelector('.pp-picker-intro');
    if (!help) {
      help = document.createElement('p');
      help.className = 'pp-picker-intro';
      if (heading) heading.after(help);
      else picker.prepend(help);
    }
    const intro =
      mode === 'trends'
        ? 'Explore today’s wait patterns and available recorded history.'
        : mode === 'attractions'
          ? 'Pick a park to browse attraction waits and reported operating status.'
          : 'Choose a park to continue.';
    if (help.textContent !== intro) help.textContent = intro;
    for (const button of picker.querySelectorAll('button')) {
      const key = parkKey(button);
      if (!key || button.dataset.ppPickerDecorated) continue;
      button.dataset.ppPickerKey = key;
      button.dataset.ppPickerDecorated = 'true';
      const image = document.createElement('img');
      image.className = 'pp-picker-icon';
      image.alt = '';
      image.width = 48;
      image.height = 48;
      image.decoding = 'async';
      const fallback = document.createElement('span');
      fallback.className = 'pp-picker-fallback';
      fallback.setAttribute('aria-hidden', 'true');
      fallback.textContent = parks[key].emoji;
      fallback.hidden = true;
      image.addEventListener('error', () => {
        image.hidden = true;
        fallback.hidden = false;
      });
      image.src = new URL('images/' + parks[key].file, base).href;
      const name = document.createElement('span');
      name.className = 'pp-picker-name';
      name.textContent = parks[key].name;
      const arrow = document.createElement('span');
      arrow.className = 'pp-picker-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.innerHTML = svg('<path d="m9 5 7 7-7 7"/>');
      button.replaceChildren(image, fallback, name, arrow);
    }
    const headerLabel = document.querySelector('#ppNavigationHeader>label');
    if (headerLabel) {
      const overview = route === '#/overview' || route === '#' || !route;
      if (mode && !picker.hidden) {
        if (!headerLabel.hidden) headerLabel.hidden = true;
        headerLabel.dataset.ppPickerHid = 'true';
      } else if (headerLabel.dataset.ppPickerHid) {
        delete headerLabel.dataset.ppPickerHid;
        if (!overview && headerLabel.hidden) headerLabel.hidden = false;
      }
    }
  }
  function refresh() {
    decorateDock();
    decoratePicker();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      refresh();
    });
  }

  function initialize() {
    nav = document.getElementById('ppNavigation');
    if (!nav) {
      console.error('Dock/picker polish requires the existing Part 1A navigation. Nothing changed.');
      return;
    }

    new MutationObserver((mutations) => {
      if (
        mutations.some((m) =>
          [...m.addedNodes].some(
            (n) => n.nodeType === 1 && (n.id === 'ppParkPicker' || n.querySelector?.('#ppParkPicker')),
          ),
        )
      )
        schedule();
    }).observe(document.getElementById('ppNavigationContent') || document.body, {
      childList: true,
      subtree: true,
    });
    const headerLabel = document.querySelector('#ppNavigationHeader>label');
    if (headerLabel)
      new MutationObserver(schedule).observe(headerLabel, { attributes: true, attributeFilter: ['hidden'] });
    new ResizeObserver(measure).observe(nav);
    window.addEventListener('hashchange', schedule);
    window.addEventListener('pageshow', schedule);
    window.ParkPulseDockPicker = Object.freeze({ version: '1.0.0', refresh: schedule });
    refresh();
  }

  const start = () => queueMicrotask(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();

/* ==========================================================================
 * Context icons and overview cleanup (PPUI.contextCards)
 * ========================================================================== */
/* Park Pulse context icons / overview content cleanup v1.2.0. Load after 210-dock-picker-polish.js. */
(() => {
  'use strict';
  if (window.ParkPulseContextCards) return;
  const scriptURL = document.currentScript?.src;
  const base = scriptURL ? new URL('../../', scriptURL) : new URL('.', document.baseURI);
  const names = {
    magic_kingdom: 'Magic Kingdom',
    epcot: 'EPCOT',
    hollywood_studios: 'Hollywood Studios',
    animal_kingdom: 'Animal Kingdom',
  };
  const files = {
    magic_kingdom: 'MKEmoji_1_1023x1023.png',
    epcot: 'EPCOTEmoji_1_1023x1023.png',
    hollywood_studios: 'HSEmoji_1_1023x1023.png',
    animal_kingdom: 'AKEmoji_1_1023x1022.png',
  };
  let home,
    queued = false;
  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };
  function ageMinutes(iso) {
    const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    return Number.isFinite(ms) && ms <= Date.now() + 60000
      ? Math.max(0, (Date.now() - ms) / 60000)
      : Infinity;
  }
  function oldQueue() {
    const ms = Date.parse(parkData?.updated_at);
    return (
      ageMinutes(parkData?.updated_at) > STALE_THRESHOLD_MINUTES ||
      !Number.isFinite(ms) ||
      curveET(new Date(ms)).day !== curveET(new Date()).day
    );
  }
  function livePark(key) {
    return !parkData?.unavailable ? parkData?.parks?.[key] : null;
  }
  function weatherSnapshot(key) {
    const data = typeof weatherData !== 'undefined' ? weatherData : null;
    const failed = typeof weatherFailed !== 'undefined' && weatherFailed;
    const park = data?.parks?.[key],
      observation = park?.observation;
    if (!observation || !Number.isFinite(observation.temperature_c))
      return {
        text: data || failed ? 'Weather unavailable' : 'Weather loading…',
        old: false,
        detail: 'Current nearby-station temperature is unavailable.',
      };
    const old =
      failed ||
      ageMinutes(observation.observed_at) > 90 ||
      ageMinutes(data.updated_at) > 20 ||
      !!park.collection?.errors?.observations;
    const description = typeof observation.description === 'string' ? observation.description.trim() : '';
    const icon = typeof wxIcon === 'function' ? wxIcon(description) : '🌡️';
    const temperature =
      typeof wxF === 'function'
        ? wxF(observation.temperature_c)
        : Math.round((observation.temperature_c * 9) / 5 + 32) + '°F';
    return {
      text: icon + ' ' + temperature,
      old,
      detail:
        (description ? description + '. ' : '') +
        'Nearby-station observation, not a measurement at every attraction.' +
        (old ? ' Weather reports are older or delayed.' : ''),
    };
  }
  function longestSnapshot(key) {
    const park = livePark(key);
    if (!park || !Array.isArray(park.rides)) return { label: 'Longest wait', value: 'Unavailable', name: '' };
    const hours = normalizeHours(park.hours);
    if (hours?.day === curveET(new Date()).day) {
      const phase = getParkPhase(key, park);
      if (['pre-open', 'closed-for-day'].includes(phase.phase))
        return { label: 'Longest wait', value: 'Not currently shown', name: '' };
    }
    try {
      const ride = computeLiveStats(park).longest;
      if (!ride || !Number.isFinite(ride.wait_time))
        return { label: 'Longest wait', value: 'Unavailable', name: '' };
      return {
        label: oldQueue() ? 'Last reported longest' : 'Longest wait',
        value: ride.wait_time + ' min',
        name: String(ride.name || 'Attraction'),
      };
    } catch (error) {
      console.warn('Park Pulse: longest wait unavailable', error);
      return { label: 'Longest wait', value: 'Unavailable', name: '' };
    }
  }
  /* END DATA HELPERS */
  function selectedPark() {
    const m = location.hash.match(/^#\/park\/([a-z_]+)\//);
    return m && names[m[1]] ? m[1] : null;
  }
  function iconURL(key) {
    const icon = home?.querySelector('.pp1b-card[data-park="' + key + '"] .pp1b-identity img');
    return icon?.complete && icon.naturalWidth > 0
      ? icon.currentSrc || icon.src
      : new URL('images/' + files[key], base).href;
  }
  function configureIcon(image, key) {
    if (!key) {
      image.hidden = true;
      return;
    }
    if (image.dataset.ppPark !== key) {
      image.dataset.ppPark = key;
      image.hidden = false;
      image.src = iconURL(key);
    } else image.hidden = image.complete && image.naturalWidth === 0;
  }
  function createIcon() {
    const image = document.createElement('img');
    image.className = 'pp-context-park-icon';
    image.alt = '';
    image.width = 36;
    image.height = 36;
    image.addEventListener('error', () => {
      image.hidden = true;
    });
    image.addEventListener('load', () => {
      image.hidden = selectedPark() !== image.dataset.ppPark;
    });
    return image;
  }

  function decorateSnapshot(key) {
    const snapshot = document.getElementById('ppSelectedParkSnapshot'),
      average = snapshot?.querySelector('[data-average]');
    if (!snapshot || !average) return;
    let row = snapshot.querySelector('.pp-snapshot-identity');
    if (!row) {
      row = document.createElement('div');
      row.className = 'pp-snapshot-identity';
      average.before(row);
      row.append(createIcon(), average);
    }
    configureIcon(row.querySelector('img'), key);
  }
  function decorateHeading(heading, key) {
    if (!heading) return;
    let label = heading.querySelector('.pp-context-heading-text'),
      image = heading.querySelector('.pp-context-park-icon');
    if (!label || !image) {
      const value = heading.textContent.replace(/^\s*(?:📈|🎢|🔥|📅)\s*/u, '').trim();
      label = document.createElement('span');
      label.className = 'pp-context-heading-text';
      label.textContent = value;
      image = createIcon();
      heading.replaceChildren(image, label);
    }
    heading.classList.add('pp-park-heading');
    configureIcon(image, key);
  }
  // Keep the existing nodes so the original renderer's live references remain valid.
  function compactOverviewCard(card, extra) {
    let row = card.querySelector('.pp-card-metrics');
    if (!row) {
      row = document.createElement('div');
      row.className = 'pp-card-metrics';
      const average = document.createElement('div');
      average.className = 'pp-card-average';
      const weather = document.createElement('div');
      weather.className = 'pp-card-weather-group';
      const value = card.querySelector('.pp1b-value,.pp1b-metric');
      const label = card.querySelector('.pp1b-label,.pp1b-caption');
      if (value) average.append(value);
      if (label) average.append(label);
      row.append(average, weather);
      extra.before(row);
    }
    const group = row.querySelector('.pp-card-weather-group');
    for (const node of extra.querySelectorAll('.pp-card-weather,.pp-card-weather-warning'))
      group.append(node);
    const action = card.querySelector('.pp1b-action');
    if (action && !action.dataset.ppOverviewChevron) {
      action.dataset.ppOverviewChevron = 'true';
      action.dataset.ppCorner = 'true';
      action.setAttribute('aria-hidden', 'true');
      action.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7"/></svg>';
    }
  }
  function restoreOverviewTagline() {
    const intro = home.querySelector('.pp1b-intro');
    if (!intro) return;
    if (!intro.classList.contains('pp-overview-tagline')) intro.classList.add('pp-overview-tagline');
    if (intro.hidden) intro.hidden = false;
    if (intro.inert) intro.inert = false;
    if (intro.hasAttribute('aria-hidden')) intro.removeAttribute('aria-hidden');
    const first = 'Live wait times. Smarter park choices.',
      second = 'More time for the magic.';
    if (intro.textContent.trim() !== first + ' ' + second) {
      const a = document.createElement('span'),
        b = document.createElement('span');
      a.textContent = first;
      b.textContent = second;
      intro.replaceChildren(a, document.createTextNode(' '), b);
    }
  }
  function updateCards() {
    for (const card of home.querySelectorAll('.pp1b-card[data-park]')) {
      const key = card.dataset.park;
      if (!names[key]) continue;
      let extra = card.querySelector('.pp-card-useful-context');
      if (!extra) {
        extra = document.createElement('div');
        extra.className = 'pp-card-useful-context';
        extra.innerHTML =
          '<div class="pp-card-weather"></div><small class="pp-card-weather-warning" hidden>Older weather</small><div class="pp-card-longest-heading"><span class="pp-card-longest-label"></span><strong class="pp-card-longest-value"></strong></div><div class="pp-card-longest-name"></div>';
        const action = card.querySelector('.pp1b-action');
        if (action) action.before(extra);
        else card.append(extra);
      }
      compactOverviewCard(card, extra);
      const weather = weatherSnapshot(key),
        longest = longestSnapshot(key);
      const weatherNode = card.querySelector('.pp-card-weather');
      setText(weatherNode, weather.text);
      if (weatherNode.title !== weather.detail) weatherNode.title = weather.detail;
      const warning = card.querySelector('.pp-card-weather-warning');
      if (warning.hidden === weather.old) warning.hidden = !weather.old;
      setText(extra.querySelector('.pp-card-longest-label'), longest.label);
      setText(extra.querySelector('.pp-card-longest-value'), longest.value);
      setText(extra.querySelector('.pp-card-longest-name'), longest.name);
      const metric = card.querySelector('.pp1b-value,.pp1b-metric')?.textContent || '';
      const caption = card.querySelector('.pp1b-label,.pp1b-caption')?.textContent || '';
      const aria =
        names[key] +
        '. ' +
        metric +
        '. ' +
        caption +
        '. ' +
        weather.text +
        '. ' +
        (weather.old ? 'Older weather report. ' : '') +
        longest.label +
        ': ' +
        longest.value +
        (longest.name ? ', ' + longest.name : '') +
        '. View attractions.';
      if (card.getAttribute('aria-label') !== aria) card.setAttribute('aria-label', aria);
    }
  }
  function cleanMore() {
    const more = document.querySelector('[data-pp-pane="more"]');
    if (!more) return;
    const oldLabel =
      document.getElementById('crowdInfoBtn')?.closest('.section-label') ||
      document.querySelector('#ppDetailedParkConditions .section-label');
    if (oldLabel && more.contains(oldLabel)) {
      let compat = document.getElementById('ppMoreCompatibility');
      if (!compat) {
        compat = document.createElement('div');
        compat.id = 'ppMoreCompatibility';
        compat.hidden = true;
        compat.inert = true;
        more.append(compat);
      }
      if (oldLabel.parentElement !== compat) compat.append(oldLabel);
    }
    const dialog = document.getElementById('ppGlobalSettingsDialog');
    if (!dialog) return;
    const preferences = document.getElementById('pp1bDisplayPreferences');
    if (preferences && more.contains(preferences)) {
      const heading = preferences.querySelector(':scope > h2');
      if (heading) {
        const small = document.createElement('h3');
        for (const attribute of heading.attributes) small.setAttribute(attribute.name, attribute.value);
        small.textContent = 'Time and dates';
        heading.replaceWith(small);
      }
      preferences.classList.add('pp-settings-section');
      preferences.querySelectorAll('.pp-open-display-settings').forEach((button) => button.remove());
      dialog.append(preferences);
    }
    const motion = document.getElementById('ppAnimationsSwitch')?.closest('.pp-motion-settings');
    const host = dialog.querySelector('#ppSettingsMotionHost');
    if (motion && host && more.contains(motion)) host.append(motion);
  }
  function refresh() {
    if (!home) return;
    const key = selectedPark();
    decorateSnapshot(key);
    decorateHeading(
      document.getElementById('trendChart')?.closest('.panel')?.querySelector('.panel-header h2'),
      key,
    );
    decorateHeading(document.getElementById('ppHistoryTitle'), key);
    restoreOverviewTagline();
    updateCards();
    cleanMore();
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      refresh();
    });
  }

  function initialize() {
    home = document.getElementById('ppCompactOverview');
    if (!home) {
      console.error('Context/card cleanup requires the current compact Overview. Nothing changed.');
      return;
    }

    const options = { childList: true, subtree: true, characterData: true };
    new MutationObserver(schedule).observe(home, {
      ...options,
      attributes: true,
      attributeFilter: ['aria-label'],
    });
    const snapshot = document.getElementById('ppSelectedParkSnapshot');
    if (snapshot) new MutationObserver(schedule).observe(snapshot, options);
    const historyTitle = document.getElementById('ppHistoryTitle');
    if (historyTitle) new MutationObserver(schedule).observe(historyTitle, options);
    const chartHeading = document
      .getElementById('trendChart')
      ?.closest('.panel')
      ?.querySelector('.panel-header h2');
    if (chartHeading) new MutationObserver(schedule).observe(chartHeading, options);
    PPUI.contextCards = { schedule }; // called from renderWeather() in park-cards.js
    window.addEventListener('hashchange', schedule);
    window.addEventListener('pageshow', schedule);
    window.ParkPulseContextCards = Object.freeze({ version: '1.2.0', refresh: schedule });
    refresh();
  }

  const start = () => queueMicrotask(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
