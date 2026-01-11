@echo off
cd /d "%~dp0"
echo ============================================================
echo Checking Index Folders...
echo ============================================================
echo.
node tools\check-folders.js
echo.
echo ============================================================
echo Press any key to close...
pause >nul











