# フロントエンド構成

## 目的

もともと `public/js/main.js` に集約されていた処理を、責務ごとに分割して保守しやすくすることが目的です。  
機能の見た目や操作感は大きく変えず、コードの境界だけを明確にしています。

## 編集起点

- 実装を直す場所: `src/`
- 配信用の生成物: `public/js/`

普段は `src/` を編集し、`npm run build` で `public/js/` を更新します。

## モジュール分割

### `src/main.ts`

- アプリ起動の入口
- `context` を作成し、認証監視を開始する

### `src/context.ts`

- DOM 参照の収集
- Firebase パスや `app_id` の解決
- アプリ全体で共有する state の初期化

### `src/auth.ts`

- 匿名認証または custom token 認証
- 管理タブ用の簡易パスワード判定
- 初期化タイミングの制御

### `src/firestore.ts`

- Firestore の購読処理
- config / lanes / roomState / registry の読み取り
- 購読結果を state へ反映し、描画を更新する

### `src/db-sync.ts`

- 設定変更時の DB 同期
- レーン追加・削除、部屋状態の補完、既存データのマイグレーション

### `src/render.ts`

- 受付画面の描画
- レーン担当画面の描画
- 管理設定画面の描画
- サマリーバーやモーダルなど UI 表示の組み立て

### `src/events.ts`

- タブ切替
- ボタン、入力、検索、バックアップ、イベント ID 切替
- 画面操作から write 層を呼び出すイベント配線

### `src/writes.ts`

- Firestore への更新処理
- レーン状態変更、受付状態変更、待機組数更新、管理設定保存

### `src/default-config.ts`

- 初期設定値
- 元コードにあった設定コメントを保持

### `src/types.ts`

- アプリ内で共通利用する型定義

### `src/firebase-config.ts`

- Firebase SDK 初期化
- `db` と `auth` の生成

## コメント方針

この repository のコードは元実装のコメントや意図が重要なので、  
リファクタ時も既存コメントをできる限り残す方針にしています。

## Next.js を入れていない理由

現状は Firebase Hosting 上の静的配信で要件を満たしているためです。

Next.js を検討する条件:

1. サーバー側で認証・認可を実行したい
2. SSR が必要になる
3. API Routes でバックエンドを同居させたい

それまでは構成を増やさず、静的フロントエンドのまま保守性を高める方針です。
