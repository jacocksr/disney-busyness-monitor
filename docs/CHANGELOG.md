# Changelog — Disney World Park Pulse

This log records actual source/release milestones. Stored test results are local evidence for the stated stage, not automatic CI or proof that every later commit passed.

## 2026-10-19 — Frontend organization and closure-interface milestone

Status: merged into main; owner reports a clean live check.
- PR: https://github.com/jacocksr/disney-busyness-monitor/pull/2 .
- Merge commit: 738ec44d8067d3d2e80a4f44899e379bcf2b0b44.
- Merge time: 2026-10-19 19:37:12 UTC (3:37:12 PM EDT).
- Merged by: jacocksr.
- Development head: 52592d89884fd854a9cffa2821e0d894b2d1af7b.
- Pre-merge main: 4552f0b5561c244c49a185d5fce573594ab7e868.
- Original extraction reference: 1c1e016a9f66ace98c5230743d8cd2a576f5aafd.
- Owner live-check report: 2026-10-19, approximately 3:39 PM EDT; clean.
- Verification distinction: GitHub merge verified; no separate assistant full production-browser audit or Pages-job inspection at this checkpoint.

### Source organization
- Initially extracted inline JavaScript verbatim into 12 named classic scripts and CSS into 16 layers, retaining execution/cascade order.
- Root index.html reduced from 286,870 to 20,743 bytes by relocation, not feature removal.
- Added continuity documents, source manifest, frozen original reference, extraction verifier and optional HAR-backed comparison harness.
- Updated README for multi-file setup, actual configuration paths, literal-URL examples, local development and tests.
- Internal render wrappers and CSS override layers remain; deeper semantic consolidation is not claimed complete.

### Best-park banner fix
- Handle both better and much-better tiers as quieter conditions rather than sending much-better to the busy fallback.
- Handle busier tiers explicitly and use a neutral unknown fallback.
- Add friendlier wording and avoid unsupported blanket all-park claims.
- Avoid claiming a comparative best choice when only one park is comparable.
- Preserve ranking, wait inclusion and historical comparison mathematics.
- Files: assets/js/10-core.js. Features: F03/F06.

### Closure marker and inline details
- Rename park-wide control to Show Closures; enlarge red dots and add a contrasting outline/click region.
- Add Recorded ride interruptions key and a full-width details disclosure with distinct-ride count.
- Show ride names, current reported status separately from historical episode timing, multiple-interruption lists and ride-history access.
- Marker taps open the same inline panel filtered to the hour of the event's first closed report; nearest marker wins when hit regions overlap.
- Add selected-marker ring and Show all today; retain details when markers are hidden.
- Preserve grouping, event payload, wait curves, main closure section, heatmap actions and individual ride-chart shading.
- Earlier marker-only package used 22x22 hit regions; the later inline-panel implementation adjusted marker inset/hit regions for selection. Consult current source rather than treating an earlier dimension as the final specification.
- Files: assets/js/90-closure-history.js, assets/css/50-closure-panels.css. Features: F07/F12/F13/F15.

### Mobile layout, status time and styling
- Keep park-wide popup within the viewport, with fixed header and scrolling body; retain three compact summary metrics on mobile.
- Strengthen container/card hierarchy in both themes; final treatment uses neutral interiors with red outer frames. Current-state badges retain semantic colors.
- Include the ride feed's last_updated time in fresh Reported Open labels, using the selected display time zone; do not interpret this as reopening time.
- Re-render closure views when display time zone changes without extra fetching.
- Preserve timestamps, stale-data safeguards and existing API/Worker/D1 contracts.

### Smooth disclosures
- Animate main and nested details at approximately 320ms opening and 260ms closing.
- Reverse rapid toggles from current dimensions, clean temporary heights, and retarget nested content changes.
- Retain scope/open/filter state during same-park/day re-renders; reset on park/day changes.
- Keep closing content inert, restore focus and support keyboard activation/Escape.
- Marker-triggered reveal waits for opening and scrolls the modal body where applicable.
- Reduced Motion users receive immediate state changes.

### Evidence
- Initial extraction: exact source reconstruction and 12 syntax checks; shipped compact comparison suite 56/56, two widths/two themes.
- Broader earlier 88-checkpoint working-environment run is separate evidence, not an additive coverage total.
- Marker-only update: 13 targeted checks plus five preservation comparisons per width/theme configuration.
- Banner update: 35 controlled logic assertions.
- Inline panel: 36 checks per width/theme configuration plus empty/persistence/time-zone/stale-data checks; physical marker taps/clicks included.
- Smooth details: 35 assertions per configuration at two widths/two themes plus mobile Reduced Motion, and four animation edge checks.
- Source/response fixtures and individual test stages differ; do not sum these into one exhaustive test count.
- Owner local review included real images; owner subsequently reported the live site clean.

### Limitations and unchanged backend scope
- Pre-merge PR check runs were zero. Stored JSON results are historical, not a live CI badge.
- Automated replay lacked actual PNGs and successful archive/active-alert fixtures in the supplied HAR.
- Targeted keyboard/motion testing is not sitewide accessibility certification; no backend concurrency/integration or prolonged resource audit was performed.
- Original settled-state comparisons disabled motion; later targeted animation tests explicitly enabled it.
- No intended changes to Workers, D1, static collector, data files, workflow or Pages settings.
- Known crowd-score bands/wording, hours validation, main refresh lifecycle and broader accessibility issues remain separate follow-up work. The specific banner tier bug above is fixed.

### Original evidence and rollback
Preserve tests/reference.html, source-manifest.json, VALIDATION.md and earlier test reports as historical baseline evidence. Original extraction hashes and pixel/text parity checks can intentionally fail after accepted presentation/logic changes; do not overwrite them merely to force a pass. Create a separately named current-release regression baseline.

For rollback, review/revert the intended frontend change while preserving unrelated later commits. The pre-merge and extraction references above are comparison points, not instructions to reset all repository history.

## 2026-10-19 — Post-release documentation cleanup

Status: prepared against the accepted merge; not yet committed when supplied.
- Replace stale draft/unmerged descriptions with the verified PR #2 merge and owner live-check record.
- Record PR #1 as closed without merge and superseded, not active.
- Remove duplicated installation-guide copies and repair the malformed changelog tail; retain substantive change/test history above.
- Clarify historical extraction tests versus accepted current behavior.
- Refresh README clone/default-source instructions and architecture continuity guidance.
- Documentation-only: no application/backend/test-baseline files changed by this cleanup.
- Cleanup branch/PR/commit: establish when performed; do not invent future identifiers.

## Historical baseline and review references
- 2026-10-16: original reference 1c1e016a9f66ace98c5230743d8cd2a576f5aafd, message Revise README for Disney World Park Pulse. Records the baseline, not the dates all features were originally developed.
- Original HTML Git blob: 2bd7b961f6a02efabe4b7ec0d76b80372062d3e5.
- PR #1: closed without merging, superseded by PR #2. Reviewed structural snapshot 12c2bf99fe12038816c30e2df152ab67d63a05d3.
- PR #2 intermediate documentation snapshot: 62d9a8b52c0a950a35f9fcc9e2d1a0a656529744.
- Marker application commit: 6481e58dfa95d33de62c26aeba3961ee1bce50ff; follow-up stored-results head 751247e1a972487fb67ee2c5802ec9f7926dcf22.
- Final merged head and merge recorded in the release entry above.

## Future entry template

### YYYY-MM-DD — Change title
- Status: proposed / committed / merged / owner live-verified.
- Starting branch/commit:
- Files and affected feature IDs:
- Added/changed/fixed/removed:
- Actual automated verification and limitations:
- Owner/manual verification:
- Backend/database impact:
- PR/merge/deployment record:
- Rollback reference:

Update PROJECT_STATUS.md after accepting a milestone. Keep setup instructions in README or guides, not duplicated in the change log.
