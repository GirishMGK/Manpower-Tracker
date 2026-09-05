#!/usr/bin/env bash
# Starts both dev servers in the background, bound to 0.0.0.0 so Codespaces'
# port forwarding can reach them. Runs on every Codespace start/resume
# (postStartCommand) — guarded so it doesn't spawn duplicates on a resume.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p /tmp/firm-rms-logs

if ! pgrep -f "uvicorn app.main:app" > /dev/null; then
  echo "==> Starting backend (uvicorn) on :8000"
  (cd backend && nohup .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 \
    > /tmp/firm-rms-logs/backend.log 2>&1 &)
else
  echo "==> Backend already running"
fi

if ! pgrep -f "vite.*--port 5173" > /dev/null; then
  echo "==> Starting frontend (vite) on :5173"
  (cd frontend && nohup npm run dev -- --host 0.0.0.0 --port 5173 \
    > /tmp/firm-rms-logs/frontend.log 2>&1 &)
else
  echo "==> Frontend already running"
fi

echo "==> Logs: /tmp/firm-rms-logs/{backend,frontend}.log"
