"""FastAPI app for Delete Me (Info Cleanup)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app import storage

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = Jinja2Templates(directory=str(ROOT / "templates"))

app = FastAPI(
    title="Delete Me",
    description="Local info cleanup helper for your own data-broker opt-outs.",
    version="1.0.0",
)
app.mount("/static", StaticFiles(directory=str(ROOT / "static")), name="static")


@app.on_event("startup")
def _startup() -> None:
    storage.ensure_data_dir()
    storage.get_db().close()


def _ctx(request: Request, **extra: Any) -> dict[str, Any]:
    profile = storage.load_profile()
    targets = storage.enriched_targets()
    enabled = [t for t in targets if t.get("enabled")]
    incomplete = [
        t
        for t in enabled
        if t.get("status") != "completed"
    ]
    return {
        "request": request,
        "profile": profile,
        "profile_empty": storage.profile_is_empty(profile),
        "targets": targets,
        "statuses": storage.STATUSES,
        "enabled_count": len(enabled),
        "incomplete_count": len(incomplete),
        "runs": storage.list_runs(20),
        **extra,
    }


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request) -> HTMLResponse:
    return TEMPLATES.TemplateResponse(request, "index.html", _ctx(request))


@app.get("/profile", response_class=HTMLResponse)
async def profile_page(request: Request) -> HTMLResponse:
    return TEMPLATES.TemplateResponse(request, "profile.html", _ctx(request))


@app.post("/profile")
async def save_profile(
    full_name: str = Form(""),
    aliases: str = Form(""),
    emails: str = Form(""),
    phones: str = Form(""),
    addresses: str = Form(""),
    usernames: str = Form(""),
) -> RedirectResponse:
    storage.save_profile(
        {
            "full_name": full_name,
            "aliases": aliases,
            "emails": emails,
            "phones": phones,
            "addresses": addresses,
            "usernames": usernames,
        }
    )
    return RedirectResponse("/?saved=profile", status_code=303)


@app.post("/api/targets/{target_id}/status")
async def api_set_status(target_id: str, request: Request) -> JSONResponse:
    body = await request.json()
    status = body.get("status")
    notes = body.get("notes")
    if status not in storage.STATUSES:
        raise HTTPException(400, f"Invalid status. Use one of: {storage.STATUSES}")
    ids = {t["id"] for t in storage.load_catalog()}
    if target_id not in ids:
        raise HTTPException(404, "Unknown target")
    storage.set_status(target_id, status, notes=notes)
    return JSONResponse({"ok": True, "target_id": target_id, "status": status})


@app.post("/api/targets/{target_id}/enabled")
async def api_set_enabled(target_id: str, request: Request) -> JSONResponse:
    body = await request.json()
    enabled = bool(body.get("enabled"))
    ids = {t["id"] for t in storage.load_catalog()}
    if target_id not in ids:
        raise HTTPException(404, "Unknown target")
    storage.set_enabled(target_id, enabled)
    return JSONResponse({"ok": True, "target_id": target_id, "enabled": enabled})


@app.post("/api/run-delete-all")
async def api_run_delete_all(request: Request) -> JSONResponse:
    """Weekly / automation entry: queue all enabled incomplete opt-outs."""
    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except Exception:
        body = {}
    open_browser = bool(body.get("open_browser", False))
    result = storage.run_delete_all(open_browser=open_browser)
    return JSONResponse(result)


@app.get("/api/profile")
async def api_get_profile() -> JSONResponse:
    return JSONResponse(storage.load_profile())


@app.get("/api/targets")
async def api_get_targets() -> JSONResponse:
    return JSONResponse(storage.enriched_targets())


@app.get("/api/runs")
async def api_get_runs() -> JSONResponse:
    return JSONResponse(storage.list_runs())


@app.get("/api/email-body/{target_id}")
async def api_email_body(target_id: str) -> JSONResponse:
    catalog = {t["id"]: t for t in storage.load_catalog()}
    if target_id not in catalog:
        raise HTTPException(404, "Unknown target")
    profile = storage.load_profile()
    target = catalog[target_id]
    return JSONResponse(
        {
            "body": storage.build_email_body(profile, target["name"]),
            "mailto": storage.mailto_for_target(profile, target),
            "target": target["name"],
        }
    )


@app.get("/history", response_class=HTMLResponse)
async def history_page(request: Request) -> HTMLResponse:
    return TEMPLATES.TemplateResponse(request, "history.html", _ctx(request))
