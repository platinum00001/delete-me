"""CLI entry for weekly automation: python -m app.run_weekly"""

from __future__ import annotations

import argparse
import json
import sys

from app import storage


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Queue opt-out actions for all enabled incomplete targets."
    )
    parser.add_argument(
        "--open-browser",
        action="store_true",
        help="Open up to 5 web opt-out URLs in the default browser.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print full JSON result instead of a short summary.",
    )
    args = parser.parse_args(argv)

    storage.ensure_data_dir()
    result = storage.run_delete_all(open_browser=args.open_browser)

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(result["summary"])
        print(f"Run id: {result['run_id']}")
        for a in result["actions"]:
            print(f"  - {a['name']}: {a['action']} -> {a.get('url', '')[:80]}")
        if result.get("profile_empty"):
            print(
                "WARNING: Profile is empty. Save your info in the web UI before opting out.",
                file=sys.stderr,
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
