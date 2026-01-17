@echo off
chcp 65001 >nul
cd /d C:\racescore
git add -A
git commit -m "Horse mark UI: mobile/PC input separation, 7 mark types, unified colors"
git push origin main
pause
