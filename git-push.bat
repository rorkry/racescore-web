@echo off
chcp 65001 > nul
cd /d "%~dp0"

echo ========================================
echo Git Push Script
echo ========================================

echo.
echo [1/3] Staging all changes...
git add -A

echo.
echo [2/3] Committing...
git commit -m "feat: おれAI馬名クリックで詳細表示・お気に入り追加対応、バックグラウンドプリフェッチ"

echo.
echo [3/3] Pushing to origin...
git push origin main

echo.
echo ========================================
echo Done! GitHub Actions will deploy to VPS.
echo ========================================
pause



