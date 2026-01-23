@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"

echo ============================================
echo Git Commit and Push
echo ============================================

git add -A
git commit -m "fix: レースレベルと好走数の整合性チェック追加、重複データ問題修正"
git push origin main

echo ============================================
echo 完了
echo ============================================
pause
