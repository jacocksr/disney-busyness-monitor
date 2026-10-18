
/* Today's park hours strip on each card (only when the worker supplied valid hours for today). */
(() => {
  function addHoursStrips() {
    document.querySelectorAll('#parkGrid .park-card').forEach(card => {
      const key = card.dataset.parkKey, park = parkData.parks[key];
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
      const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));

      const nowMins = nowET.getHours() * 60 + nowET.getMinutes();
      const showEarlyEntry = hasEE && nowMins < hhmmToMins(h.open);

      const schedEvent = getParkScheduledEvent(key, park, nowET);
      const festival = getParkFestival(key, park, nowET);

      let eventPill = '';
      if (schedEvent && !ph.isSpecialEvent) {
        eventPill = '<span class="pulse-hours-event" title="' + escapeHtml(schedEvent.name) + '"><span aria-hidden="true">' + schedEvent.icon + '</span><strong>' + escapeHtml(schedEvent.name) + '</strong> <small>' + escapeHtml(schedEvent.hours) + '</small></span>';
      }
      let festPill = '';
      if (festival) {
        festPill = '<span class="pulse-hours-festival" title="' + escapeHtml(festival.name) + ' · ' + escapeHtml(festival.sub) + '"><span aria-hidden="true">' + festival.icon + '</span><strong>' + escapeHtml(festival.name) + '</strong> <small>' + escapeHtml(festival.sub) + '</small></span>';
      }

      const html = '<div class="pulse-hours ' + cls + '" title="Today\u2019s park hours (Eastern Time)">'
        + '<span class="pulse-hours-main"><span class="pulse-hours-dot" aria-hidden="true"></span>Today <strong>' + fmtClock(h.open) + ' \u2013 ' + fmtClock(h.close) + '</strong> <small>ET</small></span>'
        + (showEarlyEntry ? '<span class="pulse-hours-ee">\ud83d\udd11 Early Entry ' + fmtClock(h.earlyEntry) + '</span>' : '')
        + eventPill
        + festPill
        + '</div>';
      const header = card.querySelector('.pulse-header');
      if (header) header.insertAdjacentHTML('afterend', html);
    });
  }
  const priorRenderCards = renderCards;
  renderCards = function(...args) {
    const result = priorRenderCards.apply(this, args);
    if (!isDataUnavailable()) addHoursStrips();
    return result;
  };
})();
/* Keep the unavailable card intact: guard the outermost renderCards wrapper. */
(() => {
  const priorRenderCards = renderCards;
  renderCards = function(...args) {
    if (isDataUnavailable()) { renderUnavailableState(); return; }
    return priorRenderCards.apply(this, args);
  };
})();
/* Curve clock: re-render the wait curve when the Eastern hour/day rolls over. */
(() => {
  let lastCurveClock = '';
  let lastPhaseSig = null;
  const priorTimestamp = updateTimestamp;
  updateTimestamp = function(...args) {
    const result = priorTimestamp(...args);
    if (isDataUnavailable()) return result;
    // Re-render when a park's phase changes (e.g. it opens) instead of waiting for the next data refresh.
    const phaseSig = PARK_ORDER.map(k => {
      if (!parkData.parks[k]) return "-";
      const p = getParkPhase(k, parkData.parks[k]);
      return p.phase + (p.awaiting ? "*" : "") + (p.openNow ? "+" : "");
    }).join("|");
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
    return result;
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
      const rideName = (!isClosed && stats.longest && stats.longest.name) ? stats.longest.name : '';
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
      const validPoints = (series.today || []).filter(x => typeof x === 'number' && Number.isFinite(x));
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
    const label = hour => `${hour % 12 || 12}${hour >= 12 ? 'p' : 'a'}`;
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
            spanGaps: false
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
            spanGaps: false
          }
        ]
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
              title: items => {
                const i = items[0]?.dataIndex;
                return i !== undefined ? `${series.day} · ${label(series.hours[i])} ET` : '';
              },
              label: item => `${item.dataset.label}: ${item.parsed.y} min`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: c.grid },
            ticks: { color: c.textColor, callback: v => v + 'm', font: { size: 9 }, maxTicksLimit: 5 }
          },
          x: {
            grid: { color: 'transparent' },
            ticks: { color: c.textColor, font: { size: 9 }, maxRotation: 0 }
          }
        }
      }
    });
  }

