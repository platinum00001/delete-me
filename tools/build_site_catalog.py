"""Regenerate docs/catalog.js from data/catalog.json (no personal data involved)."""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
cat = json.loads((root / "data" / "catalog.json").read_text())
keep = ("id", "name", "category", "opt_out_url", "method", "notes", "enabled")
cat = [{k: b.get(k) for k in keep} for b in cat]
(root / "docs" / "catalog.js").write_text(
    "// Generated from data/catalog.json by tools/build_site_catalog.py\n"
    "window.DM_CATALOG = " + json.dumps(cat, indent=1, ensure_ascii=False) + ";\n")
print(len(cat), "brokers written")
