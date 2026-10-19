# Project status — Disney World Park Pulse

Last updated: 2026-10-19.

## Start here
The frontend organization and closure-interface work is merged. Use the actual latest main source as the starting point for new work. Old candidate ZIPs, attachments and conversation memory are not authoritative code.

## Accepted release
- Repository: jacocksr/disney-busyness-monitor.
- Production source: main, repository root.
- Accepted merge commit: 738ec44d8067d3d2e80a4f44899e379bcf2b0b44.
- Merge verified through GitHub: 2026-10-19 at 19:37:12 UTC (3:37:12 PM EDT), by jacocksr.
- Merged PR: https://github.com/jacocksr/disney-busyness-monitor/pull/2 .
- Merged development head: 52592d89884fd854a9cffa2821e0d894b2d1af7b.
- Original development branch: refactor/frontend-organization; still present at cleanup inspection, now eligible for removal after cleanup. Do not use it as the default branch for future work.
- PR #1 was closed without merging and superseded by PR #2. It is historical review evidence, not an active task.
- Live URL: https://jacocksr.github.io/disney-busyness-monitor/ .
- Owner reported a clean live check on 2026-10-19 at approximately 3:39 PM EDT.
- Verification distinction: merge is GitHub-verified; live behavior is owner-verified. The assistant did not independently perform a fresh full production-browser audit or inspect a Pages deployment run for this checkpoint.
- Pages settings remain deploy from main, / (root). No publishing-setting changes are needed.

This documentation cleanup is prepared against the accepted merge. Its eventual documentation commit will have another SHA. Inspect the actual main head before future changes rather than assuming it remains at the merge commit forever.

## Accepted frontend changes
- Original inline code separated into 12 classic JavaScript files and 16 stylesheet layers; root index.html is 20,743 bytes. No frontend build step is required.
- Best-park banner correctly handles strongly quieter comparisons and uses friendlier copy. Ranking and wait comparison mathematics were not changed by that fix.
- Park-wide closure toggle says Show Closures; larger, contrasting red dots retain recorded-event grouping.
- Accessible inline interruption details provide distinct-ride counts, multiple episode lists and ride-history links.
- Marker taps select the relevant hourly group in that same panel; Show all today clears the filter. Details remain available when markers are hidden.
- Reported Open pills include the ride-feed report time and follow the selected display time zone. They do not identify the exact reopening time.
- Mobile park popup is viewport-bounded with a fixed header and scrolling body; metrics use a compact row.
- Neutral blue/navy and white interruption interiors, red outer frames, and semantic current-status badge colors are retained.
- Main/nested closure details have smooth height/fade opening and closing, rapid-toggle handling and Reduced Motion support.

File separation is complete as a structural milestone; internal consolidation of chained rendering wrappers and overlapping style ownership remains future work.

## Where to edit
- Static page structure: index.html.
- Core/banner logic and configuration: assets/js/10-core.js.
- Weather: assets/js/20-weather.js and relevant CSS.
- Closure data/UI, marker handling, panel state, timestamps and motion: assets/js/90-closure-history.js.
- Closure presentation and modal overrides: assets/css/50-closure-panels.css.
- Maintained event metadata: assets/js/100-event-catalog.js.
- Full map: ARCHITECTURE.md. Preservation obligations: FEATURES.md.

## Evidence and test status
### Historical extraction baseline
- Original source reference: 1c1e016a9f66ace98c5230743d8cd2a576f5aafd.
- Original HTML blob: 2bd7b961f6a02efabe4b7ec0d76b80372062d3e5 (286,870 bytes).
- Initial extraction preserved 28 source blocks verbatim and reconstructed the original exactly.
- The delivered compact suite passed 56 comparisons across two viewport widths and two themes, using captured API/Chart.js/font responses.
- The earlier broader working-environment run reported 88 matching comparisons; it is separate evidence, not additional coverage to add to the shipped runner's count.

### Subsequent targeted checks
- Marker update: 13 checks and five data-preservation comparisons per width/theme configuration; initial click-routing verification called the plugin handler.
- Banner update: 35 controlled logic assertions and syntax checking.
- Mobile inline panel: 36 checks per width/theme configuration, plus empty-state and persistence/stale/time-zone checks; included physical marker taps/clicks.
- Status-time edit: controlled time-zone/freshness checks; later motion checks also exercised the report-time behavior.
- Final smooth-disclosure package: 35 checks at each desktop/mobile and light/dark configuration plus a mobile Reduced Motion run; four extra animation edge checks. These are repeated assertions, not that many independent scenarios.
- Normal-motion tests checked intermediate heights, reversals, nested resizing, cleanup and state/focus retention. Original settled-state comparisons had disabled CSS motion; distinguish the test stages.
- Owner reviewed locally, including actual park PNGs, and subsequently reported clean production behavior after merge.

### Important limitations
- No automatic regression CI was configured in this milestone; pre-merge GitHub check runs were zero. JSON result files are historical local evidence.
- Tests used reconstructed reference pages and fixed captured responses, not a fresh full production audit of every feature.
- Successful archived ride-history responses and active weather-alert fixtures were not captured; manual popup confirmation is not equivalent to that automated coverage.
- No full keyboard/accessibility certification, backend integration/concurrency test or long-duration performance audit.
- Actual PNGs were absent from earlier automated replay; owner checked them manually.
- Not all targeted test harnesses from conversation were committed as runnable tests. Inspect tests/ before assuming any particular regression script is available.

## Preserve the original test evidence
Keep tests/reference.html, source-manifest.json, VALIDATION.md and historical JSON results. They describe the original extraction or an identified earlier test stage.

Because intentional changes were accepted in 10-core.js, 90-closure-history.js and 50-closure-panels.css, tests/verify_source.py and exact original-versus-current render comparisons are no longer current-release pass/fail gates. Expected mismatches must not be hidden by rewriting the original reference or hashes. Establish a separately named post-release baseline and behavior-oriented tests before treating future changes as fully regression-covered.

## Backend boundary
Owner-supplied references (not independently verified deployed byte copies):
- Queue Worker wdw-queue-probe, supplied v3.7.
- Weather Worker park-pulse-weather, supplied v1.1.
- Both bind env.DB to shared D1 wdw-busyness-db; owner reports five-minute triggers.
- Worker source/configuration and schema were supplied in conversation and are not yet reproducible versioned backend deployment assets in this repository.
- Workers, D1 schema, scraper_collector.py, data/, workflow and Pages configuration were outside the frontend change scope.
- The Python static-data collector is a distinct implementation, not a replacement for the production Worker APIs.

## Remaining issues and follow-up work
1. Crowd-score descriptor bands and badge colors still disagree at some values; this is distinct from the fixed best-park banner fall-through.
2. UI descriptions of the crowd score versus the backend's absolute-wait formula need reconciliation.
3. Hours validation accepts undated or out-of-range values; missing-hours and final-queue-clearing phases need review.
4. Main refresh timeout/finally cleanup and serial request sequencing need review.
5. General modal semantics/focus and broader accessibility need further review; the targeted closure-panel improvements are not a sitewide certification.
6. Render-wrapper/CSS ownership consolidation is not finished. Do it in separate tested changes, not in this housekeeping patch.
7. Add current-release fixtures/tests and, separately, consider regression CI.
8. Version backend source/configuration/migrations in a future reviewed task without secrets.

## Next actions
1. Apply this documentation-only cleanup on a fresh branch from main; do not revive the merged branch.
2. Review/merge that cleanup PR, keeping application/backend files unchanged.
3. Delete finished branches after confirming no unmerged work remains.
4. Refresh the local working copy from main and archive older candidates as references only.
5. Choose a focused next task, create a fresh branch from current main and record the starting commit.

## Future-session handoff
Provide repository, actual branch/commit, task and any uncommitted local changes. Read PROJECT_STATUS.md, ARCHITECTURE.md and FEATURES.md. Inspect current source and dependencies before editing. Keep changes focused; preserve features unless explicitly approved otherwise. Report actual tests, limitations and commit/merge/deployment state. External writes/deployment require explicit approval.
