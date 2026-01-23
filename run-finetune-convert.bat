@echo off
chcp 65001
cd /d "C:\競馬データ\racescore-web"
node scripts/convert-learning-to-finetune.js
pause
