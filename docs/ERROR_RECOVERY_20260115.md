# エラー対応メモ - 2026年1月15日

## 📋 発生した問題

### 1. GitHub ActionsのSSH接続エラー
```
ssh: handshake failed: read tcp ...:10022: read: connection reset by peer
```

### 2. サイトが表示されない
```
ERR_CONNECTION_REFUSED
```

### 3. マルウェア感染の痕跡
```
/etc/profile: line 31: `/tmp/x86_64.kok (deleted) startup &'
```

---

## 🔍 原因

### SSH接続エラーの原因
- **IPアドレスが変わっていた**
  - 旧IP: `160.251.40.196`
  - 新IP: `163.44.117.86`
- GitHub Secretsの `SSH_HOST` が古いIPのままだった

### サイト表示エラーの原因
1. Nginxがインストールされていなかった
2. pm2にアプリが登録されていなかった
3. ファイアウォール（ufw）でポート3000が閉じていた

### マルウェア感染
- `/etc/profile`、`/root/.bashrc`、cronジョブにマルウェアコードが挿入されていた
- 典型的なクリプトマイナー（`x86_64.kok`）の痕跡

---

## ✅ 解決手順

### Step 1: IPアドレスの確認と更新

1. ConoHa管理画面でVPSの現在のIPアドレスを確認
2. GitHub Secrets（https://github.com/rorkry/racescore-web/settings/secrets/actions）を更新
   - `SSH_HOST` → `163.44.117.86`

### Step 2: サーバー復旧

```bash
# SSHでVPSに接続
ssh -p 10022 root@163.44.117.86

# pm2でアプリを起動
cd /var/www/racescore-web
pm2 start npm --name "racescore" -- start
pm2 save

# ファイアウォールでポート3000を開放
ufw allow 3000/tcp

# Nginxをインストール・設定
apt update && apt install -y nginx

cat > /etc/nginx/sites-available/racescore << 'EOF'
server {
    listen 80;
    server_name 163.44.117.86;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -sf /etc/nginx/sites-available/racescore /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl start nginx && systemctl enable nginx
systemctl reload nginx
```

### Step 3: マルウェア駆除

```bash
# cronジョブを削除
crontab -r
rm -f /etc/cron.d/root

# 感染ファイルからマルウェアコードを削除
sed -i '/kok/d' /etc/profile
sed -i '/nigga/d' /etc/profile
sed -i '/kok/d' /root/.bashrc
sed -i '/nigga/d' /root/.bashrc

# 確認
grep -n "kok\|nigga" /etc/profile /root/.bashrc
crontab -l
```

### Step 4: セキュリティ強化

```bash
# ローカルPCでSSH鍵を生成（PowerShell）
ssh-keygen -t ed25519 -C "rorkry-local"
cat ~/.ssh/id_ed25519.pub

# VPSに公開鍵を追加
echo "ssh-ed25519 AAAA... rorkry-local" >> ~/.ssh/authorized_keys

# パスワード認証を無効化
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

### Step 5: 安定化設定

```bash
# pm2自動起動（サーバー再起動時に自動復旧）
pm2 startup
pm2 save

# fail2ban確認（既に稼働中だった）
systemctl status fail2ban

# 自動セキュリティアップデート（既にインストール済みだった）
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades
```

---

## 📝 GitHub Secrets設定

| 名前 | 値 |
|-----|-----|
| `SSH_HOST` | `163.44.117.86` |
| `SSH_USERNAME` | `root` |
| `SSH_PRIVATE_KEY` | VPSの `~/.ssh/github_deploy` の秘密鍵 |
| `GH_PAT` | GitHub Personal Access Token |

---

## 🔧 サーバー情報

| 項目 | 値 |
|-----|-----|
| プロバイダ | ConoHa VPS |
| IPアドレス | `163.44.117.86` |
| SSHポート | `10022` |
| OS | Ubuntu 22.04.5 LTS |
| Node.js | Next.js 15.3.1 |
| プロセス管理 | pm2 |
| リバースプロキシ | Nginx |

---

## 🛡️ セキュリティ設定状態

| 項目 | 状態 |
|-----|------|
| SSH鍵認証 | ✅ 有効 |
| パスワード認証 | ❌ 無効化済み |
| fail2ban | ✅ 稼働中 |
| 自動セキュリティアップデート | ✅ 有効 |
| ファイアウォール（ufw） | ✅ 有効 |

---

## 🔜 今後のタスク

- [ ] ドメイン取得（お名前.com）
- [ ] HTTPS化（Let's Encrypt）
- [ ] ドメインのDNS設定

---

## 📌 便利なコマンド集

```bash
# SSHでVPSに接続
ssh -p 10022 root@163.44.117.86

# アプリの状態確認
pm2 status
pm2 logs racescore --lines 50

# Nginxの状態確認
systemctl status nginx
nginx -t

# アプリの再起動
pm2 restart racescore

# サーバーのリソース確認
htop
df -h
```

---

## 🌐 HTTPS化の手順（ドメイン取得後）

### 1. お名前.comでドメイン取得

### 2. DNS設定（お名前.comの管理画面）
- Aレコード: `@` → `163.44.117.86`
- Aレコード: `www` → `163.44.117.86`

### 3. Nginx設定を更新
```bash
# server_nameをドメインに変更
nano /etc/nginx/sites-available/racescore
# server_name yourdomain.com www.yourdomain.com;
```

### 4. Let's Encryptで証明書取得
```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### 5. 自動更新の確認
```bash
certbot renew --dry-run
```

---

*作成日: 2026年1月15日*
