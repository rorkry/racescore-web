@echo off
chcp 65001 > nul

cd /d "C:\競馬データ\racescore-web"

echo ============================================
echo 最新コミット内容を確認
echo ============================================

echo.
echo [1] 直近5コミットで変更されたファイル:
git log --oneline --name-only -5

echo.
echo [2] saga-brain.tsの最新コミット:
git log --oneline -1 -- lib/saga-ai/saga-brain.ts

echo.
echo [3] prediction-rules.tsの最新コミット:
git log --oneline -1 -- lib/ai-chat/prediction-rules.ts

echo.
echo [4] route.tsの最新コミット:
git log --oneline -1 -- app/api/ai-chat/route.ts

echo.
echo [5] level-analyzer.tsの最新コミット:
git log --oneline -1 -- lib/saga-ai/level-analyzer.ts

echo.
echo [6] 不要バッチファイル削除してコミット:
git add -A
git commit -m "chore: 不要なデバッグ用バッチファイルを削除"
git push origin main

echo.
pause
