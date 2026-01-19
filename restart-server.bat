@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo サーバー再起動スクリプト
echo ========================================
echo.
echo 1. Node.jsプロセスを終了中...
taskkill /f /im node.exe 2>nul
timeout /t 2 /nobreak >nul
echo.
echo 2. キャッシュを削除中...
if exist ".next" (
    rmdir /s /q ".next"
    echo    .next フォルダを削除しました
) else (
    echo    .next フォルダは存在しません
)
echo.
echo 3. 開発サーバーを起動中...
echo    ※ Ctrl+C で停止できます
echo.
npm run dev
pause
