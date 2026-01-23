@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"
echo === Git Status ===
git status
echo.
echo === Adding files ===
git add -A
echo.
echo === Committing ===
git commit -m "fix: 好走数表示を次1走目に統一、過大評価ルール修正、巻き返し閾値3.5以上に変更"
echo.
echo === Pushing to origin ===
git push origin main
echo.
echo === Done ===
pause
