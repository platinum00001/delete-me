# Delete Me (Info Cleanup)

Free tools for opting yourself out of US data brokers and people-search sites. This repo has two parts:

| Part | Folder | What it is |
|------|--------|------------|
| **Website** | [`docs/`](docs/) | Static, browser-only site served by GitHub Pages: **https://platinum00001.github.io/delete-me/** |
| **Local app** | `app/`, `templates/`, `static/` | FastAPI app that runs on your own machine (127.0.0.1) with an API/CLI for weekly automation |

Both use the same broker catalog, `data/catalog.json`.

## Website (docs/)

- Plain HTML/CSS/JS — no backend, no analytics, no third-party scripts, strict Content-Security-Policy.
- Your info (name, aliases, emails, phones, addresses, usernames) is saved **only in your browser** (localStorage). Export/Import JSON backup and a **Clear my data** button are on the *Your info* tab.
- **Delete all** walks through every enabled broker that isn't done: each step copies your details to the clipboard and opens the official opt-out page (or a prefilled request email for email-based brokers). Mark each one *Submitted* or *Confirmed*; re-check dates are set automatically (30 / 90 days) and can be edited.
- Dashboard with progress, filters, and per-broker on/off toggles.
- Downloadable `.ics` calendar reminder: weekly, Mondays 9:00 AM (your local time).

To update the site's broker list after editing `data/catalog.json`:

```bash
python3 tools/build_site_catalog.py   # regenerates docs/catalog.js
```

Preview locally: `cd docs && python3 -m http.server 8080` then open http://127.0.0.1:8080/.
Smoke test (fake data only): `python3 tools/smoke_test.py http://127.0.0.1:8080/` (needs Playwright).

## Local app

A **local-only** helper website for opting yourself out of US data brokers and people-search sites.

You enter your personal info once, browse a curated catalog of opt-out targets, then click **Delete all** to open or queue removal requests for every enabled incomplete target. Status is tracked locally. A small API and CLI support weekly automation.

## Safety

- For **your own data only** (privacy opt-outs).
- Prefer official opt-out URLs and email templates — **no** password logins, credential stuffing, or CAPTCHA bypass.
- Binds to **127.0.0.1** only. Profile, catalog toggles, statuses, and run history stay under `data/`.
- Many brokers still require **email verification** or manual steps. The app tracks status and opens the right links; it does **not** guarantee instant erasure.

## Requirements

- Python 3.10+ (3.11+ recommended)

## Quick start

```bash
git clone https://github.com/platinum00001/delete-me.git
cd delete-me
./start.sh
```

Then open **http://127.0.0.1:8777/**

### Manual start

```bash
cd /workspace/delete-me
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export PYTHONPATH="$(pwd)"
uvicorn app.main:app --host 127.0.0.1 --port 8777
```

## How to use

1. Open **Your info** and save name, aliases, emails, phones, addresses, usernames.
2. On the **Dashboard**, toggle which catalog targets are enabled.
3. Click **Delete all** — the app marks targets as `opened`, opens web opt-out pages, and prepares mailto/email bodies where needed.
4. After you submit / verify on each site, use **Mark done** or change the status dropdown (`submitted`, `awaiting_verification`, `completed`, `failed`).
5. Check **Run history** for past Delete-all / weekly runs.

## Weekly automation

### HTTP API

```bash
curl -s -X POST http://127.0.0.1:8777/api/run-delete-all \
  -H 'Content-Type: application/json' \
  -d '{"open_browser": false}'
```

Optional: `"open_browser": true` opens up to 5 web URLs on the server machine (useful only if the server runs on your desktop).

Other useful endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/profile` | Saved profile |
| GET | `/api/targets` | Catalog + statuses |
| GET | `/api/runs` | Run history |
| POST | `/api/targets/{id}/status` | `{"status":"completed"}` |
| POST | `/api/targets/{id}/enabled` | `{"enabled":true}` |

### CLI

With the same venv / `PYTHONPATH`:

```bash
cd /workspace/delete-me
source .venv/bin/activate
export PYTHONPATH="$(pwd)"
python -m app.run_weekly
python -m app.run_weekly --json
python -m app.run_weekly --open-browser
```

Example crontab (weekly Monday 9:00 local — adjust timezone as needed):

```cron
0 9 * * 1 cd /workspace/delete-me && . .venv/bin/activate && PYTHONPATH=/workspace/delete-me python -m app.run_weekly >> /workspace/delete-me/data/weekly.log 2>&1
```

## Data files

| Path | Purpose |
|------|---------|
| `data/catalog.json` | Editable broker catalog (name, URL, method, notes, enabled) |
| `data/profile.json` | Your saved profile (created on first save) |
| `data/status.db` | SQLite: per-target status + run history |

Add or edit brokers by updating `data/catalog.json` (unique `id`, real opt-out URL when possible).

## Status values

`not_started` → `opened` → `submitted` → `awaiting_verification` → `completed` (or `failed`)

## Limitations

- Opt-out URLs change; if a link 404s, update `data/catalog.json`.
- Most people-search sites need a confirmation email or captcha — complete those steps yourself.
- The app does not scrape listings or submit remote forms automatically.
- “Delete all” opens many tabs; browsers may block pop-ups — allow them for `127.0.0.1`.
- Email targets open a template / mailto; you still send the message.

## License

Personal / local use. Use responsibly and only for your own information.
