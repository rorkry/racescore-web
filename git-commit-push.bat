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
git commit -m "fix: レースレベルUNKNOWN判定緩和、巻き返し評価閾値を3.5以上に変更"
echo.
echo === Pushing to origin ===
git push origin main
echo.
echo === Done ===
pause
