@echo off
rem PlantLens gateway launcher for Windows. Double-click, or run from any folder:
rem   start-gateway.bat                 first run: setup wizard, then the gateway
rem   start-gateway.bat -Setup          re-run the setup wizard
rem   start-gateway.bat -Profile uno    a second device on the same PC
setlocal
set "PS=powershell.exe"
where pwsh.exe >/dev/null 2>/dev/null && set "PS=pwsh.exe"
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-gateway.ps1" %*
set "RC=%ERRORLEVEL%"
endlocal & exit /b %RC%
