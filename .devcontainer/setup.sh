#!/usr/bin/env bash
# One-time Codespace setup: install deps, seed a demo dataset into a fresh
# SQLite dev DB. Runs once per Codespace creation (postCreateCommand).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Backend: venv + deps"
cd backend
python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt

echo "==> Backend: seed demo dataset (admin@firm.local / ChangeMe!2026)"
.venv/bin/python -m app.jobs.startup_seed
.venv/bin/python -m seed.seed_data

cd ../frontend
echo "==> Frontend: npm install"
npm install --silent

echo "==> Setup complete. Servers will start automatically."
