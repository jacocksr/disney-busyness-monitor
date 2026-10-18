# Feature-preservation register — Disney World Park Pulse

Last updated: 2026-10-18.

## Policy
Preserve every existing feature unless the owner explicitly approves a change or removal. This is a baseline inventory, not a guarantee of complete correctness. Existing defects belong in PROJECT_STATUS.md and must not be fixed silently during unrelated refactoring.

For each change: identify affected IDs, inspect dependencies, compare the accepted source, run applicable tests, record manual evidence and state untested scenarios. No removal of code or UI is justified solely because it is missing from this register; inspect and extend the register if additional functionality is found.

## Features
| ID | Feature and behavior to preserve | Acceptance checks |
|---|---|---|
| F01 | Theme: saved/system selection, toggle, palettes and motion preference | Both themes; reload preference; chart readability; no theme flash regression |
| F02 | Time display and freshness: display-zone choice, source timestamps, loading/unavailable/stale notices and retry behavior | Different time zones; initial failure; delayed data; recovery; source age distinct from fetch time |
| F03 | Four-park overview and synchronized selection: cards, icons, metrics, comparisons, best-park banner | Select each park; table/chart/weather/closure selection remains coherent; repeated rendering does not duplicate content |
| F04 | Operating schedule and phase: hours, Early Entry, before-open, open, closed, clearing queues and ticketed event presentation | Missing/dated hours; phase boundaries; access wording; post-close and next-day handling |
| F05 | Attraction table: search by name/land, sorting, mobile presentation, standard/special grouping, operating statuses and popup launch | Search/reset; sort fields/directions; expand scheduled experiences; open a row; long names remain usable |
| F06 | Wait calculations and historical comparisons: effective positive-wait filters, matched sets, equal ride weights, sample gate, coverage and typical band | Zero/null/closed/alternate queues; partial baselines; no data; insufficient history; correct matched denominator |
| F07 | Park wait trends: today versus typical, coverage context, main chart and park popup | Same captured data yields same series/labels; no artificial zero during closures; modal opens/closes; themes |
| F08 | Ride history: rolling readings, daily archive, previous/next navigation, average/peak summaries and sparklines | Today and previous available day; empty/partial/archive-failure cases; return to today; consistent units |
| F09 | Three heatmap views: today/hour, date-specific last seven days, weekday aggregation | Correct headings/calendar semantics; sorting; missing values; mobile scroll; long names; cells open expected details |
| F10 | Weather: card readings, glance/detail, park switching, feels-like/wind/humidity, forecasts and alerts | Captured observations/forecasts; expanded browsing; source timestamps; no alerts; missing/stale/provider error; alert fixture when available |
| F11 | Current closures and classifications: temporary, refurbishment, unknown start, scheduled/limited experiences | Counts/groupings stay distinct; current feed and historical records are not conflated; logical attraction grouping retained |
| F12 | Closure history: today/week/seven-day periods, timelines, ride links, uncertainty and coverage | Switch periods/parks; interrupted and ongoing episodes; truncation/coverage notices; sampled bounds not exact cause claims |
| F13 | Closure chart/heatmap overlays: markers, grouped park annotations, ride shading, legends and direct links | No duplicate annotations after refresh; wait values/colors retain meaning; open correct ride details; gaps handled conservatively |
| F14 | Events/festivals: schedule enrichment, explicit date/park matching, admission distinctions, expandable brief and official links | Identified and unknown event; member versus paid ticket; included festival; long titles; expand/close; no season-based invention |
| F15 | Disclosures and navigation: expand/collapse, card actions, keyboard sorting/scrolling, visible focus, modal closing and reduced motion | Mouse/keyboard; repeated park changes; Escape; no accidental nested actions; actual accessibility gaps remain tracked |
| F16 | External dependencies, attribution and static paths: Chart.js, fonts, provider attribution, park images and relative asset references | Actual Pages prefix; no missing assets; retained provider links; unavailable dependency behavior documented |
| F17 | Refresh lifecycle and resource behavior: polling, prior snapshot retention, independent weather/closure data and source freshness | Initial load, repeat refresh, failures/retry, no duplicated DOM or unnecessary backend changes |
| F18 | Backend/collector continuity: queue/weather Workers, shared D1, static Python collector and automation | No accidental source/config/schema/workflow edits during frontend-only work; explicit review for any future backend change |

## Current evidence
- Original inline code retained verbatim in 12 JavaScript and 16 stylesheet files; byte-identical reconstruction passed.
- Delivered browser suite: 56 matching checkpoints across two widths and two initial themes. Actual Chart.js replayed from the HAR.
- Compact suite covers park selection, search, heatmap modes, expanded weather/closures, ride popup open/close and theme toggle. It does not individually prove every acceptance check above.
- Owner reports clean local rendering with images, functional ride popup and other functionality appearing to work as intended.
- Earlier broader working-environment checks are documented separately in PROJECT_STATUS.md; do not present them as part of the shipped compact runner.

## Coverage still to extend
Successful archived response replay; active alerts; complete keyboard/focus behavior; animation fidelity; full screenshot parity; all operating-phase edges; prolonged refresh/recovery; backend integration/concurrency. Manual popup confirmation is valuable but is not a recorded archive-response fixture.

## Change review checklist
- [ ] Starting branch/commit identified and current files inspected.
- [ ] Affected feature IDs and dependency files listed.
- [ ] No intentional behavior changes hidden inside structural cleanup.
- [ ] New/modified/deleted files reviewed; any removal justified.
- [ ] Relevant automated checks actually run and results recorded.
- [ ] Owner review recorded separately from automated tests.
- [ ] Known defects and untested scenarios explicitly noted.
- [ ] No credentials or raw private browser logs committed.
- [ ] Deployment/rollback status updated after acceptance.
