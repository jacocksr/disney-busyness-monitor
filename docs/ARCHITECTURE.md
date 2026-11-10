[Uploading ARCHITECTURE.md…]()
# Architecture — Disney World Park Pulse

Last updated: November 9, 2026, after the frontend consolidation cleanup (24 scripts → 6; 21 stylesheets plus runtime-injected CSS → 6). PRs #3–#6 are merged; see [CHANGELOG.md](CHANGELOG.md).

## System Overview

The static browser frontend requests public read APIs from separate queue/history and weather Workers. Both Workers use a shared Cloudflare D1 database; the browser never connects directly to D1.

```text
GitHub Pages (main, root) / owner local static server
                         |
                  index.html + assets
                   /              \
       Queue/History Worker      Weather Worker
                   \              /
                   Shared D1 database
```

The repository's Python collector is a separate static JSON/JSONL pipeline, not a replacement implementation of the production Worker contracts. Static hosting does not start a Worker or make the dashboard offline-capable.

## Repository Boundaries

- `index.html`: markup, inline event handlers and asset references. Only `assets/js/boot.js` loads in `<head>`; Chart.js and the five application scripts load at the end of `<body>`.
- `assets/js/`: six feature-grouped classic scripts (see below). They replaced 24 numbered patch files in the November 2026 cleanup.
- `assets/css/`: six feature-grouped stylesheets. They replaced 21 numbered layers, an unused `merged_css.css`, and the eight blocks of CSS that scripts used to inject at runtime.
- `images/`: park PNGs, logos and icons; keep document-relative names and capitalization.
- `docs/`: current state, architecture, preservation register and release history.
- `tests/`: frozen original HTML, extraction verifier, HAR replay and historical results. These reference the pre-cleanup numbered files and are historical evidence, not a current regression suite.
- `source-manifest.json` / `VALIDATION.md`: original extraction evidence, not current-release integrity or pass/fail claims.
- `data/`, `scraper_collector.py`, `.github/workflows/update_wait_times.yml`: separate Python collection path. The frontend does not read `data/`.
- Production backend source, nonsecret configuration and migrations are not in this repository. Public endpoint addresses are not credentials.

## JavaScript Ownership and Loading

Scripts are classic scripts, not ES modules, and share top-level globals (`parkData`, `currentPark`, `dayNavState`, etc.). Load order matters: `core.js` must load first because it defines the shared state and the `PPUI` hook registry.

| File under `assets/js/` | Loaded | Responsibility |
|---|---|---|
| `boot.js` | `<head>` | Saved/system theme before first paint; Animations preference (`window.ParkPulseMotion`) |
| `core.js` | body | Shared state, API fetching, timestamps, park selection, queue table, charts, day navigation, heatmaps, best-park logic, positive-wait averages and matched comparisons, `PPUI` registry |
| `park-cards.js` | body | Weather view model and polling, park cards (descriptors, weather pills, compact labels, hours strips), disclosure animation, table navigation, park-wide wait popup |
| `history.js` | body | Closure history (`PPUI.closures`), event catalog (`ParkEventCatalog`), event detail briefs, monthly history calendar (`PPUI.history`) |
| `effects.js` | body | Score/gauge animation and celebration effects (`PPUI.gauges`) |
| `app-shell.js` | body | Navigation shell and tabs (`PPUI.navigation`), compact overview (`PPUI.overview`), header status badge and theme control (`PPUI.statusBadge`, `PPUI.theme`), settings, header logo, park picker and context cards (`PPUI.contextCards`) |

### One definition per function

Earlier releases changed behavior by reassigning global functions in later files (`renderCards` was wrapped eight times). Each public function now has exactly one definition, and later features plug in through optional hooks on `PPUI`. A hook that is not installed is skipped, so each feature file can be removed or debugged in isolation.

Effective call order:

- `renderCards()`: unavailable state, or `renderParkCards` → `PPUI.refinePulseCards` → `PPUI.applyWeatherPills` → `PPUI.shortenCardLabels` → `PPUI.addHoursStrips`; then `closures.renderAvailability`, `enhanceEventCards`, `gauges.sync`, `overview.scheduleRefresh`.
- `selectPark(key)`: `navigation.canSelect` guard → `gauges.enterSelection` → apply selection, weather, `closures.onParkSelected` → `gauges.exitSelection` → `gauges.afterSelection` → `history.syncPark` → `navigation.afterSelect`.
- `renderAll()`: core renders (or unavailable state) → `navigation.afterRenderAll` → `overview.scheduleRefresh` → `statusBadge.queueRefresh`.
- `updateTimestamp()`: timestamp badge, weather, `cards.refreshOnClockChange`, `closures.syncTimeZone`, `overview.scheduleRefresh`, then always `statusBadge.refresh`.
- `fetchLatestData()`: live data, then always `closures.load`.
- Charts and heatmaps: `renderChart` → `closures.attachParkChart`; `renderHeatmapTable` → `closures.decorateHeatmap`; ride-history charts render through `closures.renderRideChart`.
- Day navigation: `initDayNav` asks `history.initDayNav` first; `renderDayNav` ends with `closures.afterDayNav` and `history.afterDayNav`; `closeRideModal(restore)` calls `history.afterRideModalClose`.
- `openParkWaitModal()`: `closures.beforeParkWaitModal` → `showParkWaitModal` → `closures.afterParkWaitModal`.

To change a behavior, edit the single function or hook named above rather than adding a wrapper in a new file.

Some modules still use `MutationObserver` to re-decorate DOM written by another module (overview cards, park picker, header logo on theme change, heatmap headers). These are the remaining cross-module couplings; replace one with an explicit hook only after confirming every code path that mutates the observed element.

## Styles and Markup

Stylesheets load at the end of `<head>` in this order; later files intentionally refine earlier ones:

| File under `assets/css/` | Contents |
|---|---|
| `base.css` | Tokens, layout, hero/header, panels, queue table, modals, light/dark theme |
| `weather-and-tables.css` | Weather glance/details, mobile tables, wait-color contrast |
| `park-cards-and-closures.css` | Park cards, score layout, closure panels, pills and icons, event details |
| `history-calendar.css` | Heatmap names, disclosure animation, monthly calendar and history lists |
| `effects.css` | Gauges, score animation, celebration effects, Reduced Motion |
| `app-shell.css` | Navigation shell, compact overview, status badge, settings, header logo, park picker, context cards |

No script injects `<style>` elements any more; all presentation lives in these files. Declarations that were always overridden later in the cascade, empty rules and selectors that matched nothing in any tested state were removed during consolidation.

The title-line spans supply their own theme-specific background-clipped gradients; the parent heading's old gradient is reset. Light cool endpoint is `#168bea`; dark gradients remain separate.

Spacing is scoped: the overview grid and `.content-grid` use the gap token; major direct-child panels own a top gap and no competing bottom gap. Do not blanket-reset all `.panel` margins or force equal card heights.

## Asset Paths

Keep:
- `images/MKEmoji_1_1023x1023.png`
- `images/EPCOTEmoji_1_1023x1023.png`
- `images/HSEmoji_1_1023x1023.png`
- `images/AKEmoji_1_1023x1022.png`

Pages uses `/disney-busyness-monitor/`. Keep `assets/...` and `images/...`, not domain-root `/assets/...`. Preserve case and genuine images. The document also loads Chart.js and web fonts externally; their network failures are separate from API availability.

## API Contracts

Queue origin: `https://wdw-queue-probe.jacocksr.workers.dev`.
Weather endpoint: `https://park-pulse-weather.jacocksr.workers.dev/api/weather`.

| Route | Contract | Successful Worker cache TTL |
|---|---|---|
| `/api/live-wait-times` | `updated_at`, `parks[key]`, rides/status/hours/score | 60 s |
| `/api/history-24h` | `rides[id].points` as `[ISO timestamp, wait]`, optional hours metadata | 120 s |
| `/api/historical-summary` | Weekday/hour positive-wait buckets, recent summaries and dated `daily_heatmap` | 900 s |
| `/api/ride-history?ride=ID` | Original `{ride,days}` archive response, latest 14 day rows; epoch-second points | 600 s |
| `/api/closure-events` | Schema 1, tracking/coverage, episodes and sampled timing/uncertainty | 120 s |
| `/api/history-calendar?month=YYYY-MM` | Schema 1, month, timezone, snapshot time, metric/coverage, rides/parks daily summaries and available-history bounds | 300 s |
| `/api/ride-history-day?ride=ID&day=YYYY-MM-DD` | Schema 1, requested ride/day, status `available` or `no_graph`, source, partial, epoch-second points | 60 s today; 600 s past |
| Weather `/api/weather` | Schema 1, observations, forecasts, alerts, collection errors/freshness | 60 s |

Calendar APIs were owner-deployed separately; they are dependencies, not code deployment performed by merging the frontend. Existing endpoint contracts remain compatible. New routes use parameter-aware canonical cache keys; do not reuse the old fixed-route cache helper that discards query parameters.

A successful response/cache timestamp is not proof of fresh or complete source observations. Preserve provider timestamps and stale/unavailable warnings. A 503 `preparing` response is honest initialization/unavailability, not a public invitation to build raw history.

## Calendar Read Path and Semantics

```text
Existing collection -> completed-hour/day rollups -> stored month snapshots
                                                 -> edge cache -> browser cache
Exact graph selection -> indexed ride/date archive OR today's rolling-history blob
```

Scheduled Worker maintenance builds at most one month per invocation from `ride_day_summary`, not raw `queue_times`. Rollups/archive chunks atomically mark their affected month dirty. Historical bootstrap progresses with a stored cursor; failed generation retains retry state/prior snapshots. Indexed ride/date checks establish archived graph availability per summary row. Public misses only read stored blobs/points.

Persistent keys: `calendar:v1:manifest`, `calendar:v1:month:YYYY-MM`, `calendar:v1:dirty:YYYY-MM`. Snapshots are bounded by a 1,500,000 UTF-8 byte guard. Edge caches are not durable globally replicated storage; misses may read D1. Shared usage must include BOTH queue and weather workloads. Calendar meta logs do not account for every existing-batch operation.

The browser:
- Defers history requests until requested; reuses one month across parks and rides.
- Keeps up to six month promises, evicting failures/older entries; explicit Refresh History re-fetches.
- Keeps up to 24 ride/date request entries; fetch-cache lookup TTL is one minute today/five minutes past. An open modal retains already-loaded date responses until explicit refresh or state replacement.
- Adds no five-minute monthly-history polling loop.
- Limits month navigation by supported bounds. Startup can try the previous month once when the current month is unsupported, not an arbitrary backwards scan.

Daily attraction average: positive open readings from completed hourly rollups. Park average: equal-weight mean of qualifying ride-day means, not pooling every sample. Classification exclusions are maintained name patterns; corrected Worker standard OR refurbishment eligibility aligns with the frontend's standard historical inclusion approach. Do not silently exclude all theaters or redefine the denominator.

Calendar colors are fixed absolute minute bands. Cell text is rounded to whole minutes; underlying values/thresholds remain precise. Queue-list pill colors intentionally use the existing three-band helper. Neither is an attendance percentile, forecast or crowd score. Today is partial; a past row/sample count does not establish full-day completeness. Missing/future values are not zero/short waits.

## Shared Ride-Modal Bridge

Existing core state is `dayNavState[kind]` with `rideId`, `archived`, `series`, `days`, `selected`. The calendar plugs into core day navigation through the `PPUI.history` hooks listed above.

A synchronous pending calendar intent creates marked `_ppHistory` state for a requested ride/date. This avoids invoking the old limited archive loader on a calendar open. Original `renderDayNav` then renders through the same closure-aware `renderSparkline` implementation as standby clicks. The add-on does not create its own Chart or dialog.

Exact-date responses are checked for matching ride/day and epoch-second units, then converted to milliseconds for the shared renderer. State identity and per-date tokens prevent stale completion from overwriting another state or reopening a closed modal. Marked rebuilds preserve the selected date; normal standby initialization/archive behavior remains unchanged.

The original arrows navigate the marked state's known summary/requested dates and load details lazily. No graph stays on its requested date and can still show summary statistics. Historical positive-wait averages are labeled separately from current live wait/status; zero waits remain in plotted readings. Missing live ride metadata is unavailable, not proof of current closure.

Legacy dated comparison cells use the current Eastern seven-day column generation from core, not blindly a stale API `days` array. Weekday aggregates are explained as multi-date values; the modal plots an explicitly selected actual date, not a fictitious weekday time series.

`closeRideModal(restore)` forwards the restore flag to `PPUI.history.afterRideModalClose`. Normal close restores the originating control; park-change close can suppress it.

## Closure Behavior and Coverage to Preserve

The shared closure renderer provides the familiar gradient fill, linear time axis, theme-aware tooltips, gap handling, shading and controls. Its scope uses the requested `dayNavState.selected`. Missing observations and absent returned events are not proof of no interruption, especially outside the closure response horizon. The calendar adds explanatory context but does not backfill closure data.

Preserve the PR #2 behavior:
- Independent main/park-modal panel state scoped to park/day.
- Distinct-ride disclosure count versus markers, episodes and currently closed counts.
- Nearest-marker selection, hourly filtering, selected ring and Show all today.
- Current reported status separate from historical episode timing; multiple episodes and ride links.
- Feed `last_updated` in fresh Reported Open labels, not current clock/reopening time.
- Viewport-bounded park modal, visible close/header, body scrolling and compact metrics.
- Approximately 320ms open/260ms close wrapper motion, reversals, nested resize, inert closing content, focus return, same-scope refresh retention and Reduced Motion.
- Display-time changes repaint labels/visible history without turning a presentation action into another historical data fetch.

## Weather Description Handling

Observation `description` is optional independently of temperature, wind/humidity and forecast periods. The candidate trims the description and omits the suffix when blank; existing no-observation and stale/collection-error handling remains. It never calls a forecast 'Sunny' description an observed station condition. This is a frontend display change; neither provider normalization nor Worker collection is changed.

## Workers, D1 and Preservation Boundaries

Reference baseline: owner-supplied queue v3.7, followed by the separately deployed calendar addition; weather v1.1. No formal new queue version number was assigned. Both use `env.DB` -> `wdw-busyness-db` and owner-reported five-minute cron triggers.

Queue tables: `queue_times`, `ride_hour_summary`, `ride_day_summary`, `rollup_state`, `ride_day_points`, `closure_tracking_state`, `ride_closure_events`. Weather tables: `weather_locations`, `weather_collection_state`, `weather_observations`, `weather_alerts`, `weather_alert_locations`. Shared `api_cache` keys are namespaced. Do not modify Cloudflare `_cf_KV`.

Preserve the closure revision guard and its nonnegative CHECK, archive chunking/jobs/repair, raw fallback behavior on original routes, timestamp units, rollup inclusion/cursor and collection cadence. No new schema/index/service or weather deployment is required by this frontend release. Verify source before proposing backend changes; do not reconstruct deployed source from documentation.

## Development, Evidence and Release Workflow

Future tasks start from the actually accepted `main` on a fresh task branch. Serving static files locally still calls configured remote APIs. Optional server commands run in a shell, not a browser console: macOS `python3 -m http.server 8000 --bind 127.0.0.1`; Windows with Python launcher `py -m http.server 8000 --bind 127.0.0.1`.

Owner preference is local owner-led browser validation with assistant source review. Record actual checks and limitations; do not claim a passing test suite from syntax review, screenshots or zero GitHub check runs. Earlier fixture/HAR evidence is historical. The revision-2 browser attempt did not complete a passing regression sequence.

Preserve `tests/reference.html`, `source-manifest.json`, `VALIDATION.md` and old JSON evidence. Original reconstruction/pixel checks intentionally differ after accepted edits; create separately named later baselines rather than rewriting old evidence. Keep private/raw HARs local unless sanitized. Do not commit secrets, caches or temporary artifacts.

Pages publishes `main` at `/ (root)`. The presence of assets on main, a feature-branch upload, a PR merge and a completed Pages deployment are different facts. After explicit acceptance, record actual merge/deployment identifiers and owner live review; none is prefilled for PR #3. Preserve unrelated commits during rollback, and keep Worker/API rollback separate from frontend rollback.
