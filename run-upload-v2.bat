@echo off
cd /d "%~dp0"
echo ============================================================
echo Current directory: %cd%
echo ============================================================
echo.
echo Running upload script...
echo.
echo ポート番号を入力してください (デフォルト: 3000):
set /p PORT_NUMBER=
if "%PORT_NUMBER%"=="" set PORT_NUMBER=3000
echo 使用するポート: %PORT_NUMBER%
echo.
set PORT=%PORT_NUMBER%
call npx ts-node tools/upload-indices.ts
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
