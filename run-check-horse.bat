@echo off
chcp 65001
cd /d "C:\競馬データ\racescore-web"
node check_horse_by_name.js %1
