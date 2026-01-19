@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Current directory: %CD%
echo.
echo === Stopping ALL node processes ===
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.
echo === Cleaning .next cache ===
if exist .next rmdir /s /q .next
echo.
echo === Starting dev server on port 3000 ===
npm run dev
pause
