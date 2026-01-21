@echo off
chcp 65001 > nul
cd /d "%~dp0"
node check-horse-detail.js ジーネキング
pause
