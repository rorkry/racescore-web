@echo off
chcp 65001 > nul
cd /d "C:\競馬データ\racescore-web"

echo ============================================================
echo 指数データをRailway本番DBにアップロード
echo ============================================================
echo.
echo 対象フォルダ:
echo   - C:\競馬データ\L4F
echo   - C:\競馬データ\T2F
echo   - C:\競馬データ\ポテンシャル指数
echo   - C:\競馬データ\レボウマ
echo   - C:\競馬データ\巻き返し指数
echo   - C:\競馬データ\クッション値
echo.
echo アップロード先: Railway本番環境
echo.
echo 続行しますか？ (Y/N)
set /p CONFIRM=
if /i not "%CONFIRM%"=="Y" (
    echo キャンセルしました。
    pause
    exit /b
)

echo.
echo アップロード開始...
set USE_RAILWAY=true
call npx ts-node tools/upload-indices.ts

echo.
echo ============================================================
if %ERRORLEVEL% neq 0 (
    echo エラーが発生しました！上のメッセージを確認してください。
) else (
    echo 完了しました！
)
echo ============================================================
pause
