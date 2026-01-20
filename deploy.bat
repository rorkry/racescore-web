@echo off
chcp 65001 > nul
cd /d "%~dp0"
git add -A
git commit -m "fix_year_type_text_not_integer"
git push origin main
echo Done!
pause
