@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"

echo ============================================
echo 重複データ修正 + キャッシュクリア
echo ============================================
echo.
echo このスクリプトは以下を行います:
echo 1. umadataの重複データを削除（ラップありを優先）
echo 2. race_levelsキャッシュを期限切れにする
echo.
echo 続行しますか？
pause

node fix_duplicate_data.js

echo.
pause
