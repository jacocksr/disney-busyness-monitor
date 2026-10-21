# Project Status — Disney World Park Pulse

Last updated: October 21, 2026. Release-candidate documentation; PR #3 is not recorded as merged.

## Start Here

The calendar and presentation milestone is under review in [PR #3](https://github.com/jacocksr/disney-busyness-monitor/pull/3), branch `calendar_update`, targeting `main`.

Use the actual current branch source before editing. Older attachments and generated candidates are not authoritative code. The owner has reviewed the frontend locally and will perform further browser checks; do not imply unattended background work or unperformed tests.

## Source and Deployment Checkpoint

| Item | Last verified state |
|---|---|
| Repository | `jacocksr/disney-busyness-monitor` |
| Working branch | `calendar_update` |
| PR | #3, Calendar update; open and unmerged at documentation preparation |
| Last GitHub-reviewed PR head | `4c9311917d61920ee6d4c4b7169ca56f68451255` |
| Last GitHub-reviewed main | `0ab07cb3b4fc491c6670d251e9130e1cdfd3d512` |
| Pages publishing | `main`, repository root; no configuration change requested |
| Frontend live URL | https://jacocksr.github.io/disney-busyness-monitor/ |
| Calendar backend | Separately owner-deployed; API/bootstrap behavior owner-verified |
| Final focus correction | Source-reviewed from owner's October 21 paste; not present at the last reviewed PR head above |
| Calendar production frontend | Not recorded as merged, Pages-deployed or independently production-verified |

These SHAs are inspection checkpoints, not a claim the branches cannot advance. The owner must commit the pasted focus correction and these documentation changes to `calendar_update`; establish the resulting head before final review. No future commit, merge SHA, deployment time or new Worker version is invented here.

Both `160-history-calendar.css` and `170-header-layout.css` were initially committed to `main` while the HTML/JS work was on the feature branch. The owner synchronized the branch; both files now exist at the reviewed PR head. Do not delete or recreate them from old attachments. The reviewed diff of `170-header-layout.css` is a line-ending conversion, not a redesign.

## Previous Accepted Frontend Release

- PR #2 merged October 19, 2026, at 19:37:12 UTC (3:37:12 PM EDT), by `jacocksr`.
- Merge commit: `738ec44d8067d3d2e80a4f44899e379bcf2b0b44`.
- Merged development head: `52592d89884fd854a9cffa2821e0d894b2d1af7b`.
- Pre-merge main: `4552f0b5561c244c49a185d5fce573594ab7e868`.
- Owner reported the live site clean at approximately 3:39 PM EDT on October 19.
- PR #1 was closed without merge and superseded by PR #2.
- The completed refactor branch is not the branch for new calendar work.

GitHub merge verification and owner live review are different evidence. No independent complete assistant production-browser audit or Pages-job verification is claimed for that checkpoint.

## PR #3 Candidate Changes

### History Interface

- Primary modes: `🎢 Ride Waits Today` and `📅 Explore Recorded History`.
- Today retains the existing hourly heatmap, table IDs/listeners, mobile scrolling and closure context.
- Explore History adds a monthly calendar, park-average/qualifying-attraction selection, bounded month navigation and synchronized park selection.
- Calendar cells display whole minutes using `Math.round`; API data and calculations retain their precision. Other historical summary values can retain a decimal place.
- Five stable calendar bands use absolute average minutes: below 15, 15–below 30, 30–below 45, 45–below 60, and 60 or more. They are not crowd-score or attendance tiers. Banding uses unrounded values.
- Missing summaries and future dates are neutral; today is partial; future dates are not forecasts.
- Month navigation sits directly above calendar headings/cells. Metric, coverage and snapshot details are behind a keyboard/touch-accessible information disclosure, with the icon at the card's top-right corner.
- Park-date lists reuse queue table/row/wait-pill styling, real available land labels, search and sorting. Queue badges use the existing shared `getWaitPillStyle`: at most 15 green, at most 45 yellow, otherwise red. These thresholds are intentionally separate from calendar bands.
- Last Seven Days and weekday patterns remain in a secondary disclosure; Recent 7 days is an access shortcut, not a replacement data source.

### Existing Shared Ride Modal

- Calendar/date selections use the existing standby modal and closure-aware chart renderer rather than a separate calendar Chart or dialog.
- The bridge preserves the explicitly requested day, validates ride/date responses, converts epoch seconds to milliseconds, and guards against late responses affecting a different/closed state.
- Normal standby openings retain their original archive loader and navigation behavior.
- Calendar openings fetch exact ride/date data on demand; no graph does not trigger a substitution of today.
- Original day arrows operate within the known summary/requested-date set; unloaded detail dates are fetched when selected.
- Weekday aggregates are explained as multi-date values, not an invented dated time series.
- Historical positive-wait summaries stay distinct from current wait/status, plotted zero waits and closure reports. Missing current attraction metadata is unavailable, not an invented closure.
- The October 21 owner-pasted correction forwards `restore` from `closeGraph` to `closeRideModal` and makes the close wrapper honor it. Normal close restores focus; park-change close can suppress restoration. Commit verification and owner browser validation of this last correction remain separate tasks.

### Presentation and Weather

- Brand badge: `✨ Disney World Park Pulse`.
- Hero heading: `Your Best Disney Day` / `Starts Here`.
- Tagline: `Live wait times. Smarter park choices.` / `More time for the magic.`
- Title Case is the convention for headings; the user-supplied descriptive tagline intentionally uses sentence case.
- Theme-specific warm/cool headline gradients preserve the accepted dark palette and end the light cool gradient in blue `#168bea`.
- Correct `.hero` wrapper nesting is restored; the wrapper includes park icons, update/timezone controls and stale-data notice. `.container` continues through the footer.
- Mobile hero/banner spacing is tighter. `--card-gap: 1.25rem` controls outer card/section gaps without forcing equal heights or changing desktop park columns.
- Main chart heading: `📈 Today’s Wait Pulse`; Choose Your Park uses the owner's globe prefix.
- Weather glance trims an observation description and omits the description suffix when blank, retaining available temperature, wind/humidity, source timestamps and forecast. It does not substitute a forecast description for an observed condition or remove missing/stale-data safeguards.

## Backend Dependency and Verification

Queue origin: `https://wdw-queue-probe.jacocksr.workers.dev`.
Weather endpoint: `https://park-pulse-weather.jacocksr.workers.dev/api/weather`.
Both Workers share `env.DB` bound to `wdw-busyness-db`; existing five-minute schedules are owner-reported.

Calendar addition was made against owner-supplied queue Worker v3.7 and deployed separately by the owner. No formal new Worker version was assigned. Weather source remains the supplied v1.1 reference; frontend weather copy changes do not deploy a weather Worker.

New dependency routes:
- `/api/history-calendar?month=YYYY-MM` — reusable stored month snapshot.
- `/api/ride-history-day?ride=ID&day=YYYY-MM-DD` — exact archive date, or today's rolling readings; epoch-second points.

Existing routes remain compatible. The original `/api/ride-history?ride=ID` returns its limited recent archive set; it is not the new exact-date endpoint.

October 20 owner checks established:
- September snapshot: `2026-10-20T19:45:31.975Z`.
- October snapshot: `2026-10-20T19:50:31.596Z`.
- Manifest: `bootstrap_next:null`, updated `2026-10-20T19:50:32.992Z`.
- September contained September 29–30 daily summaries without detailed graphs; metadata resolution was complete for that snapshot.
- Monthly, exact archived-date, summary-only and today's rolling-history requests returned the expected results, according to the owner.

The calendar backend uses daily summaries, one bounded monthly build per scheduled invocation, persistent namespaced cache snapshots and parameter-aware edge caching. Public misses do not rebuild raw history. No new migration/index/cron/service/Pages change is required by this frontend PR.

Do not claim long-term quota safety from those checks: calendar logs do not include the whole queue/weather workload. Shared D1 usage, overnight archive behavior and scheduler concurrency have not been comprehensively certified. Backend source/configuration/migrations remain a reproducibility gap in the repository.

## Source Ownership

| File | Responsibility |
|---|---|
| `index.html` | Markup, correct wrapper hierarchy and ordered asset references |
| `assets/js/10-core.js` | Shared state, core charts, queues, history/navigation and original heatmaps |
| `assets/js/20-weather.js` | Weather view model, display, freshness/polling and missing-description handling |
| `assets/js/90-closure-history.js` | Closure UI, effective ride-chart renderer, overlays, motion and lifecycle wrappers |
| `assets/js/120-history-calendar.js` | Calendar, caching, exact-date bridge and local focus behavior |
| `assets/css/160-history-calendar.css` | Scoped history/table/calendar layout, digit fitting and information-icon placement |
| `assets/css/170-header-layout.css` | Hero gradients/type, mobile spacing and shared card-gap token |
| `assets/js/100-event-catalog.js` / `110-event-details.js` | Maintained event information and disclosure presentation |

Inspect the effective wrapper chain before changing shared functions. No async/defer/module conversion or script reordering is authorized by this release. Relative `assets/` and `images/` paths must remain valid beneath the Pages project prefix.

## Validation and Evidence Boundaries

The owner prefers to perform browser testing locally; provide source-reviewed changes and record the owner's actual results. Do not launch or claim a new assistant browser test cycle by default.

- PR #3 source was inspected through `4c931191...`; existing GitHub check runs at that checkpoint were zero, not a passing CI suite.
- The latest pasted focus correction is source-reviewed only, not independently commit-verified or browser-tested.
- The owner reviewed calendar/UI iterations locally and provided screenshots/feedback. That is not proof every feature-register check passed or that the release is live through Pages.
- Initial calendar candidate: 45 controlled browser checks repeated over four viewport/theme configurations (180 assertions), with fixture hooks, intercepted APIs and stubbed Chart construction. Not full-site/real-Chart rendering parity.
- Revision 2 assistant browser work stopped at an unresolved fixture mobile-overflow check; no completed revision-2 regression-suite pass is claimed. The owner subsequently reviewed the files locally and requested the later refinements.
- Backend add-on checks and owner API checks are separate from frontend evidence; do not combine them into an exhaustive total.

Historical PR #2 evidence remains in CHANGELOG: original extraction reconstruction/12 syntax checks; compact 56 comparisons; separate broader 88-checkpoint stage; banner, marker, inline-panel, timestamps and motion checks with their stated fixture limits. These are historical results, not checks of the new PR head.

Preserve `tests/reference.html`, `source-manifest.json`, `VALIDATION.md` and old JSON evidence. Intentional changes make original byte/pixel parity unsuitable as a current pass/fail gate; do not rewrite the original baseline to hide expected differences.

## Known Limitations and Follow-Up

1. Final owner-pasted focus correction and this documentation package require commit verification.
2. No post-merge Pages deployment or calendar production-browser confirmation is recorded.
3. Month snapshots are reused in-session until explicitly refreshed/evicted; no background history poll is added. Calendar rounding can differ slightly from a detailed value/color boundary.
4. Older graph dates do not establish complete closure-event coverage; no shading is not proof of no interruptions.
5. Maintained classification patterns are limited. Some theater-style experiences fall through to standard in both frontend and backend. Do not silently expand exclusions or change denominators in this release.
6. Existing crowd-score wording/band inconsistencies, schedule validation, main refresh lifecycle, general modal accessibility and wrapper/CSS consolidation remain separate work. The previous best-park tier fall-through bug was fixed in PR #2.
7. Version production backend source/nonsecret configuration/schema in a separate reviewed task; do not reconstruct deployed code from summaries.
8. Active-alert fixtures, comprehensive keyboard/accessibility coverage, real-Chart/full-site regression, concurrency and long-duration D1 usage remain limited or unverified.

## Next Actions

1. Commit the owner's focus correction and documentation updates on `calendar_update`, not directly on `main`.
2. Inspect the new head and final diff; record exact source-review scope without asserting unrun checks.
3. Owner performs focused local checks, including normal close versus park-switch focus and exact-date/no-graph behavior.
4. Keep PR #3 open until explicitly accepted. No merge/deploy action is authorized by documentation preparation.
5. After an approved merge, record the actual merge SHA/time, inspect Pages delivery and record the owner's live check. Do not prefill those facts.
6. Future development starts from the actual accepted `main`; preserve unrelated commits during rollback.
