@echo off
chcp 65001
cd /d "C:\競馬データ\racescore-web"
echo === Git Status ===
git status
echo.
echo === Adding files ===
git add -A
echo.
echo === Committing ===
git commit -m "feat: 閾値分析結果に基づくAI予想ロジック改善 - ポテンシャル指数: >=7で回収率255%%、>=6で159%%、>=5で114%% - 巻き返し指数: 2-3が最強ゾーン(125%%)、4-6で期待値プラス - 学習データエクスポートスクリプト拡張(ラップ/時計/不利馬分析)"
echo.
echo === Pushing to origin ===
git push origin main
echo.
echo === Done ===
pause
