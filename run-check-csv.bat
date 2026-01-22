@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"
node check-csv-header.js
pause
