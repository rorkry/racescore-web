@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak > nul
npm run dev






