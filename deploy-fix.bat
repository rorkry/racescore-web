@echo off
chcp 65001
cd /d "C:\競馬データ\racescore-web"
git pull origin main --no-rebase
git add -A
git commit -m "fix_race_level_comment_display_and_add_to_horse_info" --allow-empty
git push origin main
pause
