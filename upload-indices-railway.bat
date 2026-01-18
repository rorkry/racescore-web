@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ============================================================
echo Horse Racing Index Upload Tool (Railway)
echo ============================================================
echo.
echo Uploading to: https://racescore-web-production.up.railway.app
echo.

set "USE_RAILWAY=true"
npx ts-node tools/upload-indices.ts

echo.
echo ============================================================
if %ERRORLEVEL% neq 0 (
    echo ERROR occurred! Check the message above.
) else (
    echo Completed successfully!
)
echo ============================================================
echo.
echo Press any key to close...
pause >nul
