# Changelog — Disney World Park Pulse

Record accepted changes and their actual status. Do not infer deployment from a generated file, local test, branch commit or pull request. Entries below describe the known checkpoint, not an invented full historical release log.

## Unreleased — frontend source organization

Date: 2026-10-18.
Status: committed on the development branch and locally reviewed; draft PR open; not merged or deployed at the latest check.
Working branch: refactor/frontend-organization.
Reviewed branch snapshot: 12c2bf99fe12038816c30e2df152ab67d63a05d3.
Pull request: https://github.com/jacocksr/disney-busyness-monitor/pull/1 .
Documentation follow-up: prepared against the reviewed snapshot; its commit SHA will be established when committed.
Production/rollback reference: 1c1e016a9f66ace98c5230743d8cd2a576f5aafd.

### Changed
- Extracted existing inline JavaScript verbatim into 12 named classic-script files under assets/js/.
- Extracted existing inline CSS verbatim into 16 named stylesheet layers under assets/css/.
- Replaced inline blocks with ordered references at their original document positions.
- Reduced root index.html from 286,870 to 20,743 bytes by relocation, not feature removal.
- Preserved original calculations, queue filters, labels, IDs, handlers, endpoint addresses, image paths, script scope and cascade order.

### Added
- source-manifest.json with original source identity and extraction slots/hashes.
- Frozen original test reference and source-preservation verification.
- Optional HAR-backed browser comparison harness and delivered results.
- Validation and candidate setup documentation.
- Four continuity documents: PROJECT_STATUS.md, ARCHITECTURE.md, FEATURES.md and this changelog, uploaded with uppercase filenames.

### Validation
- All 12 extracted JavaScript files passed syntax checks.
- Source reconstruction matched original HTML byte-for-byte.
- Delivered compact suite: 56/56 matching checkpoints (14 at each of 390px/1280px and light/dark).
- No page JavaScript exceptions observed in delivered suite.
- Owner reports clean local appearance with original images, functional ride popup and other functionality appearing to work as intended.
- Uploaded-branch hash review matched all 28 application asset blobs and root index.html against the expected extraction; no deleted files in the 40-file PR list.
- GitHub reported zero check runs for the reviewed PR head. Stored local results do not establish CI coverage or tests on every later commit.

### Limitations and unchanged scope
- Automated park-image rendering and successful archived ride-history response replay were not covered by supplied fixtures.
- CSS motion disabled for settled-state tests; no full-page visual/accessibility certification.
- No active weather alert fixture; no backend integration/concurrency testing.
- Existing crowd-label/hours-validation/refresh/accessibility issues remain documented, not silently fixed.
- No change to either Worker, D1, scraper_collector.py, data files, collection workflow or Pages settings.
- Existing rendering wrappers and style overrides remain; internal semantic consolidation is future work.
- Documentation-only follow-up updates README for multi-file structure, config locations, literal-URL examples, local development, tests, continuity and deployment.
- The same follow-up updates PROJECT_STATUS.md, this changelog and ARCHITECTURE.md for the actual branch/PR checkpoint without claiming a merge or deployment.

### Acceptance and deployment record
- Owner local acceptance: reported 2026-10-18.
- Branch upload: complete; application upload and uppercase continuity names reviewed at 12c2bf99fe12038816c30e2df152ab67d63a05d3.
- Pull request: #1, open draft into main.
- Main at review: 4552f0b5561c244c49a185d5fce573594ab7e868; root entries/hashes match original baseline after a stylesheet add/remove pair.
- Merge commit/date: pending.
- Production verification: pending.
- Rollback if required: restore/revert the frontend change while preserving unrelated later commits; original reference above is for comparison, not instruction to reset all repository history.

## Recorded pre-refactor baseline — 2026-10-16

Commit: 1c1e016a9f66ace98c5230743d8cd2a576f5aafd.
Commit message: Revise README for Disney World Park Pulse.
The repository used a single-file frontend at root, original images, static collector/data and collection workflow. The authoritative project source was identified by the owner and the attached original HTML matched its Git blob. This entry records the baseline only; it does not assign the frontend feature-development date or claim independent production validation.

## Template for future entries

### [Unreleased or version] — YYYY-MM-DD
- Branch and starting/implementation commit:
- Task and affected feature IDs:
- Added/changed/fixed/removed:
- Files modified:
- Automated verification actually performed:
- Owner/manual verification:
- Known limitations:
- Backend/database impact:
- Pull request/merge/deployment status:
- Rollback reference:

Update PROJECT_STATUS.# Closure marker and label update

## Application file to replace
assets/js/90-closure-history.js

Only this application file changes. Do not replace index.html, stylesheets, tests/reference.html, source-manifest.json, backend code or the entire project.

## Source identity
Prepared against refactor/frontend-organization at PR #2 head 62d9a8b52c0a950a35f9fcc9e2d1a0a656529744.
The retrieved current module's Git blob was 3f183ed39e71f784e3d8967b96f7c39c59632fae. The original attachment's matching module was independently hashed to that value, allowing a complete replacement without relying on truncated connector text.
If the branch module changed after this checkpoint, review the newer file before replacing it.

## Changes
- Park-wide chart checkbox: Show grouped markers -> Show Closures.
- Same shared wording in the main average-waits chart and park-wide trend popup.
- Marker radius: 3 -> 6 canvas/CSS pixels (diameter 6 -> 12 before the outline).
- Contrasting 2-pixel outline; brighter red/pink in dark mode and dark red in light mode.
- Marker moved slightly upward and horizontally inset to fit its increased radius.
- Park-wide click region: 18x17 -> 22x22 pixels.
- Existing grouping, source events, selection, toggle synchronization and click routing retained.
- Individual ride chart label remains Show closure shading; vertical shading calculations unchanged.
- No additional hover text, API calls or Worker/D1 changes.

## Verification actually performed
- Node JavaScript syntax check passed.
- Every source edit is an explicit replacement; reversing them reproduces the original module exactly.
- HAR-backed Chromium test at 390px and 1280px in light/dark: all 13 targeted checks passed per configuration (52 repeated check executions).
- Five preservation comparisons per configuration passed (20 executions): main wait series, park popup series, individual ride series, grouped marker count and closure-event count.
- Verified actual red-marker arc radius and stroke, larger hit rectangles, checkbox label, hide/show behavior, popup controls and unchanged ride-shading label.
- Click-routing check called the Chart.js plugin event handler directly at the marker position; this was not a physical mouse/touch interaction test.
- No page JavaScript exceptions observed.

Tests used original HTML reconstructed from verified source with this module replaced, actual captured Chart.js and fixed HAR response data. This is targeted browser evidence, not a fresh full-branch checkout test or live deployment. Images and successful archive responses were unavailable in the capture; animations were disabled. Review the visual size locally before committing.

## Important test-baseline distinction
This is an intentional behavior/presentation change after structural extraction. tests/verify_source.py will now fail on this module's original hash. The old comparison runner can also report differences in the intended label and chart pixels.
Do not rewrite the frozen original or change source-manifest.json merely to silence those results. Keep them as historical extraction evidence. Future regression assertions should explicitly allow the requested label/marker changes while continuing to compare underlying data and unrelated behavior.

## Local steps
1. Keep a backup of the existing module outside the served candidate folder.
2. Replace assets/js/90-closure-history.js with the supplied full file.
3. Reload your local candidate (hard refresh if necessary).
4. Check main chart and park popup, both themes and a narrow viewport.
5. Toggle Show Closures off/on. Check affected-ride access and unchanged ride popup shading.

## GitHub steps
After local acceptance, edit assets/js/90-closure-history.js on refactor/frontend-organization, paste the complete replacement and commit to the same branch. PR #2 updates automatically. Do not merge or edit main yet.
Suggested commit: ui: clarify closure toggle and enlarge chart markers

Optional changelog note (record as locally tested/committed only after those steps occur):
- Rename the park-wide closure toggle to Show Closures.
- Increase grouped closure-dot diameter, contrast and click target while retaining closure grouping, wait data and individual ride shading.
Affected feature IDs: F07, F13; related interaction checks F15/F17.
md after accepting a milestone so a new conversation can identify what is current.

[CHANGE-NOTES.md](https://github.com/user-attachments/files/33639889/CHANGE-NOTES.md)

# Closure marker and label update

## Application file to replace
assets/js/90-closure-history.js

Only this application file changes. Do not replace index.html, stylesheets, tests/reference.html, source-manifest.json, backend code or the entire project.

## Source identity
Prepared against refactor/frontend-organization at PR #2 head 62d9a8b52c0a950a35f9fcc9e2d1a0a656529744.
The retrieved current module's Git blob was 3f183ed39e71f784e3d8967b96f7c39c59632fae. The original attachment's matching module was independently hashed to that value, allowing a complete replacement without relying on truncated connector text.
If the branch module changed after this checkpoint, review the newer file before replacing it.

## Changes
- Park-wide chart checkbox: Show grouped markers -> Show Closures.
- Same shared wording in the main average-waits chart and park-wide trend popup.
- Marker radius: 3 -> 6 canvas/CSS pixels (diameter 6 -> 12 before the outline).
- Contrasting 2-pixel outline; brighter red/pink in dark mode and dark red in light mode.
- Marker moved slightly upward and horizontally inset to fit its increased radius.
- Park-wide click region: 18x17 -> 22x22 pixels.
- Existing grouping, source events, selection, toggle synchronization and click routing retained.
- Individual ride chart label remains Show closure shading; vertical shading calculations unchanged.
- No additional hover text, API calls or Worker/D1 changes.

## Verification actually performed
- Node JavaScript syntax check passed.
- Every source edit is an explicit replacement; reversing them reproduces the original module exactly.
- HAR-backed Chromium test at 390px and 1280px in light/dark: all 13 targeted checks passed per configuration (52 repeated check executions).
- Five preservation comparisons per configuration passed (20 executions): main wait series, park popup series, individual ride series, grouped marker count and closure-event count.
- Verified actual red-marker arc radius and stroke, larger hit rectangles, checkbox label, hide/show behavior, popup controls and unchanged ride-shading label.
- Click-routing check called the Chart.js plugin event handler directly at the marker position; this was not a physical mouse/touch interaction test.
- No page JavaScript exceptions observed.

Tests used original HTML reconstructed from verified source with this module replaced, actual captured Chart.js and fixed HAR response data. This is targeted browser evidence, not a fresh full-branch checkout test or live deployment. Images and successful archive responses were unavailable in the capture; animations were disabled. Review the visual size locally before committing.

## Important test-baseline distinction
This is an intentional behavior/presentation change after structural extraction. tests/verify_source.py will now fail on this module's original hash. The old comparison runner can also report differences in the intended label and chart pixels.
Do not rewrite the frozen original or change source-manifest.json merely to silence those results. Keep them as historical extraction evidence. Future regression assertions should explicitly allow the requested label/marker changes while continuing to compare underlying data and unrelated behavior.

## Local steps
1. Keep a backup of the existing module outside the served candidate folder.
2. Replace assets/js/90-closure-history.js with the supplied full file.
3. Reload your local candidate (hard refresh if necessary).
4. Check main chart and park popup, both themes and a narrow viewport.
5. Toggle Show Closures off/on. Check affected-ride access and unchanged ride popup shading.

## GitHub steps
After local acceptance, edit assets/js/90-closure-history.js on refactor/frontend-organization, paste the complete replacement and commit to the same branch. PR #2 updates automatically. Do not merge or edit main yet.
Suggested commit: ui: clarify closure toggle and enlarge chart markers

Optional changelog note (record as locally tested/committed only after those steps occur):
- Rename the park-wide closure toggle to Show Closures.
- Increase grouped closure-dot diameter, contrast and click target while retaining closure grouping, wait data and individual ride shading.
Affected feature IDs: F07, F13; related interaction checks F15/F17.

