@echo off
chcp 65001 > nul
cd /d "%~dp0"
git add -A
git commit -m "feat: horse analysis page with search, favorites, and detail modal"
git push origin main
echo Done!
pause
