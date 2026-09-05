; Inno Setup script — wraps the PyInstaller build (dist/firm-rms/) into a
; normal Windows installer: Start Menu shortcut, optional desktop icon,
; uninstaller registered in "Add or Remove Programs". Built automatically
; by .github/workflows/build-windows-exe.yml on a windows-latest runner
; (which ships Inno Setup's iscc.exe preinstalled).
;
; To build locally on Windows instead: install Inno Setup
; (https://jrsoftware.org/isinfo.php), run PyInstaller first per
; firm_rms.spec, then: iscc desktop\installer.iss

#define MyAppName "Firm RMS"
; Single source of truth for the version number — the same ..\VERSION file
; app/core/version.py reads at runtime (bundled into the exe by
; firm_rms.spec), so "check for updates" compares against the exact
; version this installer was built from. Bump that one file, not this one.
#define VersionFileHandle FileOpen("..\VERSION")
#define MyAppVersion Trim(FileRead(VersionFileHandle))
#expr FileClose(VersionFileHandle)
#define MyAppPublisher "Firm RMS"
#define MyAppExeName "firm-rms.exe"

[Setup]
AppId={{6F3B6E6A-6E9B-4C6E-9C1A-9C6F6B6E6D6E}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
; Per-user data (SQLite DB, JWT secret) lives under %LOCALAPPDATA%\FirmRMS
; (see desktop/launcher.py), so the install folder itself can stay
; read-only and a per-machine install under Program Files works fine.
OutputDir=..\dist-installer
OutputBaseFilename=FirmRMS-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "..\dist\firm-rms\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; Flags: nowait postinstall skipifsilent
