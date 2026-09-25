"""
Disney World Busyness Monitor - Data Collector & Static JSON Generator
Runs via GitHub Actions on a cron schedule (every ~10 minutes).
Pulls live wait times for the 4 Walt Disney World theme parks via Queue-Times API,
computes real-time crowd index, and maintains four tiers of historical data:

  1. data/live_wait_times.json      - current snapshot (unchanged behavior)
  2. data/history_24h.json          - raw ~10-min resolution, rolling 24 hours
  3. data/history_7d.json           - hourly resolution, rolling 7 days
  4. data/historical_summary.json   - permanent aggregate: running avg wait per
                                       ride, bucketed by day-of-week + hour.
                                       Never grows unbounded; only updates in place.
  5. data/events/YYYY-MM-DD.jsonl   - NEW: permanent raw event log, one file per
                                       calendar day, one line per (ride, scrape).
                                       Preserves exact date + full context
                                       (park hours, weekday, month, holiday,
                                       weather) forever, at bounded per-day size.
                                       Never rewritten after the day ends -> git
                                       history grows by one small new file per
                                       day instead of one big diff every 10 min.
"""

import json
import os
import datetime
import calendar
import requests

PARKS = {
    "magic_kingdom": {"id": 6, "name": "Magic Kingdom", "capacity_weight": 1.0},
    "epcot": {"id": 5, "name": "EPCOT", "capacity_weight": 0.9},
    "hollywood_studios": {"id": 7, "name": "Disney's Hollywood Studios", "capacity_weight": 0.85},
    "animal_kingdom": {"id": 8, "name": "Disney's Animal Kingdom", "capacity_weight": 0.8}
}

# Same DEFAULT_HOURS the frontend hardcodes today -- now the source of truth also
# lives here so it can be written into every event record.
DEFAULT_HOURS = {
    "magic_kingdom":      {"early_entry": "08:30", "open": "09:00", "close": "22:00"},
    "epcot":               {"early_entry": "08:30", "open": "09:00", "close": "21:00"},
    "hollywood_studios":   {"early_entry": "08:30", "open": "09:00", "close": "21:00"},
    "animal_kingdom":      {"early_entry": "07:30", "open": "08:00", "close": "18:00"}
}

# Fixed-date + floating US holidays relevant to WDW crowd patterns.
# Extend this dict as needed; floating holidays are resolved at runtime below.
FIXED_HOLIDAYS = {
    (1, 1): "New Year's Day",
    (7, 4): "Independence Day",
    (12, 24): "Christmas Eve",
    (12, 25): "Christmas Day",
    (12, 31): "New Year's Eve",
}

DATA_DIR = "data"
EVENTS_DIR = os.path.join(DATA_DIR, "events")
LIVE_FILE = os.path.join(DATA_DIR, "live_wait_times.json")
HISTORY_24H_FILE = os.path.join(DATA_DIR, "history_24h.json")
HISTORY_7D_FILE = os.path.join(DATA_DIR, "history_7d.json")
SUMMARY_FILE = os.path.join(DATA_DIR, "historical_summary.json")

RETENTION_24H_HOURS = 24
RETENTION_7D_DAYS = 7
MIN_SAMPLES_FOR_RELIABLE = 15  # ~3 weeks of same weekday/hour before day-of-week view is trusted

WEEKDAY_ABBR = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WEEKDAY_NAME = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTH_NAME = list(calendar.month_name)  # index 1-12


def fetch_park_queue(park_id: int):
    url = f"https://queue-times.com/parks/{park_id}/queue_times.json"
    headers = {"User-Agent": "WDW-Busyness-Monitor/1.0 (GitHubActions-Collector)"}
    try:
        resp = requests.get(url, headers=headers, timeout=12)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Error fetching park {park_id}: {e}")
        return None


def compute_crowd_score(rides):
    """
    Computes a 1-10 crowd score based on average wait times of open headliner attractions.
    Score 1-3: Low, 4-6: Moderate, 7-8: Busy, 9-10: Peak.
    """
    open_waits = [r["wait_time"] for r in rides if r.get("is_open") and r.get("wait_time", 0) > 0]
    if not open_waits:
        return 1.0, 0

    avg_wait = sum(open_waits) / len(open_waits)
    score = min(10.0, max(1.0, round((avg_wait / 7.0), 1)))
    return score, round(avg_wait, 1)


def load_json(path, default):
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"Warning: could not read {path} ({e}); starting fresh.")
    return default


def save_json(path, payload):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def prune_points(points, cutoff_iso):
    """Keep only [timestamp, wait_time] pairs newer than cutoff_iso."""
    return [p for p in points if p[0] >= cutoff_iso]


def update_24h_history(history, park_key, ride, timestamp_iso):
    ride_id = str(ride["id"])
    entry = history["rides"].setdefault(ride_id, {
        "name": ride["name"], "park": park_key, "points": []
    })
    entry["name"] = ride["name"]
    entry["park"] = park_key
    if ride.get("is_open"):
        entry["points"].append([timestamp_iso, ride["wait_time"]])


def update_7d_history(history, park_key, ride, timestamp_iso, now):
    """Append at most once per hour per ride to keep this file hourly-resolution."""
    ride_id = str(ride["id"])
    entry = history["rides"].setdefault(ride_id, {
        "name": ride["name"], "park": park_key, "points": []
    })
    entry["name"] = ride["name"]
    entry["park"] = park_key
    if not ride.get("is_open"):
        return
    last_point = entry["points"][-1] if entry["points"] else None
    if last_point is None or last_point[0][:13] != timestamp_iso[:13]:  # different hour bucket (YYYY-MM-DDTHH)
        entry["points"].append([timestamp_iso, ride["wait_time"]])


def update_summary(summary, park_key, ride, now):
    if not ride.get("is_open") or ride.get("wait_time", 0) <= 0:
        return
    ride_id = str(ride["id"])
    bucket_key = f"{WEEKDAY_ABBR[now.weekday()]}_{now.hour:02d}"

    ride_entry = summary["rides"].setdefault(ride_id, {
        "name": ride["name"], "park": park_key, "buckets": {}
    })
    ride_entry["name"] = ride["name"]
    ride_entry["park"] = park_key

    bucket = ride_entry["buckets"].setdefault(bucket_key, {"avg_wait": 0.0, "samples": 0})
    n = bucket["samples"]
    bucket["avg_wait"] = round((bucket["avg_wait"] * n + ride["wait_time"]) / (n + 1), 1)
    bucket["samples"] = n + 1


def get_holiday_name(date_obj):
    """Resolve fixed-date holidays and a few common floating US holidays for a given date."""
    key = (date_obj.month, date_obj.day)
    if key in FIXED_HOLIDAYS:
        return FIXED_HOLIDAYS[key]

    year = date_obj.year

    def nth_weekday(month, weekday, n):
        """1-indexed nth occurrence of `weekday` (0=Mon) in `month`."""
        d = datetime.date(year, month, 1)
        offset = (weekday - d.weekday()) % 7
        d += datetime.timedelta(days=offset + 7 * (n - 1))
        return d

    def last_weekday(month, weekday):
        d = datetime.date(year, month, calendar.monthrange(year, month)[1])
        offset = (d.weekday() - weekday) % 7
        return d - datetime.timedelta(days=offset)

    floating = {
        nth_weekday(11, 3, 4): "Thanksgiving",              # 4th Thursday of November
        last_weekday(5, 0): "Memorial Day",                 # last Monday of May
        nth_weekday(9, 0, 1): "Labor Day",                  # 1st Monday of September
        nth_weekday(1, 0, 3): "MLK Day",                    # 3rd Monday of January
        nth_weekday(2, 0, 3): "Presidents' Day",            # 3rd Monday of February
    }
    return floating.get(date_obj, None)


def get_park_hours_for_event(park_key):
    """Returns the park's scheduled hours dict; swap for a real per-day hours API later if needed."""
    return DEFAULT_HOURS.get(park_key)


def append_event_log(date_str, records):
    """
    Appends raw per-ride event records to data/events/YYYY-MM-DD.jsonl (one line per record).
    Files are never rewritten once the day is over -> bounded git diff per run,
    and full raw history back to day one stays queryable by exact calendar date.
    """
    os.makedirs(EVENTS_DIR, exist_ok=True)
    path = os.path.join(EVENTS_DIR, f"{date_str}.jsonl")
    with open(path, "a", encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, separators=(",", ":")) + "\n")


def build_event_record(now, park_key, park_info, ride, weather=None):
    """Builds one flat, fully self-describing event record for the raw log."""
    date_obj = now.date()
    holiday_name = get_holiday_name(date_obj)
    return {
        "timestamp": now.isoformat(),
        "park": park_key,
        "attraction_id": ride.get("id"),
        "attraction": ride.get("name"),
        "land": ride.get("land"),
        "wait": ride.get("wait_time", 0),
        "operational_status": "open" if ride.get("is_open") else "closed",
        "park_hours": get_park_hours_for_event(park_key),
        "weekday": WEEKDAY_NAME[now.weekday()],
        "month": MONTH_NAME[now.month],
        "is_holiday": holiday_name is not None,
        "holiday_name": holiday_name,
        "weather": weather,  # placeholder: wire up a weather API call here when ready
    }


def run_collector():
    os.makedirs(DATA_DIR, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)
    timestamp_iso = now.isoformat()
    today_str = now.date().isoformat()

    snapshot = {"updated_at": timestamp_iso, "parks": {}}

    history_24h = load_json(HISTORY_24H_FILE, {"updated_at": timestamp_iso, "rides": {}})
    history_7d = load_json(HISTORY_7D_FILE, {"updated_at": timestamp_iso, "rides": {}})
    summary = load_json(SUMMARY_FILE, {"updated_at": timestamp_iso, "min_samples_for_reliable": MIN_SAMPLES_FOR_RELIABLE, "rides": {}})
    summary["min_samples_for_reliable"] = MIN_SAMPLES_FOR_RELIABLE

    event_records = []

    for key, info in PARKS.items():
        data = fetch_park_queue(info["id"])
        flat_rides = []
        if data and "lands" in data:
            for land in data["lands"]:
                land_name = land.get("name", "General")
                for ride in land.get("rides", []):
                    flat_rides.append({
                        "id": ride.get("id"),
                        "name": ride.get("name"),
                        "land": land_name,
                        "is_open": ride.get("is_open", False),
                        "wait_time": ride.get("wait_time", 0),
                        "last_updated": ride.get("last_updated")
                    })

        crowd_score, avg_wait = compute_crowd_score(flat_rides)
        open_count = sum(1 for r in flat_rides if r["is_open"])
        down_count = sum(1 for r in flat_rides if not r["is_open"])

        snapshot["parks"][key] = {
            "name": info["name"],
            "crowd_score": crowd_score,
            "avg_wait": avg_wait,
            "open_attractions": open_count,
            "down_attractions": down_count,
            "rides": sorted(flat_rides, key=lambda x: x["wait_time"], reverse=True)
        }

        for ride in flat_rides:
            if ride.get("id") is None:
                continue
            update_24h_history(history_24h, key, ride, timestamp_iso)
            update_7d_history(history_7d, key, ride, timestamp_iso, now)
            update_summary(summary, key, ride, now)
            event_records.append(build_event_record(now, key, info, ride))

    # Prune rolling windows
    cutoff_24h = (now - datetime.timedelta(hours=RETENTION_24H_HOURS)).isoformat()
    cutoff_7d = (now - datetime.timedelta(days=RETENTION_7D_DAYS)).isoformat()

    for entry in history_24h["rides"].values():
        entry["points"] = prune_points(entry["points"], cutoff_24h)
    for entry in history_7d["rides"].values():
        entry["points"] = prune_points(entry["points"], cutoff_7d)

    history_24h["updated_at"] = timestamp_iso
    history_7d["updated_at"] = timestamp_iso
    summary["updated_at"] = timestamp_iso

    # Write all four existing files (unchanged behavior)
    save_json(LIVE_FILE, snapshot)
    save_json(HISTORY_24H_FILE, history_24h)
    save_json(HISTORY_7D_FILE, history_7d)
    save_json(SUMMARY_FILE, summary)

    # Append today's raw event log (new tier 5 -- never rewrites prior days)
    append_event_log(today_str, event_records)

    print(f"Successfully generated {LIVE_FILE} at {timestamp_iso}")
    print(f"24h history: {sum(len(r['points']) for r in history_24h['rides'].values())} points across {len(history_24h['rides'])} rides")
    print(f"7d history:  {sum(len(r['points']) for r in history_7d['rides'].values())} points across {len(history_7d['rides'])} rides")
    print(f"Summary buckets: {sum(len(r['buckets']) for r in summary['rides'].values())} across {len(summary['rides'])} rides")
    print(f"Event log: appended {len(event_records)} records to data/events/{today_str}.jsonl")


if __name__ == "__main__":
    run_collector()
