@echo off
title Forest Beat Server - close this window to stop
cd /d "%~dp0"

rem ---- 1) Node: use bundled portable node first, fallback to system node ----
set "NODE_DIR=%~dp0.tools\node-v20.18.0-win-x64"
if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"

where node >nul 2>nul
if errorlevel 1 goto nonode

rem ---- 2) If a server is already running on 5173, just open the browser ----
curl -s -o nul -m 2 http://localhost:5173/
if not errorlevel 1 goto already

rem ---- 3) First run: install dependencies ----
if not exist "node_modules" goto install
goto run

:install
echo First run: installing dependencies, please wait...
call npm install
if errorlevel 1 goto installfail

:run
echo ============================================================
echo   Forest Beat - dev server
echo   Local    : http://localhost:5173/
echo   Analyzer : http://localhost:5173/analyzer.html
echo.
echo   Browser opens automatically. Close this window to stop.
echo ============================================================
echo.
call npm run dev
echo.
echo Server exited. If port 5173 is busy, close the old server window first.
pause
exit /b

:already
echo Game server is already running, opening browser...
start "" "http://localhost:5173/"
timeout /t 3 /nobreak >nul
exit /b 0

:nonode
echo [ERROR] Node.js not found.
echo Expected portable node at: .tools\node-v20.18.0-win-x64
echo Or install Node.js 18+ manually, then double-click this file again.
echo.
pause
exit /b 1

:installfail
echo [ERROR] npm install failed. Please screenshot this window for support.
pause
exit /b 1
