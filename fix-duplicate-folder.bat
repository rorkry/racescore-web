@echo off
chcp 65001 > nul

cd /d "C:\競馬データ\racescore-web"

echo ============================================
echo 重複フォルダを修正
echo ============================================

echo.
echo [問題] racescore-web\racescore-web という重複フォルダがあります。
echo これがサブモジュールとして誤認されています。
echo.

echo [1] Gitのインデックスから削除...
git rm --cached racescore-web
echo.

echo [2] 重複フォルダをバックアップ位置に移動...
if exist "racescore-web" (
    move "racescore-web" "C:\競馬データ\racescore-web-backup-duplicate"
    echo 移動完了: C:\競馬データ\racescore-web-backup-duplicate
)
echo.

echo [3] Git Status確認...
git status
echo.

echo [4] 変更をコミット...
git add -A
git commit -m "fix: 重複フォルダ削除、好走数表示修正、過大評価ルール修正"
echo.

echo [5] プッシュ...
git push origin main
echo.

echo ============================================
echo 完了！
echo ============================================
echo.
echo バックアップは C:\競馬データ\racescore-web-backup-duplicate にあります。
echo 問題なければ後で削除してください。
echo.

pause
