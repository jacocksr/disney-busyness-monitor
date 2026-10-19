
  // Shown only until the first successful live fetch. Contains NO invented numbers.
  // updated_at is null on purpose so it can never look "fresh".
  const fallbackData = { unavailable: true, updated_at: null, parks: {} };
  let liveFetchAttempted = false;
  function isDataUnavailable() { return !!(parkData && parkData.unavailable); }

  // TEMPORARY stopgap: used only when the worker does not send valid park.hours for today.
  // Worker v3.4 now supplies hours; set ALLOW_DEFAULT_HOURS = false once verified (then delete DEFAULT_HOURS).
  const ALLOW_DEFAULT_HOURS = false;
  const HHMM_RE = /^\d{1,2}:\d{2}$/;
  // Accept worker hours only if well-formed and for today's Eastern date.
  function normalizeHours(h) {
    if (!h || !HHMM_RE.test(h.open || "") || !HHMM_RE.test(h.close || "")) return null;
    if (h.day && h.day !== curveET(new Date()).day) return null;
    return { ...h, earlyEntry: HHMM_RE.test(h.earlyEntry || "") ? h.earlyEntry : h.open };
  }
  function hoursAreEstimated(park) { return !normalizeHours(park && park.hours); }
  function resolveHours(parkKey, park) {
    const h = normalizeHours(park && park.hours);
    if (h) return h;
    return ALLOW_DEFAULT_HOURS ? (DEFAULT_HOURS[parkKey] || null) : null;
  }
  function updateHoursNote() {
    const el = document.getElementById("hoursNote");
    if (!el) return;
    const parks = (parkData && parkData.parks) || {};
    el.hidden = isDataUnavailable() || !ALLOW_DEFAULT_HOURS || !Object.values(parks).some(hoursAreEstimated);
  }

  const DEFAULT_HOURS = {
    magic_kingdom:      { earlyEntry: "08:30", open: "09:00", close: "22:00" },
    epcot:               { earlyEntry: "08:30", open: "09:00", close: "21:00" },
    hollywood_studios:   { earlyEntry: "08:30", open: "09:00", close: "21:00" },
    animal_kingdom:      { earlyEntry: "07:30", open: "08:00", close: "18:00" }
  };

  const API_BASE = 'https://wdw-queue-probe.jacocksr.workers.dev';
  const STALE_THRESHOLD_MINUTES = 20;
  const MIN_SAMPLES_FOR_RELIABLE = 15;
  const EXCLUDED_NAME_PATTERNS = [/single rider/i, /lightning lane/i, /individual lightning lane/i];
  const DATA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
  const TIMESTAMP_TICK_INTERVAL_MS = 30 * 1000;
  const PARK_EMOJI_IMAGES = {
    magic_kingdom: "images/MKEmoji_1_1023x1023.png",
    epcot: "images/EPCOTEmoji_1_1023x1023.png",
    hollywood_studios: "images/HSEmoji_1_1023x1023.png",
    animal_kingdom: "images/AKEmoji_1_1023x1022.png"
  };

  const PARK_ORDER = ["magic_kingdom", "epcot", "hollywood_studios", "animal_kingdom"];

  let activeParkKey = "magic_kingdom";
  let parkData = fallbackData;
  let history24h = null;
  let historicalSummary = null;
  let chartInstance = null;
  let sparklineInstance = null;
  let hmSparklineInstance = null;
  let heatmapMode = "hour";
  let heatmapSortCol = "name";
  let heatmapSortDir = "asc";
  let sortField = "wait_time";
  let sortDir = "desc";
  let isRefreshing = false;
  let showSpecialRows = false;

  // ── Ride classification (edit these lists as the park calendar changes) ──
  // Applies to ALL four parks. Order of precedence: event > meet > show > limited hours.
  // Special items are kept off the Down count, closure row, wait averages and heatmaps;
  // they live in their own popup section and a collapsed group at the bottom of the table.

  // Party / after-hours / ticketed-event experiences.
  const EVENT_NAME_PATTERNS = [/not.so.scary/i, /very merry/i, /jollywood nights/i, /after hours/i, /halloween party/i, /christmas party/i];
  // Character meet-and-greets (every park uses "Meet ..." titles).
  const MEET_NAME_PATTERNS = [/^meet\b/i];
  // Scheduled live shows / theater performances.
  const SHOW_NAME_PATTERNS = [/live on stage/i, /sing.along/i, /musical adventure/i, /better zoogether/i, /festival of the lion king/i, /fantasmic/i, /finding nemo/i, /turtle talk/i];
  // Other experiences with limited operating hours.
  const LIMITED_HOURS_NAME_PATTERNS = [/pirate.{0,2}s adventure/i, /conservation station/i, /wildlife express/i];
  // Planned refurbishments: always tagged "Refurbishment" while closed.
  const REFURBISHMENT_NAME_PATTERNS = [/walt disney world railroad/i, /carousel of progress/i];
  // Closed entries that are really one attraction (e.g. multiple stations) are merged.
  const MERGE_CLOSURE_GROUPS = [{ pattern: /^walt disney world railroad/i, name: "Walt Disney World Railroad", unit: "station" }];
  const SPECIAL_KIND_LABELS = { event: "Event", meet: "Character meet", show: "Show", limited: "Limited hours" };
  const SUMMARY_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
  let lastSummaryFetchAt = 0;

  let currentTheme = document.documentElement.dataset.theme || 'dark';

  function updateThemeButton() {
    const isLight = currentTheme === 'light';
    const icon = document.getElementById('themeIcon');
    const text = document.getElementById('themeText');
    const button = document.getElementById('themeToggleBtn');
    if (!icon || !text || !button) return;

    icon.textContent = isLight ? '🌙' : '☀️';
    text.textContent = isLight ? 'Dark Mode' : 'Light Mode';
    button.setAttribute('aria-label', isLight ? 'Switch to dark mode' : 'Switch to light mode');
    button.setAttribute('title', isLight ? 'Switch to dark mode' : 'Switch to light mode');
  }

  function applyTheme(theme, persist = true) {
    currentTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (persist) {
      try { localStorage.setItem('wdw_theme', currentTheme); } catch (e) { /* storage unavailable */ }
    }
    updateThemeButton();

    // Chart.js canvases are not CSS-driven, so repaint any that are on screen.
    const activePark = parkData && parkData.parks ? parkData.parks[activeParkKey] : null;
    if (activePark) renderChart(activePark);
    if (dayNavState.ride) renderDayNav('ride', dayNavState.ride);
    if (dayNavState.hm) renderDayNav('hm', dayNavState.hm);
  }

  let themeTransitionBusy = false;

  function toggleTheme() {
    if (themeTransitionBusy) return;
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyTheme(nextTheme);
      return;
    }
    themeTransitionBusy = true;
    if (typeof document.startViewTransition === 'function') {
      const transition = document.startViewTransition(() => applyTheme(nextTheme));
      transition.finished.catch(() => {}).finally(() => { themeTransitionBusy = false; });
      return;
    }

    // Fallback: interpolate colors and fade the old page gradient.
    const layer = document.createElement('div');
    layer.className = 'theme-background-fade';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.backgroundImage = getComputedStyle(document.body).backgroundImage;
    document.body.prepend(layer);
    document.documentElement.classList.add('theme-fading');
    void layer.offsetWidth;
    applyTheme(nextTheme);
    requestAnimationFrame(() => { layer.style.opacity = '0'; });
    setTimeout(() => {
      layer.remove();
      document.documentElement.classList.remove('theme-fading');
      themeTransitionBusy = false;
    }, 520);
  }

  function getThemeColor(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  // One place for every Chart.js color so the three charts stay consistent in both themes.
  function chartTheme() {
    const isLight = document.documentElement.dataset.theme === 'light';
    return {
      isLight,
      textColor: getThemeColor('--text-muted', '#a9bdd4'),
      primary: getThemeColor('--gold', '#ffd166'),
      secondary: getThemeColor('--purple', '#a78bfa'),
      surface: getThemeColor('--card-bg-solid', '#17324f'),
      text: getThemeColor('--text', '#f5f8fc'),
      border: getThemeColor('--card-border', 'rgba(255,255,255,0.15)'),
      grid: isLight ? 'rgba(23,50,79,0.09)' : 'rgba(255,255,255,0.06)',
      pointBorder: isLight ? '#ffffff' : '#0f2545',
      fillTop: isLight ? 'rgba(201,130,0,0.24)' : 'rgba(255,209,102,0.32)',
      fillTopSmall: isLight ? 'rgba(201,130,0,0.22)' : 'rgba(255,209,102,0.3)',
      fillBottom: isLight ? 'rgba(201,130,0,0.02)' : 'rgba(255,209,102,0.02)'
    };
  }

  const TIMEZONES = [
    { id: "America/New_York", label: "Eastern (Park Time)" },
    { id: "America/Chicago", label: "Central" },
    { id: "America/Denver", label: "Mountain" },
    { id: "America/Los_Angeles", label: "Pacific" },
    { id: "local", label: "My Device Time" }
  ];
  function readTzPref() {
    try { return localStorage.getItem("wdw_tz_pref"); } catch (e) { return null; }
  }
  function saveTzPref(id) {
    try { localStorage.setItem("wdw_tz_pref", id); } catch (e) { /* private mode / blocked storage */ }
  }
  let selectedTz = readTzPref() || "America/New_York";

  function isExcludedRide(name) {
    return EXCLUDED_NAME_PATTERNS.some(rx => rx.test(name || ""));
  }

  function formatUpdatedTime(isoString) {
    let d = isoString ? new Date(isoString) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    const opts = { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
    if (selectedTz !== "local") opts.timeZone = selectedTz;
    return d.toLocaleTimeString([], opts);
  }

  function renderTzOptions() {
    const list = document.getElementById("tzOptionsList");
    list.innerHTML = "";
    TIMEZONES.forEach(tz => {
      const opt = document.createElement("div");
      opt.className = `tz-option ${tz.id === selectedTz ? 'selected' : ''}`;
      opt.textContent = tz.label;
      opt.onclick = (e) => {
        e.stopPropagation();
        selectedTz = tz.id;
        saveTzPref(tz.id);
        updateTimestamp();
        renderTzOptions();
        document.getElementById("tzDropdown").classList.remove("open");
      };
      list.appendChild(opt);
    });
  }

  function toggleTzDropdown(e) {
    e.stopPropagation();
    document.getElementById("tzDropdown").classList.toggle("open");
    document.getElementById("crowdInfoPopover").classList.remove("open");
  }

  function toggleInfoPopover(e) {
    e.stopPropagation();
    document.getElementById("crowdInfoPopover").classList.toggle("open");
    document.getElementById("tzDropdown").classList.remove("open");
  }

  document.addEventListener("click", () => {
    document.getElementById("tzDropdown").classList.remove("open");
    document.getElementById("crowdInfoPopover").classList.remove("open");
  });

  function getDataAgeMinutes() {
    if (!parkData.updated_at) return 0;
    const ts = new Date(parkData.updated_at);
    if (isNaN(ts.getTime())) return 0;
    return Math.floor((Date.now() - ts.getTime()) / 60000);
  }

  function updateTimestamp() {
    updateHoursNote();
    if (isDataUnavailable()) {
      const badge = document.getElementById("lastUpdated");
      document.getElementById("lastUpdatedText").textContent = isRefreshing ? "Updating..." : "Live data unavailable";
      badge.classList.toggle("is-stale", !isRefreshing);
      badge.classList.toggle("is-refreshing", isRefreshing);
      if (isRefreshing || !liveFetchAttempted) {
        document.getElementById("staleBanner").classList.remove("visible");
      } else {
        document.getElementById("staleBannerText").innerHTML = `<strong>Can&rsquo;t reach live data</strong> &mdash; wait times and crowd scores are unavailable right now. We&rsquo;ll keep retrying about every 5 minutes and this page will update automatically once the connection is back.`;
        document.getElementById("staleBanner").classList.add("visible");
      }
      return;
    }
    const text = formatUpdatedTime(parkData.updated_at);
    document.getElementById("lastUpdatedText").textContent = isRefreshing ? "Updating..." : `Updated: ${text}`;

    const ageMinutes = getDataAgeMinutes();
    const isStale = ageMinutes > STALE_THRESHOLD_MINUTES;
    const badge = document.getElementById("lastUpdated");
    const banner = document.getElementById("staleBanner");
    const bannerText = document.getElementById("staleBannerText");

    badge.classList.toggle("is-stale", isStale && !isRefreshing);
    badge.classList.toggle("is-refreshing", isRefreshing);

    if (isStale) {
      const hours = Math.floor(ageMinutes / 60);
      const mins = ageMinutes % 60;
      const ageLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
      if (allParksAwaitingData()) {
        bannerText.innerHTML = `<strong>Showing last night&rsquo;s final update</strong> &mdash; live wait times appear once today&rsquo;s first readings arrive. This page updates automatically.`;
      } else {
        bannerText.innerHTML = `<strong>Data may be out of date</strong> &mdash; last refreshed ${ageLabel} ago. Wait times shown below could differ from the park right now. We refresh roughly every 5 minutes, and this page will update automatically once new wait times arrive.`;
      }
      banner.classList.add("visible");
    } else {
      banner.classList.remove("visible");
    }
  }

  
  function getParkScheduledEvent(parkKey, park, nowET = new Date()) {
    const event = normalizeHours(park?.hours)?.specialEvent;
    if (!event || typeof event !== 'object') return null;
    const name = String(event.name || '').trim();
    const category = [name, event.type, event.category, event.description]
      .filter(Boolean).join(' ').replace(/[_-]+/g, ' ');
    // Resort access benefits are not separately ticketed events.
    if (/early\s*(?:(?:theme\s*)?park\s*)?entry|early\s*access|extended\s*(?:evening\s*)?(?:theme\s*)?(?:park\s*)?hours|extra\s*magic\s*hours/i.test(category)) return null;
    const ticketed = event.isTicketed === true || event.ticketed === true || event.separatelyTicketed === true;
    const explicitlyNotTicketed = event.isTicketed === false || event.ticketed === false || event.separatelyTicketed === false;
    if (!name || explicitlyNotTicketed || (!ticketed && !EVENT_NAME_PATTERNS.some(pattern => pattern.test(name)))) return null;
    // Do not infer a party or its hours solely from an early park closing.
    const eventHours = String(event.eventHours || event.hours || '').trim()
      .replace(/^(?:tonight|today)\s*[·:]?\s*/i, '');
    return {
      ...event,
      name,
      icon: event.icon || '🎟️',
      eventHours,
      hours: eventHours ? 'Today · ' + eventHours : 'Today · Separately ticketed event'
    };
  }

  function getParkFestival(parkKey, park, nowET = new Date()) {
    if (park?.hours?.festival) return park.hours.festival;
    if (parkKey !== 'epcot') return null;
    const y = nowET.getFullYear(), m = nowET.getMonth() + 1, d = nowET.getDate();
    const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (dateStr >= `${y}-08-25` && dateStr <= `${y}-11-22`) {
      return { name: "Food & Wine Festival", icon: "🍷", sub: "Global Marketplaces Open" };
    }
    if (dateStr >= `${y}-11-27` && dateStr <= `${y}-12-30`) {
      return { name: "Festival of the Holidays", icon: "🎄", sub: "Holiday Kitchens Open" };
    }
    if ((m === 1 && d >= 12) || (m === 2 && d <= 23)) {
      return { name: "Festival of the Arts", icon: "🎨", sub: "Art & Culinary Studios Open" };
    }
    if (m >= 3 && m <= 5) {
      return { name: "Flower & Garden Festival", icon: "🌸", sub: "Outdoor Kitchens Open" };
    }
    return null;
  }

  function detectSpecialEvent(parkKey, park, nowET = new Date()) {
    const month = nowET.getMonth(); // 7=Aug, 8=Sep, 9=Oct, 10=Nov, 11=Dec
    const hours = resolveHours(parkKey, park);
    const [clH] = (hours?.close || "22:00").split(":").map(Number);
    const rides = (park && park.rides) ? park.rides : [];
    const openRides = rides.filter(r => r && r.is_open && typeof r.wait_time === 'number' && r.wait_time > 0);
    const isEarlyClose = clH <= 18;

    if (parkKey === 'magic_kingdom') {
      if ((month >= 7 && month <= 9) && (isEarlyClose || openRides.length >= 2)) {
        return { name: "Mickey’s Not-So-Scary Halloween Party", icon: "🎃", hours: "7:00 PM – 12:00 AM", liveRidesCount: openRides.length };
      }
      if ((month >= 10 && month <= 11) && (isEarlyClose || openRides.length >= 2)) {
        return { name: "Mickey’s Very Merry Christmas Party", icon: "🎄", hours: "7:00 PM – 12:00 AM", liveRidesCount: openRides.length };
      }
      if (openRides.length >= 3) {
        return { name: "Disney After Hours", icon: "✨", hours: "Special event in progress", liveRidesCount: openRides.length };
      }
    } else if (parkKey === 'hollywood_studios') {
      if ((month >= 10 && month <= 11) && (isEarlyClose || openRides.length >= 2)) {
        return { name: "Disney Jollywood Nights", icon: "✨", hours: "7:30 PM – 12:30 AM", liveRidesCount: openRides.length };
      }
      if (openRides.length >= 3) {
        return { name: "Disney After Hours", icon: "✨", hours: "Special event in progress", liveRidesCount: openRides.length };
      }
    } else if (openRides.length >= 3) {
      return { name: "Special Ticketed Event", icon: "🎟️", hours: "Special event in progress", liveRidesCount: openRides.length };
    }
    return null;
  }

  function getParkPhase(parkKey, park) {
    const hours = resolveHours(parkKey, park);
    if (!hours) {
      if (snapshotIsFromPreviousDay()) return { phase: "pre-open", awaiting: true };
      return { phase: "open" };
    }

    const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    const [eeH, eeM] = hours.earlyEntry.split(":").map(Number);
    const [opH, opM] = hours.open.split(":").map(Number);
    const [clH, clM] = hours.close.split(":").map(Number);

    const earlyEntryMins = eeH * 60 + eeM;
    const openMins = opH * 60 + opM;
    const closeMins = clH * 60 + clM;
    const nowMins = nowET.getHours() * 60 + nowET.getMinutes();

    if (nowMins < earlyEntryMins) return { phase: "pre-open", opensAt: hours.earlyEntry, generalAt: hours.open };
    if (nowMins < openMins) return { phase: "early-entry", generalAt: hours.open };

    if (nowMins >= closeMins) {
      // 1. Check if special ticketed event is active
      const specialEvent = detectSpecialEvent(parkKey, park, nowET);
      if (specialEvent) {
        return { phase: "open", isSpecialEvent: true, specialEvent, openNow: true };
      }

      // 2. Check if guests are still clearing queues after normal close (up to 75m post-close)
      const rides = (park && park.rides) ? park.rides : [];
      const openRides = rides.filter(r => r && r.is_open && typeof r.wait_time === 'number' && r.wait_time > 0);
      if (openRides.length > 0 && nowMins < closeMins + 75) {
        return { phase: "open", clearingQueues: true, closedAt: hours.close, openNow: true };
      }

      return { phase: "closed-for-day" };
    }

    if (snapshotIsFromPreviousDay()) return { phase: "pre-open", awaiting: true, openNow: true };
    return { phase: "open" };
  }

  function formatHourLabel(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period} ET`;
  }

  function getVisibleRides(park) {
    return (park.rides || []).filter(r => !isExcludedRide(r.name));
  }

  function computeLiveStats(park) {
    const openRides = getStandardRides(park).filter(r => r.is_open);
    if (openRides.length === 0) return { avgWait: null, longest: null };
    const avgWait = Math.round(openRides.reduce((sum, r) => sum + (r.wait_time || 0), 0) / openRides.length);
    const longest = openRides.reduce((max, r) => (r.wait_time > (max ? max.wait_time : -1) ? r : max), null);
    return { avgWait, longest };
  }

  function estimateClosureMinutes(rideId) {
    if (!history24h || !history24h.rides) return { minutes: null, unknown: true };
    const entry = history24h.rides[String(rideId)];
    if (!entry || !entry.points || entry.points.length === 0) return { minutes: null, unknown: true };
    const lastOpenPoint = entry.points[entry.points.length - 1];
    const lastOpenTime = new Date(lastOpenPoint[0]).getTime();
    if (isNaN(lastOpenTime)) return { minutes: null, unknown: true };
    const minutes = Math.max(0, Math.round((Date.now() - lastOpenTime) / 60000));
    return { minutes, unknown: false, lastOpenIso: lastOpenPoint[0] };
  }

  function formatClosureDuration(closureInfo) {
    if (!closureInfo || closureInfo.unknown || closureInfo.minutes === null) return "down (duration unknown)";
    const m = closureInfo.minutes;
    if (m < 60) return "down " + m + " min";
    const h = Math.floor(m / 60);
    const rem = m % 60;
    return rem > 0 ? ("down " + h + "h " + rem + "m") : ("down " + h + "h");
  }

  function getRideKind(r) {
    const n = (r && r.name) || "";
    if (EVENT_NAME_PATTERNS.some(rx => rx.test(n))) return "event";
    if (MEET_NAME_PATTERNS.some(rx => rx.test(n))) return "meet";
    if (SHOW_NAME_PATTERNS.some(rx => rx.test(n))) return "show";
    if (LIMITED_HOURS_NAME_PATTERNS.some(rx => rx.test(n))) return "limited";
    return "standard";
  }

  function getStandardRides(park) {
    return getVisibleRides(park).filter(r => getRideKind(r) === "standard");
  }

  function hasNoRecentOpenReading(rideId) {
    if (!history24h || !history24h.rides) return false;
    const entry = history24h.rides[String(rideId)];
    return !entry || !entry.points || entry.points.length === 0;
  }

  // For a CLOSED standard ride: extended closure (refurbishment / 24h+) or temporary downtime.
  function classifyClosedRide(r) {
    const n = r.name || "";
    if (REFURBISHMENT_NAME_PATTERNS.some(rx => rx.test(n))) return { group: "extended", tag: "Refurbishment" };
    if (hasNoRecentOpenReading(r.id)) return { group: "extended", tag: "Extended closure (24h+)" };
    return { group: "temporary" };
  }

  // Epoch ms of today's earliest park opening (early entry, ET) for the given park.
  function getTodayParkOpenMs(parkKey, park) {
    const hours = resolveHours(parkKey, park);
    if (!hours) return null;
    const [h, m] = (hours.earlyEntry || hours.open).split(":").map(Number);
    const now = new Date();
    const wall = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const offsetMs = wall.getTime() - now.getTime();
    const target = new Date(wall);
    target.setHours(h, m, 0, 0);
    return target.getTime() - offsetMs;
  }

  function formatLastOpen(iso) {
    const etDay = d => d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    const d = new Date(iso);
    const dayKey = etDay(d);
    let dayLabel;
    if (dayKey === etDay(new Date())) dayLabel = "today";
    else if (dayKey === etDay(new Date(Date.now() - 24 * 60 * 60 * 1000))) dayLabel = "yesterday";
    else dayLabel = d.toLocaleDateString([], { month: "short", day: "numeric", timeZone: "America/New_York" });
    return `${formatUpdatedTime(iso)} ${dayLabel}`;
  }

  // "down 1h 20m" for mid-day breakdowns; "not open yet today" when the ride's last open
  // reading predates today's park opening (avoids counting overnight hours as downtime).
  function formatClosureStatus(closureInfo, parkKey, park) {
    if (closureInfo && !closureInfo.unknown && closureInfo.lastOpenIso) {
      const openMs = getTodayParkOpenMs(parkKey, park);
      const lastMs = Date.parse(closureInfo.lastOpenIso);
      if (openMs !== null && !isNaN(lastMs) && lastMs < openMs) {
        return `not open yet today \u00b7 last open ${formatLastOpen(closureInfo.lastOpenIso)}`;
      }
    }
    return formatClosureDuration(closureInfo);
  }

  // Splits a park's non-running attractions into three groups so that only genuine
  // short-term downtime drives the card's Down count and red closure row.
  function getClosureGroups(park) {
    const groups = { temporary: [], extended: [], special: [] };
    const merged = {};
    getVisibleRides(park).forEach(r => {
      const kind = getRideKind(r);
      if (kind !== "standard") {
        groups.special.push({ id: r.id, name: r.name, land: r.land, kind, is_open: r.is_open, wait_time: r.wait_time });
        return;
      }
      if (r.is_open) return;
      const cls = classifyClosedRide(r);
      if (cls.group === "temporary") {
        groups.temporary.push({ id: r.id, name: r.name, land: r.land, closureInfo: estimateClosureMinutes(r.id) });
        return;
      }
      const mg = MERGE_CLOSURE_GROUPS.find(g => g.pattern.test(r.name || ""));
      if (mg) {
        if (!merged[mg.name]) {
          merged[mg.name] = { id: mg.name, name: mg.name, lands: [], count: 0, unit: mg.unit, tag: cls.tag };
          groups.extended.push(merged[mg.name]);
        }
        const m = merged[mg.name];
        m.count += 1;
        if (r.land && !m.lands.includes(r.land)) m.lands.push(r.land);
      } else {
        groups.extended.push({ id: r.id, name: r.name, lands: [r.land], count: 1, unit: null, tag: cls.tag });
      }
    });
    return groups;
  }

  function getCurrentBucketKey() {
    const abbrs = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const easternNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
    return `${abbrs[easternNow.getDay()]}_${String(easternNow.getHours()).padStart(2, "0")}`;
  }

  function getParkBaseline(park) {
    if (!historicalSummary || !historicalSummary.rides) return null;
    const bucketKey = getCurrentBucketKey();
    const visibleRides = getStandardRides(park).filter(r => r.is_open);
    let totalWeighted = 0, totalSamples = 0;
    visibleRides.forEach(ride => {
      const entry = historicalSummary.rides[String(ride.id)];
      if (!entry) return;
      const bucket = entry.buckets[bucketKey];
      if (!bucket) return;
      totalWeighted += bucket.avg_wait * bucket.samples;
      totalSamples += bucket.samples;
    });
    if (totalSamples === 0) return null;
    return { avgWait: totalWeighted / totalSamples, samples: totalSamples };
  }

  function getParkComparison(parkKey, park) {
    const phaseInfo = getParkPhase(parkKey, park);
    if (phaseInfo.phase !== "open") return { status: "closed" };
    const stats = computeLiveStats(park);
    if (stats.avgWait === null) return { status: "no-data" };
    const baseline = getParkBaseline(park);
    const minSamples = (historicalSummary && historicalSummary.min_samples_for_reliable) || MIN_SAMPLES_FOR_RELIABLE;
    if (!baseline || baseline.samples < minSamples) return { status: "insufficient-data" };
    const pctDiff = baseline.avgWait > 0
      ? Math.round(((stats.avgWait - baseline.avgWait) / baseline.avgWait) * 100)
      : 0;
    return { status: "ready", pctDiff };
  }

  // Comparison vs. typical conditions. Within +/-TYPICAL_BAND_PCT counts as "typical" everywhere
  // (banner, park cards). These are relative to normal, not a promise of short waits.
  function vsTypicalTier(pctDiff) {
    if (typeof pctDiff !== 'number' || !Number.isFinite(pctDiff)) return "unknown";
    if (pctDiff < -40) return "much-better";
    if (pctDiff < -10) return "better";
    if (pctDiff > 40) return "much-busier";
    if (pctDiff > 10) return "busier";
    return "typical";
  }
  function vsTypicalText(pctDiff) {
    if (typeof pctDiff !== 'number' || !Number.isFinite(pctDiff)) return "Typical crowds unknown";
    if (pctDiff < -40) return "Much quieter than usual";
    if (pctDiff < -10) return "Quieter than usual";
    if (pctDiff > 40) return "Much busier than usual";
    if (pctDiff > 10) return "Busier than usual";
    return "Typical for this time";
  }

  function hhmmToMins(v) { const [h, m] = String(v).split(":").map(Number); return h * 60 + m; }
  // "09:00" -> "9:00 AM"; "24:00" -> "12:00 AM"
  function fmtClock(hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    const hh = h % 24, period = hh >= 12 ? "PM" : "AM", h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }

  // True when the newest snapshot is from a previous Eastern day (overnight gap before the first scrape).
  function snapshotIsFromPreviousDay() {
    if (!parkData || !parkData.updated_at) return false;
    const ts = new Date(parkData.updated_at);
    if (isNaN(ts.getTime())) return false;
    return curveET(ts).day !== curveET(new Date()).day;
  }
  // Every park is waiting on today's first readings (no park can show live waits yet).
  function allParksAwaitingData() {
    const keys = Object.keys((parkData && parkData.parks) || {});
    return keys.length > 0 && snapshotIsFromPreviousDay();
  }

  function renderBestParkBanner() {
    const banner = document.getElementById("bestParkBanner");
    if (isDataUnavailable()) { banner.innerHTML = ""; return; }
    const comparisons = PARK_ORDER
      .map(key => ({ key, park: parkData.parks[key] }))
      .filter(x => x.park)
      .map(x => ({ ...x, comp: getParkComparison(x.key, x.park) }));

    const ready = comparisons.filter(x => x.comp.status === "ready");

    if (ready.length === 0) {
      const phases = PARK_ORDER.filter(k => parkData.parks[k]).map(k => getParkPhase(k, parkData.parks[k]));
      const notOpen = p => p.phase === "pre-open" || p.phase === "early-entry" || p.phase === "closed-for-day";
      if (phases.length && phases.every(notOpen)) {
        let icon = "🌙", title, sub;
        const upcoming = phases.filter(p => p.phase !== "closed-for-day");
        const g = upcoming.filter(p => p.generalAt && !p.openNow).map(p => p.generalAt).sort((x, y) => hhmmToMins(x) - hhmmToMins(y))[0];
        if (upcoming.length === 0) {
          title = "Parks Are Closed for the Day";
          sub = "Rankings return tomorrow, once the parks open and wait times start coming in.";
        } else if (phases.some(p => p.openNow)) {
          icon = "⏳";
          title = "Waiting for Today’s First Update";
          sub = "Some parks are already open. Rankings begin as soon as today’s first wait times arrive.";
        } else if (upcoming.some(p => p.phase === "early-entry")) {
          icon = "🔑";
          title = "Early Entry Is Underway";
          sub = g ? `Rankings begin once the parks open to everyone, starting at ${formatHourLabel(g)}.` : "Rankings begin once the parks open to everyone.";
        } else {
          title = "Parks Aren’t Open Yet";
          sub = g ? `Rankings begin once the parks open. The first park opens at ${formatHourLabel(g)}.` : "Rankings begin once the parks open and today’s first wait times come in.";
        }
        banner.innerHTML = `
          <div class="best-park-content">
            <span class="best-park-icon">${icon}</span>
            <div>
              <div class="best-park-eyebrow">Best Park Right Now</div>
              <div class="best-park-title">${title}</div>
              <div class="best-park-sub">${sub}</div>
            </div>
          </div>`;
        return;
      }
      banner.innerHTML = `
        <div class="best-park-content">
          <span class="best-park-icon">📊</span>
          <div>
            <div class="best-park-eyebrow">Best Park Right Now</div>
            <div class="best-park-title">Gathering baseline data</div>
            <div class="best-park-sub">We need a few weeks of history at this time of day before we can reliably say which park is running below normal. Check back soon!</div>
          </div>
        </div>`;
      return;
    }

    ready.sort((a, b) => a.comp.pctDiff - b.comp.pctDiff);
    const best = ready[0];
    const tier = vsTypicalTier(best.comp.pctDiff);
    const magnitude = Math.abs(best.comp.pctDiff);
    const name = escapeHtml(best.park.name);
    const onlyOneComparison = ready.length === 1;
    const comparisonNote = onlyOneComparison
      ? "This is the only park we can compare right now."
      : "Compared with each park’s usual waits at this hour.";
    let icon, dot, title, sub;
    if (tier === "much-better" || tier === "better") {
      icon = "🏆"; dot = "🟢";
      title = `${name} Is a Great Pick Right Now!`;
      sub = tier === "much-better"
        ? `Waits are about ${magnitude}% shorter than usual for this time of day. More time to explore, less time in line!`
        : `Waits are about ${magnitude}% shorter than usual for this time of day. A nice moment to enjoy a few favorites.`;
    } else if (tier === "typical") {
      icon = "🧭"; dot = "🔵";
      title = `${name} Is Right on Track!`;
      sub = `Waits are close to their usual levels for this time of day. Pick your favorites and enjoy the park.`;
    } else if (tier === "busier" || tier === "much-busier") {
      icon = "🧭"; dot = "🟠";
      title = onlyOneComparison ? `A Busy Stretch at ${name}` : `${name} Is Your Best Bet Right Now`;
      sub = onlyOneComparison
        ? `Waits are about ${magnitude}% longer than usual right now. Check individual rides before choosing your next stop.`
        : `It’s a busy stretch, but ${name} is closest to its usual wait times.`;
    } else {
      icon = "📊"; dot = "⚪";
      title = `Let’s Check the Latest Waits`;
      sub = `We don’t have a clear comparison just yet. The individual ride waits can help you choose your next stop.`;
    }

    banner.innerHTML = `
      <div class="best-park-content">
        <span class="best-park-icon">${icon}</span>
        <div>
          <div class="best-park-eyebrow">Best Park Right Now</div>
          <div class="best-park-title">${title}</div>
          <div class="best-park-sub">${dot} ${sub}</div>
          <div class="best-park-note">${comparisonNote}</div>
        </div>
      </div>`;
  }

  function renderUnavailableState() {
    const loading = !liveFetchAttempted || isRefreshing;
    const msg = loading
      ? `<div class="data-unavailable" role="status"><span class="data-unavailable-icon">⏳</span><div><strong>Loading live data&hellip;</strong></div></div>`
      : `<div class="data-unavailable" role="status"><span class="data-unavailable-icon">📡</span><div><strong>Live data unavailable</strong><br>We can&rsquo;t reach the wait-time feed right now, so no crowd scores or wait times are shown.</div></div>`;
    document.getElementById("parkGrid").innerHTML = msg;
    document.getElementById("bestParkBanner").innerHTML = "";
    ["ridesPanelParkStrip", "chartPanelParkStrip", "heatmapPanelParkStrip"].forEach(id => { document.getElementById(id).innerHTML = ""; });
    document.getElementById("ridesBody").innerHTML = "";
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
    renderHeatmapEmpty(loading ? "Loading live data..." : "Live data unavailable.");
  }

  function renderAll() {
    if (isDataUnavailable()) { renderUnavailableState(); return; }
    renderPanelParkStrips();
    renderCards();
    renderDetails();
    renderHeatmap();
    renderBestParkBanner();
    updateAllActiveStates();
  }

  async function fetchJsonWithCacheBust(path) {
   const res = await fetch(path);
   if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
   return res.json();
  }

  async function fetchLatestData({ isInitialLoad = false } = {}) {
    if (isRefreshing) return;
    isRefreshing = true;
    if (!isInitialLoad) updateTimestamp();

    let nextParkData = null;
    let nextHistory24h = null;
    let nextHistoricalSummary = null;
    let fetchSucceeded = false;

    try {
      nextParkData = await fetchJsonWithCacheBust(`${API_BASE}/api/live-wait-times`);
      if (!nextParkData.parks || Object.keys(nextParkData.parks).length === 0) throw new Error("Live data empty");
      fetchSucceeded = true;
    } catch (e) {
      console.log("Live data fetch failed; keeping previous snapshot.", e);
    }

    try {
      nextHistory24h = await fetchJsonWithCacheBust(`${API_BASE}/api/history-24h`);
    } catch (e) {
      console.log("No 24h history available yet.");
    }

    try {
      const summaryEmpty = !historicalSummary || Object.keys(historicalSummary.rides || {}).length === 0;
      const summaryDue = summaryEmpty || (Date.now() - lastSummaryFetchAt) >= SUMMARY_REFRESH_INTERVAL_MS;
      if (summaryDue) {
        nextHistoricalSummary = await fetchJsonWithCacheBust(`${API_BASE}/api/historical-summary`);
      }
    } catch (e) {
      console.log("No historical summary available yet.");
    }

    let independentHistoryChanged = false;
    if (nextHistory24h && nextHistory24h.rides && Number.isFinite(Date.parse(nextHistory24h.updated_at))) {
      const oldTime = Date.parse(history24h?.updated_at), newTime = Date.parse(nextHistory24h.updated_at);
      if (!Number.isFinite(oldTime) || newTime >= oldTime) { history24h = nextHistory24h; independentHistoryChanged = true; }
    }
    if (nextHistoricalSummary && nextHistoricalSummary.rides && Number.isFinite(Date.parse(nextHistoricalSummary.updated_at))) {
      const oldTime = Date.parse(historicalSummary?.updated_at), newTime = Date.parse(nextHistoricalSummary.updated_at);
      if (!Number.isFinite(oldTime) || newTime >= oldTime) { historicalSummary = nextHistoricalSummary; lastSummaryFetchAt = Date.now(); independentHistoryChanged = true; }
    }

    if (fetchSucceeded && nextParkData) {
      const incomingTs = new Date(nextParkData.updated_at).getTime();
      const currentTs = parkData.updated_at ? new Date(parkData.updated_at).getTime() : NaN;
      const incomingIsNewer = isNaN(currentTs) || (!isNaN(incomingTs) && incomingTs >= currentTs);
      if (isInitialLoad || incomingIsNewer) {
        parkData = nextParkData;
        renderAll();
      } else {
        console.log("Fetched data was not newer than current snapshot; ignoring.");
      }
    }

    isRefreshing = false;
    liveFetchAttempted = true;
    if (independentHistoryChanged || isDataUnavailable()) renderAll();
    updateTimestamp();
  }

  async function loadData() {
    renderTzOptions();

    renderAll();
    updateTimestamp();

    await fetchLatestData({ isInitialLoad: true });
    updateTimestamp();

    setInterval(() => { fetchLatestData({ isInitialLoad: false }); }, DATA_REFRESH_INTERVAL_MS);
    setInterval(() => { updateTimestamp(); }, TIMESTAMP_TICK_INTERVAL_MS);
  }

  function getScoreBadge(score, phaseInfo) {
    if (phaseInfo.phase === "pre-open" || phaseInfo.phase === "early-entry") {
      return `<span class="score-badge score-na">N/A</span>`;
    }
    if (score < 4.0) return `<span class="score-badge score-low">${score} / 10</span>`;
    if (score < 7.0) return `<span class="score-badge score-mod">${score} / 10</span>`;
    return `<span class="score-badge score-high">${score} / 10</span>`;
  }

  function getStatusBanner(phaseInfo) {
    if (phaseInfo.phase === "pre-open" && phaseInfo.awaiting && phaseInfo.openNow) {
      return `<div class="park-status-banner pre-open">☀️ Open now &mdash; live waits appear with today&rsquo;s first update</div>`;
    }
    if (phaseInfo.phase === "pre-open" && phaseInfo.awaiting) {
      return `<div class="park-status-banner pre-open">🌙 Not open yet &mdash; live waits appear once the park opens</div>`;
    }
    if (phaseInfo.phase === "pre-open") {
      const noEarlyEntry = phaseInfo.opensAt === phaseInfo.generalAt;
      return `<div class="park-status-banner pre-open">🌙 Not open yet &mdash; ${noEarlyEntry ? "Park opens" : "Early Entry starts"} ${formatHourLabel(phaseInfo.opensAt)}</div>`;
    }
    if (phaseInfo.phase === "early-entry") {
      return `<div class="park-status-banner early-entry">🔑 Early Entry only (resort guests)</div>`;
    }
    if (phaseInfo.specialEvent) {
      return `<div class="park-status-banner special-event">
        <span style="font-size:1.15rem;">${phaseInfo.specialEvent.icon}</span>
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:0.84rem;line-height:1.2;">${escapeHtml(phaseInfo.specialEvent.name)}</div>
          <div style="font-size:0.7rem;opacity:0.85;font-weight:500;">Special event in progress · ${escapeHtml(phaseInfo.specialEvent.hours)}</div>
        </div>
      </div>`;
    }
    if (phaseInfo.clearingQueues) {
      return `<div class="park-status-banner pre-open">
        <span>🌙</span>
        <div style="min-width:0;">
          <div style="font-weight:700;font-size:0.82rem;">Park Closed (${formatHourLabel(phaseInfo.closedAt)})</div>
          <div style="font-size:0.7rem;opacity:0.85;">Final queues actively clearing</div>
        </div>
      </div>`;
    }
    if (phaseInfo.phase === "closed-for-day") {
      return `<div class="park-status-banner pre-open">🌙 Closed for the day</div>`;
    }
    return "";
  }

  function getBestTimeTip(score, phaseInfo) {
    if (phaseInfo.phase === "pre-open" && phaseInfo.awaiting) return phaseInfo.openNow ? "Live waits will appear with today’s first update." : "Check back once the park opens for live crowd data.";
    if (phaseInfo.phase === "pre-open") return phaseInfo.opensAt === phaseInfo.generalAt ? "Check back once the park opens for live crowd data." : "Check back once Early Entry begins for live crowd data.";
    if (phaseInfo.phase === "early-entry") return "Resort guests only right now &mdash; full crowd score resumes at general open.";
    if (phaseInfo.phase === "closed-for-day") return "Park is closed. See you tomorrow!";
    if (score < 4.0) return "Great time to visit — short waits all around!";
    if (score < 7.0) return "Moderate crowds — arrive early for headliners.";
    return "Peak crowds — rope-drop or use Lightning Lane.";
  }

  function updateAllActiveStates() {
    document.querySelectorAll(".park-select-btn").forEach(btn => {
      btn.classList.toggle("active-park", btn.dataset.parkKey === activeParkKey);
    });
  }

  function pulseCardForKey(key) {
    const grid = document.getElementById("parkGrid");
    const card = grid.querySelector(`[data-park-key="${key}"]`);
    if (!card) return;
    card.classList.remove("just-clicked");
    void card.offsetWidth;
    card.classList.add("just-clicked");
    setTimeout(() => card.classList.remove("just-clicked"), 350);
  }

  function pulseIconsForKey(key) {
    document.querySelectorAll(`.park-select-btn[data-park-key="${key}"] img`).forEach(img => {
      img.classList.remove("emoji-pulse");
      void img.offsetWidth;
      img.classList.add("emoji-pulse");
    });
  }

  function buildParkStripHtml() {
    return PARK_ORDER.map(key => {
      const p = parkData.parks[key];
      if (!p) return '';
      const src = PARK_EMOJI_IMAGES[key] || "";
      return `<button type="button" class="park-select-btn" data-park-key="${key}" onclick="selectPark('${key}', this)">
        <img src="${src}" alt="${p.name} emoji" />
      </button>`;
    }).join('');
  }

  function renderPanelParkStrips() {
    document.getElementById("ridesPanelParkStrip").innerHTML = buildParkStripHtml();
    document.getElementById("chartPanelParkStrip").innerHTML = buildParkStripHtml();
    document.getElementById("heatmapPanelParkStrip").innerHTML = buildParkStripHtml();
  }

  function selectPark(key) {
    if (isDataUnavailable()) { activeParkKey = key; return; }
    activeParkKey = key;
    renderCards();
    renderDetails();
    renderHeatmap();
    updateAllActiveStates();
    pulseIconsForKey(key);
    pulseCardForKey(key);
  }

  function renderCards() {
    const grid = document.getElementById("parkGrid");
    grid.innerHTML = "";
    for (const [key, p] of Object.entries(parkData.parks)) {
      const phaseInfo = getParkPhase(key, p);
      const isClosed = phaseInfo.phase === "pre-open" || phaseInfo.phase === "closed-for-day";
      const stats = computeLiveStats(p);
      const avgWaitDisplay = (phaseInfo.phase === "pre-open" || phaseInfo.phase === "closed-for-day" || stats.avgWait === null)
        ? "&ndash;"
        : `${stats.avgWait} min`;
      const longestDisplay = (phaseInfo.phase === "pre-open" || phaseInfo.phase === "closed-for-day" || !stats.longest)
        ? "&ndash;"
        : `${stats.longest.wait_time}min`;
      const longestName = (!isClosed && stats.longest) ? stats.longest.name : "";
      const comp = getParkComparison(key, p);
      const vsNormalPill = comp.status === "ready"
        ? `<span class="vs-normal-pill ${({better:'below',typical:'typical',busier:'above'})[vsTypicalTier(comp.pctDiff)]}">${({better:'🟢',typical:'🔵',busier:'🟠'})[vsTypicalTier(comp.pctDiff)]} ${vsTypicalText(comp.pctDiff)}</span>`
        : '';

      // Only genuine short-term downtime on standard attractions drives the
      // Down count and red closure row. Refurbishments/extended closures and
      // events/shows/meets live in the popup sections.
      const closureGroups = isClosed ? { temporary: [], extended: [], special: [] } : getClosureGroups(p);
      const downCount = closureGroups.temporary.length;
      const closureRowHtml = buildClosureRowHtml(key, closureGroups, isClosed);

      const card = document.createElement("div");
      card.className = `park-card ${key === activeParkKey ? 'active' : ''} ${isClosed ? 'closed' : ''}`;
      card.dataset.parkKey = key;
      card.style.setProperty('--park-color', p.color || 'linear-gradient(90deg, #ffd166, #ff6fb5)');
      card.onclick = () => selectPark(key);
      const parkEmojiSrc = PARK_EMOJI_IMAGES[key] || "";
      const parkEmojiImg = parkEmojiSrc ? `<img src="${parkEmojiSrc}" alt="${p.name} emoji" class="park-name-emoji" />` : '';
      card.innerHTML = `
        <div class="card-header">
          <h3>${parkEmojiImg}${p.name}</h3>
          ${getScoreBadge(p.crowd_score, phaseInfo)}
        </div>
        ${getStatusBanner(phaseInfo)}
        <div class="card-metrics-top">
          <div>
            <span class="metric-label">Average Wait</span>
            <div class="average-wait-row">
              <span class="metric-value">${avgWaitDisplay}</span>
              ${vsNormalPill}
            </div>
          </div>
          <div>
            <span class="metric-label">Down</span>
            <span class="metric-value" style="color:${downCount > 0 ? 'var(--red)' : 'var(--text)'}">${isClosed ? '&ndash;' : downCount}</span>
          </div>
        </div>
        <div class="card-metrics-longest">
          <span class="metric-label">Longest Wait</span>
          <div class="longest-wait-row">
            ${longestName
              ? `<span class="metric-longest-name" title="${longestName}">${longestName}</span>`
              : '<span></span>'}
            <span class="metric-value">${longestDisplay}</span>
          </div>
        </div>
        ${closureRowHtml}
        <div class="best-time-strip ${isClosed ? 'muted' : ''}">💡 ${getBestTimeTip(p.crowd_score, phaseInfo)}</div>
      `;
      grid.appendChild(card);
    }
  }

  function buildClosureRowHtml(parkKey, groups, isParkClosed) {
    if (isParkClosed) return "";
    var html = "";
    var tempN = groups.temporary.length;
    if (tempN === 0) {
      html += '<div class="closure-row none">✅ No temporary closures</div>';
    } else {
      html += '<div class="closure-row" onclick="openClosureModal(event, \'' + parkKey + '\')">'
        + '⛔ ' + tempN + ' temporary closure' + (tempN === 1 ? '' : 's')
        + '<span class="closure-caret">▾</span></div>';
    }
    var extN = groups.extended.length, spN = groups.special.length;
    if (extN + spN > 0) {
      var parts = [];
      if (extN > 0) parts.push('🛠 ' + extN + ' refurbishment/extended');
      if (spN > 0) parts.push('🎟️ ' + spN + ' event/show/meet');
      html += '<div class="closure-row info" onclick="openClosureModal(event, \'' + parkKey + '\')">'
        + parts.join(' · ') + '<span class="closure-caret">▾</span></div>';
    }
    return html;
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function openClosureModal(e, parkKey) {
    e.stopPropagation();
    const park = parkData.parks[parkKey];
    if (!park) return;
    const groups = getClosureGroups(park);

    document.getElementById("closureModalPark").textContent = park.name;

    let html = "";
    html += '<div class="closure-section-title">Temporary closures</div>';
    if (groups.temporary.length === 0) {
      html += '<div class="closure-modal-empty">No temporary closures right now.</div>';
    } else {
      groups.temporary.forEach(c => {
        html += '<div class="closure-modal-item">'
          + '<span class="closure-ride-name">' + escapeHtml(c.name) + '</span>'
          + '<span class="closure-ride-land">' + escapeHtml(c.land) + '</span>'
          + '<span class="closure-duration">⛔ ' + escapeHtml(formatClosureStatus(c.closureInfo, parkKey, park)) + '</span>'
          + '</div>';
      });
    }

    if (groups.extended.length > 0) {
      html += '<div class="closure-section-title">Refurbishment &amp; extended closures</div>';
      groups.extended.forEach(c => {
        let land = c.lands.filter(Boolean).join(" · ");
        if (c.unit && c.count > 1) land += " (" + c.count + " " + c.unit + "s)";
        html += '<div class="closure-modal-item">'
          + '<span class="closure-ride-name">' + escapeHtml(c.name) + '</span>'
          + '<span class="closure-ride-land">' + escapeHtml(land) + '</span>'
          + '<span class="closure-tag">🛠 ' + escapeHtml(c.tag) + '</span>'
          + '</div>';
      });
    }

    if (groups.special.length > 0) {
      html += '<div class="closure-section-title">Events, shows &amp; character meets</div>';
      groups.special.forEach(c => {
        const label = SPECIAL_KIND_LABELS[c.kind] || "Special";
        const status = c.is_open
          ? '<span class="closure-live">● ' + escapeHtml(label) + ' · Running now' + (c.wait_time > 0 ? ' · ' + c.wait_time + ' min' : '') + '</span>'
          : '<span class="closure-muted">' + escapeHtml(label) + ' · Not running right now</span>';
        html += '<div class="closure-modal-item">'
          + '<span class="closure-ride-name">' + escapeHtml(c.name) + '</span>'
          + '<span class="closure-ride-land">' + escapeHtml(c.land) + '</span>'
          + status
          + '</div>';
      });
    }

    document.getElementById("closureModalList").innerHTML = html;
    document.getElementById("closureModalOverlay").classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeClosureModal() {
    document.getElementById("closureModalOverlay").classList.remove("active");
    document.body.style.overflow = "";
  }

  function getWaitPillStyle(waitTime) {
    if (waitTime <= 15) return { bg: 'rgba(53,208,138,0.18)', color: 'var(--green)' };
    if (waitTime <= 45) return { bg: 'rgba(255,200,87,0.18)', color: 'var(--yellow)' };
    return { bg: 'rgba(255,93,122,0.18)', color: 'var(--red)' };
  }

  function setSortField(field) {
    if (sortField === field) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDir = field === "wait_time" ? "desc" : "asc";
    }
    updateSortHeaderUI();
    renderDetails();
  }

  function updateSortHeaderUI() {
    const map = { name: "thAttraction", land: "thLand", wait_time: "thWait" };
    Object.entries(map).forEach(([field, id]) => {
      const th = document.getElementById(id);
      th.classList.toggle("sort-active", field === sortField);
      const arrow = th.querySelector(".sort-arrow");
      if (field === sortField) {
        arrow.textContent = sortDir === "asc" ? "▲" : "▼";
      } else {
        arrow.textContent = "▾";
      }
    });
    const mobileSort = document.getElementById('queueMobileSort');
    if (mobileSort) mobileSort.value = sortField;
    const mobileDirection = document.getElementById('queueMobileDirection');
    if (mobileDirection) {
      mobileDirection.textContent = sortDir === 'asc' ? 'Ascending ↑' : 'Descending ↓';
      mobileDirection.setAttribute('aria-label', 'Sort ' + (sortDir === 'asc' ? 'descending' : 'ascending'));
    }
  }

  function renderDetails() {
    const park = parkData.parks[activeParkKey];
    if (!park) return;
    const parkEmojiSrc = PARK_EMOJI_IMAGES[activeParkKey] || "";
    const titleEmojiImg = parkEmojiSrc ? `<img src="${parkEmojiSrc}" alt="${park.name} emoji" class="panel-title-emoji" />` : (park.icon ? `${park.icon} ` : '');
    document.getElementById("selectedParkTitle").innerHTML = `${titleEmojiImg}${park.name} Standby Queue`;

    renderRideRows(park);
    updateSortHeaderUI();
    renderChart(park);
  }

  function renderRideRows(park) {
    const searchVal = document.getElementById("rideSearch").value.toLowerCase();
    const body = document.getElementById("ridesBody");
    body.innerHTML = "";

    // Don't show stale queue rows before the park opens or after it closes.
    const parkKeyForPhase = Object.keys(parkData.parks).find(k => parkData.parks[k] === park) || activeParkKey;
    const queuePhase = getParkPhase(parkKeyForPhase, park);
    if (queuePhase.phase === "pre-open" || queuePhase.phase === "closed-for-day") {
      let headline, detail, icon = "🌙";
      if (queuePhase.phase === "closed-for-day") {
        headline = "Closed for the day";
        detail = "See you tomorrow! Live standby waits return when the park opens.";
      } else if (queuePhase.openNow) {
        icon = "☀️";
        headline = "Open now &mdash; waiting for today&rsquo;s first update";
        detail = "Live standby waits will appear here in a few minutes.";
      } else if (queuePhase.awaiting || !queuePhase.opensAt) {
        headline = "Not open yet";
        detail = "Live standby waits will appear here once the park opens.";
      } else {
        const noEarlyEntry = queuePhase.opensAt === queuePhase.generalAt;
        headline = `Not open yet &mdash; ${noEarlyEntry ? "Park opens" : "Early Entry starts"} ${formatHourLabel(queuePhase.opensAt)}`;
        detail = "Live standby waits will appear here once the park opens.";
      }
      body.innerHTML = `<tr class="queue-closed-row"><td colspan="3"><div class="queue-closed-icon">${icon}</div><strong>${headline}</strong><div>${detail}</div></td></tr>`;
      return;
    }

    const matchesSearch = r => (r.name || "").toLowerCase().includes(searchVal) || (r.land || "").toLowerCase().includes(searchVal);

    const sortRides = list => list.slice().sort((a, b) => {
      let av = a[sortField], bv = b[sortField];
      if (sortField === "wait_time") {
        av = a.is_open ? a.wait_time : -1;
        bv = b.is_open ? b.wait_time : -1;
      } else {
        av = (av || "").toString().toLowerCase();
        bv = (bv || "").toString().toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    const buildRow = (r) => {
      const kind = getRideKind(r);
      const row = document.createElement("tr");
      row.className = "ride-row";
      let waitDisplay;
      if (r.is_open) {
        const style = getWaitPillStyle(r.wait_time);
        waitDisplay = `<span class="wait-pill" style="background:${style.bg}; color:${style.color}">${r.wait_time} min</span>`;
      } else if (kind !== "standard") {
        waitDisplay = `<span class="status-muted">Not running right now</span>`;
      } else {
        const cls = classifyClosedRide(r);
        waitDisplay = cls.group === "extended"
          ? `<span class="status-refurb">🛠 ${escapeHtml(cls.tag)}</span>`
          : `<span class="status-down">⛔ Temporary Closure</span>`;
      }
      const landText = kind !== "standard"
        ? `${SPECIAL_KIND_LABELS[kind] || "Special"} · ${r.land || ""}`
        : (r.land || "");
      row.innerHTML = `
        <td><strong>${escapeHtml(r.name)}</strong><span class="queue-mobile-land">${escapeHtml(landText)}</span></td>
        <td><span class="land-tag">${escapeHtml(landText)}</span></td>
        <td style="text-align: right;">${waitDisplay}</td>
      `;
      row.onclick = () => openRideModal(r, park.name);
      return row;
    };

    const visible = getVisibleRides(park).filter(matchesSearch);
    const standardRows = sortRides(visible.filter(r => getRideKind(r) === "standard"));
    const specialRows = sortRides(visible.filter(r => getRideKind(r) !== "standard"));

    standardRows.forEach(r => body.appendChild(buildRow(r)));

    if (specialRows.length > 0) {
      const hdr = document.createElement("tr");
      hdr.className = "special-group-row";
      hdr.innerHTML = `<td colspan="3">🎟️ Events, shows &amp; character meets (${specialRows.length})<span class="special-caret">${showSpecialRows ? "▾" : "▸"}</span></td>`;
      hdr.onclick = () => { showSpecialRows = !showSpecialRows; renderRideRows(park); };
      body.appendChild(hdr);
      if (showSpecialRows) specialRows.forEach(r => body.appendChild(buildRow(r)));
    }
  }

  const CURVE_ET_FORMAT = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
    day: '2-digit', weekday: 'short', hour: '2-digit', hourCycle: 'h23'
  });

  function curveET(date) {
    const p = Object.fromEntries(CURVE_ET_FORMAT.formatToParts(date).map(x => [x.type, x.value]));
    return {day: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday.toLowerCase(), hour: Number(p.hour)};
  }

  function buildParkWaitCurve(park, now = new Date()) {
    const current = curveET(now), nowMs = now.getTime();
    const rides = getStandardRides(park); // Include currently closed rides with earlier readings.
    const perRide = {};
    let firstObserved = 24, lastObserved = -1;
    for (const ride of rides) {
      const hourly = {};
      for (const point of history24h?.rides?.[String(ride.id)]?.points || []) {
        if (!Array.isArray(point) || typeof point[1] !== 'number' || !Number.isFinite(point[1]) || point[1] <= 0) continue;
        const ms = Date.parse(point[0]);
        if (!Number.isFinite(ms) || ms > nowMs) continue;
        const time = curveET(new Date(ms));
        if (time.day !== current.day) continue;
        const bucket = hourly[time.hour] ||= {sum: 0, samples: 0};
        bucket.sum += point[1]; bucket.samples++;
        firstObserved = Math.min(firstObserved, time.hour);
        lastObserved = Math.max(lastObserved, time.hour);
      }
      perRide[String(ride.id)] = hourly;
    }
    const hoursConfig = resolveHours(activeParkKey, park);
    const parseHour = value => { const [h, m] = String(value || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h + m / 60 : null; };
    const opening = parseHour(hoursConfig?.earlyEntry || hoursConfig?.open);
    const closing = parseHour(hoursConfig?.close);
    let start = opening === null ? 8 : Math.floor(opening);
    let end = closing === null ? 22 : Math.ceil(closing) - 1;
    if (firstObserved < 24) start = Math.min(start, firstObserved);
    if (lastObserved >= 0) end = Math.max(end, lastObserved);
    start = Math.max(0, Math.min(23, start)); end = Math.max(start, Math.min(23, end));
    const hours = Array.from({length: end - start + 1}, (_, i) => start + i);
    const today = [], typical = [], coverage = [];
    for (const hour of hours) {
      const key = `${current.weekday}_${String(hour).padStart(2, '0')}`;
      const observed = [], historical = [], matched = [];
      for (const ride of rides) {
        const id = String(ride.id), o = perRide[id]?.[hour], b = historicalSummary?.rides?.[id]?.buckets?.[key];
        const validBaseline = b && typeof b.avg_wait === 'number' && Number.isFinite(b.avg_wait) && b.avg_wait > 0 && b.samples > 0;
        const observation = o ? {avg: o.sum / o.samples, samples: o.samples} : null;
        if (observation && hour <= current.hour) observed.push({id, ...observation});
        if (validBaseline) historical.push({id, avg: b.avg_wait, samples: b.samples});
        if (observation && validBaseline && hour <= current.hour) matched.push({observed: observation, historical: b});
      }
      const mean = a => a.length ? Math.round(a.reduce((n, x) => n + x, 0) / a.length * 10) / 10 : null;
      // Both lines use equal attraction weights. Where both exist, compare the SAME rides.
      if (observed.length) {
        today.push(mean(matched.length ? matched.map(x => x.observed.avg) : observed.map(x => x.avg)));
        typical.push(mean(matched.map(x => x.historical.avg_wait)));
      } else {
        today.push(null);
        typical.push(mean(historical.map(x => x.avg)));
      }
      coverage.push({observedRides: observed.length, matchedRides: matched.length,
        historicalRides: observed.length ? matched.length : historical.length,
        observedSamples: matched.length ? matched.reduce((n, x) => n + x.observed.samples, 0) : observed.reduce((n, x) => n + x.samples, 0),
        historicalSamples: observed.length ? matched.reduce((n, x) => n + x.historical.samples, 0) : historical.reduce((n, x) => n + x.samples, 0),
        partial: hour === current.hour});
    }
    return {day: current.day, weekday: current.weekday, currentHour: current.hour, hours, today, typical, coverage};
  }

  function renderChart(park) {
    const canvas = document.getElementById('trendChart'), ctx = canvas.getContext('2d');
    const series = buildParkWaitCurve(park), c = chartTheme();
    if (chartInstance) chartInstance.destroy();
    const gradient = ctx.createLinearGradient(0, 0, 0, 195);
    gradient.addColorStop(0, c.fillTop); gradient.addColorStop(1, c.fillBottom);
    const label = hour => `${hour % 12 || 12}${hour >= 12 ? 'p' : 'a'}`;
    const sourceTime = iso => {
      const ms = Date.parse(iso);
      return Number.isFinite(ms) ? new Date(ms).toLocaleString('en-US', {month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZone:'America/New_York', timeZoneName:'short'}) : 'Unavailable';
    };
    const hasToday = series.today.some(x => x !== null), hasTypical = series.typical.some(x => x !== null);
    const warnings = [];
    if (!hasToday) warnings.push('No qualifying observations for this park today yet.');
    if (!hasTypical) warnings.push('No matching historical weekday/hour baseline available.');
    const historyAge = Date.now() - Date.parse(history24h?.updated_at);
    if (hasToday && (!Number.isFinite(historyAge) || historyAge > STALE_THRESHOLD_MINUTES * 60000)) warnings.push('Observed history may be out of date.');
    const summaryAge = Date.now() - Date.parse(historicalSummary?.updated_at);
    if (hasTypical && (!Number.isFinite(summaryAge) || summaryAge > 2 * 60 * 60 * 1000)) warnings.push('Historical summary has not refreshed recently.');
    const insights = document.getElementById('insightsPanel');
    const warningHtml = warnings.length ? '<div class="insight-item curve-warning" role="status" style="margin-bottom:0.75rem;">' + escapeHtml(warnings.join(' ')) + '</div>' : '';
    insights.innerHTML = warningHtml +
      '<details class="chart-notes-disclosure" data-smooth-expand>' +
        '<summary class="chart-notes-summary">' +
          '<span class="chart-notes-summary-text">📊 Methodology & Timestamps</span>' +
          '<span class="chart-notes-summary-chevron">▾</span>' +
        '</summary>' +
        '<div class="chart-notes-body" data-disclosure-content>' +
          '<div class="insight-item"><strong>Actual data:</strong> ' + escapeHtml(series.day) +
          ' · Eastern park time. Observed history: ' + escapeHtml(sourceTime(history24h?.updated_at)) +
          ' · Historical summary: ' + escapeHtml(sourceTime(historicalSummary?.updated_at)) + '.</div>' +
          '<div class="insight-item"><strong>How to read this:</strong> Positive standby waits for standard attractions only; zero waits and closed readings are excluded. Each attraction contributes equally after its hourly readings are averaged. Where both lines exist, they use the same available attractions; hover for coverage. The current observed hour is partial. Future observed hours stay blank.</div>' +
          '<div class="insight-item"><strong>Preliminary baseline:</strong> Same-weekday historical averages are not a forecast or a crowd index. They can include today’s completed rollups; reading counts do not establish multiple weeks of history.</div>' +
        '</div>' +
      '</details>';
    if (window.ParkPulseDisclosure?.initialize) window.ParkPulseDisclosure.initialize(insights);
    canvas.setAttribute('aria-label', `${park.name}: observed and historical average positive standby waits on ${series.day}, Eastern time`);
    canvas.setAttribute('role', 'img');
    chartInstance = new Chart(ctx, {
      type:'line', data:{labels:series.hours.map(label), datasets:[
        {label:'Today · observed', data:series.today, borderColor:c.primary, backgroundColor:gradient,
         pointBackgroundColor:c.primary, pointBorderColor:c.pointBorder, pointRadius:3, pointHoverRadius:5,
         borderWidth:2.5, tension:0, fill:true, spanGaps:false},
        {label:'Same weekday · historical average', data:series.typical, borderColor:c.secondary,
         borderDash:[6,5], borderWidth:1.5, pointRadius:2, tension:0, fill:false, spanGaps:false}
      ]}, options:{responsive:true,maintainAspectRatio:false,
        plugins:{legend:{labels:{color:c.textColor,usePointStyle:true,padding:10,boxWidth:8,font:{size:10}}},
          tooltip:{backgroundColor:c.surface,titleColor:c.primary,bodyColor:c.text,borderColor:c.border,borderWidth:1,padding:10,cornerRadius:8,
            callbacks:{title:items => {const i=items[0]?.dataIndex;return i===undefined?'':`${series.day} · ${label(series.hours[i])}–${label(series.hours[i]+1)} Eastern${series.coverage[i].partial?' · current hour (partial)':''}`;},
              label:item => `${item.dataset.label}: ${item.parsed.y} min`,
              afterLabel:item => {const x=series.coverage[item.dataIndex];return item.datasetIndex===0 ?
                `${x.matchedRides || x.observedRides} attractions · ${x.observedSamples} positive readings${x.matchedRides ? ` · matched ${x.matchedRides}/${x.observedRides} observed attractions` : ' · no historical match'}` :
                `${x.historicalRides} attractions · ${x.historicalSamples} historical readings · preliminary`;}}}},
        scales:{y:{beginAtZero:true,grid:{color:c.grid},ticks:{color:c.textColor,callback:v=>v+'m',font:{size:9}}},
          x:{grid:{color:'transparent'},ticks:{color:c.textColor,font:{size:9}},title:{display:true,text:'Eastern park time · hourly buckets',color:c.textColor}}}
      }
    });
  }

  function openRideModal(ride, parkName) {
    document.getElementById("rideModalLand").textContent = `${parkName} · ${ride.land}`;
    document.getElementById("rideModalName").textContent = ride.name;
    document.getElementById("rideModalCurrent").textContent = ride.is_open ? `${ride.wait_time} min` : "Closed";

    initDayNav("ride", ride.id);

    document.getElementById("rideModalOverlay").classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeRideModal() {
    dayNavState.ride = null;
    document.getElementById("rideModalOverlay").classList.remove("active");
    document.body.style.overflow = "";
  }


  // ── Day-by-day wait history (shared by the standby and heatmap popups) ──
  // Today comes from the rolling 24h history; earlier days come from the worker's
  // nightly archive (/api/ride-history). If the archive isn't available, earlier
  // days still appear (as "partial") for whatever the 24h history still holds.
  const RIDE_HISTORY_TTL_MS = 10 * 60 * 1000;
  const rideHistoryCache = {};
  const dayNavState = { ride: null, hm: null };
  const DAY_NAV_CONFIG = {
    ride: {
      prefix: "rideModal",
      render: pts => renderSparkline(pts),
      clear: () => { if (sparklineInstance) { sparklineInstance.destroy(); sparklineInstance = null; } }
    },
    hm: {
      prefix: "hmModal",
      render: pts => renderHeatmapModalSparkline(pts),
      clear: () => { if (hmSparklineInstance) { hmSparklineInstance.destroy(); hmSparklineInstance = null; } }
    }
  };

  function etDateKey(d) {
    return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  }

  function formatDayKey(dayKey, withWeekday) {
    const opts = { month: "short", day: "numeric", timeZone: "UTC" };
    if (withWeekday) opts.weekday = "short";
    return new Date(dayKey + "T12:00:00Z").toLocaleDateString([], opts);
  }

  async function loadArchivedDays(rideId) {
    const key = String(rideId);
    const cached = rideHistoryCache[key];
    if (cached && Date.now() - cached.at < RIDE_HISTORY_TTL_MS) return cached.days;
    try {
      const res = await fetch(`${API_BASE}/api/ride-history?ride=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const days = (data && data.days) || {};
      rideHistoryCache[key] = { at: Date.now(), days };
      return days;
    } catch (e) {
      console.log("Ride history archive unavailable:", e);
      return {};
    }
  }

  // Returns { "YYYY-MM-DD": { points: [[epochMs, wait], ...], partial: bool } }
  function buildDaySeries(rideId, archivedDays) {
    const series = {};
    const todayKey = etDateKey(new Date());

    Object.entries(archivedDays || {}).forEach(([day, pts]) => {
      if (day === todayKey || !Array.isArray(pts)) return;
      series[day] = { points: pts.map(p => [p[0] * 1000, p[1]]), partial: false };
    });

    const live = {};
    getTodayPointsForRide(rideId).forEach(p => {
      if (typeof p[1] !== "number") return;
      const ms = Date.parse(p[0]);
      if (isNaN(ms)) return;
      const day = etDateKey(new Date(ms));
      (live[day] = live[day] || []).push([ms, p[1]]);
    });
    Object.entries(live).forEach(([day, pts]) => {
      if (day === todayKey || !series[day]) series[day] = { points: pts, partial: day !== todayKey };
    });

    if (!series[todayKey]) series[todayKey] = { points: [], partial: false };
    return series;
  }

  function initDayNav(kind, rideId) {
    const state = { rideId: String(rideId), archived: null, series: {}, days: [], selected: null };
    dayNavState[kind] = state;
    rebuildDayNav(kind, state, true);
    loadArchivedDays(rideId).then(archived => {
      if (dayNavState[kind] !== state) return;
      state.archived = archived;
      rebuildDayNav(kind, state, false);
    });
  }

  function rebuildDayNav(kind, state, resetSelection) {
    state.series = buildDaySeries(state.rideId, state.archived);
    state.days = Object.keys(state.series).sort();
    if (resetSelection || !state.series[state.selected]) state.selected = etDateKey(new Date());
    renderDayNav(kind, state);
  }

  function stepDay(kind, delta) {
    const state = dayNavState[kind];
    if (!state) return;
    const j = state.days.indexOf(state.selected) + delta;
    if (j < 0 || j >= state.days.length) return;
    state.selected = state.days[j];
    renderDayNav(kind, state);
  }

  function renderDayNav(kind, state) {
    const cfg = DAY_NAV_CONFIG[kind];
    const todayKey = etDateKey(new Date());
    const entry = state.series[state.selected] || { points: [], partial: false };
    const isToday = state.selected === todayKey;
    const idx = state.days.indexOf(state.selected);

    document.getElementById(cfg.prefix + "PrevDay").disabled = idx <= 0;
    document.getElementById(cfg.prefix + "NextDay").disabled = idx < 0 || idx >= state.days.length - 1;

    let label = formatDayKey(state.selected, true);
    if (isToday) label = "Today · " + label;
    else if (entry.partial) label += " · partial";
    document.getElementById(cfg.prefix + "DayLabel").textContent = label;
    document.getElementById(cfg.prefix + "ChartTitle").textContent = isToday ? "Today's Wait Time History" : "Wait Time History";

    const points = entry.points;
    const noHistoryEl = document.getElementById(cfg.prefix + "NoHistory");
    const canvasEl = document.getElementById(cfg.prefix + "Sparkline");
    if (points.length < 2) {
      noHistoryEl.textContent = isToday
        ? "Not enough history yet today — check back after a few more updates."
        : "No readings recorded for this day.";
      noHistoryEl.style.display = "block";
      canvasEl.style.display = "none";
      cfg.clear();
    } else {
      noHistoryEl.style.display = "none";
      canvasEl.style.display = "block";
      cfg.render(points);
    }

    if (kind === "ride") updateRideDayStats(points, isToday, state.selected);
  }

  function updateRideDayStats(points, isToday, dayKey) {
    const shortDay = formatDayKey(dayKey, false);
    document.getElementById("rideModalAvgLabel").textContent = isToday ? "Today's Avg" : `${shortDay} Avg`;
    document.getElementById("rideModalPeakLabel").textContent = isToday ? "Today's Peak" : `${shortDay} Peak`;
    if (points.length < 2) {
      document.getElementById("rideModalAvg").textContent = "–";
      document.getElementById("rideModalPeak").textContent = "–";
      return;
    }
    const waits = points.map(pt => pt[1]);
    document.getElementById("rideModalAvg").textContent = `${Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)} min`;
    document.getElementById("rideModalPeak").textContent = `${Math.max(...waits)} min`;
  }

  // Rolling 24h points for a ride (ISO timestamp, wait). Use buildDaySeries() for per-day views.
  function getTodayPointsForRide(rideId) {
    if (!history24h || !history24h.rides) return [];
    const entry = history24h.rides[String(rideId)];
    if (!entry) return [];
    return entry.points || [];
  }

  function renderSparkline(points) {
    const ctx = document.getElementById('rideModalSparkline').getContext('2d');
    const labels = points.map(p => new Date(p[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    const data = points.map(p => p[1]);
    const c = chartTheme();

    if (sparklineInstance) sparklineInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 120);
    gradient.addColorStop(0, c.fillTopSmall);
    gradient.addColorStop(1, c.fillBottom);

    sparklineInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data, borderColor: c.primary, backgroundColor: gradient,
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: c.surface, titleColor: c.primary, bodyColor: c.text,
          borderColor: c.border, borderWidth: 1, padding: 8, cornerRadius: 6,
          callbacks: { label: (ctx) => `${ctx.parsed.y} min` }
        }},
        scales: {
          y: { grid: { color: c.grid }, ticks: { color: c.textColor, callback: v => v + 'm' } },
          x: { grid: { color: 'transparent' }, ticks: { color: c.textColor, maxTicksLimit: 6 } }
        }
      }
    });
  }

  function setHeatmapMode(mode, el) {
    heatmapMode = mode;
    heatmapSortCol = "name";
    heatmapSortDir = "asc";
    document.querySelectorAll(".heatmap-tab").forEach(t => t.classList.remove("active"));
    el.classList.add("active");
    renderHeatmap();
  }

  function setHeatmapSort(col) {
    if (heatmapSortCol === col) {
      heatmapSortDir = heatmapSortDir === "asc" ? "desc" : "asc";
    } else {
      heatmapSortCol = col;
      heatmapSortDir = col === "name" ? "asc" : "desc";
    }
    renderHeatmap();
  }

  function getHeatColor(waitTime, maxWait) {
    if (waitTime === null || waitTime === undefined) return null;
    const pct = maxWait > 0 ? Math.min(1, waitTime / maxWait) : 0;
    const stops = [
      [53, 208, 138], [143, 208, 138], [255, 200, 87], [255, 154, 92], [255, 93, 122]
    ];
    const scaled = pct * (stops.length - 1);
    const idx = Math.min(stops.length - 2, Math.floor(scaled));
    const frac = scaled - idx;
    const c1 = stops[idx], c2 = stops[idx + 1];
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * frac);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * frac);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * frac);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const textColor = brightness > 150 ? "#12122a" : "#ffffff";
    return { bg: `rgb(${r},${g},${b})`, text: textColor };
  }

  function renderHeatmapByHour() {
    const caveat = document.getElementById("heatmapCaveat");
    caveat.classList.remove("visible");
    document.getElementById("heatmapTitle").textContent = "🔥 Ride Wait Heatmap — Today by Hour";

    const park = parkData.parks[activeParkKey];
    if (!park) { renderHeatmapEmpty("Live data unavailable."); return; }
    const etDateFmt = { timeZone: "America/New_York" };
    const todayET = new Date().toLocaleDateString("en-CA", etDateFmt);
    const standardRides = getStandardRides(park);

    // Keep all standard attractions that recorded wait times today in history24h, or are open
    const ridesWithHistoryToday = standardRides.filter(r => {
      const pts = history24h?.rides?.[String(r.id)]?.points || [];
      return pts.some(([iso, wait]) => new Date(iso).toLocaleDateString("en-CA", etDateFmt) === todayET && wait > 0);
    });
    const candidateRides = ridesWithHistoryToday.length ? ridesWithHistoryToday : standardRides.filter(r => r.is_open);
    const finalRides = candidateRides.length ? candidateRides : standardRides;
    finalRides.sort((a, b) => (b.wait_time || 0) - (a.wait_time || 0));
    const visibleRides = finalRides.slice(0, 14);

    if (!history24h || !history24h.rides || visibleRides.length === 0) {
      renderHeatmapEmpty("Collecting today's data — the heatmap will populate as more scrapes come in throughout the day.");
      return;
    }

    const nowHour = new Date(new Date().toLocaleString("en-US", etDateFmt)).getHours();
    const hours = [];
    for (let h = 8; h <= Math.min(23, nowHour); h++) hours.push(h);

    const rideRows = visibleRides.map(ride => {
      const entry = history24h.rides[String(ride.id)];
      const pointsByHour = {};
      if (entry) {
        entry.points.forEach(([iso, wait]) => {
          if (new Date(iso).toLocaleDateString("en-CA", etDateFmt) !== todayET) return;
          const localHour = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York" })).getHours();
          if (!pointsByHour[localHour]) pointsByHour[localHour] = [];
          pointsByHour[localHour].push(wait);
        });
      }
      return { ride, pointsByHour };
    });

    let maxWait = 0;
    rideRows.forEach(({ pointsByHour }) => {
      Object.values(pointsByHour).forEach(arr => {
        const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
        if (avg > maxWait) maxWait = avg;
      });
    });

    renderHeatmapTable(
      hours.map(h => formatHourShort(h)),
      rideRows.map(({ ride, pointsByHour }) => ({
        id: ride.id,
        name: ride.name,
        cells: hours.map(h => {
          const arr = pointsByHour[h];
          if (!arr || arr.length === 0) return null;
          return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
        })
      })),
      maxWait
    );
  }

  function formatHourShort(h) {
    const period = h >= 12 ? "p" : "a";
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return `${h12}${period}`;
  }

  function renderHeatmapByWeekday() {
    const caveat = document.getElementById("heatmapCaveat");
    document.getElementById("heatmapTitle").textContent = "🔥 Ride Wait Heatmap — By Day of Week";

    const park = parkData.parks[activeParkKey];
    if (!park) { renderHeatmapEmpty("Live data unavailable."); return; }
    const visibleRides = getStandardRides(park).filter(r => r.is_open).slice(0, 12);
    const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const weekdayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

    if (!historicalSummary || !historicalSummary.rides || visibleRides.length === 0) {
      caveat.classList.add("visible");
      caveat.innerHTML = `<strong>Gathering data:</strong> Day-of-week patterns need several weeks of history to be reliable. Check back after this tracker has been running a while.`;
      renderHeatmapEmpty("No day-of-week data collected yet.");
      return;
    }

    const minSamples = historicalSummary.min_samples_for_reliable || MIN_SAMPLES_FOR_RELIABLE;
    let anyReliable = false;
    let maxWait = 0;
    const rideRows = visibleRides.map(ride => {
      const entry = historicalSummary.rides[String(ride.id)];
      const cells = weekdayKeys.map(wd => {
        if (!entry) return null;
        const matching = Object.entries(entry.buckets || {}).filter(([k]) => k.startsWith(wd + "_"));
        if (matching.length === 0) return null;
        const totalSamples = matching.reduce((s, [, b]) => s + b.samples, 0);
        const weightedAvg = matching.reduce((s, [, b]) => s + b.avg_wait * b.samples, 0) / totalSamples;
        if (totalSamples >= minSamples) anyReliable = true;
        if (weightedAvg > maxWait) maxWait = weightedAvg;
        return { avg: Math.round(weightedAvg), samples: totalSamples };
      });
      return { id: ride.id, name: ride.name, cells };
    });

    if (!anyReliable) {
      caveat.classList.add("visible");
      caveat.innerHTML = `<strong>Not enough data yet:</strong> day-of-week cells have fewer than ${minSamples} readings. Values are preliminary; reading counts do not establish multiple weeks of coverage.`;
    } else {
      caveat.classList.add("visible");
      caveat.textContent = "Historical weekday averages combine all collected dates for each weekday. They are not a single week's report; multiple readings on one date do not establish a multi-week pattern.";
    }

    renderHeatmapTable(
      weekdayLabels,
      rideRows.map(r => ({
        id: r.id,
        name: r.name,
        cells: r.cells.map(c => c ? c.avg : null),
        samples: r.cells.map(c => c ? c.samples : 0)
      })),
      maxWait,
      minSamples
    );
  }

  function renderHeatmapEmpty(message) {
    document.getElementById("heatmapHead").innerHTML = "";
    document.getElementById("heatmapBody").innerHTML = `<tr><td style="padding:1.5rem; color:var(--text-muted); font-style:italic; text-align:center;">${message}</td></tr>`;
  }

  function renderHeatmapTable(colLabels, rows, maxWait, minSamples) {
    const head = document.getElementById("heatmapHead");
    const body = document.getElementById("heatmapBody");
    const table = document.getElementById('heatmapTable');
    table.style.setProperty('--heatmap-columns', colLabels.length);
    let colgroup = table.querySelector('colgroup');
    if (!colgroup) { colgroup = document.createElement('colgroup'); table.insertBefore(colgroup, table.firstChild); }
    colgroup.innerHTML = '<col class="heatmap-name-col">' + colLabels.map(() => '<col class="heatmap-data-col">').join('');

    const sortedRows = rows.slice().sort((a, b) => {
      let av, bv;
      if (heatmapSortCol === "name") {
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
      } else {
        av = a.cells[heatmapSortCol];
        bv = b.cells[heatmapSortCol];
        av = (av === null || av === undefined) ? -1 : av;
        bv = (bv === null || bv === undefined) ? -1 : bv;
      }
      if (av < bv) return heatmapSortDir === "asc" ? -1 : 1;
      if (av > bv) return heatmapSortDir === "asc" ? 1 : -1;
      return 0;
    });

    const nameArrow = heatmapSortCol === "name" ? (heatmapSortDir === "asc" ? "▲" : "▼") : "▾";
    const nameActive = heatmapSortCol === "name" ? "sort-active" : "";
    const colHeadersHtml = colLabels.map((l, i) => {
      const active = heatmapSortCol === i;
      const arrow = active ? (heatmapSortDir === "asc" ? "▲" : "▼") : "▾";
      const parts = String(l).split(' · ');
      const label = parts.length > 1 ? `<span class="heatmap-label-day">${escapeHtml(parts[0])}</span><span class="heatmap-label-separator"> · </span><span class="heatmap-label-date">${escapeHtml(parts.slice(1).join(' · '))}</span>` : escapeHtml(l);
      return `<th class="sortable ${active ? 'sort-active' : ''}" onclick="setHeatmapSort(${i})">${label} <span class="sort-arrow">${arrow}</span></th>`;
    }).join('');

    head.innerHTML = `<tr><th class="ride-col sortable ${nameActive}" onclick="setHeatmapSort('name')">Attraction <span class="sort-arrow">${nameArrow}</span></th>${colHeadersHtml}</tr>`;

    if (sortedRows.length === 0) {
      renderHeatmapEmpty("No attraction data available for this park right now.");
      return;
    }
    body.innerHTML = sortedRows.map(row => {
      const cellsHtml = row.cells.map((val, i) => {
        if (val === null) {
          return `<td><span class="heatmap-cell no-data">&ndash;</span></td>`;
        }
        const color = getHeatColor(val, maxWait);
        const lowSample = minSamples && row.samples && row.samples[i] < minSamples;
        const title = lowSample ? `${val} min avg (${row.samples[i]} samples — needs ${minSamples})` : `${val} min avg`;
        return `<td><span class="heatmap-cell has-data" style="background:${color.bg}; color:${color.text}; opacity:${lowSample ? 0.55 : 1}" title="${title}">${val}</span></td>`;
      }).join('');
      return `<tr data-ride-id="${escapeHtml(row.id)}"><td class="ride-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</td>${cellsHtml}</tr>`;
    }).join('');
  }

  function renderHeatmapLast7Days() {
    const caveat = document.getElementById('heatmapCaveat');
    document.getElementById('heatmapTitle').textContent = '🔥 Ride Wait Heatmap — Last 7 Days';
    const data = historicalSummary && historicalSummary.daily_heatmap;
    if (!data || !data.rides) {
      caveat.classList.add('visible');
      caveat.textContent = 'Daily history is initializing. Deploy the updated queue Worker, then wait for its next completed-hour rollup and the summary refresh. No weekday averages are substituted for dates.';
      renderHeatmapEmpty('Date-specific summary not available yet.');
      return;
    }
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const fields = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const today = `${fields.year}-${fields.month}-${fields.day}`;
    const [year, month, day] = today.split('-').map(Number);
    const days = Array.from({length: 7}, (_, i) => new Date(Date.UTC(year, month - 1, day - 6 + i)).toISOString().slice(0, 10));
    const labels = days.map(key => {
      const date = new Date(key + 'T12:00:00Z');
      const weekday = date.toLocaleDateString('en-US', {weekday:'short', timeZone:'UTC'});
      const monthName = date.toLocaleDateString('en-US', {month:'short', timeZone:'UTC'});
      return `${weekday} · ${monthName}/${key.slice(8)}${key === today ? ' *' : ''}`;
    });
    const park = parkData.parks[activeParkKey];
    // Include currently closed standard attractions when they have daily history.
    const rides = getStandardRides(park).filter(r => data.rides[String(r.id)]).slice(0, 12);
    let maxWait = 0;
    const rows = rides.map(ride => {
      const entries = data.rides[String(ride.id)] || {};
      const cells = days.map(key => {
        const e = entries[key];
        if (!e || !(e.samples > 0) || !Number.isFinite(e.avg_wait)) return null;
        const value = Math.round(e.avg_wait);
        maxWait = Math.max(maxWait, value);
        return value;
      });
      return {id: ride.id, name: ride.name, cells, samples: days.map(key => entries[key]?.samples || 0)};
    });
    caveat.classList.add('visible');
    caveat.textContent = '* Today is partial and includes completed hourly rollups only. Values are averages of recorded positive waits while open; zero-minute waits and closed readings are excluded. A dash means no qualifying readings. Dates use Eastern park time. ' +
      (data.as_of_day !== today ? 'The cached summary is from an earlier date; newer daily data is pending. ' : '') +
      'Summary updated: ' + formatUpdatedTime(historicalSummary.updated_at) + '.';
    if (!rows.length) {
      renderHeatmapEmpty('No qualifying daily history available for this park yet.');
      return;
    }
    // Daily descriptive averages are not assigned a multi-week reliability label.
    renderHeatmapTable(labels, rows, maxWait, 0);
    const byId = Object.fromEntries(rows.map(row => [String(row.id), row]));
    document.querySelectorAll('#heatmapBody tr[data-ride-id]').forEach(tr => {
      const row = byId[tr.dataset.rideId];
      tr.querySelectorAll('.heatmap-cell').forEach((cell, i) => {
        cell.title = days[i] + (days[i] === today ? ' · partial' : '') +
          (row.cells[i] === null ? ' · no qualifying readings' : ` · ${row.cells[i]} min average · ${row.samples[i]} readings`);
      });
    });
  }


  function renderHeatmap() {
    if (heatmapMode === "hour") renderHeatmapByHour();
    else if (heatmapMode === "daily") renderHeatmapLast7Days();
    else renderHeatmapByWeekday();
  }


  function getRideHistoryStats(rideId) {
    const points = getTodayPointsForRide(rideId).filter(pt => typeof pt[1] === "number");
    let h24 = null;
    if (points.length > 0) {
      const waits = points.map(pt => pt[1]);
      const peak = Math.max(...waits);
      const peakPt = points.find(pt => pt[1] === peak);
      h24 = {
        avg: Math.round(waits.reduce((a, b) => a + b, 0) / waits.length),
        peak, peakTime: peakPt ? peakPt[0] : null, count: waits.length
      };
    }
    let d7 = null;
    let busiest = null;
    const entry = historicalSummary && historicalSummary.rides ? historicalSummary.rides[String(rideId)] : null;
    if (entry && entry.last_7_days) {
      d7 = {
        avg: Math.round(entry.last_7_days.avg_wait),
        peak: entry.last_7_days.peak_wait,
        samples: entry.last_7_days.samples
      };
    }
    if (entry && entry.buckets) {
      let bestKey = null, bestAvg = -1;
      Object.entries(entry.buckets).forEach(([k, b]) => {
        if (b.avg_wait > bestAvg) { bestAvg = b.avg_wait; bestKey = k; }
      });
      if (bestKey) busiest = { key: bestKey, avg: Math.round(bestAvg) };
    }
    return { points, h24, d7, busiest };
  }

  function formatBucketKey(key) {
    if (!key) return "";
    const [wd, hr] = key.split("_");
    const names = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };
    return `${names[wd] || wd} ${formatHourShort(parseInt(hr, 10))}`;
  }

  function openHeatmapRideModal(rideId) {
    const park = parkData.parks[activeParkKey];
    if (!park) return;
    const ride = (park.rides || []).find(r => String(r.id) === String(rideId));
    if (!ride) return;

    document.getElementById("hmModalLand").textContent = `${park.name} \u00b7 ${ride.land}`;
    document.getElementById("hmModalName").textContent = ride.name;

    const st = getRideHistoryStats(ride.id);
    const setTxt = (id, t) => { document.getElementById(id).textContent = t; };

    if (st.h24) {
      setTxt("hmModalAvg24", `${st.h24.avg} min`);
      setTxt("hmModalAvg24Sub", `${st.h24.count} readings`);
      setTxt("hmModalPeak", `${st.h24.peak} min`);
      const peakAt = st.h24.peakTime ? `at ${formatUpdatedTime(st.h24.peakTime)}` : "";
      const peak7 = (st.d7 && st.d7.peak !== undefined) ? `7-day peak ${st.d7.peak} min` : "";
      setTxt("hmModalPeakSub", [peakAt, peak7].filter(Boolean).join(" \u00b7 "));
    } else {
      setTxt("hmModalAvg24", "\u2013"); setTxt("hmModalAvg24Sub", "No data yet");
      setTxt("hmModalPeak", "\u2013");
      setTxt("hmModalPeakSub", (st.d7 && st.d7.peak !== undefined) ? `7-day peak ${st.d7.peak} min` : "");
    }

    if (st.d7) {
      setTxt("hmModalAvg7", `${st.d7.avg} min`);
      setTxt("hmModalAvg7Sub", `${st.d7.samples} samples`);
    } else {
      setTxt("hmModalAvg7", "\u2013"); setTxt("hmModalAvg7Sub", "No data yet");
    }

    let note = "";
    if (st.busiest) {
      note = `Typically busiest: ${formatBucketKey(st.busiest.key)} (avg ${st.busiest.avg} min). `;
    }
    note += "7-day figures exclude zero-minute readings; the 24-hour average includes every open reading.";
    setTxt("hmModalNote", note);

    initDayNav("hm", ride.id);

    document.getElementById("hmModalOverlay").classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function closeHeatmapRideModal() {
    dayNavState.hm = null;
    document.getElementById("hmModalOverlay").classList.remove("active");
    document.body.style.overflow = "";
  }

  function renderHeatmapModalSparkline(points) {
    const ctx = document.getElementById('hmModalSparkline').getContext('2d');
    const labels = points.map(p => new Date(p[0]).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    const data = points.map(p => p[1]);
    const c = chartTheme();

    if (hmSparklineInstance) hmSparklineInstance.destroy();

    const gradient = ctx.createLinearGradient(0, 0, 0, 120);
    gradient.addColorStop(0, c.fillTopSmall);
    gradient.addColorStop(1, c.fillBottom);

    hmSparklineInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data, borderColor: c.primary, backgroundColor: gradient,
          borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.3, fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: c.surface, titleColor: c.primary, bodyColor: c.text,
          borderColor: c.border, borderWidth: 1, padding: 8, cornerRadius: 6,
          callbacks: { label: (ctx) => `${ctx.parsed.y} min` }
        }},
        scales: {
          y: { grid: { color: c.grid }, ticks: { color: c.textColor, callback: v => v + 'm' } },
          x: { grid: { color: 'transparent' }, ticks: { color: c.textColor, maxTicksLimit: 6 } }
        }
      }
    });
  }

  document.getElementById("heatmapBody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-ride-id]");
    if (tr) openHeatmapRideModal(tr.dataset.rideId);
  });

  document.getElementById("rideSearch").addEventListener("input", renderDetails);
  window.addEventListener("DOMContentLoaded", () => { updateThemeButton(); loadData(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeRideModal(); closeClosureModal(); closeHeatmapRideModal(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const delta = e.key === "ArrowLeft" ? -1 : 1;
    if (document.getElementById("rideModalOverlay").classList.contains("active")) stepDay("ride", delta);
    else if (document.getElementById("hmModalOverlay").classList.contains("active")) stepDay("hm", delta);
  });
