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
git commit -m "fix: 馬検索画面でおれAIトグルが反映されない問題を修正

- /api/horses/detail にenableSagaAIパラメータを追加
- FloatingActionButtonのトグル状態をグローバル変数で共有
- useFeatureAccessが初期化時にもアクティブ状態を取得可能に
- ページ間でトグル状態が保持されるように改善"

echo.
echo === Pushing to origin ===
git push origin main

echo.
echo === Done! ===
pause
