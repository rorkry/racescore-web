@echo off
chcp 65001 > nul

echo ============================================
echo racescore-web デプロイスクリプト
echo ============================================
echo.

REM racescore-webディレクトリ内で直接実行
cd /d "%~dp0"

echo 現在のディレクトリ: %CD%
echo.

REM 親ディレクトリの.gitを確認
if exist "C:\競馬データ\.git" (
    echo [警告] C:\競馬データ\.git が存在します。
    echo これが原因でサブモジュール扱いになっています。
    echo 削除しますか？ (Y/N)
    set /p CONFIRM=
    if /i "%CONFIRM%"=="Y" (
        rmdir /s /q "C:\競馬データ\.git"
        echo 削除しました。
    )
)

echo.
echo === Git Status ===
git status
echo.

echo === Adding files ===
git add .
echo.

echo === Committing ===
git commit -m "fix: 好走数表示を次1走目に統一、過大評価ルール修正、巻き返し閾値3.5以上に変更"
echo.

echo === Pushing ===
git push origin main
echo.

echo === 完了 ===
pause
