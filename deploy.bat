@echo off
chcp 65001 > nul
cd /d "%~dp0"
git add -A
git commit -m "fix: update db-new to db imports for time-check and routers"
git push origin main
echo Done!
pause
