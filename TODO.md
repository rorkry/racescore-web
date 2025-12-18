# RaceScore Web - 修正・改善 TODO

## バグ修正（最優先）
- [x] 動的ルートのslug names統一（[id]を[raceKey]に統一）
  - [x] app/races/[ymd]/[course]/[raceNo] を削除
  - [x] ルート参照を修正
  - [x] API ルートの確認

## UI改善（スマホ対応）
- [x] 馬柱テーブルの横スクロール対応
  - [x] EntryTable.tsx の修正
  - [x] Tailwind CSS の overflow-x-auto 適用
  - [x] タッチスクロール対応
- [x] モバイルレイアウト最適化
  - [x] 列幅の調整
  - [x] フォントサイズの最適化
  - [x] ボタン・インタラクティブ要素のサイズ確認

## PWA対応
- [x] manifest.json の作成
- [x] Service Worker の設定 (sw.js)
- [x] layout.tsx に PWA メタタグを追加
- [ ] アイコン画像の作成

## Vercel対応
- [x] vercel.json の作成
- [x] .env.example の作成
- [x] README.md の更新

## GitHub & デプロイ
- [x] GitHub へのプッシュ
- [ ] Vercel との連携設定
- [ ] デプロイ確認
