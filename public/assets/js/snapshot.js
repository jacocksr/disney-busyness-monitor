/* Park Pulse lean-card presentation: Attractions snapshot and Best Park evidence.
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
    if (!rows.length) return;
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
      body.innerHTML = '<p class="pp-best-reason"></p><dl class="pp-best-facts"><div data-best-runner-row><dt data-best-runner-label>Next closest</dt><dd data-best-runner></dd></div></dl><p class="pp-best-hours"></p><p class="pp-best-freshness"></p><a class="pp-best-link"></a>';
      inner.replaceChildren(body);
    }
    banner.classList.add('pp-best-evidence-card');
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
    const freshness = !known ? 'Report age unknown' : olderDay ? 'Previous-day report' : age > STALE_THRESHOLD_MINUTES ? 'Reports delayed' + SEP + age + ' min old' : 'Updated ' + age + ' min ago';
    setText(body.querySelector('.pp-best-freshness'), freshness);
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
