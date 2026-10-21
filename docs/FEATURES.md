# Feature-Preservation Register — Disney World Park Pulse

Last updated: October 21, 2026. Includes the PR #3 candidate; not a claim of merge, production verification or completed acceptance checks.

## Policy

Preserve every existing feature unless a behavior change/removal is explicitly approved. This inventory is not a guarantee of correctness; absence from the register is not permission to remove behavior. Existing defects belong in PROJECT_STATUS, not silent fixes during unrelated presentation work.

Identify affected IDs, inspect effective source/wrappers, provide source-reviewed changes, record the owner's local results and state unverified scenarios. The owner currently prefers to run browser testing; do not require a new assistant browser cycle for each edit. Record automated checks only if actually performed, with their scope.

## Features

| ID | Feature and Behavior to Preserve | Acceptance Checks / Owner Review |
|---|---|---|
| F01 | Saved/system theme, toggle, palettes and motion preference; candidate adds distinct readable hero gradients per theme | Both themes; saved reload; no theme flash; chart readability; light cool endpoint remains `#168bea` |
| F02 | Display-time preferences, source timestamps, loading/stale/unavailable notices and recovery | Multiple zones/device local; initial failure; delayed data; source age versus request time; presentation changes do not create unnecessary fetching |
| F03 | Four-park overview, icons, metrics/comparisons, best-park banner and synchronized selection | Each park updates queue/chart/weather/closure/history consistently; no duplicate controls or unsupported rankings |
| F04 | Hours, Early Entry, before/open/closed/clearing phases and ticketed schedules | Missing/dated hours; boundaries; access distinctions; final queues; next day; preserve known limitations for separate review |
| F05 | Search/sort attraction table, land information, standard/special grouping, statuses and native ride modal | Filter/reset; sort/direction; expand special group; keyboard and row open; long names |
| F06 | Positive-wait eligibility, matched-set comparisons, equal weights, sample gates and typical bands | Zero/null/closed/alternate queues; partial baseline; matched denominator; no silent metric/classification changes |
| F07 | Today versus typical park wait trends, coverage context, main chart and park popup | Same source yields same series; no invented zero at closures; theme/zone and modal behavior; new heading is presentation only |
| F08 | Rolling/archive ride history, previous/next navigation, average/peak and shared renderer | Today and past; empty/one point/null/zero/error; return to today; seconds versus milliseconds; ordinary standby path preserved |
| F09 | Original hourly, dated Last Seven Days and aggregate weekday heatmaps remain accessible | Today is primary; daily/weekday secondary; sorting, scrolling, markers and title/date semantics; dated cell opens that column's actual day |
| F10 | Independent weather glance/details, card weather, forecast/alerts, timestamps and freshness | Partial observations, blank/whitespace description, valid temperature with no description, no observations, stale/errors; no forecast-to-observation substitution; alerts fixture still limited |
| F11 | Current closure classification and grouping: temporary, refurbishment, unknown starts, scheduled experiences | Current feed separate from durable episodes; logical railroad grouping; no special-experience inflation of temporary counts |
| F12 | Today/week/seven-day closure history, timelines, ride links, uncertainty and coverage | Period/park changes; interrupted/ongoing; truncation/start coverage; no inferred exact transition or cause |
| F13 | Park markers, per-ride shading, gap handling, legends and direct graph links | No duplicate annotations; counts distinct; shared renderer on calendar opens; absent shading is not full historical coverage |
| F14 | Event/festival enrichment with explicit dates/parks, admission distinctions and official links | Known/unknown; complimentary-member versus paid versus included; no seasonal invention/live inventory claim |
| F15 | Disclosures, card navigation, focus, modal closing, keyboard controls, Reduced Motion | Mouse/keyboard/Escape; info disclosure accessible without hover; normal history close restores focus, park-change close suppresses old-row restoration; pending correction needs committed/local verification |
| F16 | Chart.js/fonts, provider attribution, park PNGs and document-relative assets | Pages prefix/case; dependency failures; both new CSS and calendar JS load; sources retained |
| F17 | Refresh lifecycle, retained prior snapshots, independent weather/closure and resource discipline | Repeat refresh/failure/retry; no duplicate DOM; month reused across parks/rides; no added five-minute monthly history polling |
| F18 | Backend/collector continuity: shared D1, queue/weather Workers, separate Python collector and workflow | No unintended migration/index/cron/Worker/publishing changes; backend dependency deployment recorded separately; no secrets |
| F19 | Monthly Explore History calendar, bounded month navigation, park/attraction selector, historical queue-style lists and exact-date bridge | Earliest/latest month; leap/month boundaries; today partial, future/no data neutral; whole-minute cells, precise underlying means; stable colors; search/sort; summary-only date does not substitute today; stale response cannot change another/closed modal |
| F20 | Hero branding, two-line benefit heading, concise tagline, Title Case/emoji headings and consistent card spacing | Correct hero/container wrappers; both gradients; no long-value overlap; info icon does not reserve empty row; `--card-gap` without equal-height forcing; desktop park columns remain |

## History and Metric Requirements

- Existing inclusion rules are limited maintained name patterns; some theater-style experiences remain standard in both frontend and backend. Expanding these exclusions is a separate behavior decision.
- Calendar attraction means use positive open readings from completed hourly rollups. Park-day means weight qualifying attraction means equally, not pooled samples.
- Calendar has five stable absolute minute bands (<15, <30, <45, <60, >=60). Queue pills retain the existing three bands (<=15, <=45, >45). Neither is an attendance or typical-relative crowd scale.
- Cell display rounding does not change stored values, detailed summaries or band thresholds. Preserve zero graph readings; they are not closures and do not enter positive-wait means.
- Past summary/sample presence is not complete-day coverage. Missing/future dates are not zero. Graph availability flags are snapshot-time metadata, not conclusive negative archive proof.
- Calendar selection uses the existing standby modal and closure-aware renderer with the requested date. Ordinary standby initialization remains unchanged.
- Weekday cells summarize multiple dates; the graph must identify its explicitly selected actual day and explain the distinction.
- Current wait/status remains current. A historical average or missing live ride must not be presented as current operation.
- Preserve the native shared modal, asynchronous state/token guards, bounded caches, on-demand fetches, explicit refresh and retry. An old request must not reopen a closed modal or reset another selection to today.

## Evidence and Limitations

### Historical PR #2 Evidence

Original extraction preserved 12 JavaScript blocks and 16 stylesheets with byte-identical reconstruction. The compact HAR-backed suite recorded 56 comparisons across two widths/two themes, replaying actual Chart.js. A separate broader 88-checkpoint stage and later targeted banner/marker/inline/status/motion checks are documented in CHANGELOG and are not additive exhaustive coverage. Owner local review included genuine PNGs, followed by an owner-reported clean live check after PR #2.

The original compact suite covered park selection/search/heatmap modes, expanded weather/closures, ride popup and theme. It did not establish every acceptance requirement. Active-alert and successful archive fixtures, broad accessibility, backend concurrency and sustained resource usage remained limited.

### PR #3 Candidate Evidence

The owner confirmed monthly bootstrap, archived-date, summary-only and today's rolling-history endpoint outcomes and reviewed successive frontend iterations locally. The corrected focus functions were source-reviewed in the October 21 paste; commit verification and owner browser behavior of that last change are separate.

Initial calendar component tests used fixture hooks/intercepted APIs/stubbed Chart construction: 45 checks repeated in four configurations, not 180 unique scenarios or a full-site pass. Revision-2 assistant browser work stopped on an unresolved fixture mobile check; it is not a completed passing regression suite. No new browser tests were run for these documentation updates. Last inspected PR check runs were zero.

No full production, real-Chart pixel parity, accessibility, concurrent-scheduler or shared-D1 quota certification is claimed. Do not rewrite original fixtures or historical results to hide expected changes.

## Change Review Checklist

- [ ] Current branch/head/base and any local uncommitted corrections identified.
- [ ] Affected feature IDs, effective wrapper dependencies and complete asset inventory reviewed.
- [ ] No unapproved behavior/denominator/classification changes hidden inside polish.
- [ ] Owner local checks and any actual automated evidence recorded separately, with limitations.
- [ ] Exact-date/no-graph/late-response and normal-close/park-change-focus behavior reviewed.
- [ ] Source timestamps, stale warnings, closure uncertainty and provider attribution retained.
- [ ] No secrets, private raw HARs, generated caches or unrelated files added.
- [ ] Backend deployment distinguished from frontend merge and Pages delivery.
- [ ] Merge/deployment/rollback facts recorded only after the actions occur.
