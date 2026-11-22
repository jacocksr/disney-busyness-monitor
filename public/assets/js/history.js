/* Park Pulse history: closure events (panel, chart markers, heatmap marks), verified event
   calendar, event detail toggles on cards and the monthly history calendar. */

/* ==========================================================================
 * Closure events and chart overlays (PPUI.closures, window.ParkClosureUI)
 * ========================================================================== */
(() => {
  'use strict';
  const KEY_BY_ID = { 5: 'epcot', 6: 'magic_kingdom', 7: 'hollywood_studios', 8: 'animal_kingdom' };
  let payload = null,
    failed = false,
    busy = false,
    lastAttempt = 0,
    selectedPeriod = 'today',
    parkModalKey = null;
  const ms = (x) => (typeof x === 'number' ? x : Date.parse(x));
  const esc = (x) => escapeHtml(String(x ?? ''));
  function et(msValue) {
    return curveET(new Date(msValue));
  }
  function clock(value) {
    const t = ms(value);
    if (!Number.isFinite(t)) return 'Unknown';
    const opts = { hour: 'numeric', minute: '2-digit' };
    if (selectedTz !== 'local') opts.timeZone = selectedTz;
    return new Date(t).toLocaleTimeString([], opts);
  }
  function dayStart(day) {
    const [y, m, d] = day.split('-').map(Number);
    for (const offset of [4, 5]) {
      const t = Date.UTC(y, m - 1, d, offset);
      if (et(t).day === day && et(t).hour === 0) return t;
    }
    return NaN;
  }
  function nextDay(day) {
    return new Date(Date.parse(day + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  }
  function dayEnd(day) {
    return dayStart(nextDay(day));
  }
  function hourStart(day, hour) {
    const [y, m, d] = day.split('-').map(Number);
    for (const offset of [4, 5]) {
      const t = Date.UTC(y, m - 1, d, hour + offset);
      const p = et(t);
      if (p.day === day && p.hour === hour) return t;
    }
    return NaN;
  }
  function eventEnd(e) {
    return Math.max(ms(e.first_closed_at), ms(e.last_closed_at));
  }
  function normalize(data) {
    if (!data || data.schema_version !== 1 || !Array.isArray(data.events))
      throw Error('Unsupported closure payload');
    const events = new Map();
    for (const raw of data.events) {
      if (
        !raw ||
        !KEY_BY_ID[raw.park_id] ||
        !Number.isInteger(raw.ride_id) ||
        !['temporary', 'unknown', 'refurbishment'].includes(raw.category) ||
        !['ongoing', 'completed', 'interrupted'].includes(raw.state)
      )
        continue;
      const first = ms(raw.first_closed_at),
        last = ms(raw.last_closed_at),
        reopen = ms(raw.first_reopened_at);
      if (
        !Number.isFinite(first) ||
        !Number.isFinite(last) ||
        last < first ||
        (raw.state === 'completed' && (!Number.isFinite(reopen) || reopen < last))
      )
        continue;
      const id = String(raw.event_id || `${raw.park_id}:${raw.ride_id}:${raw.first_closed_at}`);
      events.set(id, {
        ...raw,
        event_id: id,
        park: KEY_BY_ID[raw.park_id],
        ride_name: String(raw.ride_name || 'Attraction'),
        start_uncertain: !!raw.start_uncertain,
      });
    }
    return { ...data, events: [...events.values()] };
  }
  function relevant(key, rideId, day, includeUnknown = false) {
    if (!payload) return [];
    return payload.events
      .filter(
        (e) =>
          e.park === key &&
          (rideId == null || String(e.ride_id) === String(rideId)) &&
          (e.category === 'temporary' || (includeUnknown && e.category === 'unknown')) &&
          (!day || (ms(e.first_closed_at) < dayEnd(day) && eventEnd(e) >= dayStart(day))),
      )
      .sort((a, b) => ms(a.first_closed_at) - ms(b.first_closed_at));
  }

  const openRows = new Set();
  let showGraphClosures = true,
    showAllRows = false;
  function periodBounds() {
    const today = et(Date.now()).day,
      shift = (n) => new Date(Date.parse(today + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    const weekday = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
    const first =
      selectedPeriod === 'week' ? shift(-weekday) : selectedPeriod === 'seven' ? shift(-6) : today;
    return {
      start: dayStart(first),
      end: Date.now() + 1,
      first,
      last: today,
      label:
        selectedPeriod === 'week'
          ? 'This week (Mon–today)'
          : selectedPeriod === 'seven'
            ? 'Last 7 days'
            : 'Today',
    };
  }
  function dateLabel(value) {
    return new Date(ms(value)).toLocaleDateString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
    });
  }
  function dateTime(value) {
    return dateLabel(value) + ' · ' + clock(value);
  }
  function closureDelayed() {
    return (
      !!payload &&
      (failed || !Number.isFinite(ms(payload.updated_at)) || Date.now() - ms(payload.updated_at) > 15 * 60000)
    );
  }
  function currentRide(key, id) {
    return (parkData?.parks?.[key]?.rides || []).find((r) => String(r.id) === String(id));
  }
  function liveStatus(key, id) {
    const park = parkData?.parks?.[key],
      ride = currentRide(key, id);
    if (!park || !ride) return { code: 'unknown', label: 'Current status unavailable' };
    const source = ms(ride.last_updated),
      stamp = ms(parkData.updated_at),
      fresh =
        Number.isFinite(stamp) &&
        Date.now() - stamp <= STALE_THRESHOLD_MINUTES * 60000 &&
        Number.isFinite(source) &&
        Date.now() - source <= 15 * 60000;
    if (!fresh) return { code: 'unknown', label: 'Last report only' };
    const phase = getParkPhase(key, park);
    if (!['open', 'early-entry'].includes(phase.phase) && !phase.openNow)
      return { code: 'outside', label: phase.phase === 'pre-open' ? 'Not open yet' : 'Park not operating' };
    return {
      code: ride.is_open ? 'open' : 'closed',
      label: ride.is_open ? 'Reported Open ' + clock(ride.last_updated) : 'Reported closed',
    };
  }
  function description(e, withDate = false) {
    const status = liveStatus(e.park, e.ride_id),
      prefix = withDate ? dateLabel(e.first_closed_at) + ' · ' : '';
    if (e.state === 'completed') {
      const n = Math.max(0, Math.round((ms(e.first_reopened_at) - ms(e.first_closed_at)) / 60000));
      return (
        prefix +
        (e.start_uncertain
          ? 'Reopened ' + clock(e.first_reopened_at) + ' · start time unknown'
          : (n > 0 ? 'Reported closed ~' + n + ' min' : 'Brief closure recorded') +
            ' · ' +
            clock(e.first_closed_at) +
            '–' +
            clock(e.first_reopened_at))
      );
    }
    if (e.state === 'interrupted')
      return prefix + 'Last reported closed ' + clock(e.last_closed_at) + ' · observation interrupted';
    if (status.code === 'closed' && !closureDelayed())
      return (
        prefix +
        (e.start_uncertain
          ? 'Reported closed · start time unknown'
          : 'Closed since about ' + clock(e.first_closed_at))
      );
    return (
      prefix +
      'Last reported closed ' +
      clock(e.last_closed_at) +
      (e.start_uncertain ? ' · start time unknown' : ' · reopening not recorded')
    );
  }
  function coverage(day) {
    if (!payload)
      return failed
        ? 'Closure history is unavailable. Live wait-time views remain available.'
        : 'Closure history is loading.';
    let text = 'Closure history updated ' + dateTime(payload.updated_at) + '. ';
    if (payload.tracking_started_at)
      text += 'Forward tracking began ' + dateTime(payload.tracking_started_at) + '. ';
    if (payload.backfill_status !== 'completed') text += 'Earlier history has not been backfilled. ';
    if (payload.truncated) text += 'The loaded event list is truncated. ';
    return (
      text +
      'Dates use Eastern park days; displayed times follow the time-zone selector. Closures are sampled reports, not exact failure times. Missing observations are unknown, not open. Scheduled experiences and refurbishments stay separate from temporary downtime. Historical scheduled-experience status is not supplied by this endpoint.'
    );
  }
  function showDataInfo() {
    const card = document.getElementById('pcAvailabilityPanel'),
      info = document.getElementById('pcClosureDataInfo');
    if (card) {
      if (window.ParkPulseDisclosure) ParkPulseDisclosure.setOpen(card, true);
      else card.open = true;
    }
    if (info) {
      info.open = true;
      openRows.add('data-info');
      setTimeout(() => {
        info.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'nearest',
        });
        info.querySelector('summary')?.focus();
      }, 340);
    }
  }
  function currentClosed() {
    const park = parkData?.parks?.[activeParkKey];
    if (!park) return [];
    return getStandardRides(park).filter(
      (r) =>
        !r.is_open &&
        !REFURBISHMENT_NAME_PATTERNS.some((p) => p.test(r.name || '')) &&
        liveStatus(activeParkKey, r.id).code === 'closed',
    );
  }
  function summaryData() {
    const period = periodBounds(),
      events = (payload?.events || []).filter(
        (e) => e.park === activeParkKey && ms(e.first_closed_at) < period.end && eventEnd(e) >= period.start,
      );
    const temporary = events.filter((e) => e.category === 'temporary'),
      groups = new Map();
    for (const e of temporary) {
      const key = String(e.ride_id),
        g = groups.get(key) || { id: key, name: e.ride_name, events: [] };
      g.events.push(e);
      groups.set(key, g);
    }
    const closed = currentClosed();
    return { period, events, temporary, groups, closed };
  }
  function logicalName(e) {
    return /walt disney world railroad/i.test(e.ride_name) ? 'Walt Disney World Railroad' : e.ride_name;
  }
  function statusClass(code) {
    return code === 'closed' ? 'is-closed' : code === 'open' ? 'is-open' : 'is-unknown';
  }
  function bindRemembered(root) {
    root.querySelectorAll('details[data-pc-key]').forEach((el) => {
      el.open = openRows.has(el.dataset.pcKey);
      el.addEventListener('toggle', () => {
        if (el.open) openRows.add(el.dataset.pcKey);
        else openRows.delete(el.dataset.pcKey);
      });
    });
  }
  function openRideHistory(key, id) {
    if (document.getElementById('parkWaitModalOverlay')?.classList.contains('active')) closeParkWaitModal();
    if (key !== activeParkKey) selectPark(key);
    openHeatmapRideModal(String(id));
  }
  const closureIconCache = new Map();
  function closureIconFrame(url) {
    if (closureIconCache.has(url)) return closureIconCache.get(url);
    const work = new Promise((resolve) => {
      const image = new Image();
      try {
        if (new URL(url, location.href).origin !== location.origin) image.crossOrigin = 'anonymous';
      } catch {
        resolve(null);
        return;
      }
      image.onload = () => {
        try {
          const size = 256,
            canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(image, 0, 0, size, size);
          const pixels = ctx.getImageData(0, 0, size, size).data;
          let left = size,
            top = size,
            right = -1,
            bottom = -1;
          for (let y = 0; y < size; y++)
            for (let x = 0; x < size; x++)
              if (pixels[(y * size + x) * 4 + 3] > 24) {
                left = Math.min(left, x);
                right = Math.max(right, x);
                top = Math.min(top, y);
                bottom = Math.max(bottom, y);
              }
          if (right < left || bottom < top) {
            resolve(null);
            return;
          }
          const w = right - left + 1,
            h = bottom - top + 1,
            output = document.createElement('canvas');
          output.width = 128;
          output.height = 128;
          const target = output.getContext('2d'),
            scale = 120 / Math.max(w, h),
            dw = w * scale,
            dh = h * scale;
          target.drawImage(canvas, left, top, w, h, (128 - dw) / 2, (128 - dh) / 2, dw, dh);
          resolve(output.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      image.onerror = () => resolve(null);
      image.src = url;
    });
    closureIconCache.set(url, work);
    return work;
  }
  function normalizeClosureIcons(summary) {
    summary.querySelectorAll('.pc-closure-park-strip img').forEach((img) => {
      const source = img.getAttribute('src');
      if (!source || img.dataset.pcIconNormalized) return;
      img.dataset.pcIconNormalized = 'pending';
      closureIconFrame(new URL(source, location.href).href).then((frame) => {
        if (frame && img.isConnected) {
          img.src = frame;
          img.dataset.pcIconNormalized = 'true';
        } else img.dataset.pcIconNormalized = 'fallback';
      });
    });
  }
  function closureParkButtons() {
    return PARK_ORDER.map((key) => {
      const park = parkData?.parks?.[key],
        name = park?.name || key.replaceAll('_', ' ');
      return (
        '<button type="button" class="park-select-btn' +
        (key === activeParkKey ? ' active-park' : '') +
        '" data-park-key="' +
        esc(key) +
        '" aria-pressed="' +
        (key === activeParkKey) +
        '" aria-label="Show ' +
        esc(name) +
        ' closures" title="' +
        esc(name) +
        '"' +
        (!park ? ' disabled' : '') +
        '><img src="' +
        esc(PARK_EMOJI_IMAGES[key] || '') +
        '" alt=""></button>'
      );
    }).join('');
  }
  function syncClosureDetails(open) {
    const card = document.getElementById('pcAvailabilityPanel'),
      button = card?.querySelector('.pc-details-pill');
    if (!button) return;
    const value = typeof open === 'boolean' ? open : !!card.open;
    button.setAttribute('aria-expanded', String(value));
    button.setAttribute('aria-label', value ? 'Hide closure details' : 'Show closure details');
    button.innerHTML =
      (value ? 'Hide details' : 'Show details') +
      ' <span aria-hidden="true">' +
      (value ? '▴' : '▾') +
      '</span>';
  }
  function bindClosureHeader(summary) {
    const card = document.getElementById('pcAvailabilityPanel'),
      button = summary.querySelector('.pc-details-pill');
    syncClosureDetails();
    normalizeClosureIcons(summary);
    if (!card.dataset.pcHeaderBound) {
      card.dataset.pcHeaderBound = 'true';
      card.addEventListener('toggle', () => syncClosureDetails());
    }
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const open = button.getAttribute('aria-expanded') !== 'true';
      syncClosureDetails(open);
      if (window.ParkPulseDisclosure) ParkPulseDisclosure.setOpen(card, open);
      else card.open = open;
    };
    summary.querySelectorAll('.pc-closure-park-strip button').forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        const key = button.dataset.parkKey;
        selectPark(key, button);
        document
          .querySelector('#pcClosureSummary .pc-closure-park-strip button[data-park-key="' + key + '"]')
          ?.focus({ preventScroll: true });
      };
      button.onkeydown = (event) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          const buttons = [...summary.querySelectorAll('.pc-closure-park-strip button:not(:disabled)')],
            index = buttons.indexOf(button),
            next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? buttons.length - 1
                  : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      };
    });
  }
  function renderAvailability() {
    const body = document.getElementById('pcAvailabilityBody'),
      summary = document.getElementById('pcClosureSummary');
    if (!body || !summary) return;
    body.querySelectorAll('details[data-pc-key]').forEach((el) => {
      if (el.open) openRows.add(el.dataset.pcKey);
      else openRows.delete(el.dataset.pcKey);
    });
    const d = summaryData(),
      park = parkData?.parks?.[activeParkKey],
      phase = park ? getParkPhase(activeParkKey, park) : null;
    const liveAge = Date.now() - ms(parkData?.updated_at),
      liveFresh = Number.isFinite(liveAge) && liveAge <= STALE_THRESHOLD_MINUTES * 60000;
    const statusText = !park
      ? 'Status unavailable'
      : !liveFresh
        ? 'Live status delayed'
        : !['open', 'early-entry'].includes(phase.phase) && !phase.openNow
          ? phase.phase === 'pre-open'
            ? 'Not open yet'
            : 'Park not operating'
          : d.closed.length + ' reported closed now';
    summary.innerHTML =
      '<span class="pc-card-title">Ride Closures<small>' +
      esc(park?.name || 'Selected park') +
      ' · ' +
      esc(d.period.label) +
      '</small></span><span class="pc-collapsed-stats"><span class="pc-count-chip ' +
      (d.closed.length ? 'is-closed' : '') +
      '">' +
      esc(statusText) +
      '</span><span class="pc-count-chip">' +
      (payload
        ? d.groups.size + ' ride' + (d.groups.size === 1 ? '' : 's') + ' affected'
        : 'History ' + (failed ? 'unavailable' : 'loading')) +
      '</span><span class="pc-count-chip">' +
      (payload ? d.temporary.length + ' recorded interruptions' : 'Waiting for reports') +
      '</span></span><button type="button" class="pc-details-pill" aria-controls="pcAvailabilityBody" aria-expanded="false">Show details <span aria-hidden="true">▾</span></button><span class="pc-closure-park-strip" role="group" aria-label="Choose park for closure reports">' +
      closureParkButtons() +
      '</span>';
    bindClosureHeader(summary);
    const groups = [...d.groups.values()].sort(
      (a, b) =>
        (liveStatus(activeParkKey, a.id).code === 'closed' ? -1 : 0) -
          (liveStatus(activeParkKey, b.id).code === 'closed' ? -1 : 0) ||
        b.events.length - a.events.length ||
        a.name.localeCompare(b.name),
    );
    const shown = showAllRows ? groups : groups.slice(0, 8);
    const rangeLabel =
      dateLabel(d.period.start) +
      (d.period.first !== d.period.last ? '–' + dateLabel(dayStart(d.period.last)) : '');
    const partial =
      payload &&
      (!payload.tracking_started_at || ms(payload.tracking_started_at) > d.period.start || payload.truncated);
    const other = d.events.filter((e) => e.category !== 'temporary'),
      otherGroups = new Map();
    for (const e of other) {
      const key = e.category + ':' + (e.category === 'refurbishment' ? logicalName(e) : e.ride_id),
        g = otherGroups.get(key) || { name: logicalName(e), category: e.category, events: [] };
      g.events.push(e);
      otherGroups.set(key, g);
    }
    if (park)
      for (const ride of getStandardRides(park)) {
        if (
          ride.is_open ||
          !REFURBISHMENT_NAME_PATTERNS.some((p) => p.test(ride.name || '')) ||
          liveStatus(activeParkKey, ride.id).code !== 'closed'
        )
          continue;
        const name = logicalName({ ride_name: ride.name }),
          key = 'refurbishment:' + name,
          g = otherGroups.get(key) || { name, category: 'refurbishment', events: [] };
        (g.liveRecords ||= []).push(ride);
        otherGroups.set(key, g);
      }
    const scheduled = park ? getClosureGroups(park).special.filter((e) => !e.is_open) : [];
    const timeline = (g) =>
      g.events
        .slice()
        .sort((a, b) => ms(b.first_closed_at) - ms(a.first_closed_at))
        .map((e) => '<li>' + esc(description(e, true)) + '</li>')
        .join('');
    body.innerHTML =
      '<div class="pc-period-tabs" role="group" aria-label="Closure history period">' +
      [
        ['today', 'Today'],
        ['week', 'This week'],
        ['seven', 'Last 7 days'],
      ]
        .map(
          ([id, label]) =>
            '<button type="button" class="pc-period-tab" data-pc-period="' +
            id +
            '" aria-pressed="' +
            (selectedPeriod === id) +
            '">' +
            label +
            '</button>',
        )
        .join('') +
      '</div>' +
      '<div class="pc-range-line"><span>' +
      esc(rangeLabel) +
      (selectedPeriod === 'week' ? ' · Monday through today' : '') +
      '</span>' +
      (partial ? '<span class="pc-subtle-tag">Partial history</span>' : '') +
      '<button type="button" class="pc-text-action" data-pc-info>About closure data ⓘ</button></div>' +
      (d.closed.length
        ? '<section class="pc-current"><h4>Reported closed now <small>Park feed ' +
          esc(clock(parkData.updated_at)) +
          '</small></h4><div class="pc-current-list">' +
          d.closed
            .map(
              (r) =>
                '<button type="button" class="pc-current-ride" data-pc-current="' +
                esc(r.id) +
                '"><span>' +
                esc(r.name) +
                '</span><span>View ride details →</span></button>',
            )
            .join('') +
          '</div></section>'
        : '') +
      '<section><h4 class="pc-list-heading">Recorded temporary interruptions</h4>' +
      (!payload
        ? '<p class="pc-empty">' +
          (failed
            ? 'Closure history could not be loaded. Wait-time views are still available.'
            : 'Loading closure reports…') +
          '</p>'
        : !groups.length
          ? '<p class="pc-empty">No temporary interruptions recorded in this period.' +
            (partial ? ' Some of this period has not been tracked.' : '') +
            '</p>'
          : '<div class="pc-ride-list">' +
            shown
              .map((g) => {
                const st = liveStatus(activeParkKey, g.id),
                  key = activeParkKey + ':' + selectedPeriod + ':' + g.id;
                return (
                  '<details class="pc-ride-row" data-pc-key="' +
                  esc(key) +
                  '"><summary><span class="pc-ride-name">' +
                  esc(g.name) +
                  '</span><span class="pc-row-count">' +
                  g.events.length +
                  ' interruption' +
                  (g.events.length === 1 ? '' : 's') +
                  '</span><span class="pc-row-action">View timeline ▾</span></summary><div class="pc-ride-body"><span class="pc-state ' +
                  statusClass(st.code) +
                  '">' +
                  esc(st.label) +
                  '</span><ul>' +
                  timeline(g) +
                  '</ul>' +
                  (currentRide(activeParkKey, g.id)
                    ? '<button type="button" class="pc-action" data-pc-history="' +
                      esc(g.id) +
                      '">View ride wait history →</button>'
                    : '') +
                  '</div></details>'
                );
              })
              .join('') +
            '</div>' +
            (groups.length > 8
              ? '<button type="button" class="pc-action pc-show-all" id="pcShowAll">' +
                (showAllRows ? 'Show fewer attractions' : 'Show all ' + groups.length + ' attractions') +
                '</button>'
              : '')) +
      '</section>' +
      (otherGroups.size
        ? '<details class="pc-other" data-pc-key="other:' +
          activeParkKey +
          '"><summary>Other reported closures <span>' +
          [...otherGroups.values()].filter((g) => g.category === 'refurbishment').length +
          ' refurbishments · ' +
          [...otherGroups.values()].filter((g) => g.category === 'unknown').length +
          ' unknown-start attractions</span> ▾</summary><div>' +
          [...otherGroups.values()]
            .map(
              (g) =>
                '<details class="pc-other-ride"><summary>' +
                esc(g.name) +
                ' <span class="pc-subtle-tag">' +
                (g.category === 'refurbishment' ? 'Refurbishment' : 'Start unknown') +
                '</span></summary>' +
                (g.liveRecords?.length
                  ? '<p class="pc-small-note">Reported closed in the current park feed' +
                    (g.liveRecords.length > 1
                      ? ' · ' + g.liveRecords.length + ' station records grouped'
                      : '') +
                    '.</p>'
                  : '') +
                '<ul>' +
                timeline(g) +
                '</ul></details>',
            )
            .join('') +
          '</div></details>'
        : '') +
      (scheduled.length
        ? '<button type="button" class="pc-text-action pc-scheduled" id="pcScheduled">View scheduled / limited-hours experiences (' +
          scheduled.length +
          ') →</button><small class="pc-small-note">Current snapshot only; not included in temporary ride interruptions.</small>'
        : '') +
      '<details class="pc-data-info" id="pcClosureDataInfo" data-pc-key="data-info"><summary>About closure data ▾</summary><p>' +
      esc(coverage()) +
      '</p><p>Today is the current Eastern park day. This week starts Monday. Last 7 days includes today and the preceding six Eastern calendar days. A brief or single-sample closure is retained, not shown as zero downtime. Interrupted reports do not establish when a ride reopened.</p></details>';
    body.querySelectorAll('[data-pc-period]').forEach(
      (b) =>
        (b.onclick = () => {
          selectedPeriod = b.dataset.pcPeriod;
          showAllRows = false;
          renderAvailability();
        }),
    );
    body.querySelectorAll('[data-pc-info]').forEach((b) => (b.onclick = showDataInfo));
    body
      .querySelectorAll('[data-pc-history]')
      .forEach((b) => (b.onclick = () => openRideHistory(activeParkKey, b.dataset.pcHistory)));
    body
      .querySelectorAll('[data-pc-current]')
      .forEach((b) => (b.onclick = () => openRideHistory(activeParkKey, b.dataset.pcCurrent)));
    const all = body.querySelector('#pcShowAll');
    if (all)
      all.onclick = () => {
        showAllRows = !showAllRows;
        renderAvailability();
      };
    const schedule = body.querySelector('#pcScheduled');
    if (schedule) schedule.onclick = (e) => openClosureModal(e, activeParkKey);
    bindRemembered(body);
  }

  function ensureHeatmapLegend() {
    const table = document.getElementById('heatmapTable'),
      panel = table?.closest('.panel');
    if (!panel) return;
    document.querySelectorAll('#heatmapCaveat .pc-heatmap-key').forEach((n) => n.remove());
    if (heatmapMode === 'hour') {
      const caveat = document.getElementById('heatmapCaveat');
      if (caveat) {
        caveat.textContent = '';
        caveat.classList.remove('visible');
      }
    }
    let legend = document.getElementById('pcHeatmapClosureLegend');
    if (!legend) {
      legend = document.createElement('div');
      legend.id = 'pcHeatmapClosureLegend';
      legend.className = 'pc-mini-legend';
      const anchor = panel.querySelector('.heatmap-legend');
      if (anchor) {
        anchor.classList.add('pc-combined-legend');
        anchor.appendChild(legend);
      } else table.parentElement.insertAdjacentElement('afterend', legend);
    }
    legend.innerHTML =
      (heatmapMode === 'weekday' ? '' : '<span>▲ Closure recorded</span>') +
      '<button type="button" class="pc-text-action" data-pc-help>About closure data ⓘ</button>' +
      (failed && !payload
        ? '<span class="pc-inline-warning">Closure history unavailable</span>'
        : closureDelayed()
          ? '<span class="pc-inline-warning">Closure updates delayed · last report ' +
            esc(clock(payload.updated_at)) +
            '</span>'
          : '');
    legend.querySelector('[data-pc-help]').onclick = showDataInfo;
  }
  function decorateHeatmap(labels) {
    ensureHeatmapLegend();
    if (!payload || !['hour', 'daily'].includes(heatmapMode)) return;
    const today = et(Date.now()).day,
      days = Array.from({ length: 7 }, (_, i) =>
        new Date(Date.parse(today + 'T12:00:00Z') - (6 - i) * 86400000).toISOString().slice(0, 10),
      );
    document.querySelectorAll('#heatmapBody tr[data-ride-id]').forEach((row) => {
      const ride = row.dataset.rideId;
      row.querySelectorAll('td:not(:first-child)').forEach((cell, i) => {
        let start, end, interval;
        if (heatmapMode === 'hour') {
          const m = String(labels[i] || '').match(/^(\d{1,2})([ap])$/);
          if (!m) return;
          const h = (Number(m[1]) % 12) + (m[2] === 'p' ? 12 : 0);
          start = hourStart(today, h);
          end = start + 3600000;
          interval = clock(start) + '–' + clock(end);
        } else {
          start = dayStart(days[i]);
          end = dayEnd(days[i]);
          interval = dateLabel(start);
        }
        const events = relevant(activeParkKey, ride, null).filter(
          (e) => ms(e.first_closed_at) < end && eventEnd(e) >= start,
        );
        if (!events.length) return;
        let node = cell.querySelector('.heatmap-cell');
        if (!node) return;
        if (node.tagName !== 'BUTTON') {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = node.className + ' pc-heatmap-action';
          button.style.cssText = node.style.cssText;
          button.innerHTML = node.innerHTML;
          button.dataset.pcBaseTitle = node.title || '';
          node.replaceWith(button);
          node = button;
        }
        node.querySelectorAll('.pc-heatmap-badge').forEach((n) => n.remove());
        const marker = document.createElement('span');
        marker.className = 'pc-heatmap-badge';
        marker.textContent = '▲';
        marker.setAttribute('aria-hidden', 'true');
        node.appendChild(marker);
        const rideName = currentRide(activeParkKey, ride)?.name || events[0].ride_name,
          value = node.textContent.replace('▲', '').trim();
        node.title =
          (node.dataset.pcBaseTitle ? node.dataset.pcBaseTitle + ' · ' : '') +
          events.length +
          ' recorded closure' +
          (events.length === 1 ? '' : 's') +
          ' · open ride wait history';
        node.setAttribute(
          'aria-label',
          rideName +
            ', ' +
            interval +
            ', ' +
            value +
            ' wait value, ' +
            events.length +
            ' recorded closure' +
            (events.length === 1 ? '' : 's') +
            '. Open ride wait history with closure shading.',
        );
        node.onclick = (event) => {
          event.stopPropagation();
          openRideHistory(activeParkKey, ride);
        };
      });
    });
  }

  // Per-chart UI state lives on the persistent note node, not in API data.
  function parkChartGroupKey(event) {
    const p = et(ms(event.first_closed_at));
    return p.day + ':' + p.hour;
  }
  function parkChartGroupLabel(groupKey) {
    const m = String(groupKey || '').match(/^(\d{4}-\d{2}-\d{2}):(\d{1,2})$/);
    if (!m) return 'Selected hour';
    const t = hourStart(m[1], Number(m[2])),
      options = { hour: 'numeric', timeZoneName: 'short' };
    if (selectedTz !== 'local') options.timeZone = selectedTz;
    return Number.isFinite(t) ? 'Around ' + new Date(t).toLocaleTimeString([], options) : 'Selected hour';
  }
  function parkChartPanelState(note, key, day) {
    const scope = key + '|' + day;
    if (note._pcParkState?.scope !== scope)
      note._pcParkState = { scope, open: false, filter: null, expanded: new Set(), about: false };
    return note._pcParkState;
  }
  function setChartClosureVisibility(visible) {
    showGraphClosures = !!visible;
    for (const c of [chartInstance, parkWaitTrendModalChartInstance, sparklineInstance, hmSparklineInstance])
      if (c?.$pc) c.update('none');
    document
      .querySelectorAll('.pc-chart-toggle input')
      .forEach((input) => (input.checked = showGraphClosures));
  }

  // Animate zero-padding wrappers so borders and spacing collapse with their content.
  const parkClosureMotions = new WeakMap();
  function parkClosureNaturalHeight(el) {
    const child = el.firstElementChild;
    if (!child) return 0;
    const style = getComputedStyle(child);
    return (
      child.getBoundingClientRect().height +
      (parseFloat(style.marginTop) || 0) +
      (parseFloat(style.marginBottom) || 0)
    );
  }
  function cancelParkClosureMotion(el) {
    const record = parkClosureMotions.get(el);
    if (!record) return;
    parkClosureMotions.delete(el);
    record.observer?.disconnect();
    record.animation?.cancel();
    record.resolve(false);
  }
  function animateParkClosureRegion(el, open, from = null) {
    if (!el) return Promise.resolve(false);
    const start = from?.height ?? (el.hidden ? 0 : el.getBoundingClientRect().height);
    const opacity = from?.opacity ?? (el.hidden ? 0 : Number(getComputedStyle(el).opacity));
    cancelParkClosureMotion(el);
    el.inert = !open;
    el.setAttribute('aria-hidden', String(!open));
    const reset = () => {
      el.hidden = !open;
      el.style.height = '';
      el.style.opacity = '';
      el.classList.remove('pc-closure-animating');
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || typeof el.animate !== 'function') {
      reset();
      return Promise.resolve(true);
    }
    el.hidden = false;
    el.style.height = '';
    el.style.opacity = '';
    const end = open ? parkClosureNaturalHeight(el) : 0;
    if (Math.abs(start - end) < 0.5) {
      reset();
      return Promise.resolve(true);
    }
    const duration = open ? 320 : 260;
    let resolve;
    const finished = new Promise((done) => (resolve = done));
    const record = {
      open,
      resolve,
      animation: null,
      observer: null,
      deadline: performance.now() + duration,
      end,
    };
    parkClosureMotions.set(el, record);
    el.classList.add('pc-closure-animating');
    const run = (height, alpha, target, milliseconds) => {
      const previous = record.animation;
      el.style.height = height + 'px';
      el.style.opacity = String(alpha);
      const animation = el.animate(
        [
          { height: height + 'px', opacity: alpha },
          { height: target + 'px', opacity: open ? 1 : 0 },
        ],
        { duration: milliseconds, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
      );
      record.animation = animation;
      previous?.cancel();
      animation.finished
        .then(() => {
          if (parkClosureMotions.get(el) !== record || record.animation !== animation) return;
          parkClosureMotions.delete(el);
          record.observer?.disconnect();
          animation.cancel();
          reset();
          resolve(true);
        })
        .catch(() => {});
    };
    run(start, Number.isFinite(opacity) ? opacity : open ? 0 : 1, end, duration);
    if (open && typeof ResizeObserver !== 'undefined' && el.firstElementChild) {
      record.observer = new ResizeObserver(() => {
        if (parkClosureMotions.get(el) !== record) return;
        const target = parkClosureNaturalHeight(el);
        if (Math.abs(target - record.end) < 1) return;
        const height = el.getBoundingClientRect().height,
          alpha = Number(getComputedStyle(el).opacity);
        record.end = target;
        run(height, alpha, target, Math.max(80, record.deadline - performance.now()));
      });
      record.observer.observe(el.firstElementChild);
    }
    return finished;
  }
  function captureParkClosureMotions(note) {
    const shots = new Map();
    note.querySelectorAll('[data-pc-motion]').forEach((el) => {
      const record = parkClosureMotions.get(el);
      shots.set(el.dataset.pcMotion, {
        height: el.hidden ? 0 : el.getBoundingClientRect().height,
        opacity: el.hidden ? 0 : Number(getComputedStyle(el).opacity),
        running: !!record,
      });
      cancelParkClosureMotion(el);
    });
    return shots;
  }
  function closeParkChartPanel(note, chart, state) {
    state.open = false;
    state.filter = null;
    chart.$pcSelectedGroup = null;
    const button = note.querySelector('[data-pc-chart-action="disclosure"]');
    button?.setAttribute('aria-expanded', 'false');
    const cue = button?.querySelector(':scope > span:last-child');
    if (cue) cue.textContent = '▾';
    const wrapper = note.querySelector('[data-pc-motion="panel"]');
    button?.focus({ preventScroll: true });
    const pending = animateParkClosureRegion(wrapper, false);
    if (wrapper) wrapper._pcMotionPromise = pending;
    chart.draw?.();
    return pending;
  }
  function revealParkChartPanel(panel) {
    if (!panel?.isConnected) return;
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    const body = panel.closest('#parkWaitModalOverlay .ride-modal-body');
    if (body) {
      const a = panel.getBoundingClientRect(),
        b = body.getBoundingClientRect();
      if (a.top < b.top || a.bottom > b.bottom)
        body.scrollTo({ top: Math.max(0, body.scrollTop + a.top - b.top - 8), behavior });
    } else panel.scrollIntoView({ behavior, block: 'nearest' });
  }

  function renderParkChartNote(note, chart, key, day, events, options = {}) {
    note.classList.add('pc-chart-note-park');
    const previousScope = note._pcParkState?.scope,
      motionBefore = captureParkClosureMotions(note);
    const state = parkChartPanelState(note, key, day);
    if (state.filter && !events.some((e) => parkChartGroupKey(e) === state.filter)) state.filter = null;
    chart.$pcSelectedGroup = state.filter;
    const focused = note.contains(document.activeElement) ? document.activeElement : null;
    const focusAction = focused?.dataset.pcChartAction,
      focusRide = focused?.dataset.pcChartRide;
    const focusToggle = focused?.matches?.('[data-pc-chart-toggle]');
    const focusPanel = focused?.classList.contains('pc-chart-detail-panel');
    const focusAbout = focused?.matches?.('.pc-chart-about > summary');
    const aboutBefore = note.querySelector('.pc-chart-about');
    if (aboutBefore) state.about = aboutBefore.open;
    const filtered = state.filter ? events.filter((e) => parkChartGroupKey(e) === state.filter) : events;
    const groupRides = (list) => {
      const groups = new Map();
      for (const e of list) {
        const id = String(e.ride_id),
          g = groups.get(id) || { id, name: currentRide(key, id)?.name || e.ride_name, events: [] };
        g.events.push(e);
        groups.set(id, g);
      }
      return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
    };
    const allRides = groupRides(events),
      rides = groupRides(filtered);
    const panelId = chart.canvas.id + 'ClosureDetails',
      headingId = panelId + 'Heading';
    const unavailable = payload?.tracking_started_at && day < et(ms(payload.tracking_started_at)).day;
    const isToday = day === et(Date.now()).day;
    const title = 'Ride interruptions' + (isToday ? ' today' : ' · ' + dateLabel(dayStart(day)));
    const count = allRides.length + ' ride' + (allRides.length === 1 ? '' : 's');
    const filterCount = rides.length + ' ride' + (rides.length === 1 ? '' : 's') + ' affected';
    const heading = state.filter ? parkChartGroupLabel(state.filter) + ' · ' + filterCount : title;
    const episode = (e) => esc(description(e, e.day !== day));
    const empty = !payload
      ? failed
        ? 'Ride interruption history is unavailable right now.'
        : 'Loading recorded ride interruptions…'
      : unavailable
        ? 'Ride interruption history is not available for this date.'
        : 'No temporary ride interruptions were recorded for this day. Missing reports do not mean every ride stayed open.';
    note.innerHTML =
      '<div class="pc-chart-controls pc-chart-controls-park">' +
      '<span class="pc-chart-marker-key"><span class="pc-chart-key-dot" aria-hidden="true"></span>Recorded ride interruptions</span>' +
      (events.length
        ? '<label class="pc-chart-toggle"><input type="checkbox" data-pc-chart-toggle' +
          (showGraphClosures ? ' checked' : '') +
          '> Show Closures</label>'
        : '') +
      '</div>' +
      '<button type="button" class="pc-chart-disclosure" data-pc-chart-action="disclosure" aria-expanded="' +
      state.open +
      '" aria-controls="' +
      esc(panelId) +
      '"><span><strong>' +
      esc(title) +
      (payload ? ' · ' + count : '') +
      '</strong><small>See which rides paused and when</small></span><span aria-hidden="true">' +
      (state.open ? '▴' : '▾') +
      '</span></button>' +
      '<div class="pc-chart-panel-motion" data-pc-motion="panel" aria-hidden="' +
      !state.open +
      '"' +
      (state.open ? '' : ' hidden inert') +
      '><div class="pc-chart-detail-panel" id="' +
      esc(panelId) +
      '" role="region" tabindex="-1" aria-labelledby="' +
      esc(headingId) +
      '">' +
      '<div class="pc-chart-detail-header"><h4 id="' +
      esc(headingId) +
      '" tabindex="-1">' +
      esc(heading) +
      '</h4>' +
      (state.filter
        ? '<button type="button" class="pc-chart-all" data-pc-chart-action="all">Show all today</button>'
        : '') +
      '</div>' +
      '<p class="pc-chart-context">' +
      (state.filter
        ? 'Showing rides with a recorded interruption starting in this hour.'
        : 'Recorded temporary interruptions, not a list of rides closed right now.') +
      ' Times follow your display time zone.</p>' +
      (closureDelayed()
        ? '<p class="pc-inline-warning">Closure updates are delayed. These are the last available reports.</p>'
        : '') +
      (payload?.truncated
        ? '<p class="pc-inline-warning">Only part of the recorded event list is available.</p>'
        : '') +
      (!rides.length
        ? '<p class="pc-empty">' + esc(empty) + '</p>'
        : '<div class="pc-chart-ride-list">' +
          rides
            .map((g) => {
              const st = liveStatus(key, g.id),
                expanded = state.expanded.has(g.id),
                sorted = g.events.slice().sort((a, b) => ms(b.first_closed_at) - ms(a.first_closed_at));
              const multiple = sorted.length > 1;
              return (
                '<section class="pc-chart-ride"><div class="pc-chart-ride-heading"><h5>' +
                esc(g.name) +
                '</h5><span class="pc-state ' +
                statusClass(st.code) +
                '">' +
                esc(st.label) +
                '</span></div>' +
                (multiple
                  ? '<button type="button" class="pc-chart-episodes-toggle" data-pc-chart-action="episodes" data-pc-chart-ride="' +
                    esc(g.id) +
                    '" aria-expanded="' +
                    expanded +
                    '" aria-controls="' +
                    esc(panelId + 'Ride' + g.id) +
                    '">' +
                    sorted.length +
                    ' recorded interruptions <span aria-hidden="true">' +
                    (expanded ? '▴' : '▾') +
                    '</span></button><div class="pc-chart-episode-motion" data-pc-motion="ride:' +
                    esc(g.id) +
                    '" aria-hidden="' +
                    !expanded +
                    '"' +
                    (expanded ? '' : ' hidden inert') +
                    '><ul class="pc-chart-episodes" id="' +
                    esc(panelId + 'Ride' + g.id) +
                    '">' +
                    sorted.map((e) => '<li>' + episode(e) + '</li>').join('') +
                    '</ul></div>'
                  : '<p class="pc-chart-single-episode">' + episode(sorted[0]) + '</p>') +
                (currentRide(key, g.id)
                  ? '<button type="button" class="pc-chart-history" data-pc-chart-action="history" data-pc-chart-ride="' +
                    esc(g.id) +
                    '">View ride history <span aria-hidden="true">→</span></button>'
                  : '<p class="pc-small-note">This ride is not in the current park feed.</p>') +
                '</section>'
              );
            })
            .join('') +
          '</div>') +
      '<details class="pc-chart-about"' +
      (state.about ? ' open' : '') +
      '><summary>About closure data ⓘ</summary><p>' +
      esc(coverage(day)) +
      '</p><p>Dots group interruptions by the hour their first closed report was recorded. One dot can represent more than one ride or interruption. Reports do not establish the exact transition time or cause. Refurbishments and unknown-start reports remain in the main Ride Closures section.</p></details>' +
      '<button type="button" class="pc-chart-close" data-pc-chart-action="close">Hide interruption details</button></div></div>';
    note.onchange = (event) => {
      if (event.target.matches('[data-pc-chart-toggle]')) setChartClosureVisibility(event.target.checked);
    };
    note.onclick = (event) => {
      const button = event.target.closest('button[data-pc-chart-action]');
      if (!button || !note.contains(button)) return;
      const action = button.dataset.pcChartAction,
        id = button.dataset.pcChartRide;
      if (action === 'history') {
        openRideHistory(key, id);
        return;
      }
      if (action === 'close' || (action === 'disclosure' && state.open)) {
        closeParkChartPanel(note, chart, state);
        return;
      }
      if (action === 'disclosure') {
        state.open = true;
        renderParkChartNote(note, chart, key, day, events, { animatePanel: true });
        return;
      }
      if (action === 'episodes') {
        const expanded = !state.expanded.has(id);
        if (expanded) state.expanded.add(id);
        else state.expanded.delete(id);
        button.setAttribute('aria-expanded', String(expanded));
        const cue = button.querySelector('span');
        if (cue) cue.textContent = expanded ? '▴' : '▾';
        const wrapper = [...note.querySelectorAll('[data-pc-motion]')].find(
          (el) => el.dataset.pcMotion === 'ride:' + id,
        );
        const pending = animateParkClosureRegion(wrapper, expanded);
        if (wrapper) wrapper._pcMotionPromise = pending;
        return;
      }
      if (action === 'all') {
        state.filter = null;
        renderParkChartNote(note, chart, key, day, events, { animatePanel: true });
        note.querySelector('.pc-chart-detail-panel')?.focus({ preventScroll: true });
      }
      chart.draw?.();
    };
    if (!note.dataset.pcAboutBound) {
      note.dataset.pcAboutBound = 'true';
      note.addEventListener(
        'toggle',
        (event) => {
          if (event.target.matches('.pc-chart-about') && note._pcParkState)
            note._pcParkState.about = event.target.open;
        },
        true,
      );
    }
    note.onkeydown = (event) => {
      if (event.key === 'Escape' && state.open && event.target.closest('.pc-chart-detail-panel')) {
        event.preventDefault();
        event.stopPropagation();
        closeParkChartPanel(note, chart, state);
        note.querySelector('[data-pc-chart-action="disclosure"]')?.focus({ preventScroll: true });
      }
    };
    note.querySelectorAll('[data-pc-motion]').forEach((el) => {
      const name = el.dataset.pcMotion,
        previous = previousScope === state.scope ? motionBefore.get(name) : null;
      const open = name === 'panel' ? state.open : state.expanded.has(name.slice(5));
      if ((name === 'panel' && options.animatePanel) || previous?.running) {
        el._pcMotionPromise = animateParkClosureRegion(el, open, previous || { height: 0, opacity: 0 });
      }
    });
    let nextFocus = null;
    if (focusAction)
      nextFocus = [...note.querySelectorAll('[data-pc-chart-action]')].find(
        (b) => b.dataset.pcChartAction === focusAction && b.dataset.pcChartRide === focusRide,
      );
    else if (focusToggle) nextFocus = note.querySelector('[data-pc-chart-toggle]');
    else if (focusPanel) nextFocus = note.querySelector('.pc-chart-detail-panel');
    else if (focusAbout) nextFocus = note.querySelector('.pc-chart-about > summary');
    if (focused) {
      if (!nextFocus || nextFocus.closest('[hidden]'))
        nextFocus = note.querySelector('[data-pc-chart-action="disclosure"]');
      nextFocus?.focus({ preventScroll: true });
    }
    chart.draw?.();
  }
  function openParkChartGroup(chart, hit) {
    const info = chart.$pc,
      note = document.getElementById(chart.canvas.id + 'ClosureNote');
    if (!info || !note || !hit?.events?.length) return;
    const state = parkChartPanelState(note, info.key, info.day);
    state.open = true;
    state.filter = parkChartGroupKey(hit.events[0]);
    const selected = state.filter;
    renderParkChartNote(note, chart, info.key, info.day, info.events, { animatePanel: true });
    const panel = note.querySelector('.pc-chart-detail-panel'),
      wrapper = note.querySelector('[data-pc-motion="panel"]');
    panel?.focus({ preventScroll: true });
    Promise.resolve(wrapper?._pcMotionPromise ?? true).then((done) => {
      if (done && note._pcParkState === state && state.open && state.filter === selected)
        revealParkChartPanel(panel);
    });
  }

  function noteForChart(chart, key, rideId, day, events) {
    const canvas = chart.canvas;
    if (!canvas?.parentElement) return;
    let note = document.getElementById(canvas.id + 'ClosureNote');
    if (!note) {
      note = document.createElement('div');
      note.id = canvas.id + 'ClosureNote';
      note.className = 'pc-chart-note';
      canvas.parentElement.insertAdjacentElement('afterend', note);
    }
    if (rideId == null) {
      renderParkChartNote(note, chart, key, day, events);
      return;
    }
    const unavailable = payload?.tracking_started_at && day < et(ms(payload.tracking_started_at)).day;
    const grouped = new Map();
    for (const e of events) {
      const id = String(e.ride_id),
        g = grouped.get(id) || { id, name: e.ride_name };
      grouped.set(id, g);
    }
    note.innerHTML =
      '<div class="pc-chart-controls">' +
      (events.length
        ? '<label class="pc-chart-toggle"><input type="checkbox" ' +
          (showGraphClosures ? 'checked' : '') +
          '> ' +
          (rideId == null ? 'Show Closures' : 'Show closure shading') +
          '</label>'
        : '') +
      '<button type="button" class="pc-text-action" data-pc-info>About closure data ⓘ</button></div>' +
      (rideId == null && events.length
        ? '<details class="pc-chart-rides"><summary>View affected rides ▾</summary><div>' +
          [...grouped.values()]
            .map(
              (g) =>
                '<button type="button" class="pc-action" data-pc-ride="' +
                esc(g.id) +
                '">' +
                esc(g.name) +
                ' · wait history →</button>',
            )
            .join('') +
          '</div></details>'
        : '') +
      (unavailable ? '<small>Closure history is not available for this date.</small>' : '');
    note.querySelector('[data-pc-info]').onclick = showDataInfo;
    note
      .querySelectorAll('[data-pc-ride]')
      .forEach((b) => (b.onclick = () => openRideHistory(key, b.dataset.pcRide)));
    const toggle = note.querySelector('input');
    if (toggle)
      toggle.onchange = () => {
        showGraphClosures = toggle.checked;
        for (const c of [
          chartInstance,
          parkWaitTrendModalChartInstance,
          sparklineInstance,
          hmSparklineInstance,
        ])
          if (c?.$pc) c.update('none');
        document
          .querySelectorAll('.pc-chart-toggle input')
          .forEach((input) => (input.checked = showGraphClosures));
      };
  }
  function chartGroups(info) {
    const sorted = info.events.slice().sort((a, b) => ms(a.first_closed_at) - ms(b.first_closed_at));
    if (info.rideId == null) {
      const groups = new Map();
      for (const e of sorted) {
        const t = ms(e.first_closed_at),
          p = et(t),
          key = p.day + ':' + p.hour;
        let g = groups.get(key);
        if (!g) {
          g = { start: t, end: eventEnd(e), events: [] };
          groups.set(key, g);
        }
        g.events.push(e);
        g.end = Math.max(g.end, eventEnd(e));
      }
      return [...groups.values()];
    }
    const groups = [];
    for (const e of sorted) {
      const a = ms(e.first_closed_at),
        b = eventEnd(e),
        last = groups.at(-1);
      if (last && a <= last.end) {
        last.end = Math.max(last.end, b);
        last.events.push(e);
      } else groups.push({ start: a, end: b, events: [e] });
    }
    return groups;
  }
  // Park-wide closure dots: canvas pixels; individual ride shading is unchanged.
  const PARK_CLOSURE_MARKER = { radius: 6, offset: 12, edgePadding: 12, hitPadding: 16, hitHeight: 32 };
  const drawingPlugin = {
    id: 'parkClosureEvents',
    beforeDatasetsDraw(chart) {
      chart.$pcHits = [];
      const info = chart.$pc;
      if (!showGraphClosures || !info || !chart.chartArea || !chart.scales.x) return;
      const { ctx, chartArea: a } = chart,
        light = document.documentElement.dataset.theme === 'light';
      ctx.save();
      ctx.beginPath();
      ctx.rect(a.left, a.top, a.right - a.left, a.bottom - a.top);
      ctx.clip();
      for (const group of chartGroups(info)) {
        const x = info.pixel(group.start),
          x2 = info.pixel(group.end);
        if (!Number.isFinite(x) || !Number.isFinite(x2) || x2 < a.left || x > a.right) continue;
        const left = Math.max(a.left, x),
          right = Math.min(a.right, Math.max(x + 2, x2)),
          px = Math.min(
            a.right - PARK_CLOSURE_MARKER.edgePadding,
            Math.max(a.left + PARK_CLOSURE_MARKER.edgePadding, x),
          );
        if (info.rideId != null) {
          const uncertain = group.events.every((e) => e.category === 'unknown');
          ctx.fillStyle = uncertain
            ? light
              ? 'rgba(160,110,0,.13)'
              : 'rgba(255,200,87,.16)'
            : light
              ? 'rgba(190,30,55,.19)'
              : 'rgba(255,65,90,.22)';
          ctx.fillRect(left, a.top, right - left, a.bottom - a.top);
          ctx.strokeStyle = uncertain
            ? light
              ? 'rgba(140,90,0,.55)'
              : 'rgba(255,200,87,.65)'
            : light
              ? 'rgba(165,20,45,.75)'
              : 'rgba(255,75,100,.8)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(left + 0.5, a.top);
          ctx.lineTo(left + 0.5, a.bottom);
          ctx.stroke();
          if (right - left > 3) {
            ctx.beginPath();
            ctx.moveTo(right - 0.5, a.top);
            ctx.lineTo(right - 0.5, a.bottom);
            ctx.stroke();
          }
        }
        chart.$pcHits.push({
          left: info.rideId == null ? px - PARK_CLOSURE_MARKER.hitPadding : left,
          right: info.rideId == null ? px + PARK_CLOSURE_MARKER.hitPadding : Math.max(left + 9, right),
          top: info.rideId == null ? a.bottom - PARK_CLOSURE_MARKER.hitHeight : a.top,
          bottom: a.bottom,
          markerX: px,
          groupKey: info.rideId == null ? parkChartGroupKey(group.events[0]) : null,
          events: group.events,
        });
      }
      ctx.restore();
    },
    afterDatasetsDraw(chart) {
      if (!showGraphClosures || !chart.$pc || chart.$pc.rideId != null || !chart.chartArea) return;
      const { ctx, chartArea: a } = chart,
        light = document.documentElement.dataset.theme === 'light';
      ctx.save();
      for (const hit of chart.$pcHits || []) {
        if (chart.$pcSelectedGroup === hit.groupKey) {
          ctx.strokeStyle = light ? '#17324f' : '#ffd166';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(
            hit.markerX,
            a.bottom - PARK_CLOSURE_MARKER.offset,
            PARK_CLOSURE_MARKER.radius + 3,
            0,
            Math.PI * 2,
          );
          ctx.stroke();
        }
        ctx.fillStyle = light ? '#a91e36' : '#ff5d7a';
        ctx.strokeStyle = light ? '#ffffff' : '#0f2545';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          hit.markerX,
          a.bottom - PARK_CLOSURE_MARKER.offset,
          PARK_CLOSURE_MARKER.radius,
          0,
          Math.PI * 2,
        );
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    },
    afterEvent(chart, args) {
      // Closure overlays never add hover text. Ordinary Chart.js wait-point tooltips are unchanged.
      const p = args.event;
      if (p?.type !== 'click' || !chart.$pc || chart.$pc.rideId != null) return;
      const hits = (chart.$pcHits || []).filter(
        (h) => p.x >= h.left && p.x <= h.right && p.y >= h.top && p.y <= h.bottom,
      );
      // Adjacent touch regions may overlap: select one nearest marker/hour, never merge unrelated groups.
      hits.sort((a, b) => Math.abs(p.x - a.markerX) - Math.abs(p.x - b.markerX));
      if (hits.length) openParkChartGroup(chart, hits[0]);
    },
  };
  if (typeof Chart !== 'undefined' && typeof Chart.register === 'function') Chart.register(drawingPlugin);
  function attachParkChart(chart, key) {
    if (!chart || !parkData?.parks?.[key]) return;
    const series = buildParkWaitCurve(parkData.parks[key]),
      events = relevant(key, null, series.day),
      hours = series.hours;
    chart.$pc = {
      key,
      rideId: null,
      day: series.day,
      events,
      pixel: (t) => {
        const p = et(t),
          parts = new Date(t)
            .toLocaleString('en-US', { timeZone: 'America/New_York', minute: '2-digit', second: '2-digit' })
            .split(':'),
          fraction = (Number(parts[0]) + Number(parts[1] || 0) / 60) / 60;
        return chart.scales.x.getPixelForValue(p.hour + fraction - (hours[0] || 0));
      },
    };
    chart.update('none');
    noteForChart(chart, key, null, series.day, events);
  }
  function rideData(points, events) {
    const clean = points
      .filter((p) => Number.isFinite(ms(p[0])) && typeof p[1] === 'number' && Number.isFinite(p[1]))
      .map((p) => ({ x: ms(p[0]), y: p[1] }))
      .sort((a, b) => a.x - b.x);
    const output = clean.map((p) => ({ ...p }));
    for (const e of events) {
      const a = ms(e.first_closed_at),
        b = eventEnd(e);
      for (const p of output) if (p.x >= a && p.x <= b) p.y = null;
      output.push({ x: a, y: null });
      if (b > a) output.push({ x: b, y: null });
    }
    for (let i = 1; i < clean.length; i++)
      if (clean[i].x - clean[i - 1].x > 8 * 60000)
        output.push({ x: (clean[i].x + clean[i - 1].x) / 2, y: null });
    return output.sort((a, b) => a.x - b.x || (a.y === null ? -1 : 0) - (b.y === null ? -1 : 0));
  }
  function rideContext(kind) {
    const state = dayNavState[kind];
    if (!state) return null;
    let key = activeParkKey;
    for (const [k, p] of Object.entries(parkData?.parks || {}))
      if ((p.rides || []).some((r) => String(r.id) === state.rideId)) {
        key = k;
        break;
      }
    return { key, id: state.rideId, day: state.selected };
  }
  function renderRideChart(points, kind) {
    const context = rideContext(kind);
    if (!context) return;
    const canvas = document.getElementById(kind === 'ride' ? 'rideModalSparkline' : 'hmModalSparkline');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d'),
      c = chartTheme(),
      events = relevant(context.key, context.id, context.day, true),
      data = rideData(points, events);
    const old = kind === 'ride' ? sparklineInstance : hmSparklineInstance;
    if (old) old.destroy();
    const gradient = ctx.createLinearGradient(0, 0, 0, 160);
    gradient.addColorStop(0, c.fillTopSmall);
    gradient.addColorStop(1, c.fillBottom);
    const first = Math.min(...data.map((p) => p.x)),
      last = Math.max(...data.map((p) => p.x));
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Posted wait while open',
            data,
            borderColor: c.primary,
            backgroundColor: gradient,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0,
            fill: true,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.surface,
            titleColor: c.primary,
            bodyColor: c.text,
            borderColor: c.border,
            borderWidth: 1,
            callbacks: {
              title: (items) => (items.length ? clock(items[0].parsed.x) : ''),
              label: (item) => `${item.parsed.y} min`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: Number.isFinite(first) ? first : undefined,
            max: Number.isFinite(last) && last > first ? last : undefined,
            grid: { color: 'transparent' },
            ticks: { color: c.textColor, maxTicksLimit: 6, callback: (v) => clock(Number(v)) },
          },
          y: {
            beginAtZero: true,
            grid: { color: c.grid },
            ticks: { color: c.textColor, callback: (v) => v + 'm' },
          },
        },
      },
    });
    chart.$pc = { ...context, rideId: context.id, events, pixel: (t) => chart.scales.x.getPixelForValue(t) };
    if (kind === 'ride') sparklineInstance = chart;
    else hmSparklineInstance = chart;
    chart.update('none');
    noteForChart(chart, context.key, context.id, context.day, events);
  }

  function refreshVisible() {
    renderAvailability();
    if (!isDataUnavailable()) renderHeatmap();
    else ensureHeatmapLegend();
    if (chartInstance) attachParkChart(chartInstance, activeParkKey);
    if (parkWaitTrendModalChartInstance && parkModalKey)
      attachParkChart(parkWaitTrendModalChartInstance, parkModalKey);
    for (const kind of ['ride', 'hm']) if (dayNavState[kind]) renderDayNav(kind, dayNavState[kind]);
  }
  async function loadClosureData(force = false) {
    if (busy || (!force && Date.now() - lastAttempt < 4 * 60000)) return;
    busy = true;
    lastAttempt = Date.now();
    try {
      const response = await fetch(`${API_BASE}/api/closure-events`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw Error('Closure endpoint HTTP ' + response.status);
      const next = normalize(await response.json());
      if (
        !payload ||
        !Number.isFinite(ms(payload.updated_at)) ||
        ms(next.updated_at) >= ms(payload.updated_at)
      )
        payload = next;
      failed = false;
    } catch (error) {
      failed = true;
      console.warn('Closure events unavailable; retaining prior events', error);
    } finally {
      busy = false;
      refreshVisible();
    }
  }
  // Refresh closure views when the selected display time zone changes.
  let closureDisplayTimeZone = selectedTz;
  PPUI.closures = {
    load: loadClosureData,
    renderAvailability,
    renderRideChart,
    attachParkChart,
    decorateHeatmap,
    ensureHeatmapLegend,
    onParkSelected() {
      showAllRows = false;
      renderAvailability();
    },
    beforeParkWaitModal(key) {
      parkModalKey = key;
    },
    afterParkWaitModal(key) {
      attachParkChart(parkWaitTrendModalChartInstance, key);
    },
    afterDayNav(kind, state) {
      const points = state.series[state.selected]?.points || [];
      if (points.length < 2) {
        const context = rideContext(kind),
          canvas = document.getElementById(kind === 'ride' ? 'rideModalSparkline' : 'hmModalSparkline');
        if (context && canvas)
          noteForChart(
            { canvas },
            context.key,
            context.id,
            context.day,
            relevant(context.key, context.id, context.day, true),
          );
      }
    },
    syncTimeZone() {
      if (closureDisplayTimeZone !== selectedTz) {
        closureDisplayTimeZone = selectedTz;
        refreshVisible();
      }
    },
  };
  window.ParkClosureUI = {
    normalize,
    relevant,
    rideData,
    dayStart,
    dayEnd,
    hourStart,
    description,
    load: loadClosureData,
    getPayload: () => payload,
    periodBounds,
    chartGroups,
    refresh: refreshVisible,
  };
  renderAvailability();
  ensureHeatmapLegend();
})();

/* ==========================================================================
 * Verified park event catalog (window.ParkEventCatalog)
 * ========================================================================== */
(() => {
  'use strict';
  // Maintained official-calendar metadata. Add exact dates here when new seasons are verified.
  // This catalog enriches an existing schedule entry; it never creates a ticketed event from a month alone.
  const VERIFIED_ON = '2026-10-15';
  const dates = (year, month, days) =>
    days.map((day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  const dvcUrl =
    'https://disneyvacationclub.disney.go.com/discounts-perks-offers/member-events/moonlight-magic/';
  const records = [
    {
      id: 'mnsshp-2026',
      park: 'magic_kingdom',
      kind: 'event',
      name: 'Mickey’s Not-So-Scary Halloween Party',
      icon: '🎃',
      pattern: /not.so.scary|halloween party/i,
      dates: [
        ...dates(2026, 8, [7, 11, 14, 18, 21, 23, 25, 28, 30]),
        ...dates(2026, 9, [1, 4, 8, 11, 13, 15, 18, 20, 22, 24, 25, 27, 29]),
        ...dates(2026, 10, [1, 2, 4, 6, 8, 9, 13, 15, 16, 18, 22, 23, 25, 27, 29, 31]),
      ],
      expectedOpen: '19:00',
      expectedClose: '24:00',
      earlyEntry: '16:00',
      category: 'Paid-ticket event',
      admissionType: 'paid_ticket',
      admission:
        'A separate, date-specific party ticket is required. Consult the official event page for current ticket options.',
      summary:
        'A Halloween celebration with trick-or-treating, themed entertainment, character experiences and select attractions.',
      highlights: [
        'Mickey’s Boo-To-You Halloween Parade',
        'Disney’s Not-So-Spooky Spectacular',
        'Hocus Pocus Villain Spelltacular',
        'Trick-or-treat locations throughout the park',
      ],
      url: 'https://disneyworld.disney.go.com/events-tours/magic-kingdom/mickeys-not-so-scary-halloween-party/',
    },
    {
      id: 'mvmcp-2026',
      park: 'magic_kingdom',
      kind: 'event',
      name: 'Mickey’s Very Merry Christmas Party',
      icon: '🎄',
      pattern: /very merry|christmas party/i,
      dates: [
        ...dates(2026, 11, [8, 9, 12, 13, 15, 17, 19, 20, 24, 25, 27, 29]),
        ...dates(2026, 12, [1, 3, 4, 6, 8, 10, 11, 13, 15, 17, 18, 20, 22]),
      ],
      expectedOpen: '19:00',
      expectedClose: '24:00',
      earlyEntry: '16:00',
      category: 'Paid-ticket event',
      admissionType: 'paid_ticket',
      admission:
        'A separate, date-specific party ticket is required. Consult the official event page for current ticket options.',
      summary:
        'A Christmas celebration with holiday entertainment, select attractions, cookies and festive beverages at designated locations.',
      highlights: [
        'Mickey’s Once Upon a Christmastime Parade',
        'Minnie’s Wonderful Christmastime Fireworks',
        'Mickey’s Most Merriest Celebration',
        'Cookies and festive beverages at designated locations',
      ],
      url: 'https://disneyworld.disney.go.com/events-tours/magic-kingdom/mickeys-very-merry-christmas-party/',
    },
    {
      id: 'jollywood-2026-2027',
      park: 'hollywood_studios',
      kind: 'event',
      name: 'Disney Jollywood Nights',
      icon: '✨',
      pattern: /jollywood/i,
      dates: [
        ...dates(2026, 11, [7, 14, 16, 21, 23, 28]),
        ...dates(2026, 12, [5, 7, 12, 14, 19, 21, 23]),
        ...dates(2027, 1, [3, 5]),
      ],
      expectedOpen: '19:30',
      expectedClose: '24:30',
      earlyEntry: '17:30',
      category: 'Paid-ticket event',
      admissionType: 'paid_ticket',
      admission:
        'A separate, date-specific event ticket is required. Consult the official event page for current ticket options.',
      summary:
        'A Hollywood-inspired holiday evening with event entertainment, character experiences, photo opportunities and select attractions.',
      highlights: [
        'Disney Holidays in Hollywood',
        'What’s This? Tim Burton’s The Nightmare Before Christmas Sing-Along',
        'Jingle Bell, Jingle BAM!',
        'Event Disney PhotoPass digital downloads included with the event ticket',
      ],
      url: 'https://disneyworld.disney.go.com/events-tours/hollywood-studios/jollywood-nights/',
    },
    {
      id: 'moonlight-epcot-2026',
      park: 'epcot',
      kind: 'event',
      name: 'Disney Vacation Club Moonlight Magic',
      icon: '🌙',
      pattern: /moonlight magic/i,
      dates: ['2026-10-15'],
      expectedOpen: '21:30',
      expectedClose: '24:30',
      hoursReference: 'Park schedule corroborated for October 15, 2026',
      category: 'Member-registration event',
      admissionType: 'complimentary_registration',
      admission:
        'No-charge event for eligible Disney Vacation Club (DVC) members and their registered guests. Advance registration is required; walk-ins are not permitted.',
      eligibility:
        'The registering member must attend and check in the entire party. Membership eligibility requirements apply.',
      summary:
        'An exclusive DVC member evening with select attractions, character greetings, entertainment and complimentary treats.',
      highlights: [
        'Select attractions',
        'Character greetings and entertainment',
        'Complimentary special treats',
      ],
      url: dvcUrl,
    },
    {
      id: 'moonlight-ak-fall-2026',
      park: 'animal_kingdom',
      kind: 'event',
      name: 'Disney Vacation Club Moonlight Magic',
      icon: '🌙',
      pattern: /moonlight magic/i,
      dates: ['2026-11-30', '2026-12-22'],
      category: 'Member-registration event',
      admissionType: 'complimentary_registration',
      admission:
        'No-charge event for eligible Disney Vacation Club (DVC) members and their registered guests. Advance registration is required; walk-ins are not permitted.',
      eligibility:
        'The registering member must attend and check in the entire party. Membership eligibility requirements apply.',
      summary:
        'An exclusive DVC member evening with select attractions, character greetings, entertainment and complimentary treats.',
      highlights: [
        'Select attractions',
        'Character greetings and entertainment',
        'Complimentary special treats',
      ],
      url: dvcUrl,
    },
    {
      id: 'food-wine-2026',
      park: 'epcot',
      kind: 'festival',
      name: 'EPCOT International Food & Wine Festival',
      icon: '🍷',
      pattern: /food\s*(?:&|and)\s*wine/i,
      start: '2026-08-27',
      end: '2026-11-21',
      category: 'Festival included with park admission',
      admissionType: 'park_admission',
      admission:
        'Included with valid EPCOT admission. A theme park reservation may be required depending on admission type. Optional dining packages have separate booking requirements.',
      summary: 'A celebration of international cuisine, music and family activities at EPCOT.',
      highlights: [
        'Global Marketplaces',
        'Eat to the Beat Concert Series',
        'Emile’s Fromage Montage',
        'Remy’s Ratatouille Hide & Squeak',
      ],
      url: 'https://disneyworld.disney.go.com/events-tours/epcot/epcot-international-food-and-wine-festival/',
    },
  ];
  for (const record of records) record.verifiedOn = VERIFIED_ON;
  const generic = (name) =>
    !name ||
    /^(?:special\s+(?:ticketed\s+)?event|ticketed\s+event|private\s+event|event|festival)$/i.test(
      String(name).trim(),
    );
  const inDates = (record, day) =>
    Array.isArray(record.dates) ? record.dates.includes(day) : day >= record.start && day <= record.end;
  function resolve(park, event, day, kind = 'event') {
    if (!event) return { record: null, status: 'no_schedule_entry' };
    const name = String(event.name || ''),
      candidates = records.filter((r) => r.park === park && r.kind === kind && inDates(r, day));
    const matched = candidates.filter((r) => generic(name) || r.pattern.test(name));
    if (matched.length !== 1) return { record: null, status: 'unverified' };
    const record = matched[0],
      hoursDiffer = !!(
        record.expectedOpen &&
        record.expectedClose &&
        event.open &&
        event.close &&
        (event.open !== record.expectedOpen || event.close !== record.expectedClose)
      );
    if (generic(name) && hoursDiffer) return { record: null, status: 'hours_conflict' };
    return { record, status: 'verified_park_date', hoursDiffer };
  }
  function enrich(park, event, day, kind = 'event') {
    if (!event) return null;
    const result = resolve(park, event, day, kind),
      record = result.record;
    const providerName = event._providerName || event.name || '';
    return {
      ...event,
      name: record ? record.name : generic(event.name) && kind === 'event' ? 'Special event' : event.name,
      icon: record?.icon || event.icon,
      isTicketed: record ? record.admissionType === 'paid_ticket' : event.isTicketed,
      admissionType: record?.admissionType || 'unconfirmed',
      _eventMeta: record,
      _eventMatch: result.status,
      _eventHoursDiffer: !!result.hoursDiffer,
      _providerName: providerName,
    };
  }
  // Applies verified calendar dates to the provider festival (called from core getParkFestival).
  function adjustFestival(key, event, nowET = new Date()) {
    const day = `${nowET.getFullYear()}-${String(nowET.getMonth() + 1).padStart(2, '0')}-${String(nowET.getDate()).padStart(2, '0')}`;

    const foodWine = records.find((r) => r.id === 'food-wine-2026');
    if (key === 'epcot' && day.startsWith('2026-')) {
      if (event && foodWine.pattern.test(event.name || '') && !inDates(foodWine, day)) return null;
      if (!event && inDates(foodWine, day))
        event = { name: foodWine.name, icon: foodWine.icon, sub: 'Official 2026 festival calendar' };
    }
    return enrich(key, event, day, 'festival');
  }
  window.ParkEventCatalog = { version: VERIFIED_ON, records, resolve, enrich, adjustFestival };
})();

/* ==========================================================================
 * Event detail toggles on park cards (PPUI.enhanceEventCards)
 * ========================================================================== */
(() => {
  'use strict';
  const opened = new Map();
  const pillSelector =
    '.pulse-hours-main,.pulse-hours-ee,.pulse-hours-event,.pulse-hours-festival,.score-badge,.park-status-banner,.pulse-closure-main,.pulse-secondary,.pulse-waits-clickable,.pulse-waits-pill-btn,.pulse-weather-pill';
  const escape = (value) => escapeHtml(String(value ?? ''));
  function safeUrl(value) {
    try {
      const u = new URL(String(value));
      return u.protocol === 'https:' ? u.href : null;
    } catch {
      return null;
    }
  }
  function shortClock(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return '';
    const [h, m] = value.split(':').map(Number),
      hh = h % 24;
    return `${hh % 12 || 12}:${String(m).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}${h >= 24 ? ' (next day)' : ''}`;
  }
  function content(entry, park, day) {
    const event = entry.event,
      meta = event._eventMeta;
    const hours = String(
      event.eventHours ||
        event.hours ||
        (event.open && event.close ? shortClock(event.open) + ' – ' + shortClock(event.close) : ''),
    )
      .replace(/^(?:today|tonight)\s*[·:]?\s*/i, '')
      .trim();
    const admission =
      meta?.admissionType === 'paid_ticket'
        ? 'Separate event ticket required.'
        : meta?.admissionType === 'complimentary_registration'
          ? 'Complimentary for eligible DVC members and registered guests. Registration required.'
          : meta?.admissionType === 'park_admission'
            ? 'Included with valid EPCOT admission.'
            : 'Admission requirements not confirmed.';
    const website =
      safeUrl(meta?.url) ||
      safeUrl(event.url || event.website || event.ticketUrl) ||
      'https://disneyworld.disney.go.com/park-calendars/day/';
    const official = meta || /^https:\/\/(?:disneyworld|disneyvacationclub)\.disney\.go\.com\//.test(website);
    return (
      '<div class="pp-event-region-inner pp-event-brief"><h4 class="pp-event-heading">' +
      escape(event.name || 'Special event') +
      '</h4>' +
      '<p class="pp-event-brief-hours">' +
      escape(hours ? hours + ' ET' : 'Specific event hours not supplied.') +
      '</p>' +
      '<p class="pp-event-brief-admission">' +
      escape(admission) +
      '</p>' +
      (meta?.earlyEntry
        ? '<p class="pp-event-brief-entry">Event-ticket entry from ' +
          escape(shortClock(meta.earlyEntry)) +
          ' ET.</p>'
        : '') +
      (event._eventHoursDiffer || event._eventMatch === 'hours_conflict'
        ? '<p class="pp-event-brief-caution">Event identity or hours need verification—check Disney’s listing.</p>'
        : '') +
      '<div class="pp-event-brief-actions"><a class="pp-event-link" href="' +
      escape(website) +
      '" target="_blank" rel="noopener noreferrer"' +
      (meta ? ' title="Official details; catalog verified ' + escape(meta.verifiedOn) + '"' : '') +
      '>' +
      escape(official ? 'Official Disney details ↗' : 'Event information ↗') +
      '</a><button type="button" class="pp-event-close pp-card-pill">Hide details</button></div></div>'
    );
  }
  function setExpanded(button, region, key, open, animate = true) {
    opened.set(key, open);
    button.setAttribute('aria-expanded', String(open));
    region.setAttribute('aria-hidden', String(!open));
    region.inert = !open;
    const start = region.hidden ? 0 : region.getBoundingClientRect().height;
    if (region._ppAnimation) {
      region._ppAnimation.cancel();
      region._ppAnimation = null;
    }
    const finish = () => {
      region.hidden = !open;
      region.style.height = '';
      region.style.overflow = '';
    };
    if (
      !animate ||
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      typeof region.animate !== 'function'
    ) {
      finish();
      return;
    }
    region.hidden = false;
    region.style.height = '';
    const end = open ? region.getBoundingClientRect().height : 0;
    region.style.overflow = 'hidden';
    const animation = region.animate(
      [
        { height: start + 'px', opacity: open ? 0 : 1 },
        { height: end + 'px', opacity: open ? 1 : 0 },
      ],
      { duration: open ? 320 : 260, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
    );
    region._ppAnimation = animation;
    animation.finished
      .then(() => {
        if (region._ppAnimation !== animation) return;
        region._ppAnimation = null;
        animation.cancel();
        finish();
      })
      .catch(() => {});
  }
  function bindEntry(card, node, entry, park, day, index) {
    const key = card.dataset.parkKey + '|' + day + '|' + entry.kind + '|' + String(entry.event.name || ''),
      id = 'ppEvent-' + card.dataset.parkKey + '-' + index;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = node.className + ' pp-card-pill pp-event-trigger';
    button.id = id + '-trigger';
    button.innerHTML = node.innerHTML;
    if (node.matches('.park-status-banner.special-event')) {
      const eventHours = String(entry.event.eventHours || entry.event.hours || '')
        .replace(/^(?:today|tonight)\s*[·:]?\s*/i, '')
        .trim();
      button.innerHTML =
        '<span aria-hidden="true">' +
        escape(entry.event.icon || '✨') +
        '</span><span><strong>' +
        escape(entry.event.name || 'Special event') +
        '</strong><small style="display:block;font-size:.7rem;font-weight:400;">' +
        escape(eventHours ? 'Scheduled hours: ' + eventHours : 'Event details') +
        '</small></span>';
    }
    const cue = document.createElement('span');
    cue.className = 'pp-event-chevron';
    cue.setAttribute('aria-hidden', 'true');
    cue.textContent = '▾';
    button.appendChild(cue);
    button.setAttribute('aria-controls', id);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute(
      'aria-label',
      (entry.kind === 'festival' ? 'Festival details: ' : 'Event details: ') + (entry.event.name || 'Event'),
    );
    button.title = 'Show or hide details for ' + (entry.event.name || 'this event');
    node.replaceWith(button);
    const region = document.createElement('div');
    region.id = id;
    region.className = 'pp-event-region';
    region.hidden = true;
    region.inert = true;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-labelledby', button.id);
    region.setAttribute('aria-hidden', 'true');
    region.innerHTML = content(entry, park, day);
    const hours = card.querySelector('.pulse-hours');
    const last = [...card.querySelectorAll(':scope > .pp-event-region')].at(-1);
    if (last) last.insertAdjacentElement('afterend', region);
    else if (hours) hours.insertAdjacentElement('afterend', region);
    else button.insertAdjacentElement('afterend', region);
    region.addEventListener('click', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      setExpanded(button, region, key, button.getAttribute('aria-expanded') !== 'true');
    });
    const close = region.querySelector('.pp-event-close');
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      setExpanded(button, region, key, false);
      button.focus();
    });
    region.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setExpanded(button, region, key, false);
        button.focus();
      }
    });
    if (opened.get(key)) setExpanded(button, region, key, true, false);
  }
  function enhanceCards() {
    document.querySelectorAll('#parkGrid .park-card').forEach((card) => {
      card.querySelectorAll(pillSelector).forEach((el) => el.classList.add('pp-card-pill'));
      const key = card.dataset.parkKey,
        park = parkData?.parks?.[key];
      if (!park) return;
      const day = normalizeHours(park.hours)?.day || curveET(new Date()).day;
      const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const ticketed = getParkScheduledEvent(key, park, nowET),
        festival = getParkFestival(key, park, nowET);
      const nodes = [];
      if (ticketed) {
        const node =
          card.querySelector('.pulse-hours-event:not(.pp-event-trigger)') ||
          card.querySelector('.park-status-banner.special-event:not(.pp-event-trigger)');
        if (node) nodes.push({ node, event: ticketed, kind: 'ticketed' });
      }
      if (festival) {
        const node = card.querySelector('.pulse-hours-festival:not(.pp-event-trigger)');
        if (node) nodes.push({ node, event: festival, kind: 'festival' });
      }
      nodes.forEach((entry, index) => bindEntry(card, entry.node, entry, park, day, index));
    });
  }
  PPUI.enhanceEventCards = enhanceCards;
  enhanceCards();
})();

/* ==========================================================================
 * Monthly history calendar and shared ride modal (PPUI.history)
 * ========================================================================== */
/* Park Pulse monthly history, revision 2 — shared ride modal. Load last as a classic script. */
(() => {
  'use strict';
  const doc = document;
  const names = {
    magic_kingdom: 'Magic Kingdom',
    epcot: 'EPCOT',
    hollywood_studios: 'Disney’s Hollywood Studios',
    animal_kingdom: 'Disney’s Animal Kingdom',
  };
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    );
  const etDay = () => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(new Date())
        .map((x) => [x.type, x.value]),
    );
    return p.year + '-' + p.month + '-' + p.day;
  };
  const monthOf = (day) => day.slice(0, 7);
  const dateLabel = (day) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(day + 'T12:00:00Z'));
  const monthLabel = (month) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
      new Date(month + '-01T12:00:00Z'),
    );
  const shiftMonth = (month, delta) => {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
  };
  const validMonth = (m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) && m.length === 7;
  // Fixed minute bands, shared across every month. Never normalize to a month's maximum.
  const band = (v) =>
    !finite(v)
      ? 'none'
      : v < 15
        ? 'short'
        : v < 30
          ? 'medium'
          : v < 45
            ? 'long'
            : v < 60
              ? 'longer'
              : 'longest';
  const state = {
    listSort: 'avg',
    listDirection: -1,
    listFilter: '',
    view: 'today',
    park: null,
    month: monthOf(etDay()),
    ride: 'park',
    payload: null,
    bounds: null,
    selectedDay: null,
    request: 0,
    detailRequest: 0,
    chart: null,
    lastFocus: null,
    legacyMode: 'daily',
    busy: false,
  };
  const months = new Map(),
    days = new Map();
  let root,
    todayHost,
    historyHost,
    legacyBody,
    oldWrap,
    primaryToday,
    primaryHistory,
    pendingShared = null;
  const base = () =>
    typeof API_BASE === 'string' ? API_BASE : 'https://wdw-queue-probe.jacocksr.workers.dev';
  const active = () =>
    typeof activeParkKey === 'string' && names[activeParkKey] ? activeParkKey : 'magic_kingdom';
  function qualifying(ride) {
    if (!ride?.name) return false;
    return (
      (typeof isExcludedRide !== 'function' || !isExcludedRide(ride.name)) &&
      (typeof getRideKind !== 'function' || getRideKind(ride) === 'standard')
    );
  }
  function putLimited(cache, key, value, max) {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > max) cache.delete(cache.keys().next().value);
  }
  async function getJSON(path) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(base() + path, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      let body;
      try {
        body = await response.json();
      } catch {
        throw Error('History returned an unreadable response. Please try again.');
      }
      if (!response.ok) {
        const e = Error(
          body.status === 'preparing'
            ? 'This history is still being prepared. Please try again after the next scheduled update.'
            : body.error === 'month_outside_supported_history'
              ? 'No recorded history is available for this month.'
              : 'History is temporarily unavailable. Please try again.',
        );
        e.code = body.error || body.status;
        e.status = response.status;
        throw e;
      }
      return body;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('The history request timed out. Please try again.');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  async function getMonth(month, force = false) {
    if (force) months.delete(month);
    if (months.has(month)) return months.get(month);
    const promise = getJSON('/api/history-calendar?month=' + encodeURIComponent(month)).then((p) => {
      if (
        p.schema_version !== 1 ||
        p.month !== month ||
        !p.rides ||
        !p.parks ||
        !validMonth(p.available_history?.earliest_month) ||
        !validMonth(p.available_history?.latest_month)
      )
        throw Error('History data did not match the requested month. Please retry.');
      return p;
    });
    putLimited(months, month, promise, 6);
    promise.catch(() => {
      if (months.get(month) === promise) months.delete(month);
    });
    return promise;
  }
  async function getDay(ride, day, force = false) {
    const key = ride + '|' + day,
      entry = days.get(key),
      ttl = day === etDay() ? 60000 : 300000;
    if (!force && entry && Date.now() - entry.at < ttl) return entry.promise;
    const promise = getJSON(
      '/api/ride-history-day?ride=' + encodeURIComponent(ride) + '&day=' + encodeURIComponent(day),
    ).then((p) => {
      if (
        p.schema_version !== 1 ||
        String(p.ride) !== String(ride) ||
        p.day !== day ||
        !['available', 'no_graph'].includes(p.status) ||
        !Array.isArray(p.points) ||
        p.point_timestamp_unit !== 'epoch_seconds'
      )
        throw Error('The graph response did not match the selected attraction and date.');
      if (
        p.points.some(
          (point) =>
            !Array.isArray(point) ||
            !finite(point[0]) ||
            !(point[1] === null || (finite(point[1]) && point[1] >= 0)),
        )
      )
        throw Error('The graph contains invalid readings.');
      return p;
    });
    const value = { at: Date.now(), promise };
    putLimited(days, key, value, 24);
    promise.catch(() => {
      if (days.get(key) === value) days.delete(key);
    });
    return promise;
  }
  function legacy(mode) {
    if (typeof setHeatmapMode === 'function')
      setHeatmapMode(mode, doc.querySelector('.heatmap-tab[data-mode="' + mode + '"]'));
    window.dispatchEvent(new Event('resize'));
  }
  function switchView(view) {
    state.view = view;
    primaryToday.setAttribute('aria-pressed', String(view === 'today'));
    primaryHistory.setAttribute('aria-pressed', String(view === 'history'));
    todayHost.hidden = view !== 'today';
    historyHost.hidden = view !== 'history';
    root.querySelector('#ppHistoryTitle').textContent =
      view === 'today' ? '🎢 Ride Waits Today' : '📅 Explore Recorded History';
    if (view === 'today') {
      todayHost.append(oldWrap);
      legacy('hour');
    } else {
      legacyBody.append(oldWrap);
      legacy(state.legacyMode);
      if (!state.payload && !state.busy) loadMonth();
      else renderCalendar();
    }
  }
  function updateToolbar() {
    root.querySelector('#ppMonthLabel').textContent = monthLabel(state.month);
    root.querySelector('#ppMonthPrevious').disabled =
      state.busy || !state.bounds || state.month <= state.bounds.earliest_month;
    root.querySelector('#ppMonthNext').disabled =
      state.busy ||
      !state.bounds ||
      state.month >= state.bounds.latest_month ||
      state.month >= monthOf(etDay());
    root.querySelector('#ppHistoryRefresh').disabled = state.busy;
    root.querySelector('#ppRecentHistory').disabled = state.busy;
  }
  async function loadMonth(force = false, initial = true) {
    const token = ++state.request,
      month = state.month;
    state.busy = true;
    state.payload = null;
    updateToolbar();
    root.querySelector('#ppCalendar').setAttribute('aria-busy', 'true');
    root.querySelector('#ppCalendar').innerHTML =
      '<p class="pp-history-message">Loading ' + esc(monthLabel(month)) + '…</p>';
    root.querySelector('#ppDayOverview').innerHTML = '';
    try {
      let p;
      try {
        p = await getMonth(month, force);
      } catch (error) {
        // At a month boundary the latest stored month can still be the previous month.
        // Make at most one bounded fallback, never scan backwards through months.
        if (initial && !state.bounds && error.code === 'month_outside_supported_history') {
          const previous = shiftMonth(month, -1);
          p = await getMonth(previous, force);
          if (token !== state.request) return;
          state.month = previous;
        } else throw error;
      }
      if (token !== state.request) return;
      state.payload = p;
      state.bounds = p.available_history;
      const mismatch = Object.values(p.rides).filter(
        (r) =>
          r.name &&
          typeof r.qualifies_for_park_average === 'boolean' &&
          qualifying(r) !== r.qualifies_for_park_average,
      ).length;
      root.querySelector('#ppEligibilityWarning').hidden = !mismatch;
      root.querySelector('#ppEligibilityWarning').textContent = mismatch
        ? 'Some recorded eligibility flags differ from the current attraction rules. Park averages below use the recorded API denominator; existing live averages are unchanged.'
        : '';
      renderSelector();
      renderCalendar();
    } catch (error) {
      if (token !== state.request) return;
      root.querySelector('#ppCalendar').innerHTML =
        '<p class="pp-history-message" role="status">' +
        esc(error.message) +
        '</p><button type="button" data-pp-action="retry">Try again</button>';
    } finally {
      if (token === state.request) {
        state.busy = false;
        root.querySelector('#ppCalendar').setAttribute('aria-busy', 'false');
        updateToolbar();
      }
    }
  }
  function renderSelector() {
    const select = root.querySelector('#ppHistoryAttraction');
    const rides = Object.entries(state.payload?.rides || {})
      .filter(([, r]) => r.park === state.park && r.qualifies_for_park_average && qualifying(r))
      .sort((a, b) => a[1].name.localeCompare(b[1].name));
    if (state.ride !== 'park' && !rides.some(([id]) => id === state.ride)) state.ride = 'park';
    select.innerHTML =
      '<option value="park">Park average</option>' +
      rides.map(([id, r]) => '<option value="' + esc(id) + '">' + esc(r.name) + '</option>').join('');
    select.value = state.ride;
  }
  function selectedDays() {
    return state.ride === 'park'
      ? state.payload?.parks?.[state.park]?.days || {}
      : state.payload?.rides?.[state.ride]?.days || {};
  }
  function renderCalendar() {
    updateToolbar();
    if (!state.payload) return;
    const calendar = root.querySelector('#ppCalendar'),
      entries = selectedDays(),
      today = etDay();
    const [year, month] = state.month.split('-').map(Number),
      first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(),
      count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let html = weekdays.map((w) => '<div class="pp-weekday" aria-hidden="true">' + w + '</div>').join('');
    for (let i = 0; i < first; i++) html += '<div class="pp-calendar-blank" aria-hidden="true"></div>';
    for (let day = 1; day <= count; day++) {
      const date = state.month + '-' + String(day).padStart(2, '0'),
        value = entries[date],
        future = date > today,
        recorded = !future && finite(value?.avg_wait),
        isToday = date === today;
      const description = future
        ? 'Future — not a forecast'
        : recorded
          ? value.avg_wait + ' minute average' + (isToday ? ', partial day' : '')
          : 'No recorded positive-wait summary';
      const inner =
        '<time datetime="' +
        date +
        '">' +
        day +
        '</time><span class="pp-cell-value">' +
        (future
          ? 'Future'
          : recorded
            ? '<span class="pp-cell-number">' +
              Math.round(value.avg_wait) +
              '</span><small class="pp-cell-unit">min</small>'
            : '—') +
        '</span>' +
        (isToday ? '<small class="pp-cell-partial">Today · partial</small>' : '');
      const classes =
        'pp-calendar-cell pp-band-' +
        (recorded ? band(value.avg_wait) : 'none') +
        (future ? ' pp-future' : '');
      html += recorded
        ? '<button type="button" class="' +
          classes +
          '" data-pp-day="' +
          date +
          '" aria-pressed="' +
          String(state.selectedDay === date) +
          '" aria-label="' +
          esc(dateLabel(date) + ': ' + description) +
          '">' +
          inner +
          '</button>'
        : '<div class="' +
          classes +
          '" aria-label="' +
          esc(dateLabel(date) + ': ' + description) +
          '">' +
          inner +
          '</div>';
    }
    calendar.innerHTML = html;
    requestAnimationFrame(fitCalendarNumbers);
    const generated = state.payload.generated_at;
    root.querySelector('#ppHistoryCoverage').textContent =
      names[state.park] +
      ' · ' +
      (state.ride === 'park'
        ? 'Equal-weight average of qualifying attraction-day means.'
        : 'Positive open-wait readings from completed hourly rollups.') +
      ' Recorded observations do not establish a complete day. Calendar dates use Eastern park time.' +
      (generated ? ' Snapshot: ' + new Date(generated).toLocaleString() + '.' : '');
    if (state.selectedDay && monthOf(state.selectedDay) === state.month)
      renderOverview(state.selectedDay, false);
    else root.querySelector('#ppDayOverview').innerHTML = '';
  }
  function liveRide(id, key = state.park) {
    return (parkData?.parks?.[key]?.rides || []).find((r) => String(r.id) === String(id));
  }
  function rowsFor(day) {
    const filter = state.listFilter.toLowerCase();
    return Object.entries(state.payload?.rides || {})
      .filter(
        ([id, r]) =>
          r.park === state.park &&
          r.qualifies_for_park_average &&
          qualifying(r) &&
          finite(r.days?.[day]?.avg_wait) &&
          (!filter || (r.name + ' ' + (liveRide(id)?.land || '')).toLowerCase().includes(filter)),
      )
      .sort((a, b) => {
        const left =
          state.listSort === 'avg'
            ? a[1].days[day].avg_wait
            : state.listSort === 'land'
              ? liveRide(a[0])?.land || ''
              : a[1].name;
        const right =
          state.listSort === 'avg'
            ? b[1].days[day].avg_wait
            : state.listSort === 'land'
              ? liveRide(b[0])?.land || ''
              : b[1].name;
        return (
          (typeof left === 'number' ? left - right : String(left).localeCompare(String(right))) *
          state.listDirection
        );
      });
  }
  function renderHistoryRows(day) {
    const body = root.querySelector('#ppHistoryRows');
    if (!body) return;
    body.innerHTML =
      rowsFor(day)
        .map(([id, r]) => {
          const value = r.days[day],
            land = liveRide(id)?.land || '',
            style = getWaitPillStyle(value.avg_wait);
          return (
            '<tr class="ride-row" data-pp-ride="' +
            esc(id) +
            '" data-pp-ride-day="' +
            day +
            '"><td><button type="button" class="pp-history-ride-name"><strong>' +
            esc(r.name) +
            '</strong></button>' +
            (land ? '<span class="queue-mobile-land">' + esc(land) + '</span>' : '') +
            '</td><td class="pp-history-land"><span class="land-tag">' +
            esc(land) +
            '</span></td><td style="text-align:right"><span class="wait-pill" style="background:' +
            style.bg +
            ';color:' +
            style.color +
            '" title="' +
            esc(
              value.archived_graph_available
                ? 'Recorded daily average; archived graph available'
                : 'Recorded daily average; detailed graph may be unavailable',
            ) +
            '">' +
            Number(value.avg_wait.toFixed(1)) +
            ' min</span></td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="3" class="pp-empty-rows">No recorded attractions match this filter.</td></tr>';
  }
  function renderOverview(day, focus = true) {
    if (state.selectedDay !== day) state.listFilter = '';
    state.selectedDay = day;
    const section = root.querySelector('#ppDayOverview');
    root
      .querySelectorAll('[data-pp-day]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ppDay === day)));
    if (state.ride !== 'park') {
      section.innerHTML = '';
      if (focus) openGraph(state.ride, day);
      return;
    }
    const value = state.payload.parks?.[state.park]?.days?.[day];
    if (!value) {
      section.innerHTML = '';
      return;
    }
    section.innerHTML =
      '<div class="pp-history-list-header"><h3 tabindex="-1">' +
      esc(dateLabel(day)) +
      '</h3><p>' +
      value.avg_wait.toFixed(1) +
      ' min park average · ' +
      value.ride_count +
      ' qualifying attractions' +
      (day === etDay() ? ' · Partial day' : '') +
      '</p><label class="pp-history-filter-label"><span class="pp-sr-only">Filter recorded attractions or lands</span><input id="ppHistoryFilter" type="search" placeholder="🔍 Filter rides or lands…" value="' +
      esc(state.listFilter) +
      '"></label></div><div class="pp-history-list-sort"><label for="ppHistorySort">Sort by</label><select id="ppHistorySort"><option value="avg">Average wait</option><option value="name">Attraction</option><option value="land">Land</option></select><button type="button" id="ppHistoryDirection" aria-label="Reverse history sort direction">' +
      (state.listDirection === 1 ? 'Ascending ↑' : 'Descending ↓') +
      '</button></div><div class="table-container pp-history-table-container"><table class="pp-history-table"><thead><tr><th>Attraction</th><th class="pp-history-land">Land</th><th style="text-align:right">Daily avg</th></tr></thead><tbody id="ppHistoryRows"></tbody></table></div>';
    section.querySelector('#ppHistorySort').value = state.listSort;
    section.querySelector('#ppHistoryFilter').oninput = (e) => {
      state.listFilter = e.target.value;
      renderHistoryRows(day);
    };
    section.querySelector('#ppHistorySort').onchange = (e) => {
      state.listSort = e.target.value;
      renderHistoryRows(day);
    };
    section.querySelector('#ppHistoryDirection').onclick = (e) => {
      state.listDirection *= -1;
      e.currentTarget.textContent = state.listDirection === 1 ? 'Ascending ↑' : 'Descending ↓';
      renderHistoryRows(day);
    };
    renderHistoryRows(day);
    if (focus) section.querySelector('h3').focus({ preventScroll: true });
  }
  function fitCalendarNumbers() {
    root.querySelectorAll('.pp-cell-number').forEach((node) => {
      if (!node.clientWidth) return;
      node.style.fontSize = '';
      let size = parseFloat(getComputedStyle(node).fontSize);
      while (node.scrollWidth > node.clientWidth && size > 9) {
        size -= 0.5;
        node.style.fontSize = size + 'px';
      }
    });
  }
  function sharedNote() {
    let note = doc.getElementById('ppSharedHistoryNote');
    if (!note) {
      note = doc.createElement('div');
      note.id = 'ppSharedHistoryNote';
      note.className = 'hm-modal-note';
      doc.querySelector('#rideModalOverlay .ride-modal-body').append(note);
    }
    return note;
  }
  function closeGraph(restore = true) {
    if (!dayNavState.ride?._ppHistory) return;
    closeRideModal(restore);
  }
  function summaryFor(nav, day) {
    return nav._ppHistory.summaries?.[day];
  }
  async function fetchSharedDay(nav, day, force = false) {
    const meta = nav._ppHistory;
    if (meta.loading[day] && !force) return;
    const token = (meta.tokens[day] || 0) + 1;
    meta.tokens[day] = token;
    meta.loading[day] = true;
    delete meta.errors[day];
    try {
      const result = await getDay(nav.rideId, day, force);
      if (dayNavState.ride !== nav || meta.tokens[day] !== token) return;
      meta.responses[day] = result;
      nav.series[day] = { points: result.points.map((p) => [p[0] * 1000, p[1]]), partial: !!result.partial };
    } catch (error) {
      if (dayNavState.ride === nav && meta.tokens[day] === token) meta.errors[day] = error.message;
    } finally {
      if (dayNavState.ride === nav && meta.tokens[day] === token) {
        meta.loading[day] = false;
        if (nav.selected === day) renderDayNav('ride', nav);
      }
    }
  }
  function paintSharedState(nav) {
    const day = nav.selected,
      meta = nav._ppHistory,
      summary = summaryFor(nav, day),
      response = meta.responses[day],
      note = sharedNote();
    note.hidden = false;
    const noHistory = doc.getElementById('rideModalNoHistory');
    if (!response && !meta.errors[day]) {
      noHistory.textContent = 'Loading readings for ' + formatDayKey(day, true) + '…';
      if (!meta.loading[day]) fetchSharedDay(nav, day);
    } else if (meta.errors[day])
      noHistory.textContent = meta.errors[day] + ' The selected date has not changed.';
    else if (response.status === 'no_graph' || !response.points.length)
      noHistory.textContent = summary
        ? 'A daily summary is available, but no detailed graph was returned for this date.'
        : 'No detailed readings were returned for this date.';
    else if (response.points.length < 2)
      noHistory.textContent =
        'Only one reading was returned for this date; there is not enough data to draw a line.';
    const points = nav.series[day]?.points || [],
      positive = points.filter((p) => finite(p[1]) && p[1] > 0),
      numeric = points.filter((p) => finite(p[1]));
    const avg = finite(summary?.avg_wait)
      ? summary.avg_wait
      : positive.length
        ? positive.reduce((n, p) => n + p[1], 0) / positive.length
        : null;
    const peak = finite(summary?.peak_wait)
      ? summary.peak_wait
      : numeric.length
        ? Math.max(...numeric.map((p) => p[1]))
        : null;
    doc.getElementById('rideModalAvgLabel').textContent = formatDayKey(day, false) + ' Avg';
    doc.getElementById('rideModalPeakLabel').textContent = formatDayKey(day, false) + ' Peak';
    doc.getElementById('rideModalAvg').textContent = avg === null ? '–' : Number(avg.toFixed(1)) + ' min';
    doc.getElementById('rideModalPeak').textContent = peak === null ? '–' : peak + ' min';
    // The chart is the existing renderer, including its closure/gap handling. No new Chart is created here.
    note.innerHTML =
      (meta.context === 'weekday'
        ? '<p>Weekday cells combine multiple dates. This chart shows the explicitly selected calendar date, not a weekday-average time series.</p>'
        : '') +
      '<p>Average: recorded positive waits while open. ' +
      (day === etDay() ? 'Today is partial. ' : '') +
      'Closure shading uses only loaded closure reports; no shading does not establish an interruption-free day.</p><button type="button" class="pc-text-action" id="ppSharedHistoryRetry">' +
      (meta.errors[day] ? 'Retry this date' : 'Refresh this date') +
      '</button>';
    note.querySelector('button').onclick = () => {
      delete meta.responses[day];
      nav.series[day] = { points: [], partial: day === etDay() };
      fetchSharedDay(nav, day, true);
      renderDayNav('ride', nav);
    };
  }
  function openGraph(ride, day, force = false, context = 'calendar') {
    if (typeof openRideModal !== 'function' || typeof renderDayNav !== 'function') return;
    const live = liveRide(ride),
      recorded = state.payload?.rides?.[ride],
      park = parkData?.parks?.[state.park];
    const item = live || {
      id: Number(ride),
      name: recorded?.name || historicalSummary?.rides?.[ride]?.name || 'Attraction history',
      land: '',
      is_open: false,
      wait_time: null,
    };
    const summaries = { ...(recorded?.days || {}) };
    const recent = historicalSummary?.daily_heatmap?.rides?.[ride] || {};
    for (const [key, value] of Object.entries(recent)) if (!summaries[key]) summaries[key] = value;
    pendingShared = { ride: String(ride), day, context, summaries, force, returnFocus: doc.activeElement };
    if (doc.getElementById('hmModalOverlay')?.classList.contains('active')) closeHeatmapRideModal();
    try {
      openRideModal(item, park?.name || names[state.park]);
      if (!live) doc.getElementById('rideModalCurrent').textContent = 'Unavailable';
    } finally {
      pendingShared = null;
    }
    const close = doc.querySelector('#rideModalOverlay .ride-modal-close');
    close?.focus({ preventScroll: true });
  }
  // Shared ride modal hooks (called from core initDayNav / renderDayNav / closeRideModal).
  function installSharedHistory() {
    PPUI.history = {
      syncPark,
      initDayNav(kind, id) {
        if (kind !== 'ride' || !pendingShared || String(id) !== pendingShared.ride) {
          if (kind === 'ride') {
            const note = doc.getElementById('ppSharedHistoryNote');
            if (note) note.hidden = true;
          }
          return false;
        }
        const request = pendingShared,
          dates = [
            ...new Set([...Object.keys(request.summaries).filter((d) => d <= etDay()), request.day]),
          ].sort();
        const nav = {
          rideId: String(id),
          archived: null,
          series: {},
          days: dates,
          selected: request.day,
          _ppHistory: {
            summaries: request.summaries,
            context: request.context,
            returnFocus: request.returnFocus,
            responses: {},
            errors: {},
            tokens: {},
            loading: {},
          },
        };
        for (const day of dates) nav.series[day] = { points: [], partial: day === etDay() };
        dayNavState.ride = nav;
        renderDayNav('ride', nav);
        return true;
      },
      afterDayNav(kind, nav) {
        if (kind === 'ride' && nav?._ppHistory) paintSharedState(nav);
      },
      afterRideModalClose(nav, restore = true) {
        const note = doc.getElementById('ppSharedHistoryNote');
        if (note) note.hidden = true;
        if (restore && nav?._ppHistory?.returnFocus?.isConnected)
          nav._ppHistory.returnFocus.focus({ preventScroll: true });
      },
    };
  }
  function syncPark() {
    const key = active();
    if (state.park === key) return;
    state.park = key;
    state.ride = 'park';
    state.selectedDay = null;
    closeGraph(false);
    if (state.payload) {
      renderSelector();
      renderCalendar();
    }
  }
  function init() {
    const panel = doc.querySelector('.heatmap-panel'),
      tabs = panel?.querySelector('.heatmap-tabs');
    if (!panel || !tabs || doc.getElementById('ppHistoryRoot')) return;
    root = panel;
    root.id = root.id || 'ppHistoryRoot';
    state.park = active();
    // Reparent the existing table and controls, preserving IDs, listeners, and closure hooks.
    oldWrap = doc.createElement('div');
    oldWrap.className = 'pp-existing-heatmap';
    for (const selector of [
      '#heatmapCaveat',
      '.heatmap-mobile-nav',
      '#heatmapScrollRegion',
      '.heatmap-legend',
    ]) {
      const node = panel.querySelector(selector);
      if (node) oldWrap.append(node);
    }
    const header = panel.querySelector('.panel-header');
    const title = doc.getElementById('heatmapTitle');
    // Keep the original title node and its ID available for old renderers.
    title.classList.add('pp-legacy-title');
    const visibleTitle = doc.createElement('h2');
    visibleTitle.id = 'ppHistoryTitle';
    visibleTitle.textContent = '🎢 Ride Waits Today';
    header.insertBefore(visibleTitle, title);
    tabs.remove();
    const navigation = doc.createElement('div');
    navigation.className = 'pp-history-primary';
    navigation.setAttribute('role', 'group');
    navigation.setAttribute('aria-label', 'Wait history view');
    navigation.innerHTML =
      '<button type="button" id="ppTodayView" aria-pressed="true">Today</button><button type="button" id="ppExploreView" aria-pressed="false">Explore History</button>';
    header.append(navigation);
    todayHost = doc.createElement('div');
    todayHost.id = 'ppTodayHost';
    todayHost.append(oldWrap);
    panel.append(todayHost);
    historyHost = doc.createElement('div');
    historyHost.id = 'ppHistoryHost';
    historyHost.hidden = true;
    historyHost.innerHTML =
      '<div class="pp-history-toolbar"><label class="pp-history-select">Explore <select id="ppHistoryAttraction"><option value="park">Park average</option></select></label><div class="pp-history-actions"><button type="button" id="ppRecentHistory">Recent 7 days</button><button type="button" id="ppHistoryRefresh">Refresh history</button></div></div><details id="ppHistoryInfo" class="pp-history-info"><summary aria-label="About recorded history" title="About recorded history"><span class="info-btn" aria-hidden="true">i</span><span class="pp-sr-only">About recorded history</span></summary><div class="pp-history-info-body"><p id="ppHistoryCoverage"></p><p>Colors show absolute average wait minutes, not attendance or busier-than-usual scores. Today is partial; missing summaries are not zero waits. Future dates are not forecasts. The park average weights qualifying attraction-day means equally.</p></div></details><p id="ppEligibilityWarning" class="pp-history-message" hidden></p><div class="pp-month-navigation"><button type="button" id="ppMonthPrevious" aria-label="Previous recorded month">‹</button><h3 id="ppMonthLabel" aria-live="polite"></h3><button type="button" id="ppMonthNext" aria-label="Next recorded month">›</button></div><div id="ppCalendar" class="pp-calendar" aria-label="Recorded daily average wait calendar"></div><div class="pp-history-legend" aria-label="Average wait in minutes"><span class="pp-band-short">Under 15</span><span class="pp-band-medium">15–29</span><span class="pp-band-long">30–44</span><span class="pp-band-longer">45–59</span><span class="pp-band-longest">60+</span><span class="pp-band-none">— No summary</span></div><section id="ppDayOverview" aria-label="Selected date details"></section><details id="ppLegacyPatterns"><summary>Recent daily comparisons &amp; weekday patterns</summary><div id="ppLegacyBody"></div></details>';
    panel.append(historyHost);
    legacyBody = historyHost.querySelector('#ppLegacyBody');
    legacyBody.append(tabs);
    // The original Today mode remains accessible through the new primary button.
    const hour = tabs.querySelector('[data-mode="hour"]');
    if (hour) hour.hidden = true;
    tabs.querySelectorAll('.heatmap-tab').forEach((tab) => {
      if (tab.dataset.mode === 'hour') return;
      tab.setAttribute('role', 'button');
      tab.tabIndex = 0;
      tab.addEventListener('click', () => {
        state.legacyMode = tab.dataset.mode;
      });
      tab.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          tab.click();
        }
      });
    });
    historyHost
      .querySelector('#ppLegacyPatterns')
      .addEventListener('toggle', () => window.dispatchEvent(new Event('resize')));
    primaryToday = doc.getElementById('ppTodayView');
    primaryHistory = doc.getElementById('ppExploreView');
    primaryToday.onclick = () => switchView('today');
    primaryHistory.onclick = () => switchView('history');
    root.querySelector('#ppMonthPrevious').onclick = () => {
      if (state.bounds && state.month > state.bounds.earliest_month) {
        state.month = shiftMonth(state.month, -1);
        state.selectedDay = null;
        loadMonth(false, false);
      }
    };
    root.querySelector('#ppMonthNext').onclick = () => {
      if (state.bounds && state.month < state.bounds.latest_month) {
        state.month = shiftMonth(state.month, 1);
        state.selectedDay = null;
        loadMonth(false, false);
      }
    };
    root.querySelector('#ppHistoryAttraction').onchange = (e) => {
      state.ride = e.target.value;
      state.selectedDay = null;
      renderCalendar();
    };
    root.querySelector('#ppHistoryRefresh').onclick = () => loadMonth(true, false);
    root.querySelector('#ppRecentHistory').onclick = () => {
      const recent = root.querySelector('#ppLegacyPatterns');
      recent.open = true;
      legacyBody.append(oldWrap);
      state.legacyMode = 'daily';
      legacy('daily');
      recent.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    };
    root.addEventListener('click', (e) => {
      const day = e.target.closest('[data-pp-day]'),
        ride = e.target.closest('[data-pp-ride]');
      if (day) renderOverview(day.dataset.ppDay);
      if (ride) openGraph(ride.dataset.ppRide, ride.dataset.ppRideDay);
      if (e.target.closest('[data-pp-action="retry"]')) loadMonth(true, false);
    });
    // The old dated Last 7 Days table must not lose the selected date on a row click.
    const legacyTable = doc.getElementById('heatmapBody');
    legacyTable.addEventListener(
      'click',
      (e) => {
        if (state.view !== 'history') return;
        const cell = e.target.closest('td'),
          row = cell?.closest('tr[data-ride-id]'),
          id = row?.dataset.rideId;
        if (!id) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (heatmapMode === 'daily' && cell.cellIndex > 0) {
          const today = etDay(),
            date = new Date(today + 'T12:00:00Z');
          date.setUTCDate(date.getUTCDate() - 6 + cell.cellIndex - 1);
          openGraph(id, date.toISOString().slice(0, 10), false, 'daily');
        } else openGraph(id, etDay(), false, heatmapMode === 'weekday' ? 'weekday' : 'comparison');
      },
      true,
    );
    installSharedHistory();
    let previousWidth = 0;
    new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width || 0;
      if (width !== previousWidth) {
        previousWidth = width;
        requestAnimationFrame(fitCalendarNumbers);
      }
    }).observe(root.querySelector('#ppCalendar'));
    doc.fonts?.ready.then(fitCalendarNumbers);
    updateToolbar();
    // No initial history fetch and no history polling timer.
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
  else init();
})();
