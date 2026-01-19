module.exports = {
  apps: [{
    name: 'racescore',
    script: './server.js',  // standalone/server.js を実行
    cwd: '/var/www/racescore-web',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '400M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,  // Nginxがリバースプロキシ
    },
    // ログ設定
    error_file: '/var/log/pm2/racescore-error.log',
    out_file: '/var/log/pm2/racescore-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // 再起動設定
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    restart_delay: 3000,
  }]
};
