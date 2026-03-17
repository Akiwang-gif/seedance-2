@echo off
title Seedance-2 CMS Server
cd /d "%~dp0"

echo.
echo Freeing port 5000...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue; Write-Host 'Killed process' $_.OwningProcess }"
if errorlevel 1 (
    echo Trying netstat method...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do (
        taskkill /PID %%a /F 2>nul
        echo Killed process %%a
    )
)
timeout /t 2 /nobreak >nul
echo.
echo Starting CMS server on port 5000...
echo.
node server-cms.js

echo.
echo Server stopped. Press any key to close this window.
pause >nul
