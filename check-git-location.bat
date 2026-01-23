@echo off
chcp 65001 > nul

echo ============================================
echo Git状態を確認
echo ============================================

echo.
echo [1] バッチファイルの場所:
echo %~dp0

echo.
echo [2] 現在のディレクトリ:
cd
echo.

echo [3] racescore-webに移動して確認:
cd /d "C:\競馬データ\racescore-web"
echo 移動後: %CD%
echo.

echo [4] Git Status:
git status
echo.

echo [5] Git Remote:
git remote -v
echo.

echo [6] 変更されたファイル:
git diff --name-only
echo.

pause
