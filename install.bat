@echo off
REM ============================================================
REM  Karate Tournament Manager - Windows installer
REM  Usage:  install.bat            (defaults only)
REM          install.bat demo       (also seed 200 demo fighters)
REM          install.bat demo nobuild
REM ============================================================
setlocal
cd /d "%~dp0"

set "ARGS="
:parse
if "%~1"=="" goto run
if /I "%~1"=="demo"    set "ARGS=%ARGS% -Demo"
if /I "%~1"=="nobuild" set "ARGS=%ARGS% -SkipBuild"
shift
goto parse

:run
where powershell >nul 2>nul
if errorlevel 1 (
  echo [X] PowerShell was not found. Please install PowerShell or Node 20+ and run install.ps1 manually.
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"%ARGS%
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo Done. Press any key to close.
) else (
  echo Installer exited with error code %RC%.
)
pause >nul
endlocal
exit /b %RC%
