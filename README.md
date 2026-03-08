# Meidaisai-MAC

明大祭向けのレーン空き状況管理アプリです。  
Firebase Hosting 上で動かす静的フロントエンドとして公開できる形に整理してあります。

## 現在の方針

- 配信形態は `Firebase Hosting + 静的フロントエンド` を維持します。
- フロントエンドは `TypeScript` で責務分離し、`src/` を編集して `public/js/` を生成します。
- `ADMIN_PASSWORD` は本格的な認証ではなく、誤操作防止用の UI ガードとして扱います。

`Next.js` は現時点では採用していません。SSR、API Routes、サーバー側認証が必要になった段階で再検討する方針です。

## セットアップ

1. `.env.example` を `.env` としてコピーします。
2. Firebase Web 設定、`APP_ID`、`ADMIN_PASSWORD` を記入します。
3. `python3 scripts/generate_local_config.py` を実行します。
4. 必要に応じて `npm install` を実行します。
5. `npm run check` または `npm run build` を実行します。
6. `public/` をローカル配信するか、Firebase CLI で deploy します。

## ローカル生成ファイル

`scripts/generate_local_config.py` は次のローカル専用ファイルを生成します。

- `public/js/env.js`
- `.firebaserc`

これらは Git 管理対象に含めません。`.env` も同様です。

## ディレクトリ構成

- `src/`
  TypeScript の実装本体です。ここを編集します。
- `public/js/`
  `npm run build` で生成される配信用 JavaScript です。
- `scripts/generate_local_config.py`
  `.env` から `env.js` と `.firebaserc` を生成します。
- `docs/operations/deploy-flow.md`
  deploy 手順と GitHub Actions 運用です。
- `docs/architecture/frontend-structure.md`
  フロントエンドの責務分離方針です。
- `docs/roadmap.md`
  現在の優先事項と後回しにしている運用項目です。

## 複数端末での開発

端末ごとに `.env` を持ち、必要な Firebase 環境へ切り替えて使います。

1. `.env.example` を `.env` にコピーします。
2. その端末で使う Firebase プロジェクトの値を `.env` に入れます。
3. `python3 scripts/generate_local_config.py` を実行します。
4. `npm run check` か `npm run build` を実行します。

1 台の端末で複数環境を切り替える場合は、たとえば次のように使えます。

- `python3 scripts/generate_local_config.py --env-file .env.dev`
- `python3 scripts/generate_local_config.py --env-file .env.prod`

## CI/CD

GitHub Actions workflow は次の 3 本です。

- `.github/workflows/validate-local-config.yml`
- `.github/workflows/firebase-hosting-preview.yml`
- `.github/workflows/firebase-hosting-live.yml`

GitHub Actions で Firebase Hosting へ自動 deploy する場合は、次の Repository Variables を設定します。

- `APP_ID`
- `ADMIN_PASSWORD`
- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`
- `FIREBASE_MEASUREMENT_ID`
- `FIREBASE_PROJECT_ALIAS`

さらに、次の Repository Secret が必要です。

- `FIREBASE_SERVICE_ACCOUNT`

未設定の間は preview/live deploy workflow は安全に `skip` されます。詳しい運用は [docs/operations/deploy-flow.md](docs/operations/deploy-flow.md) を参照してください。

## セキュリティ上の注意

`ADMIN_PASSWORD` は静的フロントエンドの都合上、ブラウザへ配信されます。  
そのため「本物の秘匿情報」ではなく、「一般ユーザーの誤操作を防ぐための UI ガード」として扱ってください。

本格的な管理者制御が必要になった場合は、Firebase Auth やサーバー側の認可へ移行し、Firestore Rules と合わせて設計を見直す必要があります。
