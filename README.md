# Disney World Park Pulse

### Live wait times, historical patterns, weather, and ride-closure context for Walt Disney World.

Disney World Park Pulse is an independent dashboard for exploring reported attraction wait times and operating conditions across all four Walt Disney World theme parks.

The project brings current waits, comparisons with historical patterns, park hours, weather, special-event information, and recorded ride interruptions into one responsive interface.

Its goal is straightforward: help visitors understand what is happening now, how it compares with recorded history, and what deserves a closer look before choosing their next attraction or park.

> Posted waits and operating statuses are third-party observations, not guarantees. Park Pulse is not affiliated with or endorsed by Disney.

---

## Explore the dashboard

The dashboard covers:

| Park | Internal key |
|---|---|
| Magic Kingdom | `magic_kingdom` |
| EPCOT | `epcot` |
| Disney’s Hollywood Studios | `hollywood_studios` |
| Disney’s Animal Kingdom | `animal_kingdom` |

Use the park icons to switch the selected park across the dashboard. Expand the wait-time, weather, event, and closure sections for additional context.

The frontend is contained in [`index.html`](index.html) and can be served as a static website. The repository has GitHub Pages enabled; use the deployment URL shown in the repository’s Pages settings or deployment information.

## Contents

- [Features](#features)
- [How to read the data](#how-to-read-the-data)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [API integration](#api-integration)
- [Run the frontend locally](#run-the-frontend-locally)
- [Python collector and GitHub Actions](#python-collector-and-github-actions)
- [Deployment and configuration](#deployment-and-configuration)
- [Data quality and limitations](#data-quality-and-limitations)
- [Development and validation](#development-and-validation)
- [Roadmap](#roadmap)
- [Data sources and acknowledgments](#data-sources-and-acknowledgments)
- [Contributing](#contributing)
- [License and affiliation](#license-and-affiliation)

---

## Features

### Park overview cards

Each park card provides a compact overview of the available operating picture:

- Reported general operating hours.
- Early Entry information before general opening.
- A wait-based crowd-score indicator.
- Average and longest qualifying posted waits.
- Comparison with the available historical baseline.
- Temporary-closure and refurbishment context.
- A condensed current-weather display.
- Expandable event and festival information.

The wait-time area opens a larger park-wide trend chart. Weather and event controls reveal their own details without requiring visitors to leave the dashboard.

### Searchable attraction waits

The attraction table supports searching and sorting, with attraction and land information alongside reported wait times or operating status.

Individual attraction details include available wait-history charts and summary statistics.

Special or scheduled experiences are handled separately from standard ride downtime so that experiences with limited schedules do not automatically inflate temporary-closure counts.

### Observed versus typical wait trends

Park-wide charts compare today’s recorded positive waits with available historical weekday/hour patterns.

The charts are intended to answer questions such as:

- Are reported waits higher or lower than the available baseline?
- Which parts of the day have been busier?
- How much observation coverage supports a comparison?

Historical averages are context—not forecasts or promises about the next hour.

### Ride wait heatmaps

The heatmap provides three views:

- Today by hour.
- Date-specific daily averages for the last seven days.
- Aggregated patterns by day of week.

Color communicates relative wait length within the view. A closure indicator adds operating-status context without replacing the wait value or changing the meaning of its color.

Closure-marked cells open the standard ride-history popup directly, where wait history and closure shading can be viewed together.

### Ride-closure history

The Ride closures card separates the current reported operating picture from recorded historical interruptions.

Its collapsed view provides useful summary information before expansion. The expanded view supports:

- Today.
- This week, beginning Monday.
- Last seven days, including today.
- Park selection through the four park icons.
- Per-attraction interruption timelines.
- Links to the standard ride-history popup.
- Separate treatment of refurbishments and uncertain-start records.

Individual ride charts can show closure intervals as vertical shaded bands. Park-wide graphs group closure activity to avoid placing a separate annotation over every observation.

Missing observations are not treated as proof that an attraction was open or closed.

### Weather at a glance

The weather interface includes:

- Current reported conditions.
- Temperature and available feels-like information.
- Wind and humidity when available.
- Observation timestamps.
- Five compact hourly forecast snapshots.
- Expanded hourly forecast information.
- Weather-alert information when returned by the weather service.
- Delayed-data and unavailable-data states.

Weather observations may come from nearby stations rather than sensors inside each park. They should not be interpreted as precise measurements at every attraction.

### Event and festival information

Expandable event pills combine reported schedule hours with a maintained frontend catalog of verified event information.

The catalog distinguishes:

- Paid, separately ticketed events.
- Complimentary member events requiring eligibility and registration.
- Festivals included with regular park admission.
- Unidentified events with unconfirmed admission requirements.

Examples supported by the maintained catalog include Mickey’s Not-So-Scary Halloween Party, Mickey’s Very Merry Christmas Party, Disney Jollywood Nights, selected Disney Vacation Club Moonlight Magic dates, and EPCOT’s Food & Wine Festival.

Identification uses explicit park/date matches and available schedule information. A month or season alone is not sufficient to identify an event.

The expanded view keeps information concise and links to the official Disney page. Ticket inventory, registration availability, prices, and entertainment showtimes are not checked live by this catalog.

### Responsive presentation

The frontend includes:

- Light and dark themes.
- Saved theme and display-time preferences.
- Responsive park cards and tables.
- Mobile heatmap scrolling controls.
- Keyboard-accessible controls and visible focus states.
- Reduced-motion handling.
- Expandable information panels.
- Explicit loading, unavailable, and delayed-data messaging.

These are implemented interface features, not a claim of a completed accessibility certification.

---

## How to read the data

### Crowd score versus historical comparison

The crowd score and the comparison-to-typical message are different measures.

| Measure | What it represents |
|---|---|
| Crowd score | A normalized indicator derived from reported attraction waits |
| Comparison to typical | The current qualifying wait picture compared with an available historical baseline for the relevant time |
| Posted wait | The provider’s reported standby wait for an attraction |
| Operating status | Whether the provider currently reports the attraction as open |

The crowd score is not a direct measurement of attendance, pedestrian density, park capacity, or the number of people inside the park.

The comparison messaging uses a ±10% band for typical conditions. A park can be close to its usual pattern and still have substantial waits.

### Which waits contribute?

The live park-card average and park-wide comparison focus on qualifying standard attractions that are open and reporting positive standby waits.

Single Rider, Lightning Lane, and separately classified scheduled experiences are not intended to be interchangeable with ordinary standby observations.

Different views may use different observation windows and inclusion rules. In particular, an attraction’s rolling-history summary may include open zero-minute readings, while positive-wait historical rollups exclude them.

Consult the labels and methodology notes in the relevant view rather than assuming every displayed average has the same denominator.

### Closure timing

A closure episode is reconstructed from sampled operating-status observations.

For example:

```text
10:00 — reported open
10:05 — reported closed
10:10 — reported closed
10:15 — reported open
```

The observations establish a change between samples. They do not establish the exact physical moment at which the attraction stopped or resumed operation.

Important distinctions:

- Open with a zero-minute wait is not a closure.
- Missing observations are not closed observations.
- An attraction already closed when tracking starts has an uncertain start.
- An interrupted observation sequence does not establish a reopening time.
- Refurbishment records are not ordinary temporary interruptions.
- A single closed sample can represent a brief interruption; it should not be interpreted as zero downtime.

The dashboard does not establish the cause of a closure. A reported interruption is not proof of a mechanical problem, staffing issue, or weather-related shutdown.

### Dates and time zones

Dashboard day-based views use Eastern park-calendar dates.

The display-time selector controls supported timestamp presentation. Some schedule information is explicitly labeled Eastern because it originates as park operating hours.

“This week” means Monday through the current Eastern park day. “Last seven days” means today and the preceding six Eastern calendar days—not necessarily a rolling 168-hour window.

The Python collector is different: it creates timestamps and weekday/hour buckets in UTC. Its static output should not be assumed to have the same calendar semantics as the Cloudflare-backed dashboard.

---

## Architecture

The project currently has two distinct data paths.

### Cloudflare-backed dashboard

The frontend is configured to consume queue/history data from a queue Worker and weather data from a separate weather Worker.

Conceptually:

```text
Queue-Times / park schedules
             |
             v
    Queue collection Worker
             |
             v
       Cloudflare D1
             |
             v
   Cached API responses
             |
             v
        index.html

Weather providers
       |
       v
Separate weather Worker
       |
       v
Weather API response
       |
       v
  index.html
```

The dashboard polls its configured APIs rather than rebuilding the website for every collection.

The deployed backend uses cached responses so ordinary page views do not need to reconstruct history or closure episodes from all raw observations.

### Repository Python collector

The repository also contains a Python collection pipeline:

```text
GitHub Actions or manual execution
                |
                v
      scraper_collector.py
                |
                v
      JSON and JSONL files
             in data/
```

This collector produces static snapshots, rolling history, historical aggregates, and raw observation logs.

It is not the same implementation as the deployed Cloudflare collector.

### Backend source availability

The current repository does not include the deployed queue/weather Worker source, D1 migration files, or a Wrangler configuration.

Consequently:

- Cloning this repository is sufficient to obtain the frontend and Python collector.
- Cloning it is not sufficient to recreate the complete production Cloudflare backend.
- The Python collector is not a drop-in substitute for all of the current dashboard’s API contracts.
- A self-hosted full deployment needs compatible backend services and their database schema.

Do not assume the Python collector’s default park hours, summary buckets, or optional weather placeholder reproduce production behavior.

---

## Repository layout

```text
disney-busyness-monitor/
├── .github/
│   └── workflows/
│       └── update_wait_times.yml
├── data/
│   ├── events/
│   ├── historical_summary.json
│   ├── history_24h.json
│   ├── history_7d.json
│   └── live_wait_times.json
├── images/
├── index.html
├── scraper_collector.py
└── README.md
```

| Path | Purpose |
|---|---|
| [`index.html`](index.html) | Dashboard markup, styles, application logic, charts, and frontend event catalog |
| [`images/`](images/) | Park icon assets |
| [`scraper_collector.py`](scraper_collector.py) | Python collector and static-data generator |
| [`.github/workflows/update_wait_times.yml`](.github/workflows/update_wait_times.yml) | Scheduled/manual collection workflow |
| [`data/live_wait_times.json`](data/live_wait_times.json) | Static current snapshot generated by the Python collector |
| [`data/history_24h.json`](data/history_24h.json) | Rolling open-ride readings from the Python collector |
| [`data/history_7d.json`](data/history_7d.json) | Rolling history with at most one stored open reading per ride per hour |
| [`data/historical_summary.json`](data/historical_summary.json) | Running positive-wait aggregates from the Python collector |
| [`data/events/`](data/events/) | Daily raw observation logs |

---

## API integration

The frontend uses these queue-service routes:

| Route | Purpose |
|---|---|
| `/api/live-wait-times` | Current park and attraction snapshot |
| `/api/history-24h` | Rolling ride wait observations |
| `/api/historical-summary` | Historical baselines and supported daily summaries |
| `/api/ride-history?ride=<id>` | Available archived day-by-day ride points |
| `/api/closure-events` | Recorded closure episodes and tracking metadata |

Weather is requested separately through the configured weather service’s `/api/weather` route.

Search `index.html` for these configuration points:

```js
const API_BASE = '[https://wdw-queue-probe.jacocksr.workers.dev](https://wdw-queue-probe.jacocksr.workers.dev)';

const WEATHER_API =
  '[https://park-pulse-weather.jacocksr.workers.dev/api/weather](https://park-pulse-weather.jacocksr.workers.dev/api/weather)';
```

These are public service addresses, not database credentials.

When hosting your own copy, point them to services you operate or are authorized to use. Those services must return the structures expected by the frontend and permit requests from the hosting origin.

The main frontend refresh interval is configured as:

```js
const DATA_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
```

This is a polling interval, not a guarantee that a new upstream observation exists every five minutes. Inspect the displayed source timestamps to assess freshness.

---

## Run the frontend locally

No frontend build step or package installation is required.

With Python installed:

```bash
git clone [https://github.com/jacocksr/disney-busyness-monitor.git](https://github.com/jacocksr/disney-busyness-monitor.git)
cd disney-busyness-monitor
python -m http.server 8000
```

Open:

```text
http://localhost:8000
```

The local page still requests its configured remote APIs and external browser dependencies. Serving the HTML locally does not start a collector, create a database, or make the dashboard offline-capable.

The frontend loads Chart.js and web fonts from external services. Network or content-security restrictions can affect those resources independently of the queue API.

---

## Python collector and GitHub Actions

### Run the static collector manually

The checked-in workflow uses Python 3.11. The collector’s external Python dependency is `requests`.

```bash
python -m pip install requests
python scraper_collector.py
```

Run it from the repository root so its relative `data/` paths resolve as expected.

The script creates or updates the static data files and appends raw records under `data/events/`.

Running the collector changes local files. It does not automatically upload them or update the Cloudflare database.

### Scheduled workflow

The checked-in workflow declares:

```yaml
schedule:
  - cron: '3,13,23,33,43,53 * * * *'
workflow_dispatch: {}
```

Its steps:

1. Check out the repository.
2. Set up Python.
3. Install dependencies.
4. Run `scraper_collector.py`.
5. Commit changed data files.

The presence of a workflow file does not establish whether scheduled runs are currently enabled or successful. Check the repository’s Actions tab.

The workflow requests repository-content write permission so it can commit generated data. Keep that permission scoped to automation that needs it.

### Static collector behavior

The Python collector:

- Requests attraction data for all four parks.
- Stores `is_open`, posted wait, and source update information in the current snapshot.
- Appends rolling wait-history points only for open attractions.
- Builds positive-wait weekday/hour summaries.
- Writes raw observation records with open/closed status.
- Adds weekday, month, holiday, and default-hours context.

Its seven-day history stores an observed reading at most once per hour; it is not an average of every reading in that hour.

The `weather` field in its raw event records is currently a placeholder. The separately deployed dashboard weather service should not be confused with completed weather collection in this script.

Similarly, the collector’s raw event-log park hours come from defaults—not the live daily schedule used by the production queue service.

A missing point in the static wait-history files is therefore insufficient evidence of a closure.

---

## Deployment and configuration

### Static hosting

The frontend can be published with GitHub Pages or another static host.

For GitHub Pages:

1. Keep `index.html` and the `images/` directory at the selected publishing location.
2. Configure Pages in the repository settings.
3. Verify the configured queue and weather API addresses.
4. Open the deployment URL supplied by GitHub.
5. Confirm that scripts, fonts, images, and API responses load successfully.

Changing `README.md` updates the repository landing page. It does not replace or modify the dashboard in `index.html`.

### Full self-hosting

A production-style self-hosted deployment additionally requires compatible queue/history and weather services.

Because the current backend source and migrations are not checked into this repository, obtain and review them before attempting to recreate the Cloudflare environment.

Do not publish API secrets, database credentials, or administrative tokens in `index.html`, workflow logs, or committed data.

### Event-catalog maintenance

Search for:

```text
verified-park-event-catalog
```

The catalog contains maintained dates and event metadata. When updating it:

- Use official event information.
- Add explicit park/date matches.
- Keep admission type distinct from the upstream schedule label.
- Keep scraped hours separate from maintained descriptions.
- Update verification dates and official links.
- Do not automatically carry one season’s dates into the next year.
- Preserve conservative behavior when an event cannot be identified.

An upstream `TICKETED_EVENT` label does not establish that the event is publicly sold. Member-registration events and other access restrictions require their own admission wording.

---

## Data quality and limitations

Park Pulse is an observation and planning aid.

It does not provide:

- Official attendance measurements.
- Guaranteed queue lengths or ride access.
- Exact closure-transition timestamps.
- Verified closure causes.
- Complete historical availability for periods that were not observed.
- Live ticket inventory or event-registration status.
- Guaranteed entertainment schedules.
- Attraction-level weather measurements at every park location.

Additional considerations:

- Collection, processing, API caching, and frontend polling can each introduce delay.
- Successful HTTP responses can still contain older observations.
- Daily summaries may lag the current hour because rollups process completed intervals.
- Historical sample counts do not necessarily establish many independent days or weeks of coverage.
- Currently closed rides may stop contributing wait readings, changing which attractions contribute to an average.
- Weather and schedule data can be unavailable independently of wait-time data.
- Refurbishment and scheduled-experience classification rules require maintenance.
- Closure history is limited by the events returned by the endpoint; a seven-day selector does not guarantee seven complete days of observations.

The interface uses unavailable and delayed-data states rather than inventing replacement observations.

For authoritative operating rules, access eligibility, ticketing, attraction availability, and safety information, consult Disney and the relevant official service.

---

## Development and validation

There is no dedicated automated test suite or frontend build configuration included in the current repository.

Before publishing a change, validate at least:

### Dashboard behavior

- All four park selectors work.
- Search and sort controls behave correctly.
- Park-card counts and selected-park details stay synchronized.
- Ride popups open directly and close correctly.
- Light and dark themes remain legible.
- Mobile tables and heatmaps remain usable.
- Keyboard focus remains visible.
- Reduced-motion settings are respected.

### Data states

- Initial loading.
- First-request failure.
- Delayed responses.
- Recovery after a failed refresh.
- No positive wait readings.
- Missing historical baselines.
- Partial-day history.
- Unknown-start or interrupted closure episodes.
- Missing weather or event details.

### Closure presentation

- Repeated refreshes do not duplicate legends or markers.
- Closure-marked cells retain ordinary heatmap dimensions.
- Closed status is not plotted as zero wait.
- Observation gaps are not drawn as continuously observed wait lines.
- Park graph annotations remain grouped.
- Closure hover behavior does not add unnecessary text beneath charts.
- Refurbishment station records do not inflate logical-attraction summaries.

### Backend operations

For backend deployments, inspect actual invocation outcomes and resource usage.

A locally valid script or successful collection does not establish sustained CPU, storage, or database-quota headroom.

Avoid adding unbounded history scans or enrichment scraping to frequent collection work. Prefer bounded processing and cached public responses.

---

## Roadmap

The following remain future or follow-up work rather than guarantees about the current implementation:

- A clickable historical calendar/day picker.
- Controlled historical closure backfill with explicit coverage information.
- Further reconciliation of live closure status and historical episodes.
- Continued review of attraction classification and grouping.
- Additional verified event dates and seasonal metadata.
- More reproducible backend setup documentation and versioned deployment assets.
- Automated regression tests for data handling and interface behavior.
- Further accessibility and performance validation.

New closure analytics should be added only when observation coverage and classification support a defensible interpretation.

---

## Data sources and acknowledgments

- [Queue-Times](https://queue-times.com/) — reported attraction wait times and operating status.
- [ThemeParks.wiki](https://www.themeparks.wiki/) — park schedule information used by the deployed queue service.
- [National Weather Service](https://www.weather.gov/) — weather information presented through the separate weather service.
- [Walt Disney World](https://disneyworld.disney.go.com/) and [Disney Vacation Club](https://disneyvacationclub.disney.go.com/) — official event information used to maintain the frontend catalog.
- [Chart.js](https://www.chartjs.org/) — browser chart rendering.
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) and [D1](https://developers.cloudflare.com/d1/) — deployed collection, API, and database infrastructure.
- [GitHub Actions](https://docs.github.com/en/actions) — repository collection automation.
- [GitHub Pages](https://docs.github.com/en/pages) — static hosting support.

Preserve provider attribution and review applicable provider terms before redistributing data or changing collection behavior.

---

## Contributing

Suggestions, bug reports, and focused improvements are welcome through the repository’s Issues and pull requests.

For an interface or data issue, include:

- Park and attraction.
- Date and approximate time.
- Selected display time zone.
- Browser and screen size.
- Expected versus observed behavior.
- A screenshot or relevant console error.
- Source timestamps where available.

Please keep changes focused, explain data assumptions, and avoid combining unrelated calculation, classification, and presentation changes in one patch.

---

## License and affiliation

No license file is currently included in the repository. Do not assume that the code, data, park artwork, or third-party assets are covered by a permissive open-source license.

Disney names, characters, park identities, and other third-party assets remain associated with their respective owners.

Disney World Park Pulse is an independent project and is not affiliated with, sponsored by, or endorsed by The Walt Disney Company.

---

Every Disney day is different. Park Pulse helps put the available observations into context.
