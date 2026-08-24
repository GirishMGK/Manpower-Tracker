"""Entry point for the Windows desktop build (see desktop/firm_rms.spec).

This is what PyInstaller packages into firm-rms.exe. It turns the normal
client/server app into a single double-click program:

  1. Picks a per-user, writable data directory (outside the read-only
     install folder) to hold the SQLite database and a generated JWT
     secret, so the app works when installed under Program Files.
  2. Points the backend at that database via env vars — set *before*
     app.main is imported, since app.core.config.get_settings() reads them
     once and is lru_cached.
  3. Creates the schema and a default admin login on first run only
     (app.jobs.startup_seed — the same idempotent bootstrap used by
     docker-compose and Codespaces, NOT the 300-person demo dataset).
  4. Starts uvicorn in-process and opens the user's browser at it. main.py
     serves the built frontend (bundled alongside this launcher) from the
     same port, so there is exactly one process and one port.

Run directly with `python desktop/launcher.py` (from a repo checkout with
`frontend/dist` built) to test this without building the .exe.
"""
import os
import secrets
import sys
import threading
import time
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8000


def _app_dirs() -> tuple[Path, Path]:
    """Returns (data_dir, resource_dir).

    data_dir: per-user, writable — database + secret key live here, never
    inside the (often read-only, e.g. Program Files) install folder.
    resource_dir: root of the bundle's read-only contents. PyInstaller's
    onefile mode extracts these to a temp dir at sys._MEIPASS; running
    unfrozen (`python desktop/launcher.py` from a checkout) it's the repo
    root, so backend/ and frontend/dist/ resolve to their normal places.
    """
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    else:
        base = str(Path.home())
    data_dir = Path(base) / "FirmRMS"
    data_dir.mkdir(parents=True, exist_ok=True)

    if hasattr(sys, "_MEIPASS"):
        resource_dir = Path(sys._MEIPASS)
    else:
        resource_dir = Path(__file__).resolve().parent.parent
    return data_dir, resource_dir


def _static_dist_dir(resource_dir: Path) -> Path:
    # firm_rms.spec bundles the built frontend under frontend_dist/ at the
    # bundle root; running unfrozen it's still at its normal repo location.
    frozen_candidate = resource_dir / "frontend_dist"
    if frozen_candidate.is_dir():
        return frozen_candidate
    return resource_dir / "frontend" / "dist"


def _configure_environment(data_dir: Path, resource_dir: Path) -> None:
    db_path = data_dir / "firm_rms.db"
    os.environ.setdefault("RMS_DATABASE_URL", f"sqlite:///{db_path.as_posix()}")

    secret_file = data_dir / "secret.key"
    if not secret_file.exists():
        secret_file.write_text(secrets.token_hex(32), encoding="utf-8")
    os.environ.setdefault("RMS_JWT_SECRET_KEY", secret_file.read_text(encoding="utf-8").strip())

    os.environ.setdefault("RMS_ENVIRONMENT", "desktop")
    os.environ.setdefault("RMS_CORS_ORIGINS", f'["http://{HOST}:{PORT}"]')

    static_dir = _static_dist_dir(resource_dir)
    if static_dir.is_dir():
        os.environ.setdefault("RMS_STATIC_DIR", str(static_dir))


def _open_browser_when_ready() -> None:
    import urllib.request

    url = f"http://{HOST}:{PORT}/"
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://{HOST}:{PORT}/health", timeout=1)
            break
        except Exception:
            time.sleep(0.5)
    try:
        webbrowser.open(url)
    except Exception:
        # No default browser registered (e.g. a headless machine) — the
        # server is still up at `url`; this only affects the auto-open
        # convenience, not the app itself. Runs on a daemon thread, so an
        # unguarded exception here wouldn't crash the app either way, but
        # printing beats a silent stack trace in the console window.
        print(f"Could not open a browser automatically — open {url} yourself.")


def main() -> None:
    data_dir, resource_dir = _app_dirs()
    _configure_environment(data_dir, resource_dir)

    # Unfrozen dev run: resource_dir is the repo root, so add backend/ to
    # sys.path to resolve `app...` imports the same way `cwd=backend/` does
    # normally. Frozen: firm_rms.spec analyses backend/app directly (via
    # pathex), so it's already compiled into the bundle and this is a no-op.
    backend_dir = resource_dir / "backend"
    if backend_dir.is_dir():
        sys.path.insert(0, str(backend_dir))

    from app.jobs import startup_seed

    startup_seed.run()

    threading.Thread(target=_open_browser_when_ready, daemon=True).start()

    import uvicorn

    # Import the FastAPI app object itself rather than passing uvicorn the
    # "app.main:app" string form. Two reasons, both specific to running
    # frozen: (1) it's what makes PyInstaller's static analysis actually
    # trace and bundle app.main and everything it pulls in (all the
    # app.api.v1 routers, services, etc.) — a string is opaque to that
    # analysis, so without this import elsewhere, none of it gets bundled
    # and the frozen exe crashes the instant uvicorn tries to import it;
    # (2) it sidesteps uvicorn's import-by-string machinery at runtime
    # entirely, which is one less thing that has to work correctly inside
    # a frozen bundle.
    from app.main import app as fastapi_app

    print(f"Firm RMS is starting — your browser will open at http://{HOST}:{PORT}")
    print(f"Data stored at: {data_dir}")
    print("Default login: admin@firm.local / ChangeMe!2026 (you'll be asked to change it)")
    print("Close this window to stop the app.")

    uvicorn.run(fastapi_app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
