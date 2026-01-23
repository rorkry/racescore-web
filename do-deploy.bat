@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"

echo === 大きなファイルを.gitignoreに追加 ===
echo /data/special-patterns-analysis.json >> .gitignore

echo === 大きなファイルをキャッシュから削除 ===
git rm --cached data/special-patterns-analysis.json 2>nul
git rm --cached data/discovered-patterns.json 2>nul

echo === 前回のコミットをリセット ===
git reset --soft HEAD~1

echo === 全ファイルを追加してコミット ===
git add -A
git commit -m "fix: L4F/T2F評価ロジック改善 - 歴代比較を最優先、絶対値判断を廃止"

echo === 強制プッシュ ===
git push origin main --force

echo.
echo === 完了！ ===
pause
