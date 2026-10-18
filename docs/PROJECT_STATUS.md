# Project status — Disney World Park Pulse

Last updated: 2026-10-18.

## Read this first
This document is the continuity entry point for new development conversations. Inspect the actual branch and files before editing. Conversation memory and old attachments are not authoritative source code.

## Source of truth and release state
- Repository: jacocksr/disney-busyness-monitor.
- Current production source: main, repository root.
- Main commit checked during PR review: 4552f0b5561c244c49a185d5fce573594ab7e868.
- Original extraction/rollback comparison reference: 1c1e016a9f66ace98c5230743d8cd2a576f5aafd. Two subsequent main commits added then removed the same stylesheet; reviewed current root file/tree hashes returned to the original baseline.
- Original index.html Git blob: 2bd7b961f6a02efabe4b7ec0d76b80372062d3e5.
- Original index.html size: 286,870 bytes.
- Live URL: https://jacocksr.github.io/disney-busyness-monitor/ .
- Pages setting supplied by owner: Deploy from a branch, main, / (root).
- Multi-file candidate: committed on the development branch and manually reviewed locally; NOT merged or deployed at the latest check.
- Working branch: refactor/frontend-organization.
- Reviewed branch snapshot: 12c2bf99fe12038816c30e2df152ab67d63a05d3.
- Pull request: https://github.com/jacocksr/disney-busyness-monitor/pull/1 — open draft, source refactor/frontend-organization into main, not merged.
- GitHub reports no merge conflict at that snapshot; this is not a functional test result.
- This documentation revision was prepared against that snapshot. Its future commit SHA is not known in advance; inspect the actual latest branch before further work.

Keep the original extraction reference for comparison. Update merge/deployment fields only after those actions actually occur.

## Current candidate scope
Structural extraction only. Root index.html references 12 JavaScript files and 16 CSS files in assets/. Source blocks were extracted verbatim at their original HTML positions. Candidate index.html is 20,743 bytes. The total application code was relocated, not substantially reduced. No frontend build step is required.

Existing render wrappers, layered CSS overrides, calculations, labels, queue filters, event metadata and endpoint addresses remain intentionally unchanged. Internal semantic consolidation is still pending.

## Validation evidence
### Automated
- All 12 extracted JavaScript files passed syntax checking.
- Source-preservation verifier reconstructs the original HTML byte-for-byte from candidate source slots.
- Delivered compact HAR replay suite: 56 matching comparison checkpoints; 14 per configuration at 390px and 1280px, light and dark themes.
- No page JavaScript exceptions in those runs.
- The shipped suite compares displayed text, selected styles/dimensions, park/mode/theme, modal state, chart data and canvas hashes.
- HAR contains five main API bodies, Chart.js and font resources. It was captured from the local reference connected to deployed services.
- The broader earlier working-environment run reported 88 matching checkpoints, including explicit failure/retry recovery. Distinguish it from the delivered reproducible 56-checkpoint suite; do not add the counts together.

### Uploaded-branch review
- PR #1 at the reviewed snapshot contains 40 changed files: 39 additions and one modified root index.html; no deleted files in the PR file list.
- Git blob hashes of all 28 uploaded application assets match the corresponding blocks from original source.
- Uploaded index.html matches the expected extraction entry: a4cc16daaaaf34f6b8b3fc9c46d44fbc4b1883d1.
- Images/data/workflow tree and scraper_collector.py hashes retain baseline values.
- All four continuity document names are correctly capitalized.
- GitHub reported zero check runs for the reviewed PR head. Prior local test results are not automatic CI results.
- No browser suite was rerun on a downloaded branch checkout during this hash review.

### Owner review
On 2026-10-18, the owner reported that the candidate looks clean locally with original images, that the ride popup is functional, and that other functionality appears to work as intended. This is manual acceptance evidence, not an automated or exhaustive certification.

### Remaining limitations
- Actual image files were not available during automated replay; owner tested them locally.
- No archived /api/ride-history response was captured in the HAR. Automated popup checks used rolling history/archive failure fallback. The owner's general popup confirmation does not independently document a successful previous-day archive response.
- Animation/transition fidelity and full-page screenshot parity were not checked; automated replay used settled states with CSS motion disabled.
- No active weather alerts were in the fixture; alert scenarios remain untested.
- No full keyboard/focus/accessibility audit, backend integration test or D1 concurrency test.
- Live page and API retrieval failed through the assistant's page-retrieval tool. These failures are not proof of a service outage; the HAR records successful responses.

## Backend boundary
Owner-supplied references, not independently verified deployed byte copies:
- Queue Worker: wdw-queue-probe, supplied source v3.7.
- Weather Worker: park-pulse-weather, supplied source v1.1.
- Both bind env.DB to shared D1 database wdw-busyness-db.
- Owner reports both triggers run every five minutes.
- Worker source, schema and configuration were supplied in conversation; at this checkpoint they are not versioned backend deployment assets in the repository.
- No Worker, D1, collector or publishing-setting changes are part of the current frontend refactor.

## Known issues — separate work, not approved fixes
1. Crowd-score descriptors and badge bands disagree at some values (for example 6.5).
2. Frontend help describes historical relativity while backend crowd_score is based on absolute positive mean waits; the matched historical comparison is separate.
3. Hours validation accepts undated schedules and syntactically matching out-of-range times.
4. Missing-hours and final-queue-clearing phase behavior need review.
5. Main refresh timeouts/finally cleanup and serial fetch sequencing need review.
6. Custom modal semantics/focus management and broader accessibility need review.
7. Rendering wrappers and overlapping style responsibilities remain.

Do not fix these silently during extraction or count them as regressions introduced by file separation.

## Next task
1. Apply and review the documentation-only README/status/changelog/architecture revision on the existing working branch. No new PR is needed.
2. Check the latest PR diff and branch state after that commit; retain all test limitations and verify no application/backend files changed with the documentation revision.
3. Obtain explicit approval before marking ready/merging. Do not change Pages settings.
4. After an approved merge, check actual Pages deployment, assets and APIs; record merge commit/date and production-verification outcome.
5. Only after accepting the structural milestone, consolidate internal rendering/style ownership in small tested changes.

## Future-session instructions
Read this file, ARCHITECTURE.md and FEATURES.md. Resolve the current branch and implementation commit. Ask for uncommitted local edits if relevant. Read dependencies before editing. Separate behavior changes from refactoring. Report changed files, actual tests, limitations and deployment status. External writes and deployment require explicit approval.
