@echo off
REM ============================================================
REM  Publish the project to a NEW PRIVATE GitHub repository.
REM  Usage:  publish-to-github.bat
REM          publish-to-github.bat https://github.com/you/karate-tournament.git
REM  (Pass a remote URL if you don't use the GitHub CLI.)
REM ============================================================
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if errorlevel 1 (
  echo [X] PowerShell was not found. Run publish-to-github.ps1 manually.
  exit /b 1
)

if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-to-github.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-to-github.ps1" -RemoteUrl "%~1"
)
set "RC=%ERRORLEVEL%"

echo.
pause >nul
endlocal
exit /b %RC%
