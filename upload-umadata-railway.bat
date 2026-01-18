@echo off
cd /d "%~dp0"
echo ============================================================
echo umadata Direct Upload Tool (Railway PostgreSQL)
echo ============================================================
echo.
echo DATABASE_URLを設定してください。
echo RailwayダッシュボードのPostgres -> Variables -> DATABASE_URL からコピー
echo.
set /p DATABASE_URL=DATABASE_URL: 
echo.
echo 接続先: Railway PostgreSQL
echo.
call npx ts-node scripts/upload-umadata-direct.ts
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
