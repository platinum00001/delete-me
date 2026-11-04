"""Local JSON/SQLite-backed storage for profile, statuses, and run history."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CATALOG_PATH = DATA_DIR / "catalog.json"
PROFILE_PATH = DATA_DIR / "profile.json"
DB_PATH = DATA_DIR / "status.db"

STATUSES = (
    "not_started",
    "opened",
    "submitted",
    "awaiting_verification",
    "completed",
    "failed",
)

DEFAULT_PROFILE = {
    "full_name": "",
    "aliases": [],
    "emails": [],
    "phones": [],
    "addresses": [],
    "usernames": [],
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def get_db() -> sqlite3.Connection:
    ensure_data_dir()
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS target_status (
            target_id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'not_started',
            notes TEXT DEFAULT '',
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            summary TEXT,
            details_json TEXT
        )
        """
    )
    conn.commit()
    return conn


def load_catalog() -> list[dict[str, Any]]:
    ensure_data_dir()
    if not CATALOG_PATH.exists():
        return []
    with CATALOG_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def save_catalog(catalog: list[dict[str, Any]]) -> None:
    ensure_data_dir()
    with CATALOG_PATH.open("w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2)
        f.write("\n")


def load_profile() -> dict[str, Any]:
    ensure_data_dir()
    if not PROFILE_PATH.exists():
        return dict(DEFAULT_PROFILE)
    with PROFILE_PATH.open(encoding="utf-8") as f:
        data = json.load(f)
    out = dict(DEFAULT_PROFILE)
    out.update(data)
    for key in ("aliases", "emails", "phones", "addresses", "usernames"):
        if isinstance(out.get(key), str):
            out[key] = [x.strip() for x in out[key].splitlines() if x.strip()]
        elif not isinstance(out.get(key), list):
            out[key] = []
    return out


def save_profile(profile: dict[str, Any]) -> dict[str, Any]:
    ensure_data_dir()
    cleaned = {
        "full_name": (profile.get("full_name") or "").strip(),
        "aliases": _as_list(profile.get("aliases")),
        "emails": _as_list(profile.get("emails")),
        "phones": _as_list(profile.get("phones")),
        "addresses": _as_list(profile.get("addresses")),
        "usernames": _as_list(profile.get("usernames")),
    }
    with PROFILE_PATH.open("w", encoding="utf-8") as f:
        json.dump(cleaned, f, indent=2)
        f.write("\n")
    return cleaned


def _as_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(x).strip() for x in value if str(x).strip()]
    if isinstance(value, str):
        return [x.strip() for x in value.replace(",", "\n").splitlines() if x.strip()]
    return [str(value).strip()] if str(value).strip() else []


def get_all_statuses() -> dict[str, dict[str, str]]:
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT target_id, status, notes, updated_at FROM target_status"
        ).fetchall()
        return {
            r["target_id"]: {
                "status": r["status"],
                "notes": r["notes"] or "",
                "updated_at": r["updated_at"],
            }
            for r in rows
        }
    finally:
        conn.close()


def set_status(target_id: str, status: str, notes: str | None = None) -> None:
    if status not in STATUSES:
        raise ValueError(f"Invalid status: {status}")
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT notes FROM target_status WHERE target_id = ?", (target_id,)
        ).fetchone()
        note_val = notes if notes is not None else (existing["notes"] if existing else "")
        conn.execute(
            """
            INSERT INTO target_status (target_id, status, notes, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(target_id) DO UPDATE SET
                status = excluded.status,
                notes = excluded.notes,
                updated_at = excluded.updated_at
            """,
            (target_id, status, note_val, _utc_now()),
        )
        conn.commit()
    finally:
        conn.close()


def set_enabled(target_id: str, enabled: bool) -> None:
    catalog = load_catalog()
    for item in catalog:
        if item["id"] == target_id:
            item["enabled"] = bool(enabled)
            break
    save_catalog(catalog)


def profile_is_empty(profile: dict[str, Any] | None = None) -> bool:
    p = profile or load_profile()
    return not (p.get("full_name") or "").strip()


def build_email_body(profile: dict[str, Any], target_name: str) -> str:
    lines = [
        f"Subject: Opt-out / deletion request — {profile.get('full_name') or '[Your Name]'}",
        "",
        f"Hello {target_name} Privacy Team,",
        "",
        "I am requesting that you remove / opt out my personal information from your databases and public listings.",
        "",
        "My details:",
        f"- Full name: {profile.get('full_name') or '(not provided)'}",
    ]
    if profile.get("aliases"):
        lines.append(f"- Aliases / previous names: {', '.join(profile['aliases'])}")
    if profile.get("emails"):
        lines.append(f"- Email addresses: {', '.join(profile['emails'])}")
    if profile.get("phones"):
        lines.append(f"- Phone numbers: {', '.join(profile['phones'])}")
    if profile.get("addresses"):
        lines.append(f"- Addresses: {'; '.join(profile['addresses'])}")
    if profile.get("usernames"):
        lines.append(f"- Usernames: {', '.join(profile['usernames'])}")
    lines += [
        "",
        "Please confirm when the removal is complete.",
        "",
        "Thank you,",
        profile.get("full_name") or "[Your Name]",
    ]
    return "\n".join(lines)


def mailto_for_target(profile: dict[str, Any], target: dict[str, Any]) -> str:
    url = target.get("opt_out_url") or ""
    body = build_email_body(profile, target.get("name", "Privacy Team"))
    if url.startswith("mailto:"):
        # Append body if not already present
        sep = "&" if "?" in url else "?"
        from urllib.parse import quote

        return f"{url}{sep}body={quote(body)}"
    from urllib.parse import quote

    subject = quote(f"Opt-out request — {profile.get('full_name') or 'privacy'}")
    return f"mailto:?subject={subject}&body={quote(body)}"


def create_run(details: list[dict[str, Any]], summary: str) -> int:
    conn = get_db()
    try:
        now = _utc_now()
        cur = conn.execute(
            """
            INSERT INTO runs (started_at, finished_at, summary, details_json)
            VALUES (?, ?, ?, ?)
            """,
            (now, now, summary, json.dumps(details)),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_runs(limit: int = 50) -> list[dict[str, Any]]:
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT id, started_at, finished_at, summary, details_json
            FROM runs
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        out = []
        for r in rows:
            out.append(
                {
                    "id": r["id"],
                    "started_at": r["started_at"],
                    "finished_at": r["finished_at"],
                    "summary": r["summary"],
                    "details": json.loads(r["details_json"] or "[]"),
                }
            )
        return out
    finally:
        conn.close()


def enriched_targets() -> list[dict[str, Any]]:
    catalog = load_catalog()
    statuses = get_all_statuses()
    result = []
    for item in catalog:
        tid = item["id"]
        st = statuses.get(tid, {"status": "not_started", "notes": "", "updated_at": None})
        row = dict(item)
        row["status"] = st["status"]
        row["status_notes"] = st["notes"]
        row["updated_at"] = st["updated_at"]
        result.append(row)
    return result


INCOMPLETE = {"not_started", "opened", "submitted", "awaiting_verification", "failed"}


def run_delete_all(open_browser: bool = False) -> dict[str, Any]:
    """Queue opt-outs for every enabled incomplete target. Updates statuses."""
    profile = load_profile()
    targets = enriched_targets()
    actions: list[dict[str, Any]] = []
    opened_urls: list[str] = []

    for t in targets:
        if not t.get("enabled"):
            continue
        if t.get("status") == "completed":
            continue
        method = t.get("method") or "web_form"
        action: dict[str, Any] = {
            "id": t["id"],
            "name": t["name"],
            "method": method,
            "status_before": t.get("status"),
        }
        if method == "email" or (t.get("opt_out_url") or "").startswith("mailto:"):
            link = mailto_for_target(profile, t)
            action["url"] = link
            action["email_body"] = build_email_body(profile, t["name"])
            action["action"] = "mailto"
        else:
            link = t.get("opt_out_url") or ""
            action["url"] = link
            action["action"] = "open_url"
            action["hint"] = (
                f"Use profile: {profile.get('full_name') or '(add profile)'}. "
                f"{t.get('notes') or ''}"
            ).strip()

        set_status(t["id"], "opened", notes=f"Queued at {_utc_now()}")
        action["status_after"] = "opened"
        actions.append(action)
        if link and not link.startswith("mailto:"):
            opened_urls.append(link)

    if open_browser and opened_urls:
        import webbrowser

        for url in opened_urls[:5]:  # safety: don't open dozens at once in CLI
            webbrowser.open(url)

    summary = (
        f"Queued {len(actions)} opt-out(s). "
        f"Profile: {profile.get('full_name') or '(empty — fill profile first)'}."
    )
    run_id = create_run(actions, summary)
    return {
        "run_id": run_id,
        "summary": summary,
        "count": len(actions),
        "actions": actions,
        "profile_empty": profile_is_empty(profile),
    }
