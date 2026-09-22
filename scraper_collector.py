"""
Disney World Busyness Monitor - Data Collector & Static JSON Generator
Runs via GitHub Actions on a cron schedule (every ~10 minutes).
Pulls live wait times for the 4 Walt Disney World theme parks via Queue-Times API,
computes real-time crowd index, and maintains three tiers of historical data:

  1. data/live_wait_times.json      - current snapshot (unchanged behavior)
  2. data/history_24h.json          - raw ~10-min resolution, rolling 24 hours
  3. data/history_7d.json           - hourly resolution, rolling 7 days
  4. data/historical_summary.json   - permanent aggregate: running avg wait per
                                       ride, bucketed by day-of-week + hour.
                                       Never grows unbounded; only updates in place.
"""

import json
import os
import datetime
import requests

PARKS = {
    "magic_kingdom": {"id": 6, "name": "Magic Kingdom", "capacity_weight": 1.0},
    "epcot": {"id": 5, "name": "EPCOT", "capacity_weight": 0.9},
    "hollywood_studios": {"id": 7, "name": "Disney's Hollywood Studios", "capacity_weight": 0.85},
    "animal_kingdom": {"id": 8, "name": "Disney's Animal Kingdom", "capacity_weight": 0.8}
}

DATA_DIR = "data"
LIVE_FILE = os.path.join(DATA_DIR, "live_wait_times.json")
HISTORY_24H_FILE = os.path.join(DATA_DIR, "history_24h.json")
HISTORY_7D_FILE = os.path.join(DATA_DIR, "history_7d.json")
SUMMARY_FILE = os.path.join(DATA_DIR, "historical_summary.json")

RETENTION_24H_HOURS = 24
RETENTION_7D_DAYS = 7
MIN_SAMPLES_FOR_RELIABLE = 15  # ~3 weeks of same weekday/hour before day-of-week view is trusted

WEEKDAY_ABBR = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


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


def run_collector():
    os.makedirs(DATA_DIR, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)
    timestamp_iso = now.isoformat()

    snapshot = {"updated_at": timestamp_iso, "parks": {}}

    history_24h = load_json(HISTORY_24H_FILE, {"updated_at": timestamp_iso, "rides": {}})
    history_7d = load_json(HISTORY_7D_FILE, {"updated_at": timestamp_iso, "rides": {}})
    summary = load_json(SUMMARY_FILE, {"updated_at": timestamp_iso, "min_samples_for_reliable": MIN_SAMPLES_FOR_RELIABLE, "rides": {}})
    summary["min_samples_for_reliable"] = MIN_SAMPLES_FOR_RELIABLE

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

    # Write all four files
    save_json(LIVE_FILE, snapshot)
    save_json(HISTORY_24H_FILE, history_24h)
    save_json(HISTORY_7D_FILE, history_7d)
    save_json(SUMMARY_FILE, summary)

    print(f"Successfully generated {LIVE_FILE} at {timestamp_iso}")
    print(f"24h history: {sum(len(r['points']) for r in history_24h['rides'].values())} points across {len(history_24h['rides'])} rides")
    print(f"7d history:  {sum(len(r['points']) for r in history_7d['rides'].values())} points across {len(history_7d['rides'])} rides")
    print(f"Summary buckets: {sum(len(r['buckets']) for r in summary['rides'].values())} across {len(summary['rides'])} rides")


if __name__ == "__main__":
    run_collector()
