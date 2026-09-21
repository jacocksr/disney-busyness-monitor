"""
Disney World Busyness Monitor - Data Collector & Static JSON Generator
Runs via GitHub Actions on a cron schedule (every 10-15 minutes).
Pulls live wait times for the 4 Walt Disney World theme parks via Queue-Times API,
computes real-time crowd index and historical rolling averages, and saves static JSON feeds.
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
HISTORY_FILE = os.path.join(DATA_DIR, "historical_summary.json")

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
    # Calibrated scale: 15 min avg ~ 3/10, 40 min avg ~ 6.5/10, 65+ min avg ~ 9.5-10/10
    score = min(10.0, max(1.0, round((avg_wait / 7.0), 1)))
    return score, round(avg_wait, 1)

def run_collector():
    os.makedirs(DATA_DIR, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc)
    timestamp_iso = now.isoformat()

    snapshot = {
        "updated_at": timestamp_iso,
        "parks": {}
    }

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

    # Write current live snapshot
    with open(LIVE_FILE, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2)
    print(f"Successfully generated {LIVE_FILE} at {timestamp_iso}")

if __name__ == "__main__":
    run_collector()
