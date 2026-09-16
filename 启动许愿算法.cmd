@echo off
rem =====================================================================
rem  Wish Algorithm - Local launcher
rem  NOTE: this file is intentionally ASCII-only. Putting multi-byte
rem  characters in a .cmd that also calls "chcp 65001" makes cmd.exe lose
rem  its parse position (byte offsets shift) and it starts executing
rem  garbage. All Chinese output is printed by server.js instead.
rem =====================================================================
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_EXE="
for %%I in (node.exe) do if not defined NODE_EXE set "NODE_EXE=%%~$PATH:I"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%ProgramFiles(x86)%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODE_EXE goto NONODE

set "EXTRA="
if "%WA_NO_OPEN%"=="1" set "EXTRA=--no-open"

"%NODE_EXE%" ".workbuddy\server.js" %EXTRA%

echo.
echo   Server stopped. You can close this window.
pause
exit /b 0

:NONODE
echo.
echo   [x] Node.js not found.
echo.
echo       This app needs Node.js 18+ to run its local data service.
echo       Install it, then double-click this file again:
echo       https://nodejs.org/
echo.
pause
exit /b 1
