#!/bin/bash
# ヘルスチェックスクリプト
# crontab -e で追加: */5 * * * * /var/www/racescore-web/scripts/health-check.sh

LOG_FILE="/var/www/racescore-web/logs/health-check.log"
URL="http://localhost:80"
MAX_RETRIES=3

# ログディレクトリ作成
mkdir -p /var/www/racescore-web/logs

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# ヘルスチェック
check_health() {
    curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$URL"
}

# メイン処理
for i in $(seq 1 $MAX_RETRIES); do
    HTTP_CODE=$(check_health)
    
    if [ "$HTTP_CODE" == "200" ]; then
        # 正常
        exit 0
    fi
    
    log "Health check failed (attempt $i/$MAX_RETRIES): HTTP $HTTP_CODE"
    sleep 5
done

# 3回失敗したら再起動
log "Server unresponsive. Restarting PM2..."
cd /var/www/racescore-web
pm2 restart racescore

# 再起動後の確認
sleep 10
HTTP_CODE=$(check_health)
if [ "$HTTP_CODE" == "200" ]; then
    log "Server restarted successfully"
else
    log "Server still not responding after restart. HTTP: $HTTP_CODE"
fi



