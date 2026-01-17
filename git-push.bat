@echo off
chcp 65001 > nul
cd /d "%~dp0"

git add -A
git status
echo.
echo コミットしますか? (Ctrl+Cでキャンセル)
pause

git commit -m "feat: 馬印7種類対応 + 過去走メモマーク表示"
git push origin main

echo.
echo Push完了!
pause
