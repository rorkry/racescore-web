@echo off
chcp 65001
cd /d "C:\競馬データ\racescore-web"

echo === 大きなファイルをGit履歴から削除 ===
echo.

REM キャッシュからファイルを削除（履歴からも）
git rm -r --cached data/learning-data/ 2>nul
git rm -r --cached data/fine-tuning/*.jsonl 2>nul
git rm -r --cached data/pattern-validation/ 2>nul

echo.
echo === .gitignore をコミット ===
git add .gitignore
git commit --amend -m "feat: 閾値分析結果に基づくAI予想ロジック改善 (大きなデータファイル除外)"

echo.
echo === 強制Push ===
git push origin main --force

echo.
echo === 完了 ===
pause
