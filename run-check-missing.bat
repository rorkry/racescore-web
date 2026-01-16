@echo off
chcp 65001
cd /d "C:\競馬データ\racescore-web"
node check_missing_horses.js
pause
