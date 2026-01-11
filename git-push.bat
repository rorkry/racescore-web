@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo === Adding all changes ===
git add -A

echo.
echo === Creating commit ===
git commit -m "Add lap analysis features: historical comparison, pace-aware evaluation, non-deceleration refinement"

echo.
echo === Pushing to origin ===
git push origin main

echo.
echo === Done! ===
pause

