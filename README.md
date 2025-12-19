This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 🎯 RaceScore Web - 競馬出馬表分析アプリ

> **Status: Production Ready** – Next.js 15 (app router, TypeScript) で構築された日本競馬の出馬表分析Webアプリケーション。CSVアップロード、合成オッズ計算、スマホ対応、PWA対応済み。

---

## 📋 主な機能

| 機能 | 状態 | 説明 |
|------|------|------|
| **CSV インポート** | ✅ | 4種類のCSVアップロード対応（出走予定馬、出馬表、枠順確定、オッズ） |
| **出馬表テーブル** | ✅ | 馬番、馬名、騎手、過去5走、印機能、合成オッズ表示 |
| **合成オッズ計算** | ✅ | 三連単O6オッズから馬別の合成単勝オッズを自動計算 |
| **スマホ対応** | ✅ | 横スクロール対応、レスポンシブデザイン |
| **PWA対応** | ✅ | ホーム画面追加、オフライン対応、Service Worker |
| **ラベル・指数** | ✅ | 競う指数に基づく自動ラベル割当（くるでしょ/めっちゃきそう/など） |

---

## 📚 バージョン履歴

### v1.0 (2024-12-19) - 初期リリース

**主な機能:**
- ✅ **競う指数計算**: 前走・2走前・3走前の評価ロジック
- ✅ **地方競馬評価**: 競馬場レベル、時計評価、転入クラス補正
- ✅ **前走データなし馬の識別**: 「データなし」表示と最下位ソート
- ✅ **外国産馬マーク対応**: $、*マークの正規化処理
- ✅ **PDF出力機能**: 軽量化対応（90MB→5-10MB程度）
- ✅ **表デザイン改善**: 囲い線、ヘッダー色、文字サイズの最適化

**バージョンに戻す方法:**
```bash
git checkout v1.0
```

---

## 🔧 最近の修正・改善（v1.1.0）

### バグ修正
- ✅ **動的ルート統一**: `[id]` と `[raceKey]` が混在していたslug namesを統一
  - `app/races/[ymd]/[course]/[raceNo]/` を削除
  - すべてのレースページを `app/race/[raceKey]/` に統一
  - Windows環境でのエラー解消

### UI改善（スマホ対応）
- ✅ **馬柱テーブル横スクロール**: 狭い画面でも見切れない対応
- ✅ **レスポンシブデザイン**: フォントサイズ、列幅をmd/lg ブレークポイントで最適化
- ✅ **タッチスクロール**: スマホでの自然なスクロール体験

### PWA対応
- ✅ **manifest.json**: ホーム画面追加対応
- ✅ **Service Worker**: キャッシュ戦略実装（ネットワークファースト）
- ✅ **メタタグ**: Apple Web App対応、theme-color設定

### Vercel対応
- ✅ **vercel.json**: ビルド設定、キャッシュヘッダー設定
- ✅ **.env.example**: 環境変数テンプレート

---

## 📦 デプロイ手順

### Vercelへのデプロイ

1. **GitHubにプッシュ**
   ```bash
   git add .
   git commit -m "Fix: slug names unification and mobile responsive design"
   git push origin main
   ```

2. **Vercelで新規プロジェクト作成**
   - https://vercel.com/new にアクセス
   - GitHubリポジトリを選択
   - Framework: Next.js を選択
   - デプロイ

3. **環境変数設定**（必要に応じて）
   - Vercel Dashboard → Settings → Environment Variables
   - `.env.example` を参考に設定

---

## 📱 PWA インストール方法

### iPhone/iPad
1. Safari で https://your-domain.com を開く
2. 共有ボタン → ホーム画面に追加

### Android
1. Chrome で https://your-domain.com を開く
2. メニュー → アプリをインストール

---

## 🛠️ 開発

### ローカル開発
```bash
pnpm dev
```

### ビルド
```bash
pnpm build
pnpm start
```

### リント
```bash
pnpm lint
```

---

## 📁 ファイル構成

```
app/                    Next.js app router
├── api/                API ハンドラー
│   ├── odds/[raceKey]/ 単勝オッズAPI
│   ├── race-detail/    レース詳細API
│   └── trio/[raceKey]/ 三連単オッズAPI
├── components/         UI コンポーネント
│   └── EntryTable.tsx  出馬表テーブル
├── race/[raceKey]/     レース詳細ページ
├── races/[ymd]/        開催日別ページ
└── page.tsx            ホームページ

public/
├── manifest.json       PWA マニフェスト
├── sw.js               Service Worker
└── icon-*.png          PWA アイコン

hooks/                  React カスタムフック
lib/                    ユーティリティ関数
utils/                  フロントエンド関数
types/                  TypeScript 型定義
```

---

## 🚀 今後の改善予定

- [ ] アイコン画像の作成・最適化
- [ ] オフライン時のデータ永続化
- [ ] ユーザー認証・ログイン機能
- [ ] 予想履歴の保存・分析
- [ ] レース結果との照合機能
- [ ] 複数デバイス間のデータ同期

---

## 📄 ライセンス

Private/Unlicensed - 詳細は LICENSE ファイルを参照

---

## 🤝 貢献

バグ報告や機能リクエストは GitHub Issues にお願いします。

---

**Built with ❤️ using Next.js 15, TypeScript, Tailwind CSS**
