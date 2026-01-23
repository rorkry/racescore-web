@echo off
chcp 65001
cd /d "C:\競馬データ\racescore-web"

echo === Git履歴から大きなファイルを完全削除 ===
echo.

REM 最初の大きなファイルが追加される前のコミットを探す
echo 現在のログ:
git log --oneline -5

echo.
echo === 大きなファイルが追加される前までリセット ===
REM 2つ前のコミットまでソフトリセット（変更は保持）
git reset --soft HEAD~2

echo.
echo === .gitignoreを追加して再コミット ===
git add .gitignore
git add lib/
git add scripts/*.js
git add scripts/*.ts
git add *.bat

echo.
echo === コミット ===
git commit -m "feat: 閾値分析結果に基づくAI予想ロジック改善 - ポテンシャル指数/巻き返し指数の閾値ルール更新 - 学習データエクスポートスクリプト追加（ローカル専用）"

echo.
echo === 強制Push ===
git push origin main --force

echo.
echo === 完了 ===
pause
