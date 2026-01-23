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
git commit -m "fix: レースレベルUNKNOWN判定を緩和 - 延べ出走3回以上で推定判定可能に - UNKNOWNキャッシュを1日に短縮 - デバッグログ追加"
echo.
echo === Pushing to origin ===
git push origin main
echo.
echo === Done ===
pause
