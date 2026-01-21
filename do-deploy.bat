@echo off
chcp 65001 > nul
cd /d C:\競馬データ\racescore-web

echo === Git Status ===
git status

echo.
echo === Adding all changes ===
git add -A

echo.
echo === Committing ===
git commit -m "fix: 馬分析ページに歴代比較データとデバッグログ追加"

echo.
echo === Pushing to origin ===
git push origin main

echo.
echo === Done! ===
pause
