@echo off
chcp 65001 > nul

cd /d "C:\競馬データ\racescore-web"

echo ============================================
echo Git構造を調査
echo ============================================

echo.
echo [1] .gitmodulesファイルの確認:
if exist ".gitmodules" (
    echo .gitmodules が存在します:
    type .gitmodules
) else (
    echo .gitmodules は存在しません
)

echo.
echo [2] racescore-webサブフォルダの確認:
if exist "racescore-web" (
    echo racescore-web フォルダが存在します！
    echo 内容:
    dir "racescore-web" /b
) else (
    echo racescore-web フォルダは存在しません
)

echo.
echo [3] .git の種類確認:
if exist ".git" (
    echo .git が存在します
    if exist ".git\config" (
        echo .git はディレクトリです（通常のリポジトリ）
        echo --- .git\config ---
        type ".git\config"
    ) else (
        echo .git はファイルです（サブモジュール）
        type ".git"
    )
)

echo.
echo [4] git submodule status:
git submodule status

echo.
pause
