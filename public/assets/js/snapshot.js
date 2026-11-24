/* Park Pulse snapshot card (Attractions tab): short wording and a colored comparison pill.
   The original app code still writes its longer text into the hidden [data-average], [data-comparison]
   and [data-meta] nodes. This module reads that text and shows a shorter version beside them, so no data
   logic changes and the old wording comes back if this file fails to load.
   Load after app-shell.js. */
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

  /* "Today \u00b7 9:00 AM EST" becomes "Updated 9:00 AM". A zone is shown only when it is not Eastern, because
     park hours are already labelled ET. */
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

    // The original code may move the average into the park-icon row, so keep the new lines next to their sources.
    if (head.previousElementSibling !== avgSrc) avgSrc.after(head);
    if (trend.previousElementSibling !== cmpSrc) cmpSrc.after(trend);
    if (meta.previousElementSibling !== metaSrc) metaSrc.after(meta);
    return true;
  }

  function render() {
    queued = false;
    if (!connect()) return;

    // Headline: "32 min avg wait". Other states keep their full wording because they are warnings.
    const avg = avgSrc.textContent.trim();
    const i = avg.indexOf(SEP);
    const value = i < 0 ? avg : avg.slice(0, i);
    const label = i < 0 ? '' : avg.slice(i + SEP.length);
    const strong = document.createElement('strong');
    strong.textContent = value;
    const tail = label === 'Average posted wait' ? ' avg wait' : label ? SEP + label : '';
    head.replaceChildren(strong, document.createTextNode(tail));

    // Comparison pill. The matched-rides detail moves into the info popover unless some rides are missing.
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
    if (mm && Number(mm[2]) < Number(mm[3])) {
      const part = document.createElement('span');
      part.className = 'pp-snap-muted';
      part.textContent = mm[2] + ' of ' + mm[3] + ' rides';
      trend.append(part);
    }
    if (mm) {
      matchNote.textContent = 'This comparison covers ' + mm[2] + ' of ' + mm[3] + ' qualifying attractions.';
      matchNote.hidden = false;
    } else {
      matchNote.hidden = true;
    }

    // Schedule and freshness: "Closes 9 PM ET \u00b7 Updated 9:00 AM".
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
    if (connect()) {
      render();
    } else {
      // The snapshot is created by app-shell.js; wait for it if it is not there yet.
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
