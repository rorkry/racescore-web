@echo off
cd /d C:\racescore
git add -A
git commit -m "Add race level caching, integrate with saga-ai, display in SagaAICard"
git push origin main
