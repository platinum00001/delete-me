"""Allow: python -m app.run_weekly via python -m app if desired."""

from app.run_weekly import main

if __name__ == "__main__":
    raise SystemExit(main())
