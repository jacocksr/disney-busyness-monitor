# Changelog — Disney World Park Pulse

Record accepted changes and their actual status. Do not infer deployment from a generated file, local test, branch commit or pull request. Entries below describe the known checkpoint, not an invented full historical release log.

## Unreleased — frontend source organization

Date: 2026-10-18.
Status: locally reviewed candidate; not committed, merged or deployed when this entry was written.
Proposed branch: refactor/frontend-organization.
Implementation commit: pending.
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
- Four continuity documents: PROJECT_STATUS.md, ARCHITECTURE.md, FEATURES.md and this changelog, prepared for the branch upload.

### Validation
- All 12 extracted JavaScript files passed syntax checks.
- Source reconstruction matched original HTML byte-for-byte.
- Delivered compact suite: 56/56 matching checkpoints (14 at each of 390px/1280px and light/dark).
- No page JavaScript exceptions observed in delivered suite.
- Owner reports clean local appearance with original images, functional ride popup and other functionality appearing to work as intended.

### Limitations and unchanged scope
- Automated park-image rendering and successful archived ride-history response replay were not covered by supplied fixtures.
- CSS motion disabled for settled-state tests; no full-page visual/accessibility certification.
- No active weather alert fixture; no backend integration/concurrency testing.
- Existing crowd-label/hours-validation/refresh/accessibility issues remain documented, not silently fixed.
- No change to either Worker, D1, scraper_collector.py, data files, collection workflow or Pages settings.
- Existing rendering wrappers and style overrides remain; internal semantic consolidation is future work.
- Existing root README still needs a targeted multi-file development update before merge.

### Acceptance and deployment record
- Owner local acceptance: reported 2026-10-18.
- Branch upload: pending.
- Pull request: pending.
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

Update PROJECT_STATUS.md after accepting a milestone so a new conversation can identify what is current.
