@echo off
chcp 65001 > nul

cd /d "C:\競馬データ\racescore-web"

echo ============================================
echo Git詳細確認
echo ============================================

echo.
echo [1] Git Status:
git status

echo.
echo [2] saga-brain.ts の変更確認:
git diff lib/saga-ai/saga-brain.ts
git diff --cached lib/saga-ai/saga-brain.ts

echo.
echo [3] prediction-rules.ts の変更確認:
git diff lib/ai-chat/prediction-rules.ts
git diff --cached lib/ai-chat/prediction-rules.ts

echo.
echo [4] ファイルがgitに追跡されているか:
git ls-files lib/saga-ai/saga-brain.ts
git ls-files lib/ai-chat/prediction-rules.ts

echo.
echo [5] 最新のコミット内容:
git log --oneline -5

echo.
echo [6] リモートと比較:
git fetch origin
git diff origin/main --name-only

echo.
pause
