/* Park Pulse park cards and weather: card markup and refinements, weather panel, smooth
   disclosures, heatmap scroll controls, hours strips and the park wait-trend modal. */

/* ==========================================================================
 * Weather data, weather panel and base park cards
 * ========================================================================== */
// Card and weather additions; existing ride, archive, and theme code retained.
const WEATHER_API = 'https://park-pulse-weather.jacocksr.workers.dev/api/weather';
let weatherData = null,
  weatherBusy = false,
  weatherFailed = false,
  weatherLastAttempt = 0;
const wxN = (v) => typeof v === 'number' && Number.isFinite(v),
  wxE = (v) => escapeHtml(v);
const wxF = (v) => (wxN(v) ? Math.round((v * 9) / 5 + 32) + '°F' : 'Unavailable');
function wxAge(t) {
  const n = Date.parse(t);
  return Number.isFinite(n) ? Math.max(0, (Date.now() - n) / 60000) : Infinity;
}
function wxTime(t, short = false) {
  if (!Number.isFinite(Date.parse(t))) return 'Unavailable';
  const opts = short
    ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
    : { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' };
  if (selectedTz !== 'local') opts.timeZone = selectedTz;
  return new Date(t).toLocaleString([], opts);
}
function wxIcon(text, night = false) {
  const t = (text || '').toLowerCase();
  if (/thunder/.test(t)) return '⛈️';
  if (/snow/.test(t)) return '🌨️';
  if (/ice|freezing|sleet/.test(t)) return '🧊';
  if (/rain|shower|drizzle/.test(t)) return '🌧️';
  if (/fog|mist|haze|smoke/.test(t)) return '🌫️';
  if (/mostly cloudy|overcast/.test(t)) return '☁️';
  if (/partly|mostly sunny|few clouds/.test(t)) return night ? '☁️' : '🌤️';
  if (/cloud/.test(t)) return '☁️';
  if (/clear|sunny|fair/.test(t)) return night ? '🌙' : '☀️';
  return '🌡️';
}
function wxFeel(o) {
  return wxN(o?.heat_index_c)
    ? { v: o.heat_index_c, label: 'Heat index' }
    : wxN(o?.wind_chill_c)
      ? { v: o.wind_chill_c, label: 'Wind chill' }
      : null;
}
function pulseCrowd(score, phase) {
  if (phase === 'pre-open') return 'Not open yet';
  if (phase === 'early-entry') return 'Early Entry';
  if (phase === 'closed-for-day') return 'Closed for the day';
  if (!wxN(score)) return 'Crowd level unavailable';
  return score < 2
    ? 'Very light crowds'
    : score < 4
      ? 'Light crowds'
      : score < 6
        ? 'Moderate crowds'
        : score < 8
          ? 'Busy'
          : 'Very busy';
}
function renderParkWeather() {
  document.querySelectorAll('.pulse-weather').forEach((el) => {
    const p = weatherData?.parks?.[el.dataset.parkKey],
      o = p?.observation,
      feel = wxFeel(o);
    if (!o) {
      el.textContent = weatherFailed ? '🌡️ Weather unavailable' : '🌡️ Weather loading…';
      return;
    }
    const stale =
      wxAge(o.observed_at) > 90 || wxAge(weatherData.updated_at) > 20 || p.collection?.errors?.observations;
    el.innerHTML =
      wxIcon(o.description) +
      ' ' +
      wxF(o.temperature_c) +
      (feel ? ' · Feels ' + wxF(feel.v) : '') +
      '<small>' +
      wxE(
        stale
          ? 'Older/delayed reading · ' + wxTime(o.observed_at)
          : 'Observed ' + wxTime(o.observed_at, true) + ' · nearby station',
      ) +
      (weatherFailed ? ' · refresh delayed' : '') +
      '</small>';
    el.title =
      (o.description || 'Condition unavailable') +
      ' · ' +
      (o.station?.name || 'nearby station') +
      (feel ? ' · Feels value uses ' + feel.label.toLowerCase() : '');
  });
}
// Base park-card markup; renderCards() below adds the refinements.
function renderParkCards() {
  const grid = document.getElementById('parkGrid');
  grid.innerHTML = '';
  for (const [key, p] of Object.entries(parkData.parks)) {
    const phase = getParkPhase(key, p),
      closed = phase.phase === 'pre-open' || phase.phase === 'closed-for-day',
      stats = computeLiveStats(p),
      groups = closed ? { temporary: [], extended: [], special: [] } : getClosureGroups(p),
      comp = getParkComparison(key, p);
    const avg = closed || stats.avgWait === null ? '—' : stats.avgWait + ' min',
      longest = closed || !stats.longest ? '—' : stats.longest.wait_time + ' min',
      ride = closed ? '' : stats.longest?.name || '';
    const extras = [];
    if (groups.extended.length) extras.push(groups.extended.length + ' refurbishment/extended');
    if (groups.special.length)
      extras.push(groups.special.length + ' scheduled experience' + (groups.special.length === 1 ? '' : 's'));
    const card = document.createElement('div');
    card.className = 'park-card ' + (key === activeParkKey ? 'active ' : '') + (closed ? 'closed' : '');
    card.dataset.parkKey = key;
    card.style.setProperty('--park-color', p.color || 'linear-gradient(90deg,var(--gold),var(--pink))');
    card.onclick = () => selectPark(key);
    const badge =
      phase.phase === 'closed-for-day'
        ? '<span class="score-badge score-na">N/A</span>'
        : getScoreBadge(p.crowd_score, phase);
    card.innerHTML =
      '<div class="pulse-header"><div class="pulse-identity"><img src="' +
      wxE(PARK_EMOJI_IMAGES[key] || '') +
      '" alt=""/><div><h3>' +
      wxE(p.name) +
      '</h3><div class="pulse-descriptor">' +
      wxE(pulseCrowd(p.crowd_score, phase.phase)) +
      '</div></div></div>' +
      badge +
      '</div>' +
      getStatusBanner(phase) +
      '<div class="pulse-waits pulse-waits-clickable" role="button" tabindex="0" onclick="openParkWaitModal(event, \'' +
      key +
      "')\" onkeydown=\"if(event.key==='Enter'||event.key===' '){event.preventDefault();openParkWaitModal(event, '" +
      key +
      '\');}" title="Tap to view hourly wait trend for ' +
      wxE(p.name) +
      '"><div><div class="label">Average wait</div><div class="value">' +
      avg +
      '</div><div class="pulse-ride" title="' +
      (comp.status === 'ready'
        ? (comp.pctDiff > 0 ? '+' : '') + comp.pctDiff + '% vs typical for this time'
        : 'No historical baseline') +
      '">' +
      (comp.status === 'ready' ? vsTypicalText(comp.pctDiff) : 'Typical crowds unknown') +
      '</div></div><div><div class="label">Longest wait</div><div class="value">' +
      longest +
      '</div><div class="pulse-ride" title="' +
      wxE(ride) +
      '">' +
      wxE(ride) +
      '</div></div><div class="pulse-waits-pill-btn"><span>📈 Tap for hourly wait trend</span><span>›</span></div></div>' +
      (closed
        ? ''
        : '<div class="pulse-closures">' +
          (groups.temporary.length
            ? '<button type="button" class="pulse-disclosure pulse-closure-main down" data-closure>⚠️ ' +
              groups.temporary.length +
              ' temporary closure' +
              (groups.temporary.length === 1 ? '' : 's') +
              ' ›</button>'
            : '<div class="pulse-closure-main">✓ No temporary closures</div>') +
          (extras.length
            ? '<button type="button" class="pulse-disclosure" data-closure>' +
              wxE(extras.join(' · ')) +
              ' ›</button>'
            : '') +
          '</div>') +
      '<div class="pulse-footer"><div class="pulse-weather" data-park-key="' +
      key +
      '">🌡️ Weather loading…</div><button type="button" class="pulse-weather-details" aria-label="Weather details for ' +
      wxE(p.name) +
      '">Details ›</button></div>';
    card.querySelectorAll('[data-closure]').forEach((b) => (b.onclick = (e) => openClosureModal(e, key)));
    card.querySelector('.pulse-weather-details').onclick = (e) => {
      e.stopPropagation();
      selectPark(key);
      document
        .getElementById('weatherPanel')
        .scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
    };
    grid.appendChild(card);
  }
  renderParkWeather();
}

// Presentation-only weather view model; provider, payload and fetch code unchanged.
function weatherViewModel(park) {
  const periods = (Array.isArray(park.forecast?.periods) ? park.forecast.periods : [])
    .filter((p) => Number.isFinite(Date.parse(p.startTime)) && Date.parse(p.endTime) > Date.now())
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const errors = park.collection?.errors || {},
    o = park.observation,
    f = park.forecast,
    a = park.alerts;
  const forecastFresh =
    !!f &&
    !weatherFailed &&
    wxAge(weatherData?.updated_at) <= 20 &&
    !errors.forecast &&
    wxAge(f.fetched_at) <= 120 &&
    wxAge(f.issued_at) <= 360;
  const alertsFresh = !!a && !errors.alerts && wxAge(a.fetched_at) <= 15;
  const active = Array.isArray(a?.active)
    ? a.active.filter((x) => !x.expires || Date.parse(x.expires) > Date.now())
    : [];
  const warnings = [];
  if (weatherFailed || wxAge(weatherData?.updated_at) > 20)
    warnings.push('Weather refresh delayed — last available data.');
  if (o && (wxAge(o.observed_at) > 90 || errors.observations))
    warnings.push('Observation is older or delayed.');
  if (!o) warnings.push('Current observations unavailable.');
  if (f && !forecastFresh) warnings.push('Forecast may be out of date.');
  if (!alertsFresh) warnings.push('NWS alert checks are unavailable or delayed.');
  return { park, o, f, a, periods, forecastFresh, alertsFresh, active, warnings };
}
function weatherTemp(p, compact = false) {
  if (!wxN(p?.temperature)) return '—';
  const value =
    p.temperatureUnit === 'C'
      ? (p.temperature * 9) / 5 + 32
      : p.temperatureUnit === 'F'
        ? p.temperature
        : null;
  return value === null ? '—' : Math.round(value) + (compact ? '°' : '°F');
}
function weatherTimeOnly(iso, hourOnly = false) {
  if (!Number.isFinite(Date.parse(iso))) return 'Unavailable';
  const options = hourOnly ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' };
  if (selectedTz !== 'local') options.timeZone = selectedTz;
  return new Date(iso).toLocaleTimeString([], options);
}
function weatherTrend(view) {
  const periods = view.periods.slice(0, 6);
  if (!view.forecastFresh || periods.length < 3) return null;
  // Avoid interpretations across gaps or sparse probability/temperature data.
  if (
    periods.some((p, i) => i && Date.parse(p.startTime) - Date.parse(periods[i - 1].startTime) > 90 * 60000)
  )
    return null;
  const rain = periods.map((p) => p.probabilityOfPrecipitation?.value);
  const completeRain = rain.every((x) => wxN(x) && x >= 0 && x <= 100);
  if (completeRain) {
    const early = (rain[0] + rain[1]) / 2,
      late = (rain.at(-1) + rain.at(-2)) / 2,
      change = late - early;
    const lateStorm = periods.slice(-2).some((p) => /thunder/i.test(p.shortForecast || ''));
    if (change >= 15 && late >= 40)
      return lateStorm
        ? { icon: '⛈️', text: 'Rain chances rise; storms are in the forecast' }
        : { icon: '🌧️', text: 'Rain chances rise over the next few hours' };
    if (change <= -15 && early >= 40)
      return { icon: '🌤️', text: 'Rain chances ease over the next few hours' };
  }
  const temps = periods.map((p) =>
    wxN(p.temperature)
      ? p.temperatureUnit === 'C'
        ? (p.temperature * 9) / 5 + 32
        : p.temperatureUnit === 'F'
          ? p.temperature
          : null
      : null,
  );
  if (temps.every(wxN) && temps.at(-1) - temps[0] >= 5)
    return { icon: '🌡️', text: 'Temperatures climb over the next few hours' };
  // Stable is shown only for an unchanged forecast description and small swings.
  const descriptions = periods.map((p) =>
    String(p.shortForecast || '')
      .trim()
      .toLowerCase(),
  );
  if (
    completeRain &&
    temps.every(wxN) &&
    descriptions[0] &&
    descriptions.every((x) => x === descriptions[0]) &&
    Math.max(...rain) - Math.min(...rain) <= 10 &&
    Math.max(...temps) - Math.min(...temps) <= 3
  )
    return {
      icon: wxIcon(periods[0].shortForecast, periods[0].isDaytime === false),
      text: 'Mostly steady conditions over the next few hours',
    };
  return null;
}
function renderWeatherGlance(view) {
  const { o, periods } = view,
    feel = wxFeel(o),
    trend = weatherTrend(view);
  const metadata = [];
  if (feel) metadata.push('Feels ' + wxF(feel.v).replace('°F', '°'));
  if (wxN(o?.wind_kmh)) metadata.push('Wind ' + Math.round(o.wind_kmh / 1.609344) + ' mph');
  if (wxN(o?.humidity_percent)) metadata.push('Humidity ' + Math.round(o.humidity_percent) + '%');
  const condition = typeof o?.description === 'string' ? o.description.trim() : '';

  let html =
    '<div class="ppwx-current">' +
    (o
      ? '<span aria-hidden="true">' +
        wxIcon(condition) +
        '</span> ' +
        wxF(o.temperature_c) +
        (condition ? ' · ' + wxE(condition) : '')
      : 'Current conditions unavailable') +
    '</div>';
  if (metadata.length)
    html +=
      '<div class="ppwx-metadata"' +
      (feel ? ' title="Feels value uses ' + wxE(feel.label.toLowerCase()) + '"' : '') +
      '>' +
      wxE(metadata.join(' · ')) +
      '</div>';
  if (trend)
    html +=
      '<div class="ppwx-trend"><span aria-hidden="true">' +
      trend.icon +
      '</span> ' +
      wxE(trend.text) +
      '</div>';
  if (periods.length) {
    html +=
      '<div class="ppwx-strip-label">Next hours · rain chance</div><div class="ppwx-glance-forecast" aria-label="Next five hourly forecast periods">' +
      periods
        .slice(0, 5)
        .map((p) => {
          const rain = p.probabilityOfPrecipitation?.value;
          const description = p.shortForecast || 'Forecast description unavailable';
          const accessible =
            weatherTimeOnly(p.startTime, true) +
            ': ' +
            weatherTemp(p) +
            ', ' +
            description +
            ', ' +
            (wxN(rain) ? rain + ' percent chance of precipitation' : 'precipitation probability unavailable');
          return (
            '<div class="ppwx-glance-hour" role="group" aria-label="' +
            wxE(accessible) +
            '" title="' +
            wxE(description + ' · ' + wxTime(p.startTime)) +
            '"><time datetime="' +
            wxE(p.startTime) +
            '" aria-hidden="true">' +
            wxE(weatherTimeOnly(p.startTime, true)) +
            '</time><strong aria-hidden="true">' +
            wxIcon(description, p.isDaytime === false) +
            ' ' +
            weatherTemp(p, true) +
            '</strong><small aria-hidden="true">' +
            (wxN(rain) ? Math.round(rain) + '%' : '—') +
            '</small></div>'
          );
        })
        .join('') +
      '</div>';
  }
  html +=
    '<div class="ppwx-glance-source">' +
    (o ? 'Observed ' + wxE(wxTime(o.observed_at, true)) + ' · Nearby station' : 'Observations unavailable') +
    ' · NWS</div>';
  document.getElementById('weatherGlance').innerHTML = html;
  document.getElementById('weatherGlanceWarnings').innerHTML =
    view.active
      .map(
        (a) =>
          '<p class="ppwx-alert-preview">⚠️ ' +
          wxE(a.event || 'NWS weather alert') +
          (view.alertsFresh ? '' : ' · Last available report') +
          ' · Expand for details</p>',
      )
      .join('') +
    (view.warnings.length ? '<p class="ppwx-warning">' + wxE(view.warnings.join(' ')) + '</p>' : '');
}

function renderWeatherParkStrip() {
  const strip = document.getElementById('weatherPanelParkStrip');
  const signature = PARK_ORDER.map(
    (key) =>
      key +
      '|' +
      (weatherData?.parks?.[key]?.name || parkData.parks?.[key]?.name || key) +
      '|' +
      PARK_EMOJI_IMAGES[key],
  ).join(';');
  if (strip.dataset.signature !== signature) {
    strip.innerHTML = PARK_ORDER.map((key) => {
      const name = weatherData?.parks?.[key]?.name || parkData.parks?.[key]?.name || key;
      return (
        '<button type="button" class="park-select-btn" data-park-key="' +
        wxE(key) +
        '" aria-label="View ' +
        wxE(name) +
        ' weather" aria-pressed="false"><img src="' +
        wxE(PARK_EMOJI_IMAGES[key] || '') +
        '" alt="" /></button>'
      );
    }).join('');
    strip.dataset.signature = signature;
  }
  strip.querySelectorAll('button').forEach((button) => {
    const active = button.dataset.parkKey === activeParkKey;
    button.classList.toggle('active-park', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function bindWeatherForecastScroll(scroller) {
  if (!scroller) return;
  const previous = document.getElementById('weatherForecastPrev'),
    next = document.getElementById('weatherForecastNext');
  const update = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    previous.disabled = scroller.scrollLeft <= 2;
    next.disabled = max <= 2 || scroller.scrollLeft >= max - 2;
  };
  const move = (direction) => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollBy({
      left: direction * Math.max(150, scroller.clientWidth * 0.8),
      behavior: reduced ? 'auto' : 'smooth',
    });
  };
  previous.onclick = () => move(-1);
  next.onclick = () => move(1);
  scroller.addEventListener('scroll', update, { passive: true });
  scroller.addEventListener('keydown', (event) => {
    if (event.target !== scroller) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    }
    if (event.key === 'Home') {
      event.preventDefault();
      scroller.scrollTo({ left: 0, behavior: 'auto' });
    }
    if (event.key === 'End') {
      event.preventDefault();
      scroller.scrollTo({ left: scroller.scrollWidth, behavior: 'auto' });
    }
  });
  requestAnimationFrame(update);
}

function renderWeatherDetails(view) {
  const el = document.getElementById('weatherContent'),
    { o, f, a, active, alertsFresh, periods } = view;
  const opened = new Set([...el.querySelectorAll('details[open]')].map((x) => x.dataset.id));
  const focused = document.activeElement?.closest?.('.weather-alert');
  const focusId = focused && el.contains(focused) ? focused.dataset.id : null;
  const oldScroller = el.querySelector('#weatherForecastScroller');
  const oldKey = oldScroller?.dataset.parkKey;
  const oldLeft = oldScroller?.scrollLeft || 0;
  const oldWidth = oldScroller?.clientWidth || 0;
  const anchorCard = oldScroller
    ? [...oldScroller.querySelectorAll('[data-period-start]')].find(
        (card) => card.offsetLeft - oldScroller.offsetLeft + card.offsetWidth > oldLeft,
      )
    : null;
  const anchorTime = anchorCard?.dataset.periodStart;
  const wasForecastFocused = document.activeElement?.id === 'weatherForecastScroller';
  const forecastButtonFocus = ['weatherForecastPrev', 'weatherForecastNext'].includes(
    document.activeElement?.id,
  )
    ? document.activeElement.id
    : null;
  let html =
    '<div class="ppwx-forecast-heading"><div class="ppwx-detail-heading">Hourly forecast <span class="ppwx-forecast-hint">Swipe or use arrows for more hours</span></div>' +
    (periods.length
      ? '<div class="ppwx-forecast-controls"><button type="button" id="weatherForecastPrev" aria-label="Earlier forecast hours" aria-controls="weatherForecastScroller">‹</button><button type="button" id="weatherForecastNext" aria-label="Later forecast hours" aria-controls="weatherForecastScroller">›</button></div>'
      : '') +
    '</div>';
  if (periods.length)
    html +=
      '<div class="weather-hours ppwx-forecast-scroller" id="weatherForecastScroller" data-park-key="' +
      wxE(activeParkKey) +
      '" role="region" aria-label="Hourly forecast; use left and right arrow keys to browse" tabindex="0">' +
      periods
        .map(
          (p) =>
            '<div class="weather-hour" data-period-start="' +
            wxE(p.startTime) +
            '"><time datetime="' +
            wxE(p.startTime) +
            '">' +
            wxE(wxTime(p.startTime, true)) +
            '</time><strong><span aria-hidden="true">' +
            wxIcon(p.shortForecast, p.isDaytime === false) +
            '</span> ' +
            weatherTemp(p) +
            '</strong><div>' +
            wxE(p.shortForecast || 'Forecast unavailable') +
            '</div><p>' +
            (wxN(p.probabilityOfPrecipitation?.value)
              ? Math.round(p.probabilityOfPrecipitation.value) + '% rain chance'
              : 'Rain probability unavailable') +
            '</p></div>',
        )
        .join('') +
      '</div>';
  else html += '<p class="ppwx-provenance">Hourly forecast unavailable.</p>';
  if (alertsFresh && !active.length)
    html += '<p class="ppwx-no-alert">✓ No active NWS weather alerts returned</p>';
  else if (!alertsFresh)
    html +=
      '<p class="ppwx-warning">NWS alert status unavailable or delayed — check official weather information.</p>';
  for (const x of active)
    html +=
      '<details class="weather-alert" data-id="' +
      wxE(x.id) +
      '"' +
      (opened.has(x.id) ? ' open' : '') +
      '><summary>⚠️ ' +
      wxE(x.event || 'Weather alert') +
      (alertsFresh ? '' : ' · Last available report') +
      '</summary><p>' +
      wxE(x.headline || '') +
      '</p><p>' +
      wxE(x.description || '') +
      '</p>' +
      (x.instruction ? '<p>' + wxE(x.instruction) + '</p>' : '') +
      '<p>Expires ' +
      wxE(wxTime(x.expires)) +
      '</p></details>';
  html +=
    '<div class="ppwx-provenance"><p><strong>Data:</strong> National Weather Service' +
    (f
      ? ' · Forecast issued ' + wxE(wxTime(f.issued_at)) + ' · Retrieved ' + wxE(wxTime(f.fetched_at))
      : ' · Forecast unavailable') +
    '.</p><p>Rain percentages are forecast probabilities, not measured rainfall.' +
    (a ? ' · NWS alerts checked ' + wxE(wxTime(a.fetched_at)) + '.' : '') +
    '</p>';
  if (o) {
    const feel = wxFeel(o),
      stats = [];
    if (feel) stats.push(feel.label + ': ' + wxF(feel.v));
    if (wxN(o.gust_kmh)) stats.push('Gusts ' + Math.round(o.gust_kmh / 1.609344) + ' mph');
    // Preserve the optional observed-rain field already present in the old UI.
    if (wxN(o.precipitation_last_hour_mm))
      stats.push('Last-hour observed rain ' + (o.precipitation_last_hour_mm / 25.4).toFixed(2) + ' in');
    if (stats.length) html += '<p>' + wxE(stats.join(' · ')) + '.</p>';
    html +=
      '<p>Observed ' +
      wxE(wxTime(o.observed_at)) +
      ' at ' +
      wxE(o.station?.name || 'nearby station') +
      ' (' +
      wxE(o.station?.id || 'unavailable') +
      ')' +
      (wxN(o.station?.distance_km)
        ? ' · ' + (o.station.distance_km / 1.609344).toFixed(1) + ' mi from this park'
        : '') +
      '.' +
      (o.fetched_at ? ' Observation retrieved ' + wxE(wxTime(o.fetched_at)) + '.' : '') +
      '</p>';
  }
  html +=
    '<p>Nearby station conditions may differ within the park.</p><p>Weather does not confirm attraction closure causes. Not an emergency alert service. <a href="https://www.weather.gov/" target="_blank" rel="noopener" style="color:var(--gold)">Official weather information →</a></p></div>';
  el.innerHTML = html;
  const scroller = el.querySelector('#weatherForecastScroller');
  if (scroller) {
    if (oldKey === activeParkKey) {
      // Keep the browsed hour when old forecast periods expire or a refresh occurs.
      const anchor = anchorTime
        ? [...scroller.querySelectorAll('[data-period-start]')].find(
            (card) => card.dataset.periodStart === anchorTime,
          )
        : null;
      scroller.scrollLeft = anchor ? anchor.offsetLeft - scroller.offsetLeft : oldLeft;
    }
    bindWeatherForecastScroll(scroller);
    if (wasForecastFocused) scroller.focus({ preventScroll: true });
    if (forecastButtonFocus) document.getElementById(forecastButtonFocus)?.focus({ preventScroll: true });
  }
  if (focusId) {
    const next = [...el.querySelectorAll('.weather-alert')].find((x) => x.dataset.id === focusId);
    next?.querySelector('summary')?.focus({ preventScroll: true });
  }
}
function renderWeatherSections() {
  renderParkWeather();
  renderWeatherParkStrip();
  const park = weatherData?.parks?.[activeParkKey],
    name = park?.name || parkData.parks?.[activeParkKey]?.name || 'Selected Park';
  document.getElementById('weatherTitle').innerHTML =
    '<img src="' +
    wxE(PARK_EMOJI_IMAGES[activeParkKey] || '') +
    '" class="panel-title-emoji" alt=""/>' +
    wxE(name) +
    ' Weather';
  if (!park) {
    const message = weatherFailed
      ? 'Weather temporarily unavailable — retrying automatically.'
      : 'Loading nearby weather…';
    document.getElementById('weatherGlance').textContent = message;
    document.getElementById('weatherGlanceWarnings').textContent = '';
    document.getElementById('weatherContent').innerHTML =
      '<p class="ppwx-provenance">' + wxE(message) + '</p>';
    return;
  }
  const view = weatherViewModel(park);
  renderWeatherGlance(view);
  renderWeatherDetails(view);
}
function renderWeather() {
  renderWeatherSections();
  PPUI.contextCards?.schedule(); // app-shell.js (after init)
}
function initWeatherDisclosure() {
  const panel = document.getElementById('weatherPanel'),
    summary = panel.querySelector('.weather-summary');
  const syncState = () => {
    summary.setAttribute('aria-expanded', String(panel.open));
    panel.querySelector('.weather-expand-label').textContent = panel.open
      ? 'Hide details ↑'
      : 'Show details ↓';
  };
  panel.addEventListener('toggle', () => {
    syncState();
    if (panel.open) {
      requestAnimationFrame(() => {
        const scroller = document.getElementById('weatherForecastScroller');
        if (scroller) scroller.dispatchEvent(new Event('scroll'));
      });
    }
  });
  syncState();
  document.getElementById('weatherPanelParkStrip').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-park-key]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    selectPark(button.dataset.parkKey);
  });
  document.addEventListener(
    'click',
    (event) => {
      if (event.target.closest?.('.pulse-weather-pill')) {
        panel.open = true;
        syncState();
      }
    },
    true,
  );
}
async function fetchWeather() {
  if (weatherBusy || document.hidden) return;
  weatherBusy = true;
  weatherLastAttempt = Date.now();
  const c = new AbortController(),
    timer = setTimeout(() => c.abort(), 12000);
  try {
    const r = await fetch(WEATHER_API, { signal: c.signal });
    if (!r.ok) throw Error('Weather HTTP ' + r.status);
    const d = await r.json();
    if (
      d.schema_version !== 1 ||
      !d.parks ||
      typeof d.parks !== 'object' ||
      !Number.isFinite(Date.parse(d.updated_at))
    )
      throw Error('Invalid weather response');
    weatherData = d;
    weatherFailed = false;
  } catch (e) {
    weatherFailed = true;
    console.warn('Weather unavailable', e);
  } finally {
    clearTimeout(timer);
    weatherBusy = false;
    renderWeather();
  }
}
window.addEventListener('DOMContentLoaded', () => {
  initWeatherDisclosure();
  renderWeather();
  fetchWeather();
  setInterval(fetchWeather, 300000);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    renderWeather();
    if (Date.now() - weatherLastAttempt >= 300000) fetchWeather();
  }
});

/* ==========================================================================
 * Card descriptors (PPUI.refinePulseCards)
 * ========================================================================== */
(() => {
  function refinePulseCards() {
    document.querySelectorAll('#parkGrid .park-card').forEach((card) => {
      const header = card.querySelector('.pulse-header');
      const descriptor = header?.querySelector('.pulse-descriptor');
      const badge = header?.querySelector('.score-badge');
      if (descriptor && badge) {
        let group = header.querySelector('.pulse-score-group');
        if (!group) {
          group = document.createElement('div');
          group.className = 'pulse-score-group';
          badge.before(group);
          group.appendChild(badge);
        }
        group.appendChild(descriptor);
        descriptor.textContent = descriptor.textContent.replace(/ crowds$/i, '');
      }
      const status = card.querySelector('.pulse-closure-main');
      if (status && !status.classList.contains('down'))
        status.textContent = status.textContent.replace(/^✓\s*/, '✅ ');
      const secondary = card.querySelector('.pulse-closures .pulse-disclosure:not(.pulse-closure-main)');
      if (secondary) {
        secondary.classList.add('pulse-secondary');
        let text = secondary.textContent;
        if (!text.includes('🛠')) text = text.replace(/(\d+ refurbishment\/extended)/, '🛠 $1');
        if (!text.includes('🎟')) text = text.replace(/(\d+ scheduled experiences?)/, '🎟️ $1');
        secondary.textContent = text;
      }
      // One interpretation for both descriptor and insight; no changed score formula.
      const park = parkData.parks[card.dataset.parkKey];
      if (!park) return;
      const phase = getParkPhase(card.dataset.parkKey, park);
      if (phase.phase !== 'open') return;
      const score = park.crowd_score;
      const heading = card.querySelector('.pulse-insight strong');
      const detail = card.querySelector('.pulse-insight small');
      if (!heading || !detail) return;
      let title, text;
      if (typeof score !== 'number' || !Number.isFinite(score)) {
        title = 'Check the latest waits';
        text = 'Crowd interpretation is unavailable.';
      } else if (score < 2) {
        title = 'A very light park day';
        text = 'Compare current waits to make the most of it.';
      } else if (score < 4) {
        title = 'Great time to visit';
        text = 'Short waits across most attractions.';
      } else if (score < 6) {
        title = 'Moderate crowds';
        text = 'Check headliner waits before your next stop.';
      } else if (score < 8) {
        title = 'A busy park day';
        text = 'Compare attractions to find your next opportunity.';
      } else {
        title = 'Very busy right now';
        text = 'Use current waits to choose your next stop.';
      }
      heading.textContent = title;
      detail.textContent = text;
    });
  }
  PPUI.refinePulseCards = refinePulseCards;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refinePulseCards);
  else refinePulseCards();
})();

/* ==========================================================================
 * Card weather pill (PPUI.applyWeatherPills)
 * ========================================================================== */
(() => {
  function applyWeatherPills() {
    document.querySelectorAll('#parkGrid .park-card').forEach((card) => {
      const secondary = card.querySelector('.pulse-secondary');
      if (secondary && !secondary.querySelector('.pulse-pill-label')) {
        const label = document.createElement('span');
        label.className = 'pulse-pill-label';
        label.textContent = secondary.textContent;
        secondary.title = secondary.textContent;
        secondary.replaceChildren(label);
      }
      const footer = card.querySelector('.pulse-footer');
      if (!footer || footer.classList.contains('pulse-weather-pill')) return;
      const weather = footer.querySelector('.pulse-weather');
      if (!weather) return;
      const key = card.dataset.parkKey;
      const parkName = parkData.parks[key]?.name || 'this park';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pulse-footer pulse-weather-pill';
      button.setAttribute('aria-label', 'View weather details for ' + parkName);
      button.setAttribute('aria-controls', 'weatherPanel');
      const reading = document.createElement('span');
      reading.className = 'pulse-weather';
      reading.dataset.parkKey = key;
      reading.innerHTML = weather.innerHTML;
      reading.title = weather.title;
      const detail = document.createElement('span');
      detail.className = 'pulse-weather-details';
      detail.textContent = 'Details ›';
      button.append(reading, detail);
      button.onclick = (event) => {
        event.stopPropagation();
        selectPark(key);
        const panel = document.getElementById('weatherPanel');
        if (!panel) return;
        panel.setAttribute('tabindex', '-1');
        panel.focus({ preventScroll: true });
        panel.scrollIntoView({
          behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
      };
      footer.replaceWith(button);
    });
  }
  PPUI.applyWeatherPills = applyWeatherPills;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyWeatherPills);
  } else {
    applyWeatherPills();
  }
})();

/* ==========================================================================
 * Smooth disclosures for details.panel / [data-smooth-expand]
 * ========================================================================== */
(() => {
  const states = new WeakMap();
  const selector = 'details.panel, details[data-smooth-expand]';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function contentOf(el) {
    return el.querySelector(':scope > .weather-expanded-content, :scope > [data-disclosure-content]');
  }
  function stop(state) {
    if (state.animation) {
      state.animation.cancel();
      state.animation = null;
    }
    if (state.fade) {
      state.fade.cancel();
      state.fade = null;
    }
  }
  function clean(el, state) {
    el.style.height = state.savedHeight;
    el.style.overflow = state.savedOverflow;
    el.classList.remove('pp-disclosure-animating');
    state.running = false;
    state.settledOpen = el.open;
    state.lastHeight = el.getBoundingClientRect().height;
  }
  function setOpen(el, open, startOverride) {
    bind(el);
    const state = states.get(el);
    if (!state.running && el.open === open && state.settledOpen === open) return;
    const start = Number.isFinite(startOverride) ? startOverride : el.getBoundingClientRect().height;
    const token = ++state.token;
    stop(state);
    if (reduced() || typeof el.animate !== 'function') {
      el.open = open;
      clean(el, state);
      return;
    }
    state.running = true;
    state.target = open;
    el.classList.add('pp-disclosure-animating');
    // Measure both complete layouts synchronously, before the browser paints.
    el.style.height = state.savedHeight;
    el.open = open;
    const end = el.getBoundingClientRect().height;
    // Closing keeps the content visible long enough to fade and slide out.
    if (!open) el.open = true;
    el.style.height = start + 'px';
    el.style.overflow = 'hidden';
    const duration = open ? 320 : 260;
    const animation = el.animate([{ height: start + 'px' }, { height: end + 'px' }], {
      duration,
      easing: 'cubic-bezier(.22,1,.36,1)',
      fill: 'forwards',
    });
    state.animation = animation;
    const content = contentOf(el);
    if (content)
      state.fade = content.animate(
        open
          ? [
              { opacity: 0, transform: 'translateY(-4px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ]
          : [
              { opacity: 1, transform: 'translateY(0)' },
              { opacity: 0, transform: 'translateY(-3px)' },
            ],
        {
          duration: open ? 240 : 180,
          easing: 'ease-out',
          fill: 'forwards',
        },
      );
    animation.finished
      .then(() => {
        if (state.token !== token) return;
        el.open = open;
        stop(state);
        clean(el, state);
      })
      .catch(() => {});
  }
  function bind(el) {
    if (!el || !el.matches(selector) || states.has(el)) return;
    const summary = el.querySelector(':scope > summary');
    if (!summary) return;
    const state = {
      running: false,
      animation: null,
      fade: null,
      token: 0,
      target: el.open,
      settledOpen: el.open,
      lastHeight: el.getBoundingClientRect().height,
      savedHeight: el.style.height,
      savedOverflow: el.style.overflow,
    };
    states.set(el, state);
    el.classList.add('pp-smooth-disclosure');
    summary.addEventListener('click', (event) => {
      // Do not interfere with any future links/controls inside a summary.
      if (event.target.closest('a,button,input,select,textarea')) return;
      event.preventDefault();
      setOpen(el, state.running ? !state.target : !el.open);
    });
    el.addEventListener('toggle', () => {
      if (state.running) return;
      // Also animate direct .open assignments made by existing site handlers.
      if (el.open !== state.settledOpen) setOpen(el, el.open, state.lastHeight);
    });
    const observer = new ResizeObserver(() => {
      if (!state.running) {
        state.lastHeight = el.getBoundingClientRect().height;
      }
    });
    observer.observe(el);
  }
  function initialize(root = document) {
    if (root.matches?.(selector)) bind(root);
    root.querySelectorAll?.(selector).forEach(bind);
  }
  // Public helper for future cards; existing weather handlers need not change.
  window.ParkPulseDisclosure = {
    setOpen: (el, open) => setOpen(typeof el === 'string' ? document.querySelector(el) : el, !!open),
    initialize,
  };
  document.addEventListener(
    'click',
    (event) => {
      if (event.target.closest?.('.pulse-weather-pill')) {
        const panel = document.getElementById('weatherPanel');
        if (panel) {
          const state = states.get(panel);
          setOpen(panel, true, state && !state.running ? state.lastHeight : undefined);
        }
      }
    },
    true,
  );
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initialize());
  else initialize();
  const added = new MutationObserver((records) => {
    for (const record of records)
      for (const node of record.addedNodes) if (node.nodeType === 1) initialize(node);
  });
  added.observe(document.documentElement, { childList: true, subtree: true });
})();

/* ==========================================================================
 * Heatmap horizontal scroll controls
 * ========================================================================== */
// Frontend-only table navigation, using existing data and event handlers.
(() => {
  function init() {
    const region = document.getElementById('heatmapScrollRegion');
    const prev = document.getElementById('heatmapScrollPrev'),
      next = document.getElementById('heatmapScrollNext');
    const update = () => {
      const max = region.scrollWidth - region.clientWidth;
      prev.disabled = region.scrollLeft <= 2;
      next.disabled = max <= 2 || region.scrollLeft >= max - 2;
      document.getElementById('heatmapSwipeHint').textContent =
        max > 2 ? 'Swipe to compare columns' : 'All columns visible';
    };
    const move = (direction) =>
      region.scrollBy({
        left: direction * Math.max(48, region.clientWidth - 144),
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    prev.onclick = () => move(-1);
    next.onclick = () => move(1);
    region.addEventListener('scroll', update, { passive: true });
    region.addEventListener('keydown', (event) => {
      if (event.target !== region) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        move(event.key === 'ArrowLeft' ? -1 : 1);
      }
      if (event.key === 'Home') {
        event.preventDefault();
        region.scrollTo({ left: 0, behavior: 'auto' });
      }
      if (event.key === 'End') {
        event.preventDefault();
        region.scrollTo({ left: region.scrollWidth, behavior: 'auto' });
      }
    });
    new MutationObserver(() => requestAnimationFrame(update)).observe(
      document.getElementById('heatmapTable'),
      { childList: true, subtree: true },
    );
    new ResizeObserver(update).observe(region);
    update();
    // Add keyboard access to sortable headers without replacing sort behavior.
    const enhance = () =>
      document.querySelectorAll('#ridesTable th.sortable,#heatmapTable th.sortable').forEach((th) => {
        th.tabIndex = 0;
        if (!th.dataset.keyboardSort) {
          th.dataset.keyboardSort = 'true';
          th.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              th.click();
            }
          });
        }
      });
    enhance();
    new MutationObserver(enhance).observe(document.getElementById('heatmapHead'), { childList: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* ==========================================================================
 * Compact card labels (PPUI.shortenCardLabels)
 * ========================================================================== */
(() => {
  function shortenLabels() {
    document.querySelectorAll('#parkGrid .park-card').forEach((card) => {
      const park = parkData.parks[card.dataset.parkKey];
      if (!park) return;
      const closuresContainer = card.querySelector('.pulse-closures');
      if (closuresContainer) {
        closuresContainer.querySelectorAll('.pulse-secondary').forEach((b) => b.remove());
        const groups = getClosureGroups(park);
        if (groups.extended.length) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'pulse-disclosure pulse-secondary';
          btn.setAttribute('data-closure', '');
          const count = groups.extended.length;
          btn.title =
            count +
            ' refurbishment/long-term closure' +
            (count === 1 ? '' : 's') +
            ' — open for exact classifications';
          btn.setAttribute('aria-label', btn.title);
          btn.onclick = (e) => openClosureModal(e, card.dataset.parkKey);
          const label = document.createElement('span');
          label.className = 'pulse-pill-label';
          label.textContent = '🛠 ' + count + ' refurbishment' + (count === 1 ? '' : 's') + ' ›';
          btn.appendChild(label);
          closuresContainer.appendChild(btn);
        }
        if (groups.special.length) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'pulse-disclosure pulse-secondary';
          btn.setAttribute('data-closure', '');
          const count = groups.special.length;
          btn.title = count + ' scheduled events/shows — open for exact classifications';
          btn.setAttribute('aria-label', btn.title);
          btn.onclick = (e) => openClosureModal(e, card.dataset.parkKey);
          const label = document.createElement('span');
          label.className = 'pulse-pill-label';
          label.textContent = '🎟️ ' + count + ' scheduled events/shows ›';
          btn.appendChild(label);
          closuresContainer.appendChild(btn);
        }
      }
      const phase = getParkPhase(card.dataset.parkKey, park);
      if (phase.phase === 'open' && !qualifyingRides(park).length) {
        const heading = card.querySelector('.pulse-insight strong'),
          detail = card.querySelector('.pulse-insight small');
        if (heading) heading.textContent = 'No positive waits reported';
        if (detail)
          detail.textContent = 'Check individual attractions; zero readings are excluded from averages.';
      }
      const comp = getParkComparison(card.dataset.parkKey, park);
      // Explain differing coverage if only some eligible rides have a baseline.
      if (comp.status === 'ready') {
        const comparison = card.querySelector('.pulse-waits>div:first-child .pulse-ride');
        if (comparison)
          comparison.title =
            'Positive waits only. Compared ' +
            comp.matchedRides +
            ' of ' +
            comp.eligibleRides +
            ' qualifying attractions with matching weekday/hour history; each attraction weighted equally.';
      }
    });
  }
  PPUI.shortenCardLabels = shortenLabels;
  const refresh = () => {
    renderCards();
    renderBestParkBanner();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh);
  else refresh();
})();

/* ==========================================================================
 * Hours strips, clock-driven refresh and park wait-trend modal
 * ========================================================================== */
/* Today's park hours strip on each card (only when the worker supplied valid hours for today). */
(() => {
  function addHoursStrips() {
    document.querySelectorAll('#parkGrid .park-card').forEach((card) => {
      const key = card.dataset.parkKey,
        park = parkData.parks[key];
      if (!park) return;
      const ph = getParkPhase(key, park);
      if (ph.awaiting && ph.openNow) {
        const d = card.querySelector('.pulse-descriptor');
        if (d) d.textContent = 'Open · awaiting first update';
      }
      if (card.querySelector('.pulse-hours')) return;
      const h = normalizeHours(park.hours);
      if (!h) return;
      const phase = ph.phase === 'open' || ph.openNow ? 'open' : ph.phase;
      const cls = phase === 'open' ? 'is-open' : phase === 'early-entry' ? 'is-early' : '';
      const hasEE = hhmmToMins(h.earlyEntry) < hhmmToMins(h.open);
      const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));

      const nowMins = nowET.getHours() * 60 + nowET.getMinutes();
      const showEarlyEntry = hasEE && nowMins < hhmmToMins(h.open);

      const schedEvent = getParkScheduledEvent(key, park, nowET);
      const festival = getParkFestival(key, park, nowET);

      let eventPill = '';
      if (schedEvent && !ph.isSpecialEvent) {
        eventPill =
          '<span class="pulse-hours-event" title="' +
          escapeHtml(schedEvent.name) +
          '"><span aria-hidden="true">' +
          schedEvent.icon +
          '</span><strong>' +
          escapeHtml(schedEvent.name) +
          '</strong> <small>' +
          escapeHtml(schedEvent.hours) +
          '</small></span>';
      }
      let festPill = '';
      if (festival) {
        festPill =
          '<span class="pulse-hours-festival" title="' +
          escapeHtml(festival.name) +
          ' · ' +
          escapeHtml(festival.sub) +
          '"><span aria-hidden="true">' +
          festival.icon +
          '</span><strong>' +
          escapeHtml(festival.name) +
          '</strong> <small>' +
          escapeHtml(festival.sub) +
          '</small></span>';
      }

      const html =
        '<div class="pulse-hours ' +
        cls +
        '" title="Today\u2019s park hours (Eastern Time)">' +
        '<span class="pulse-hours-main"><span class="pulse-hours-dot" aria-hidden="true"></span>Today <strong>' +
        fmtClock(h.open) +
        ' \u2013 ' +
        fmtClock(h.close) +
        '</strong> <small>ET</small></span>' +
        (showEarlyEntry
          ? '<span class="pulse-hours-ee">\ud83d\udd11 Early Entry ' + fmtClock(h.earlyEntry) + '</span>'
          : '') +
        eventPill +
        festPill +
        '</div>';
      const header = card.querySelector('.pulse-header');
      if (header) header.insertAdjacentHTML('afterend', html);
    });
  }
  PPUI.addHoursStrips = addHoursStrips;
})();
/* Curve clock: re-render the wait curve when the Eastern hour/day rolls over. */
(() => {
  let lastCurveClock = '';
  let lastPhaseSig = null;
  PPUI.cards = PPUI.cards || {};
  PPUI.cards.refreshOnClockChange = function () {
    if (isDataUnavailable()) return;
    // Re-render when a park's phase changes (e.g. it opens) instead of waiting for the next data refresh.
    const phaseSig = PARK_ORDER.map((k) => {
      if (!parkData.parks[k]) return '-';
      const p = getParkPhase(k, parkData.parks[k]);
      return p.phase + (p.awaiting ? '*' : '') + (p.openNow ? '+' : '');
    }).join('|');
    const phaseChanged = lastPhaseSig !== null && phaseSig !== lastPhaseSig;
    lastPhaseSig = phaseSig;
    if (phaseChanged) renderAll();
    const current = curveET(new Date());
    const key = current.day + '#' + current.hour;
    if (key !== lastCurveClock) {
      lastCurveClock = key;
      const park = parkData.parks[activeParkKey];
      if (park) renderChart(park);
    }
  };
})();

let parkWaitTrendModalChartInstance = null;

function closeParkWaitModal() {
  const overlay = document.getElementById('parkWaitModalOverlay');
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
  if (parkWaitTrendModalChartInstance) {
    parkWaitTrendModalChartInstance.destroy();
    parkWaitTrendModalChartInstance = null;
  }
}

function openParkWaitModal(event, parkKey) {
  PPUI.closures?.beforeParkWaitModal(parkKey);
  showParkWaitModal(event, parkKey);
  PPUI.closures?.afterParkWaitModal(parkKey); // closure markers on the modal curve
}

function showParkWaitModal(event, parkKey) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  const park = parkData && parkData.parks && parkData.parks[parkKey];
  if (!park) return;
  const overlay = document.getElementById('parkWaitModalOverlay');
  if (!overlay) return;

  const emojiImg = document.getElementById('parkWaitModalEmoji');
  if (emojiImg) {
    emojiImg.src = (typeof PARK_EMOJI_IMAGES !== 'undefined' && PARK_EMOJI_IMAGES[parkKey]) || '';
    emojiImg.alt = park.name || '';
  }
  const titleEl = document.getElementById('parkWaitModalTitle');
  if (titleEl) titleEl.textContent = park.name || 'Park Waits';

  const stats = computeLiveStats(park);
  const comp = getParkComparison(parkKey, park);
  const phase = getParkPhase(parkKey, park);
  const isClosed = phase.phase === 'pre-open' || phase.phase === 'closed-for-day';

  const avgEl = document.getElementById('parkWaitModalAvg');
  if (avgEl) avgEl.textContent = isClosed || stats.avgWait === null ? '—' : stats.avgWait + ' min';

  const longestEl = document.getElementById('parkWaitModalLongest');
  if (longestEl) longestEl.textContent = isClosed || !stats.longest ? '—' : stats.longest.wait_time + ' min';

  const longestRideEl = document.getElementById('parkWaitModalLongestRide');
  if (longestRideEl) {
    const rideName = !isClosed && stats.longest && stats.longest.name ? stats.longest.name : '';
    longestRideEl.textContent = rideName;
    longestRideEl.title = rideName;
  }

  const statusEl = document.getElementById('parkWaitModalStatus');
  if (statusEl) {
    if (comp.status === 'ready') {
      const text = vsTypicalText(comp.pctDiff);
      const sign = comp.pctDiff > 0 ? '+' : '';
      statusEl.innerHTML = `<strong>${escapeHtml(text)}</strong><br><small style="color:var(--text-muted);font-weight:400;">(${sign}${comp.pctDiff}% vs typical)</small>`;
    } else {
      statusEl.textContent = 'Typical crowds unknown';
    }
  }

  const series = buildParkWaitCurve(park);
  const noteEl = document.getElementById('parkWaitModalNote');
  if (noteEl) {
    const validPoints = (series.today || []).filter((x) => typeof x === 'number' && Number.isFinite(x));
    if (validPoints.length) {
      const peakVal = Math.max(...validPoints);
      const peakIdx = series.today.indexOf(peakVal);
      const peakHour = series.hours[peakIdx];
      const peakLabel = `${peakHour % 12 || 12}${peakHour >= 12 ? ' PM' : ' AM'}`;
      noteEl.innerHTML = `Waits peaked at <strong>~${Math.round(peakVal)} min</strong> around <strong>${peakLabel}</strong> today. Tap or hover points for details.`;
    } else {
      noteEl.textContent = 'Hourly trend updates dynamically as live attraction wait times are observed.';
    }
  }

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  const canvas = document.getElementById('parkWaitTrendModalChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (parkWaitTrendModalChartInstance) parkWaitTrendModalChartInstance.destroy();

  const c = chartTheme();
  const label = (hour) => `${hour % 12 || 12}${hour >= 12 ? 'p' : 'a'}`;
  const gradient = ctx.createLinearGradient(0, 0, 0, 205);
  gradient.addColorStop(0, c.fillTop);
  gradient.addColorStop(1, c.fillBottom);

  parkWaitTrendModalChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.hours.map(label),
      datasets: [
        {
          label: 'Today',
          data: series.today,
          borderColor: c.primary,
          backgroundColor: gradient,
          pointBackgroundColor: c.primary,
          pointBorderColor: c.pointBorder,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          tension: 0.15,
          fill: true,
          spanGaps: false,
        },
        {
          label: 'Typical',
          data: series.typical,
          borderColor: c.secondary,
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 2,
          tension: 0.15,
          fill: false,
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: c.surface,
          titleColor: c.primary,
          bodyColor: c.text,
          borderColor: c.border,
          borderWidth: 1,
          padding: 8,
          cornerRadius: 6,
          callbacks: {
            title: (items) => {
              const i = items[0]?.dataIndex;
              return i !== undefined ? `${series.day} · ${label(series.hours[i])} ET` : '';
            },
            label: (item) => `${item.dataset.label}: ${item.parsed.y} min`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: c.grid },
          ticks: { color: c.textColor, callback: (v) => v + 'm', font: { size: 9 }, maxTicksLimit: 5 },
        },
        x: {
          grid: { color: 'transparent' },
          ticks: { color: c.textColor, font: { size: 9 }, maxRotation: 0 },
        },
      },
    },
  });
}

/* ==========================================================================
 * renderCards pipeline
 * ========================================================================== */
/* Single entry point for the four park cards. Order matters: each step decorates the markup
   produced by the previous one. */
function renderCards() {
  if (isDataUnavailable()) renderUnavailableState();
  else {
    renderParkCards(); // base markup + weather line
    PPUI.refinePulseCards(); // crowd descriptor / headline copy
    PPUI.applyWeatherPills(); // weather pill button
    PPUI.shortenCardLabels(); // compact secondary labels
    PPUI.addHoursStrips(); // today's hours strip and event pills
  }
  PPUI.closures?.renderAvailability(); // history.js: closures panel
  if (!isDataUnavailable()) PPUI.enhanceEventCards?.(); // history.js: event detail toggles
  PPUI.gauges?.sync(); // effects.js: score gauges
  PPUI.overview?.scheduleRefresh(); // app-shell.js (after init)
}
