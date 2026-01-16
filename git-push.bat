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
git commit -m "fix: PDF出力の枠カラム削除・馬番に枠色適用・ヘッダー色修正、SagaAIレース切替時の再取得修正"

echo.
echo [3/3] Pushing to origin...
git push origin main

echo.
echo ========================================
echo Done! GitHub Actions will deploy to VPS.
echo ========================================
pause



