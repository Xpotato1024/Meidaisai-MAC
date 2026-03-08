# Meidaisai-MAC

明大祭向けのレーン空き状況管理アプリです。  
Firebase Hosting 上で動く静的フロントエンドとして運用しつつ、認証と認可は `Firebase Authentication + Firestore Rules` で担保します。

## 現在の方針

- 配信形態は `Firebase Hosting + 静的フロントエンド` を維持します。
- フロントエンドは `TypeScript` で責務分離し、`src/` を編集して `public/js/` を生成します。
- 認証は Google ログイン、権限制御は Firestore Rules を正本にします。
- `ADMIN_PASSWORD` は互換用の設定値として残していますが、現在の runtime 認証では使用しません。

`Next.js` は現時点では採用していません。SSR、API Routes、サーバー側認証が必要になった段階で再検討します。

## 認証と権限

このアプリは Google ログイン後に名簿照合を行い、今年度名簿に含まれる Gmail は自動承認します。
名簿外アカウントは従来どおり管理者承認で利用します。

- `admin`
  管理設定、DB 管理、メンバー承認、全体操作
- `reception`
  受付画面の閲覧と案内操作
- `staff`
  割り当てられた部屋だけの閲覧と更新

Firestore 上では次の 2 系統で権限情報を持ちます。

- `/artifacts/{appId}/private/data/memberDirectory/{emailKey}`
  Google スプレッドシート由来の今年度名簿
- `/artifacts/{appId}/private/data/accessRequests/{uid}`
  名簿外アカウントや特別アカウント向けの承認待ち申請
- `/artifacts/{appId}/private/data/accessMembers/{uid}`
  承認済みメンバーの role と担当部屋

`staff` は担当部屋だけを購読するため、無料枠での read コストを抑えやすい構成です。

## 名簿運用

サークルの正本名簿は Google スプレッドシートで管理し、このアプリには CSV を取り込みます。

1. Google スプレッドシートから CSV を出力する
2. 列 `名前`, `Gmail`, `学年` を含むことを確認する
3. 管理設定の「名簿インポート」から CSV を取り込む
4. 名簿登録済み Gmail はログイン時に自動承認される
5. role と担当部屋は「登録済みメンバー」から後付けする

名簿外の技術者や dev 用アカウントは、CSV に入れず従来の承認待ちリクエストから手動承認します。
このため、年度更新時に停止されるのは `authorizationSource = roster` のメンバーだけです。

## セットアップ

1. `.env.example` を `.env` としてコピーします。
2. Firebase Web 設定と `APP_ID` を記入します。
3. `python3 scripts/generate_local_config.py` を実行します。
4. `npm install` を実行します。
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
- `firestore.rules`
  role ベースの認可ルールです。
- `scripts/generate_local_config.py`
  `.env` から `env.js` と `.firebaserc` を生成します。
- `docs/operations/deploy-flow.md`
  deploy 手順と GitHub Actions 運用です。
- `docs/architecture/frontend-structure.md`
  フロントエンドの責務分離方針です。
- `docs/roadmap.md`
  継続改善と後回し項目です。

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

GitHub Actions で自動 deploy する場合は、次の Repository Variables を設定します。

- `APP_ID`
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

`main` への deploy では Hosting に加えて `firestore.rules` と `firestore.indexes.json` も適用します。  
未設定の間は preview/live deploy workflow は安全に `skip` されます。詳しい運用は [docs/operations/deploy-flow.md](docs/operations/deploy-flow.md) を参照してください。

## 初期管理者の作成

Firestore Rules は承認済み `admin` がいないと管理画面を開けません。  
最初の 1 人だけは Firebase Console から手動で作成します。

1. Firebase Authentication で Google プロバイダを有効化する
2. 管理者にしたい Google アカウントで一度ログインする
3. Firestore Console で `/artifacts/{appId}/private/data/accessMembers/{uid}` を作成する
4. 次の値を入れる

```json
{
  "uid": "ログインしたユーザーの uid",
  "email": "example@gmail.com",
  "displayName": "表示名",
  "role": "admin",
  "isActive": true,
  "assignedRoomIds": []
}
```

以後は次の流れで運用します。

1. 初期 `admin` でログインする
2. Google スプレッドシートから CSV を出力して「名簿インポート」を実行する
3. 一般メンバーは自動承認される
4. role と担当部屋はアプリ内の「メンバー権限管理」で付与する
5. 名簿外の特別アカウントは承認待ちリクエストから手動承認する

## セキュリティ上の注意

- このアプリは backend を持たないため、認可の本体は Firestore Rules です。
- `ADMIN_PASSWORD` は必要なら空のままで構いません。
- `FIREBASE_SERVICE_ACCOUNT` の JSON key は GitHub Secret にだけ置き、repository には入れません。

監査ログ、招待制、退会処理まで必要になった場合は、Cloud Functions か別 backend の導入を再検討してください。
