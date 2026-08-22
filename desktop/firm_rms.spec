# PyInstaller build spec for the Windows desktop build. Run from the repo
# root (paths below are relative to this file's directory):
#
#   cd backend && pip install -r requirements.txt pyinstaller pyinstaller-hooks-contrib
#   cd ../frontend && npm ci && npm run build
#   cd .. && pyinstaller desktop/firm_rms.spec --noconfirm
#
# Produces dist/firm-rms/firm-rms.exe (onedir — faster startup than
# --onefile, and easier for users to see what's installed). See
# .github/workflows/build-windows-exe.yml, which runs exactly this on a
# windows-latest runner and is the supported way to actually get the .exe
# (PyInstaller must run on the target OS — it cannot cross-compile a
# Windows binary from Linux/macOS).
from pathlib import Path

block_cipher = None
repo_root = Path(SPECPATH)
backend_dir = repo_root / "backend"
frontend_dist = repo_root / "frontend" / "dist"

datas = []
if frontend_dist.is_dir():
    datas.append((str(frontend_dist), "frontend_dist"))

# Third-party dependencies that resolve backends/plugins via importlib
# rather than a plain top-level import, so PyInstaller's static analysis
# can't discover them on its own.
hiddenimports = [
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
    "passlib.handlers.bcrypt",
    "bcrypt",
    "email_validator",
    "apscheduler.triggers.cron",
    "apscheduler.triggers.interval",
    "apscheduler.executors.pool",
    "apscheduler.jobstores.memory",
    "jwt",
    "multipart",
    "sqlmodel",
    "pydantic",
]

a = Analysis(
    [str(repo_root / "desktop" / "launcher.py")],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="firm-rms",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="firm-rms",
)
