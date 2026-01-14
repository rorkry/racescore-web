module.exports = {
  apps: [{
    name: 'racescore',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 80',
    cwd: '/var/www/racescore-web',
    instances: 1,
    autorestart: true,           // クラッシュ時に自動再起動
    watch: false,
    max_memory_restart: '400M',  // メモリ400MB超えたら再起動
    env: {
      NODE_ENV: 'production',
      PORT: 80
    },
    // ログ設定
    error_file: '/var/www/racescore-web/logs/error.log',
    out_file: '/var/www/racescore-web/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    // 再起動設定
    exp_backoff_restart_delay: 100,  // 再起動間隔を指数関数的に増加
    max_restarts: 10,                 // 10回再起動失敗したら停止
    restart_delay: 3000,              // 再起動前に3秒待機
  }]
};



