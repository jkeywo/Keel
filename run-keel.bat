@echo off
setlocal
cd /d "%~dp0"

REM ---- Keel launcher -------------------------------------------------
REM Usage:
REM   run-keel.bat            real mode (GitHub via gh, models via Ollama)
REM   run-keel.bat --dry-run  sandbox mode (mock GitHub, safe to click around)
REM
REM Optional env vars: KEEL_PORT (default 4400), KEEL_STATE_DIR,
REM KEEL_NO_BROWSER=1 to skip opening the browser.
REM --------------------------------------------------------------------

where node >nul 2>nul
if errorlevel 1 (
    echo [Keel] Node.js not found. Install Node 20+ from https://nodejs.org and re-run.
    pause
    exit /b 1
)

where gh >nul 2>nul
if errorlevel 1 (
    echo [Keel] Warning: GitHub CLI ^(gh^) not found on PATH.
    echo [Keel] Real mode will fail; --dry-run works without it.
)

if not exist node_modules (
    echo [Keel] First run: installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [Keel] npm install failed. See output above.
        pause
        exit /b 1
    )
)

set "KEEL_URL_PORT=%KEEL_PORT%"
if not defined KEEL_URL_PORT set "KEEL_URL_PORT=4400"

echo [Keel] Starting cockpit at http://localhost:%KEEL_URL_PORT% ...
echo [Keel] Close this window or press Ctrl+C to stop.

if not defined KEEL_NO_BROWSER (
    start "" /b cmd /c "timeout /t 4 /nobreak >nul & start "" http://localhost:%KEEL_URL_PORT%"
)

call npx tsx src/index.ts %*

echo.
echo [Keel] Server stopped.
pause
