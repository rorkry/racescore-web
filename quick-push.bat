@echo off
chcp 65001 >nul
cd /d "C:\競馬データ\racescore-web"

echo === Git Add ===
git add lib/race-pace-predictor.ts

echo === Git Commit ===
git commit -m "fix: 展開予想の枠順バイアスを大幅に弱め、スコア基準で位置決定"

echo === Git Push ===
git push origin main

echo === Done ===
pause
