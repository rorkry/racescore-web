@echo off
echo ============================================================
echo Horse Racing Index Data Upload Tool
echo ============================================================
echo.

REM Change to project directory
cd /d "%~dp0"

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed
    echo Please install from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if ts-node is installed, install if not
call npx ts-node --version >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Installing ts-node...
    call npm install -g ts-node typescript
)

REM Run the script
echo Starting index data processing...
echo.
call npx ts-node tools/upload-indices.ts

echo.
echo ============================================================
echo Process completed
echo ============================================================
pause
