@echo off
chcp 65001 > nul

echo ============================================
echo 親フォルダの.gitを削除
echo ============================================

if exist "C:\競馬データ\.git" (
    echo 検出: C:\競馬データ\.git
    echo 削除中...
    rmdir /s /q "C:\競馬データ\.git"
    echo 削除完了！
) else (
    echo C:\競馬データ\.git は存在しません
)

echo.
echo === 確認 ===
dir /a:h "C:\競馬データ" 2>nul | findstr /i ".git"
if errorlevel 1 (
    echo .git フォルダは存在しません（正常）
)

echo.
pause
