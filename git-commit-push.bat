@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"

echo ============================================
echo Git Commit and Push
echo ============================================

git add -A
git commit -m "fix: レースレベル好走数が0になる問題を修正 - SELECT文にfirst_run_good_countを追加"
git push origin main

echo ============================================
echo 完了
echo ============================================
pause
