#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

python -m pip install --upgrade pip >/dev/null
pip install -r requirements.txt

export PYTHONPATH="$(pwd)${PYTHONPATH:+:$PYTHONPATH}"
exec uvicorn app.main:app --host 127.0.0.1 --port 8777
