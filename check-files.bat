@echo off
chcp 65001 > nul

echo ============================================
echo ファイル確認
echo ============================================

echo.
echo [1] 現在のフォルダのsaga-brain.ts:
if exist "C:\競馬データ\racescore-web\lib\saga-ai\saga-brain.ts" (
    echo 存在します
) else (
    echo 存在しません！
)

echo.
echo [2] バックアップフォルダのsaga-brain.ts:
if exist "C:\競馬データ\racescore-web-backup-duplicate\lib\saga-ai\saga-brain.ts" (
    echo 存在します - バックアップに本体がある可能性！
) else (
    echo 存在しません
)

echo.
echo [3] 現在のフォルダのlib内容:
dir "C:\競馬データ\racescore-web\lib" /b 2>nul
if errorlevel 1 echo libフォルダがありません！

echo.
echo [4] バックアップフォルダのlib内容:
dir "C:\競馬データ\racescore-web-backup-duplicate\lib" /b 2>nul
if errorlevel 1 echo libフォルダがありません

echo.
pause
