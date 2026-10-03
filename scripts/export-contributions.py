"""Save the public calendar for the 3D viewer, retaining unchanged snapshots."""

from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen


QUERY = """
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date count: contributionCount level: contributionLevel } }
      }
    }
  }
}
"""
LEVELS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"]


def save_calendar(calendar, username, destination):
    days = [day for week in calendar["weeks"] for day in week["contributionDays"]]
    for day in days:
        date.fromisoformat(day["date"])
        if type(day["count"]) is not int or day["count"] < 0:
            raise ValueError("Invalid contribution count")
        day["level"] = LEVELS.index(day["level"])
    if not days or len({day["date"] for day in days}) != len(days):
        raise ValueError("Empty calendar or duplicate dates")
    snapshot = {"username": username, "total": calendar["totalContributions"], "days": days}
    if destination.exists():
        previous = json.loads(destination.read_text())
        previous.pop("updatedAt", None)
        if previous == snapshot:
            print("Viewer data unchanged; retaining the previous snapshot.")
            return
    snapshot["updatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(f"Saved {len(days)} days for the 3D viewer.")


if __name__ == "__main__":
    username = os.environ.get("PROFILE_CARDS_USERNAME", "prajeshshrestha")
    request = Request(
        "https://api.github.com/graphql",
        data=json.dumps({"query": QUERY, "variables": {"login": username}}).encode(),
        headers={"Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}", "Content-Type": "application/json"},
    )
    with urlopen(request, timeout=60) as response:
        result = json.load(response)
    if result.get("errors"):
        raise RuntimeError("GitHub could not return the contribution calendar")
    calendar = result["data"]["user"]["contributionsCollection"]["contributionCalendar"]
    save_calendar(calendar, username, Path(__file__).resolve().parents[1] / "docs/data.json")
