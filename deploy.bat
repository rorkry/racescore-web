@echo off
chcp 65001 > nul
cd /d "%~dp0"
git add -A
git commit -m "fix: use Next-Auth session for admin check, remove unused import"
git push origin main
echo Done!
pause
