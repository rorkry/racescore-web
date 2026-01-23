@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"
echo === .env ファイルの内容 ===
type .env
echo.
echo === .env.local ファイルの内容 ===
type .env.local
pause
