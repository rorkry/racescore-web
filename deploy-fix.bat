@echo off
chcp 65001 > nul

echo ============================================
echo racescore-web デプロイスクリプト
echo ============================================

REM このバッチファイルがあるディレクトリに移動
cd /d "%~dp0"

echo 現在のディレクトリ: %CD%
echo.

REM 親ディレクトリの.gitを強制削除
if exist "C:\競馬データ\.git" (
    echo [検出] C:\競馬データ\.git を削除します...
    rmdir /s /q "C:\競馬データ\.git"
    echo 削除完了
    echo.
)

echo === Git Status ===
git status
echo.

echo === Adding ALL files ===
git add -A
echo.

echo === Committing ===
git commit -m "fix: 好走数表示を次1走目に統一、過大評価ルール修正、巻き返し閾値3.5以上に変更"
echo.

echo === Pushing ===
git push origin main
echo.

echo === 完了 ===
pause
