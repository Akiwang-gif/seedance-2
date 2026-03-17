@echo off
title Seedance-2 CMS Server
cd /d "%~dp0"

echo.
echo Starting CMS server...
echo.
node server-cms.js

echo.
echo Server stopped. Press any key to close this window.
pause >nul
