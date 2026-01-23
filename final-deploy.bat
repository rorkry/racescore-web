@echo off
chcp 65001 > nul

cd /d "C:\競馬データ\racescore-web"

echo ============================================
echo 最終デプロイ
echo ============================================

echo.
echo [1] Git Status:
git status
echo.

echo [2] 変更されたファイル:
git diff --name-only
echo.

echo [3] 全ファイルをステージング:
git add -A
echo.

echo [4] コミット:
git commit -m "fix: 好走数表示を次1走目に統一、過大評価ルール修正、巻き返し閾値3.5以上に変更、UNKNOWN判定緩和"
echo.

echo [5] プッシュ:
git push origin main
echo.

echo [6] 不要なバッチファイルを削除:
del check-git-location.bat 2>nul
del debug-git.bat 2>nul
del fix-duplicate-folder.bat 2>nul
del remove-parent-git.bat 2>nul
echo.

echo ============================================
echo 完了
echo ============================================
pause
