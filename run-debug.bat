@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"
node check_race_level_debug.js
pause
