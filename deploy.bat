@echo off
chcp 65001 > nul
cd /d "%~dp0"
git add -A
git commit -m "security: add rate limiting, SQL injection protection, admin API auth"
git push origin main
echo Done!
pause
